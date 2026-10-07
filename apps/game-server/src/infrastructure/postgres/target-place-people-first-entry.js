import {
  compilePlacePeopleBindings,
  isPresenceRuleRecord,
  placePeopleCapacity,
  resolvePlacePeople,
  wantPlacePeople,
} from '@rus/materialization';
import { createNpcRoutineState, resolveNpcRoutinePresence,
  selectNpcRoutineSchedule } from '@rus/npc-runtime';
import { serverError } from '../../errors.js';
import { prepareGeneratedNpcFirstEntry } from './generated-npc-first-entry.js';

const PEOPLE_KINDS = new Set(['occupation', 'social_role']);
/** Plain absence of approved data: recorded as a gap. Everything else (wiring, invariants, broken closure) fails the arrival. */
const isDataGap = (code) => (/_DATA_GAP$/.test(code) && code !== 'PROCEDURAL_NPC_SOURCE_BINDING_DATA_GAP')
  || code === 'NPC_COMPOSITION_REGIONAL_CONTEXT_GAP' || /_POSITION_CAPACITY_GAP$/.test(code);

/** Outcomes of occupation/social_role rules as the R-2a engine stored them in the presence aggregate. */
function ruleOutcomes(aggregate, rules) {
  const byRef = new Map(rules.map((rule) => [`${rule.rule_id}@${rule.rule_version}`, rule]));
  return (aggregate?.presence_resolutions ?? [])
    .filter((record) => isPresenceRuleRecord(record) && PEOPLE_KINDS.has(record.subject_kind) && byRef.has(record.rule_ref))
    .map((record) => {
      const rule = byRef.get(record.rule_ref);
      return { rule_id: rule.rule_id, rule_version: rule.rule_version, scope_ref: rule.scope_ref,
        subject_kind: record.subject_kind, subject_ref: record.subject_ref, count: record.count };
    });
}

/**
 * People of a canonical place on first arrival (D49): D-2 compositions of its primary place families and the outcomes of
 * the occupation/role presence rules already stored in the presence aggregate (`presenceAggregate`, §3A.1), materialized
 * through the generated-NPC first-entry writer. Returns null when the resolver context carries no people information.
 * A plain data gap creates nobody and goes into the returned trace; any other failure throws. `failure` is set when the
 * factual context is unusable.
 */
export async function prepareCanonicalPlacePeople({ context, site, presenceContext, presenceAggregate = null, worldBaseReader,
  readFactualContext, approvedActorTemporalBundle, actorProfile, itemPin,
  selectItemMaterial } = {}) {
  const info = presenceContext?.people;
  if (!info) return null;
  const { request, proposal, change_set_id: changeSetId } = context;
  const rules = presenceContext.rules ?? [];
  const relationshipRules = approvedActorTemporalBundle?.npc_relationship_materialization_rules ?? [];
  if (relationshipRules.length > 0 && (info.compositions ?? []).some((composition) =>
    !Array.isArray(composition.slot_relationships))) {
    throw serverError('NPC_RELATIONSHIP_SOURCE_GAP',
      'The approved D-2 composition omitted its slot relationship source facts.',
      { status: 409, public_exposure: 'internal' });
  }
  const { wanted, trace: wantTrace } = wantPlacePeople({ party_id: request.party_id,
    scope_instance_ref: presenceContext.scopeInstanceRef, compositions: info.compositions ?? [],
    rule_outcomes: ruleOutcomes(presenceAggregate, rules) });
  // People rules were not rolled into an aggregate (the natural branch has no usable presence profile): say so.
  const preGaps = !presenceAggregate && rules.some((rule) => PEOPLE_KINDS.has(rule.subject_kind))
    ? [{ code: 'people_presence_aggregate_unavailable' }] : [];
  const nobody = (gaps) => ({ created_count: 0, trace: { ...wantTrace, gaps: [...preGaps, ...gaps] } });
  if (wanted.length === 0) return nobody([]);
  if (typeof worldBaseReader?.readPlacePeopleCandidates !== 'function'
    || typeof worldBaseReader.readPlacePeopleClosure !== 'function') {
    throw serverError('PLACE_PEOPLE_READER_REQUIRED', 'The place-people reader port is not installed.',
      { status: 409, public_exposure: 'internal' });
  }
  const canonical = { id: site.canonical_g5_ref?.entity_id ?? site.canonical_g5_ref?.id,
    version: Number(site.canonical_g5_ref?.authoring_version ?? site.canonical_g5_ref?.version) };
  const scene = { party_id: request.party_id, site_id: proposal.target_site_id, rows: proposal.inserts };
  const refuse = (read) => serverError('PLACE_PEOPLE_READ_INVALID', 'The approved data for the people of a place is invalid.',
    { status: 409, details: { reason: read.reason }, public_exposure: 'internal' });
  const candidates = await worldBaseReader.readPlacePeopleCandidates({ g4: request.g4, canonical_g5: canonical,
    subjects: wanted.map(({ subject_kind, subject_ref, profile_id }) => ({ subject_kind, subject_ref, profile_id })) });
  if (!candidates.ok) {
    if (candidates.soft) return nobody([{ code: 'people_data_unavailable', reason: candidates.reason }]);
    throw refuse(candidates);
  }
  let capacity;
  try { capacity = placePeopleCapacity(scene, candidates.placement_policy); } catch (error) {
    if (typeof error?.code === 'string' && isDataGap(error.code)) {
      return nobody([{ code: 'people_placement_unavailable', reason: error.code }]);
    }
    throw error;
  }
  // Identity/existence is resolved without spending a physical slot. Exact D-1
  // presence is projected below; only people actually on this site consume it.
  const decided = resolvePlacePeople({ wanted, candidates: candidates.candidates,
    bundle: approvedActorTemporalBundle, capacity: Math.max(capacity, wanted.length) });
  const trace = { ...wantTrace, gaps: [...preGaps, ...decided.gaps] };
  if (decided.people.length === 0) return { created_count: 0, trace };
  const closure = await worldBaseReader.readPlacePeopleClosure({ g4: request.g4, canonical_g5: canonical,
    profile_refs: [...new Map(decided.people.map((person) => [`${person.profile_ref.id}:${person.profile_ref.version}`,
      person.profile_ref])).values()], placement_policy: candidates.placement_policy });
  if (!closure.ok) throw refuse(closure);
  const factual = await readFactualContext(context);
  if (!factual?.ok || factual.party_id !== request.party_id || factual.world_revision_id !== request.g4.world_revision_id
    || !factual.started_at || !factual.calendar_profile
    || factual.environment?.schema !== 'rus.approved_initial_environment.v1'
    || typeof factual.recheck !== 'function') return { failure: factual?.ok === false ? factual : null };
  const runId = `trace:${changeSetId}`;
  try {
    const schedulePlan = resolveInitialSchedulePlacements({ people: decided.people,
      scheduleRulesByPlaceFamily: info.schedule_routine_rules_by_place_family ?? [],
      compositions: info.compositions ?? [], startedAt: factual.started_at,
      calendarProfile: factual.calendar_profile, capacity });
    const compiled = compilePlacePeopleBindings({ party_id: request.party_id, run_id: runId, scene, closure: closure.closure,
      people: decided.people, approved_bundle: approvedActorTemporalBundle, environment: factual.environment,
      placement_state_by_identity: schedulePlan.placementStates,
      actor_base_attributes_runtime_profile: actorProfile, equipment_activation: { status: 'active' },
      equipment_catalog_digest: itemPin.catalog_digest, world_catalog_digest: itemPin.compatible_world_catalog_digest });
    for (const [index, plan] of schedulePlan.byPerson.entries()) {
      if (plan.routine_profile) compiled.npc_inputs[index].routine_profile = plan.routine_profile;
      if (plan.schedule_context) compiled.npc_inputs[index].schedule_context = plan.schedule_context;
      if (plan.gap_reason) compiled.npc_inputs[index].schedule_gap_reason = plan.gap_reason;
    }
    const npc = prepareGeneratedNpcFirstEntry({ party_id: request.party_id, run_id: runId, change_set_id: changeSetId,
      world_revision_id: request.g4.world_revision_id, g4_ref: request.g4, canonical_g5_ref: canonical, scene,
      npc_relationship_materialization_rules: relationshipRules,
      relationship_compositions: info.compositions ?? [],
      ...compiled, started_at: factual.started_at, calendar_profile: factual.calendar_profile,
      selectItemMaterial });
    return { created_count: npc.validation_report.created_count, write_set: npc.write_set,
      expected_state_versions: factual.expected_state_versions ?? [], commit_rechecks: factual.commit_rechecks ?? [],
      recheck: factual.recheck, choices: npc.choices, attribute_traces: npc.attribute_traces,
      validation_report: npc.validation_report, selection: compiled.selection_trace,
      trace: { ...trace, gaps: [...trace.gaps, ...schedulePlan.gaps] } };
  } catch (error) {
    if (typeof error?.code !== 'string' || !isDataGap(error.code)) throw error;
    return { created_count: 0, trace: { ...trace, gaps: [...preGaps, ...decided.gaps, { code: 'people_compile_failed', reason: error.code }] } };
  }
}

function resolveInitialSchedulePlacements({ people, scheduleRulesByPlaceFamily,
  compositions, startedAt, calendarProfile, capacity }) {
  const byPerson = [];
  const placementStates = [];
  const gaps = [];
  let onSiteCount = 0;
  for (const person of people) {
    const matchingCompositions = compositions.filter((entry) =>
      entry.place_family_id === person.place_family_id);
    const composition = matchingCompositions.length === 1
      ? matchingCompositions[0] : null;
    const scheduledAbsences = (composition?.scheduled_absences ?? []).filter((entry) =>
      entry.subject_kind === person.subject_kind && entry.subject_ref === person.subject_ref);
    const rows = scheduleRulesByPlaceFamily
      .filter((entry) => entry.place_family_id === person.place_family_id)
      .flatMap((entry) => entry.rules ?? [])
      .filter((row) => row.scope_kind === 'place_family'
        && row.scope_ref === person.place_family_id
        && row.subject_kind === person.subject_kind
        && row.subject_ref === person.subject_ref);
    const scheduleContext = { home_scope_ref: person.place_family_id,
      subject_kind: person.subject_kind, subject_ref: person.subject_ref,
      day_type: 'normal', approved_rule_rows: structuredClone(rows),
      calendar_profile: structuredClone(calendarProfile),
      scheduled_absences: structuredClone(scheduledAbsences),
      ...(composition?.composition_ref ? {
        composition_ref: structuredClone(composition.composition_ref) } : {}) };
    if (!rows.length) {
      const presence = resolveNpcRoutinePresence({ schedule_context: scheduleContext,
        scheduled_at: startedAt, allow_home_baseline: true,
        facts: { first_entry_binding: firstEntryBinding(composition, person) } });
      byPerson.push({ ...(presence.gap_reason ? { gap_reason: presence.gap_reason } : {}) });
      placementStates.push({ state: presence.presence_state, location_ref: presence.location_ref });
      if (presence.presence_state === 'on_site') onSiteCount += 1;
      if (presence.gap_reason) gaps.push({ code: presence.gap_reason,
        subject_kind: person.subject_kind, subject_ref: person.subject_ref,
        place_family_id: person.place_family_id, location_ref: presence.location_ref });
      continue;
    }
    try {
      const selected = selectNpcRoutineSchedule({ schedule_context: scheduleContext,
        scheduled_at: startedAt });
      const initial = createNpcRoutineState({ profile: selected.rule.routine_profile,
        started_at: startedAt, calendar_profile: calendarProfile });
      const phase = initial.profile.phases[initial.phase_index];
      const presence = resolveNpcRoutinePresence({ intent: phase,
        schedule_context: selected.schedule_context, scheduled_at: startedAt,
        facts: { first_entry_binding: firstEntryBinding(composition, person) } });
      const plan = { routine_profile: selected.rule.routine_profile,
        schedule_context: selected.schedule_context };
      if (presence.gap_reason) plan.gap_reason = presence.gap_reason;
      if (presence.presence_state === 'on_site') onSiteCount += 1;
      byPerson.push(plan);
      placementStates.push({ state: presence.presence_state, location_ref: presence.location_ref });
      if (presence.gap_reason) gaps.push({ code: presence.gap_reason,
        subject_kind: person.subject_kind, subject_ref: person.subject_ref,
        place_family_id: person.place_family_id, location_ref: presence.location_ref });
    } catch (error) {
      if (error?.code !== 'npc_schedule_gap') throw error;
      const presence = resolveNpcRoutinePresence({ schedule_context: scheduleContext,
        intent: { presence_state: 'on_site', location_ref: null },
        scheduled_at: startedAt,
        facts: { first_entry_binding: firstEntryBinding(composition, person) } });
      const gapReason = presence.gap_reason ?? error.code;
      byPerson.push({ gap_reason: gapReason });
      placementStates.push({ state: presence.presence_state, location_ref: presence.location_ref });
      gaps.push({ code: gapReason, subject_kind: person.subject_kind,
        subject_ref: person.subject_ref, place_family_id: person.place_family_id,
        location_ref: presence.location_ref });
    }
  }
  let excess = Math.max(0, onSiteCount - capacity);
  for (let index = placementStates.length - 1; index >= 0 && excess > 0; index -= 1) {
    if (placementStates[index].state !== 'on_site') continue;
    placementStates[index] = { state: 'location_gap',
      location_ref: placementStates[index].location_ref };
    byPerson[index].gap_reason = 'npc_location_capacity_gap';
    gaps.push({ code: 'npc_location_capacity_gap', location_ref: placementStates[index].location_ref });
    excess -= 1;
  }
  return { byPerson, placementStates, gaps };
}

function firstEntryBinding(composition, person) {
  const locationRef = person?.place_family_id;
  if (typeof locationRef !== 'string' || !locationRef) return null;
  const personComposition = person.place_population_composition_ref;
  if (Boolean(personComposition) === Boolean(person.presence_rule_ref)) return null;
  if (personComposition) {
    const ref = composition?.composition_ref;
    if (composition?.place_family_id !== locationRef
        || typeof ref?.id !== 'string' || !ref.id
        || !validVersion(ref.version) || !validVersion(personComposition.version)
        || ref?.id !== personComposition.id
        || String(ref?.version) !== String(personComposition.version)
        || ref?.world_revision_id !== personComposition.world_revision_id) return null;
    return { location_ref: locationRef,
      binding_ref: { entity_id: ref.id, authoring_version: String(ref.version) } };
  }
  const rule = person.presence_rule_ref;
  if (typeof rule?.rule_id !== 'string' || !rule.rule_id
      || !validVersion(rule.rule_version)) return null;
  return { location_ref: locationRef,
    binding_ref: { entity_id: rule.rule_id,
      authoring_version: String(rule.rule_version) } };
}
function validVersion(value) { return (typeof value === 'string' || Number.isSafeInteger(value))
  && Number.isSafeInteger(Number(value)) && Number(value) > 0; }
