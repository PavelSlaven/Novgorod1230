import { validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';
import { compareGameTimestamp } from '@rus/time-events-history';
import { NPC_RUNTIME_OWNER, NPC_RUNTIME_RESOURCE_LIMITS } from './runtime-configuration.js';
import {
  blocked,
  dependencyPins,
  digest,
  entityRef,
  exactKeys,
  freeze,
  normalizeTimestamp,
  pinned,
  positiveDecimal,
  sealedRecord,
  sameRef,
  stableId,
  success,
  uniqueEntityRefs,
  versionedRef
} from './internal.js';

const INTERRUPTION_EFFECTS = new Set(['background', 'emergency', 'hard_interrupt', 'interaction', 'notice', 'strand']);
const RUNTIME_STATUSES = new Set(['available', 'unavailable', 'sleeping', 'travelling']);
const NPC_STATE_KEYS = [
  'npc_ref', 'state_version', 'schedule_profile_ref', 'schedule_state_id',
  'current_activity_execution_ref', 'placement_ref', 'attention_state_ref', 'body_state_ref',
  'knowledge_state_ref', 'relationship_state_ref', 'next_transition_at', 'runtime_status', 'canonical_digest'
];
const SCHEDULE_PROFILE_KEYS = [
  'profile_ref', 'status', 'provenance_ref', 'applicability', 'boundary_policy_ref',
  'visibility_policy_ref', 'interrupt_effect', 'transitions', 'canonical_digest'
];
const TRANSITION_KEYS = [
  'transition_id', 'from_schedule_state_id', 'to_schedule_state_id', 'at',
  'activity_profile_ref', 'next_boundary_at', 'runtime_status'
];
const RECHECK_KEYS = [
  'observed_state_version', 'placement_ref', 'access_ok', 'orders_ok', 'danger_ok',
  'body_ok', 'activity_ok', 'canonical_digest'
];
const SCHEDULE_EVIDENCE_KEYS = [
  'idempotency_key', 'input_digest', 'proposal_digest', 'result_state_version', 'canonical_digest'
];

function validateNpcState(value) {
  return exactKeys(value, NPC_STATE_KEYS)
    && sealedRecord(value)
    && entityRef(value.npc_ref, 'npc')
    && positiveDecimal(value.state_version)
    && versionedRef(value.schedule_profile_ref, 'activity_profile')
    && stableId(value.schedule_state_id)
    && (value.current_activity_execution_ref === null || entityRef(value.current_activity_execution_ref, 'party_timed_activity_execution'))
    && entityRef(value.placement_ref, 'entity_placement')
    && entityRef(value.attention_state_ref)
    && entityRef(value.body_state_ref, 'body_state')
    && entityRef(value.knowledge_state_ref)
    && entityRef(value.relationship_state_ref)
    && normalizeTimestamp(value.next_transition_at) !== null
    && RUNTIME_STATUSES.has(value.runtime_status);
}

function validateScheduleProfile(value, state) {
  if (!exactKeys(value, SCHEDULE_PROFILE_KEYS) || !sealedRecord(value) || value.status !== 'approved'
    || !versionedRef(value.profile_ref, 'activity_profile') || !versionedRef(value.provenance_ref, 'source_record')
    || !versionedRef(value.boundary_policy_ref) || !versionedRef(value.visibility_policy_ref)
    || !INTERRUPTION_EFFECTS.has(value.interrupt_effect) || !exactKeys(value.applicability, ['npc_refs', 'placement_refs'])
    || !uniqueEntityRefs(value.applicability.npc_refs) || !uniqueEntityRefs(value.applicability.placement_refs)
    || !value.applicability.npc_refs.some((entry) => sameRef(entry, state.npc_ref))
    || !value.applicability.placement_refs.some((entry) => sameRef(entry, state.placement_ref))
    || !Array.isArray(value.transitions) || value.transitions.length === 0
    || value.transitions.length > NPC_RUNTIME_RESOURCE_LIMITS.max_schedule_transitions) return false;
  const ids = new Set();
  for (const transition of value.transitions) {
    if (!exactKeys(transition, TRANSITION_KEYS) || !stableId(transition.transition_id) || ids.has(transition.transition_id)
      || !stableId(transition.from_schedule_state_id) || !stableId(transition.to_schedule_state_id)
      || normalizeTimestamp(transition.at) === null || !versionedRef(transition.activity_profile_ref, 'activity_profile')
      || normalizeTimestamp(transition.next_boundary_at) === null || !RUNTIME_STATUSES.has(transition.runtime_status)) return false;
    ids.add(transition.transition_id);
  }
  return sameRef(value.profile_ref.entity_ref, state.schedule_profile_ref.entity_ref)
    && value.profile_ref.authoring_version === state.schedule_profile_ref.authoring_version;
}

function validateSchedulePins(pinSet, profile, transition) {
  return dependencyPins(pinSet) && pinned(pinSet, 'profile', profile.profile_ref)
    && pinned(pinSet, 'source_dependency', profile.provenance_ref)
    && pinned(pinSet, 'condition_rule', profile.boundary_policy_ref)
    && pinned(pinSet, 'condition', profile.visibility_policy_ref)
    && pinned(pinSet, 'profile', transition.activity_profile_ref);
}

function validateRecheck(value, state) {
  return exactKeys(value, RECHECK_KEYS) && sealedRecord(value)
    && value.observed_state_version === state.state_version && sameRef(value.placement_ref, state.placement_ref)
    && ['access_ok', 'orders_ok', 'danger_ok', 'body_ok', 'activity_ok'].every((key) => value[key] === true);
}

function scheduleEvidence(value) {
  return exactKeys(value, SCHEDULE_EVIDENCE_KEYS) && sealedRecord(value) && stableId(value.idempotency_key)
    && typeof value.input_digest === 'string' && typeof value.proposal_digest === 'string'
    && positiveDecimal(value.result_state_version);
}

export function proposeNpcScheduleTransition(input = {}) {
  const state = input.npc_state;
  const profile = input.schedule_profile;
  if (!validateNpcState(state)) return blocked('npc_schedule_gap', 'A sealed normalized NPC runtime state is required');
  if (!validateScheduleProfile(profile, state)) return blocked('npc_schedule_gap', 'An applicable approved sealed schedule profile is required', state.npc_ref, input.dependency_pins);
  const scheduledAt = normalizeTimestamp(input.scheduled_at);
  if (!scheduledAt) return blocked('time_timestamp_invalid', 'scheduled_at must be an exact GameTimestamp', state.npc_ref, input.dependency_pins);
  const dueAt = normalizeTimestamp(state.next_transition_at);
  if (compareGameTimestamp(dueAt, scheduledAt) !== 0) return blocked('temporal_candidate_stale', 'NPC transition is not due at the supplied boundary', state.npc_ref, input.dependency_pins);
  const matches = profile.transitions.filter((transition) => transition.from_schedule_state_id === state.schedule_state_id && compareGameTimestamp(transition.at, scheduledAt) === 0);
  if (matches.length !== 1) return blocked('npc_schedule_gap', 'Exactly one approved schedule transition must match the current state and timestamp', state.npc_ref, input.dependency_pins);
  const transition = matches[0];
  if (!validateSchedulePins(input.dependency_pins, profile, transition)) return blocked('npc_schedule_gap', 'Schedule profile, source, boundary, visibility and activity refs require matching pins', state.npc_ref, input.dependency_pins);
  if (!validateRecheck(input.recheck_snapshot, state)) return blocked('activity_precondition_stale', 'Placement, access, orders, danger, body or activity recheck failed', state.npc_ref, input.dependency_pins);
  const nextBoundaryAt = normalizeTimestamp(transition.next_boundary_at);
  if (compareGameTimestamp(nextBoundaryAt, scheduledAt) <= 0) return blocked('temporal_execution_unbounded', 'The next NPC schedule boundary must be exact and later', state.npc_ref, input.dependency_pins);

  const inputDigest = digest({ scheduled_at: scheduledAt, npc_state_digest: state.canonical_digest, schedule_profile_digest: profile.canonical_digest, dependency_pins_digest: input.dependency_pins.canonical_digest, recheck_snapshot_digest: input.recheck_snapshot.canonical_digest });
  const idempotencyKey = `npc-schedule:${state.npc_ref.entity_id}:${state.state_version}:${transition.transition_id}`;
  const boundaryCandidate = { boundary_id: idempotencyKey, boundary_kind: 'npc_schedule', scheduled_at: scheduledAt, source_ref: profile.provenance_ref.entity_ref, primary_subject_ref: state.npc_ref, scope_ref: state.placement_ref, rule_ref: profile.profile_ref, policy_ref: profile.boundary_policy_ref, preconditions_digest: inputDigest, resolution_class: 'npc_schedule', interrupt_effect: profile.interrupt_effect, visibility_policy_ref: profile.visibility_policy_ref, idempotency_key: idempotencyKey, subject_refs: [state.npc_ref], causal_parent_refs: [] };
  if (validateSpatialV3Contract('temporal_boundary_candidate', boundaryCandidate).length > 0) return blocked('generated_schema_mismatch', 'NPC provider produced a non-formal boundary candidate', state.npc_ref, input.dependency_pins);
  const proposalPayload = { proposal_kind: 'npc_schedule_transition', npc_ref: state.npc_ref, expected_state_version: state.state_version, next_state_version: (BigInt(state.state_version) + 1n).toString(), transition_id: transition.transition_id, next_schedule_state_id: transition.to_schedule_state_id, next_activity_profile_ref: transition.activity_profile_ref, next_runtime_status: transition.runtime_status, next_boundary_at: nextBoundaryAt, boundary_candidate: boundaryCandidate };
  const proposal = freeze({ ...proposalPayload, canonical_digest: digest(proposalPayload) });
  const evidencePayload = { idempotency_key: idempotencyKey, input_digest: inputDigest, proposal_digest: proposal.canonical_digest, result_state_version: proposal.next_state_version };
  const transitionEvidence = freeze({ ...evidencePayload, canonical_digest: digest(evidencePayload) });
  if (input.persisted_transition !== undefined) {
    if (!scheduleEvidence(input.persisted_transition) || input.persisted_transition.idempotency_key !== idempotencyKey) return blocked('temporal_change_set_conflict', 'Persisted schedule transition does not belong to this boundary', state.npc_ref, input.dependency_pins);
    if (input.persisted_transition.input_digest !== inputDigest || input.persisted_transition.proposal_digest !== proposal.canonical_digest || input.persisted_transition.result_state_version !== proposal.next_state_version) return blocked('idempotency_conflict', 'Persisted schedule transition conflicts with the current immutable input', state.npc_ref, input.dependency_pins);
    return success({ proposal, transition_evidence: input.persisted_transition, replay_status: 'already_committed', trace: { owner: NPC_RUNTIME_OWNER, profile_digest: profile.canonical_digest, dependency_pins_digest: input.dependency_pins.canonical_digest, input_digest: inputDigest } });
  }
  return success({ proposal, transition_evidence: transitionEvidence, replay_status: 'new', trace: { owner: NPC_RUNTIME_OWNER, profile_digest: profile.canonical_digest, dependency_pins_digest: input.dependency_pins.canonical_digest, input_digest: inputDigest } });
}
