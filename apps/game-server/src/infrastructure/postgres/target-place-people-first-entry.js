import {
  canonicalDigest,
  compilePlacePeopleBindings,
  decidePlacePeople,
  placePeopleCapacity,
} from '@rus/materialization';
import { prepareGeneratedNpcFirstEntry } from './generated-npc-first-entry.js';

const PEOPLE_KINDS = new Set(['occupation', 'social_role']);

/**
 * People of a canonical place on first arrival (D49): D-2 composition of its primary place family plus the
 * approved presence rules for occupations and roles, materialized through the generated-NPC first-entry writer.
 * Returns null when the resolver context names no people subjects. A data gap never fails the arrival: nobody is
 * created and the gap goes into the returned trace. `failure` is set when the factual context is unusable.
 */
export async function prepareCanonicalPlacePeople({ context, site, presenceContext, worldBaseReader,
  readFactualContext, approvedActorTemporalBundle, actorProfile, itemPin } = {}) {
  const info = presenceContext?.people;
  const rules = (presenceContext?.rules ?? []).filter((rule) => PEOPLE_KINDS.has(rule.subject_kind));
  const subjects = new Map();
  for (const group of info?.composition?.population_groups ?? []) {
    for (const subject of group.weighted_subjects ?? []) {
      subjects.set(`${subject.subject_kind}:${subject.subject_ref}:${subject.profile_ref ?? ''}`,
        { subject_kind: subject.subject_kind, subject_ref: subject.subject_ref, profile_id: subject.profile_ref ?? null });
    }
  }
  for (const rule of rules) {
    subjects.set(`${rule.subject_kind}:${rule.subject_ref}:`,
      { subject_kind: rule.subject_kind, subject_ref: rule.subject_ref, profile_id: null });
  }
  if (!info || subjects.size === 0) return null;
  const { request, proposal, change_set_id: changeSetId } = context;
  const noOne = (gaps, extra = {}) => ({ created_count: 0, trace: { version: 'place_people_first_arrival_v1', gaps, ...extra } });
  if (typeof worldBaseReader?.readPlacePeopleClosure !== 'function') return noOne([{ code: 'people_reader_missing' }]);
  const canonical = { id: site.canonical_g5_ref?.entity_id ?? site.canonical_g5_ref?.id,
    version: Number(site.canonical_g5_ref?.authoring_version ?? site.canonical_g5_ref?.version) };
  const scene = { party_id: request.party_id, site_id: proposal.target_site_id, rows: proposal.inserts };
  const read = await worldBaseReader.readPlacePeopleClosure({ g4: request.g4, canonical_g5: canonical,
    subjects: [...subjects.values()] });
  if (!read.ok) return noOne([{ code: 'people_closure_unavailable', reason: read.reason }]);
  let capacity;
  try { capacity = placePeopleCapacity(scene, read.closure.placement_policy); } catch (error) {
    return noOne([{ code: 'people_placement_unavailable', reason: error.code ?? 'unknown' }]);
  }
  const decided = decidePlacePeople({ party_id: request.party_id, scope_instance_ref: presenceContext.scopeInstanceRef,
    composition: info.composition, rules, period_number: presenceContext.periodNumber, candidates: read.candidates,
    bundle: approvedActorTemporalBundle, capacity });
  const trace = { ...decided.trace, gaps: decided.gaps };
  if (decided.people.length === 0) return { created_count: 0, trace };
  const factual = await readFactualContext(context);
  if (!factual?.ok || factual.party_id !== request.party_id || factual.world_revision_id !== request.g4.world_revision_id
    || !factual.started_at || !factual.calendar_profile
    || factual.environment?.schema !== 'rus.approved_initial_environment.v1'
    || typeof factual.recheck !== 'function') return { failure: factual?.ok === false ? factual : null };
  const runId = `trace:${changeSetId}`;
  const compositionRef = { ...(info.composition?.composition_ref ?? { id: 'place_people', version: 1 }) };
  try {
    const compiled = compilePlacePeopleBindings({ party_id: request.party_id, run_id: runId, scene,
      closure: { ...read.closure, composition_ref: { id: compositionRef.id, version: compositionRef.version,
        canonical_digest: canonicalDigest({ composition_ref: compositionRef, groups: info.composition?.population_groups ?? [],
          rules: rules.map((rule) => `${rule.rule_id}@${rule.rule_version}`) }) } },
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
    if (typeof error?.code !== 'string') throw error;
    return { created_count: 0, trace: { ...trace, gaps: [...decided.gaps, { code: 'people_compile_failed', reason: error.code }] } };
  }
}
