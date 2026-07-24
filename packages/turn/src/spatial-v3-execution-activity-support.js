import {
  addElapsedTime,
  compareGameTimestamp,
  compareRationalMinutes
} from '@rus/time-events-history';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  ACTIVITY_STATUSES,
  isGameTimestamp,
  isRational,
  isRecord,
  positiveDecimalString,
  sealedPinSet,
  sealedRecord,
  stableId
} from './spatial-v3-execution-validation.js';
import { clone, deepFreeze, sameRational, timestampEqual, typedError } from './spatial-v3-execution-support.js';

export const activityError = (code = 'activity_transition_invalid', diagnostics = {}) => typedError(code, diagnostics);
export const contractValid = (name, value) => validateSpatialV3Contract(name, value).length === 0;
export const exactKeys = (value, allowed) => isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));

export function activitySnapshot(value) {
  return sealedRecord(value) && sealedRecord(value.activity_profile_ref) &&
    sealedRecord(value.completion_model_snapshot) && sealedPinSet(value.dependency_pins) &&
    contractValid('timed_activity_static_snapshot', value);
}

export function activityState(value) {
  return contractValid('party_timed_activity_execution', value) && ACTIVITY_STATUSES.has(value.status) &&
    activitySnapshot(value.activity_snapshot) && isGameTimestamp(value.started_at) &&
    isGameTimestamp(value.last_processed_at) && isRational(value.exact_elapsed) &&
    positiveDecimalString(value.state_version) &&
    (value.progress == null || (sealedRecord(value.progress) && contractValid('activity_progress_snapshot', value.progress))) &&
    (value.active_participant_bindings ?? []).every((binding) => contractValid('participant_binding', binding)) &&
    (value.reserved_resource_bindings ?? []).every((binding) => contractValid('resource_binding', binding));
}

export const nextStateVersion = (value) => (BigInt(value) + 1n).toString();
export const modelOf = (state) => state.activity_snapshot.completion_model_snapshot;
export const expectedVersion = (input, state) => positiveDecimalString(input.expected_state_version) && input.expected_state_version === state.state_version;

function earliestTimestamp(...values) {
  const timestamps = values.filter((value) => value != null);
  return timestamps.reduce((earliest, value) => compareGameTimestamp(value, earliest) < 0 ? value : earliest);
}

export function initialActivityBoundary(startedAt, model) {
  if (model.kind === 'fixed_exact') return addElapsedTime(startedAt, { exact_minutes: model.fixed_duration });
  return earliestTimestamp(model.next_recheck_at, model.hard_deadline_at);
}

export function validateBindings(name, values) {
  return Array.isArray(values) && values.every((value) => contractValid(name, value));
}

function activityInputDigest(input) {
  const canonicalInput = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'persisted_replay'));
  return computeSpatialV3CanonicalDigest(canonicalInput);
}

export function activityReplay(replays, input, state) {
  const candidate = input.boundary_candidate;
  if (!stableId(input.party_id) || !stableId(input.idempotency_record_id) || !stableId(candidate?.idempotency_key)) return null;
  const key = `activity-elapsed:${input.party_id}:${candidate.idempotency_key}`;
  const inputDigest = activityInputDigest(input);
  const expectedStateVersionsDigest = computeSpatialV3CanonicalDigest({ entries: [{
    entity_ref: { entity_kind: 'party_timed_activity_execution', entity_id: state.id }, state_version: state.state_version
  }] });
  const persisted = input.persisted_replay;
  if (persisted != null) {
    const record = persisted.record;
    if (!contractValid('idempotency_record', record) || record.id !== input.idempotency_record_id ||
      record.party_id !== input.party_id || record.operation_kind !== 'activity_elapsed' ||
      record.idempotency_key !== candidate.idempotency_key || record.canonical_input_digest !== inputDigest ||
      record.expected_state_versions_digest !== expectedStateVersionsDigest || record.status !== 'committed' || !isRecord(persisted.result)) {
      return activityError('idempotency_conflict', { execution_id: state.id });
    }
    return deepFreeze({ ...clone(persisted.result), replayed: true });
  }
  const previous = replays.get(key);
  if (previous && previous.input_digest !== inputDigest) return activityError('idempotency_conflict', { execution_id: state.id });
  return previous ? deepFreeze({ ...clone(previous.result), replayed: true }) : { key, input_digest: inputDigest, expected_state_versions_digest: expectedStateVersionsDigest };
}

export function validBoundaryCandidate(candidate, state, scheduledAt) {
  return contractValid('temporal_boundary_candidate', candidate) && candidate.boundary_kind === 'activity' &&
    candidate.source_ref.entity_kind === 'party_timed_activity_execution' && candidate.source_ref.entity_id === state.id &&
    candidate.preconditions_digest === state.preconditions_digest && timestampEqual(candidate.scheduled_at, scheduledAt);
}

const boundaryResolutionKeys = ['boundary_id', 'scheduled_at', 'preconditions_digest', 'outcome', 'reason_code', 'dependency_pins',
  'condition_met', 'progress_after', 'next_boundary_at', 'resource_reservations', 'resource_consumptions', 'body_effect_refs',
  'participant_attendance', 'participant_bindings_after', 'resource_bindings_after', 'failure_class', 'canonical_digest'];

export function validBoundaryResolution(resolution, candidate, state) {
  return sealedRecord(resolution) && exactKeys(resolution, boundaryResolutionKeys) && resolution.boundary_id === candidate.boundary_id &&
    timestampEqual(resolution.scheduled_at, candidate.scheduled_at) && resolution.preconditions_digest === state.preconditions_digest &&
    ['progressed', 'completed', 'paused', 'blocked', 'failed'].includes(resolution.outcome) && stableId(resolution.reason_code) &&
    sealedPinSet(resolution.dependency_pins) &&
    (resolution.progress_after == null || (sealedRecord(resolution.progress_after) && contractValid('activity_progress_snapshot', resolution.progress_after))) &&
    (resolution.next_boundary_at == null || isGameTimestamp(resolution.next_boundary_at)) &&
    validateBindings('resource_binding', resolution.resource_reservations ?? []) && validateBindings('resource_binding', resolution.resource_consumptions ?? []) &&
    validateBindings('participant_binding', resolution.participant_attendance ?? []) && validateBindings('participant_binding', resolution.participant_bindings_after ?? []) &&
    validateBindings('resource_binding', resolution.resource_bindings_after ?? []) &&
    (resolution.body_effect_refs ?? []).every((value) => contractValid('entity_ref', value));
}

const interruptionBoundaryOutcomes = Object.freeze({ continue: 'progressed', pause: 'paused', fail: 'failed' });
export const expectedInterruptionBoundaryOutcome = (outcome) => interruptionBoundaryOutcomes[outcome?.outcome_kind];
export function validInterruptionOutcome(outcome, state, candidate, elapsed) {
  return contractValid('interruption_outcome', outcome) && Object.hasOwn(interruptionBoundaryOutcomes, outcome.outcome_kind) &&
    outcome.execution_ref.entity_kind === 'party_timed_activity_execution' && outcome.execution_ref.entity_id === state.id &&
    outcome.boundary_ref?.entity_kind === 'temporal_boundary_candidate' && outcome.boundary_ref?.entity_id === candidate.boundary_id &&
    outcome.interruption_level === candidate.interrupt_effect && outcome.player_decision_required === false &&
    sameRational(outcome.elapsed.exact_minutes, elapsed);
}
