import { computeSpatialV3CanonicalDigest as digest }
  from '@rus/contracts/spatial-v3/registry';

const stable = (value) => typeof value === 'string'
  && value.trim().length > 0;

export function validLocalFireTemporalEvidence({ evidence,
  canonical_input_digest: canonicalInputDigest,
  local_fire_atomic_write_plan: localFire, party_id: partyId }) {
  const keys = ['schema','base_canonical_input_digest',
    'temporal_result_digest','temporal_fragment_digests',
    'candidate_evidence','canonical_digest'];
  if (!exactData(evidence, keys)
      || evidence.schema
        !== 'rus.turn.local_fire_temporal_integration_evidence.v1'
      || !stable(evidence.base_canonical_input_digest)
      || !stable(evidence.temporal_result_digest)
      || !Array.isArray(evidence.temporal_fragment_digests)
      || evidence.temporal_fragment_digests.some((value) => !stable(value))
      || !validCandidate(evidence.candidate_evidence,
        localFire, partyId)) return false;
  const { canonical_digest, ...payload } = evidence;
  return canonical_digest === digest(payload)
    && canonicalInputDigest === digest({
      command_input_digest: evidence.base_canonical_input_digest,
      temporal_result_digest: evidence.temporal_result_digest,
      temporal_fragment_digests: evidence.temporal_fragment_digests });
}

function validCandidate(evidence, localFire, partyId) {
  const keys = ['schema','rule_ref','policy_ref','candidate_snapshot',
    'candidate_digest','local_fire_write_plan_digest',
    'resolution_identity_digest'];
  const candidateKeys = ['boundary_id','boundary_kind','scheduled_at',
    'source_ref','primary_subject_ref','scope_ref','rule_ref','policy_ref',
    'preconditions_digest','resolution_class','interrupt_effect',
    'visibility_policy_ref','idempotency_key','subject_refs',
    'causal_parent_refs'];
  const candidate = evidence?.candidate_snapshot;
  const transition = localFire?.transition_proposal;
  const process = transition?.process_before;
  const authority = localFire?.authority_pin?.persisted_row;
  const boundaryId = `local-fire:${process?.process_ref}:state:${
    process?.state_version}`;
  const subjects = process?.fuel_bindings?.map(({ fuel_ref: ref }) =>
    ({ entity_kind: 'item', entity_id: ref }));
  return exactData(evidence, keys) && exactData(candidate, candidateKeys)
    && evidence.schema === 'rus.turn.local_fire_temporal_candidate_evidence.v1'
    && candidate.boundary_id === boundaryId
    && candidate.boundary_kind === 'world_process'
    && candidate.source_ref?.entity_kind === 'local_world_process'
    && candidate.source_ref.entity_id === process?.process_ref
    && same(candidate.primary_subject_ref, subjects?.[0])
    && same(candidate.scope_ref,
      { entity_kind: 'party', entity_id: partyId })
    && same(candidate.rule_ref, evidence.rule_ref)
    && evidence.rule_ref?.entity_ref?.entity_kind === 'world_process_rule'
    && evidence.rule_ref.entity_ref.entity_id === 'local_exact_fire_due_v1'
    && evidence.rule_ref.authoring_version === '1'
    && same(candidate.policy_ref, evidence.policy_ref)
    && evidence.policy_ref?.entity_ref?.entity_kind === 'world_process_policy'
    && evidence.policy_ref.entity_ref.entity_id === authority?.policy_ref
    && evidence.policy_ref.authoring_version === String(authority?.policy_version)
    && candidate.resolution_class === 'local_exact_fire_due'
    && candidate.interrupt_effect === 'background'
    && same(candidate.visibility_policy_ref, evidence.policy_ref)
    && candidate.idempotency_key === boundaryId
    && same(candidate.subject_refs, subjects)
    && Array.isArray(candidate.causal_parent_refs)
    && candidate.causal_parent_refs.length === 0
    && evidence.candidate_digest === digest(candidate)
    && same(candidate.scheduled_at, process?.next_boundary_at)
    && same(candidate.scheduled_at, transition?.at_timestamp)
    && candidate.preconditions_digest === digest({
      process_state: process, expected_state_version: process?.state_version })
    && transition?.causal_identity?.action_ref
      === `local-fire-boundary:${boundaryId}`
    && evidence.local_fire_write_plan_digest === localFire?.write_plan_digest;
}

function exactData(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function same(left, right) {
  return digest(left) === digest(right);
}
