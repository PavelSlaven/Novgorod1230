import {
  compilePlacePeopleBindings,
  isPresenceRuleRecord,
  placePeopleCapacity,
  resolvePlacePeople,
  wantPlacePeople,
} from '@rus/materialization';
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
  readFactualContext, approvedActorTemporalBundle, actorProfile, itemPin } = {}) {
  const info = presenceContext?.people;
  if (!info) return null;
  const { request, proposal, change_set_id: changeSetId } = context;
  const rules = presenceContext.rules ?? [];
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
  const decided = resolvePlacePeople({ wanted, candidates: candidates.candidates,
    bundle: approvedActorTemporalBundle, capacity });
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
    const compiled = compilePlacePeopleBindings({ party_id: request.party_id, run_id: runId, scene, closure: closure.closure,
      people: decided.people, approved_bundle: approvedActorTemporalBundle, environment: factual.environment,
      actor_base_attributes_runtime_profile: actorProfile, equipment_activation: { status: 'active' },
      equipment_catalog_digest: itemPin.catalog_digest, world_catalog_digest: itemPin.compatible_world_catalog_digest });
    const npc = prepareGeneratedNpcFirstEntry({ party_id: request.party_id, run_id: runId, change_set_id: changeSetId,
      world_revision_id: request.g4.world_revision_id, g4_ref: request.g4, canonical_g5_ref: canonical, scene,
      ...compiled, started_at: factual.started_at, calendar_profile: factual.calendar_profile });
    return { created_count: npc.validation_report.created_count, write_set: npc.write_set,
      expected_state_versions: factual.expected_state_versions ?? [], commit_rechecks: factual.commit_rechecks ?? [],
      recheck: factual.recheck, choices: npc.choices, attribute_traces: npc.attribute_traces,
      validation_report: npc.validation_report, selection: compiled.selection_trace, trace };
  } catch (error) {
    if (typeof error?.code !== 'string' || !isDataGap(error.code)) throw error;
    return { created_count: 0, trace: { ...trace, gaps: [...preGaps, ...decided.gaps, { code: 'people_compile_failed', reason: error.code }] } };
  }
}
