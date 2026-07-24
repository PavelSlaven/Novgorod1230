import {
  dependencyPins,
  digest,
  exactKeys,
  positiveInteger,
  record,
  sealedRecord,
  stableId,
  valid
} from './temporal-carriers-support.js';

const STATE_KEYS = ['party_id', 'dependency_pins', 'attachments', 'positions', 'journey_locations', 'cohort_memberships', 'carrier_capacity_snapshot', 'idempotency_records', 'approved_anchor_refs', 'canonical_digest'];
const CAPACITY_KEYS = ['carrier_kind', 'carrier_id', 'capacity', 'state_version'];
const REPLAY_ENTRY_KEYS = ['record', 'replay_result', 'replay_digest'];

export function validLimits(value) {
  return exactKeys(value, ['max_depth', 'max_attachments', 'max_capacity', 'max_idempotency_records'])
    && value.max_depth === 2
    && ['max_attachments', 'max_capacity', 'max_idempotency_records']
      .every((key) => Number.isSafeInteger(value[key]) && value[key] > 0);
}

function validCapacitySnapshot(value, limits) {
  if (!exactKeys(value, ['carriers', 'canonical_digest']) || !sealedRecord(value) || !Array.isArray(value.carriers)) return false;
  const identities = new Set();
  for (const carrier of value.carriers) {
    const key = `${carrier?.carrier_kind}\u0000${carrier?.carrier_id}`;
    if (!exactKeys(carrier, CAPACITY_KEYS) || !['cohort', 'transport'].includes(carrier.carrier_kind)
      || !stableId(carrier.carrier_id) || !Number.isSafeInteger(carrier.capacity)
      || carrier.capacity < 0 || carrier.capacity > limits.max_capacity
      || !positiveInteger(carrier.state_version) || identities.has(key)) return false;
    identities.add(key);
  }
  return true;
}

function validIdempotencyLifecycle(value) {
  if (!valid('idempotency_record', value)) return false;
  if (value.status === 'pending') return value.lease_expires_at !== null && value.result_change_set_id === null && value.failure_code === null && value.failure_digest === null;
  if (value.status === 'committed') return value.lease_expires_at === null && stableId(value.result_change_set_id) && value.failure_code === null && value.failure_digest === null;
  return value.status === 'failed' && value.lease_expires_at === null && value.result_change_set_id === null && stableId(value.failure_code) && typeof value.failure_digest === 'string';
}

function validReplayEntry(value) {
  if (!exactKeys(value, REPLAY_ENTRY_KEYS) || !validIdempotencyLifecycle(value.record)) return false;
  return value.record.status !== 'committed'
    ? value.replay_result === null && value.replay_digest === null
    : record(value.replay_result) && typeof value.replay_digest === 'string' && value.replay_digest === digest(value.replay_result);
}

export function structuralStateValid(state, limits) {
  if (!exactKeys(state, STATE_KEYS) || !sealedRecord(state) || !stableId(state.party_id)
    || !dependencyPins(state.dependency_pins) || !Array.isArray(state.attachments)
    || state.attachments.length > limits.max_attachments || state.attachments.some((value) => !valid('party_carrier_attachment', value))
    || !Array.isArray(state.positions) || state.positions.some((value) => !valid('party_actor_carrier_position', value))
    || !Array.isArray(state.journey_locations) || state.journey_locations.some((value) => !valid('party_journey_location', value))
    || !Array.isArray(state.cohort_memberships) || state.cohort_memberships.some((value) => !valid('party_cohort_membership', value))
    || !validCapacitySnapshot(state.carrier_capacity_snapshot, limits) || !Array.isArray(state.idempotency_records)
    || state.idempotency_records.length > limits.max_idempotency_records || state.idempotency_records.some((value) => !validReplayEntry(value))
    || !Array.isArray(state.approved_anchor_refs) || state.approved_anchor_refs.some((value) => !valid('movement_endpoint_ref', value))) return false;
  const locations = state.journey_locations.map((value) => `${value.party_id}\u0000${value.owner_kind}\u0000${value.owner_id}`);
  const positions = state.positions.map((value) => `${value.party_id}\u0000${value.actor_id}`);
  const anchors = state.approved_anchor_refs.map((value) => `${value.endpoint_kind}\u0000${value.endpoint_id}`);
  return new Set(locations).size === locations.length && new Set(positions).size === positions.length && new Set(anchors).size === anchors.length;
}

export function commandPayload(command) {
  return Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'idempotency_record'));
}

function expectedVersionsDigest(payload) {
  return digest({ expected_state_digest: payload.expected_state_digest, expected_state_versions: payload.expected_state_versions ?? null });
}

export function validIncomingIdempotencyRecord(value, payload, partyId) {
  return validIdempotencyLifecycle(value) && value.status === 'pending' && value.party_id === partyId
    && value.operation_kind === 'temporal_carrier' && value.canonical_input_digest === digest(payload)
    && value.expected_state_versions_digest === expectedVersionsDigest(payload);
}

export function replayFor(state, incomingRecord, freeze) {
  const entry = state.idempotency_records.find(({ record: stored }) => stored.party_id === incomingRecord.party_id
    && stored.operation_kind === incomingRecord.operation_kind && stored.idempotency_key === incomingRecord.idempotency_key);
  if (!entry) return null;
  if (entry.record.canonical_input_digest !== incomingRecord.canonical_input_digest || entry.record.expected_state_versions_digest !== incomingRecord.expected_state_versions_digest) return 'conflict';
  if (entry.record.status === 'committed') return freeze(entry.replay_result);
  if (entry.record.status === 'pending') return freeze({ ok: false, status: 'in_progress', idempotency_key: entry.record.idempotency_key, state_version: entry.record.state_version });
  return freeze({ ok: false, status: 'technical_failure', error: { code: entry.record.failure_code, failure_digest: entry.record.failure_digest } });
}
