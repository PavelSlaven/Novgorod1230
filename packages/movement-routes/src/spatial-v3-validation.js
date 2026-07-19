import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const digest = (value) => computeSpatialV3CanonicalDigest(value);
const validEntityRef = (value) => value && typeof value === 'object' && text(value.entity_kind) && text(value.entity_id);
const validVersionedRef = (value) => value && typeof value === 'object' && validEntityRef(value.entity_ref) && text(value.authoring_version);

export function validPins(value) {
  return value && typeof value === 'object' && Array.isArray(value.pins) && value.pins.length > 0 && text(value.canonical_digest)
    && value.canonical_digest === digest(value.pins).replace('sha256:', '')
    && value.pins.every((pin) => pin && text(pin.dependency_role) && validEntityRef(pin.entity_ref) && pin.version_pin && ['authoring_version', 'party_state_version'].includes(pin.version_pin.pin_kind) && (pin.version_pin.pin_kind === 'authoring_version' ? text(pin.version_pin.authoring_version) && pin.version_pin.state_version == null : Number.isInteger(pin.version_pin.state_version) && pin.version_pin.state_version > 0 && pin.version_pin.authoring_version == null));
}

export function validStaticSnapshot(stepKind, value) {
  if (!value || typeof value !== 'object' || value.snapshot_kind !== stepKind || !text(value.canonical_digest)) return false;
  const payloads = { immediate_action: 'action_snapshot', timed_activity: 'activity_snapshot', timed_traversal: 'traversal_snapshot' };
  const expected = payloads[stepKind]; if (!expected || Object.keys(value).some((key) => !['snapshot_kind', 'action_snapshot', 'activity_snapshot', 'traversal_snapshot', 'canonical_digest'].includes(key))) return false;
  if (!value[expected] || typeof value[expected] !== 'object' || Object.entries(payloads).some(([kind, key]) => kind !== stepKind && value[key] != null)) return false;
  const sealed = { ...value }; delete sealed.canonical_digest; if (value.canonical_digest !== digest(sealed)) return false;
  const payload = value[expected]; const payloadSeal = { ...payload }; delete payloadSeal.canonical_digest;
  if (!text(payload.canonical_digest) || payload.canonical_digest !== digest(payloadSeal) || !validPins(payload.dependency_pins)) return false;
  if (stepKind === 'immediate_action') return validVersionedRef(payload.action_contract_ref) && Number.isInteger(payload.action_units) && payload.action_units > 0 && (payload.relation_ref == null ? payload.movement_capacity_units == null : validEntityRef(payload.relation_ref) && Number.isInteger(payload.movement_capacity_units) && payload.movement_capacity_units > 0) && (payload.mode_transition_contract_ref == null || validVersionedRef(payload.mode_transition_contract_ref)) && (payload.completion_effect_contract_ref == null || validVersionedRef(payload.completion_effect_contract_ref));
  if (stepKind === 'timed_activity') return validVersionedRef(payload.activity_contract_ref) && Number.isInteger(payload.planned_total_minutes) && payload.planned_total_minutes > 0 && (payload.mode_transition_contract_ref == null || validVersionedRef(payload.mode_transition_contract_ref)) && (payload.completion_effect_contract_ref == null || validVersionedRef(payload.completion_effect_contract_ref));
  return validVersionedRef(payload.physical_segment_ref) && text(payload.selected_movement_method_id) && validEntityRef(payload.movement_carrier_ref) && Number.isInteger(payload.movement_capacity_units) && payload.movement_capacity_units > 0 && validVersionedRef(payload.environment_profile_ref) && validVersionedRef(payload.orientation_profile_ref) && validVersionedRef(payload.cost_profile_ref) && validVersionedRef(payload.recheck_policy_ref) && payload.factual_context_snapshot && typeof payload.factual_context_snapshot === 'object';
}

export function validReason(reason, readiness) {
  if (!reason || typeof reason !== 'object' || !text(reason.reason_code) || !text(reason.diagnostic_message)) return false;
  return readiness === 'temporarily_blocked' ? reason.severity === 'temporary' : readiness === 'data_gap' && ['hard_block', 'repair_required', 'migration_required'].includes(reason.severity);
}
