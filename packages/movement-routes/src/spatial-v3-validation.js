import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';

const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const digest = (value) => computeSpatialV3CanonicalDigest(value);
const validEntityRef = (value) => value && typeof value === 'object' && text(value.entity_kind) && text(value.entity_id);
const validVersionedRef = (value) => value && typeof value === 'object' && validEntityRef(value.entity_ref) && text(value.authoring_version);
const integer = (value) => Number.isInteger(value) && value > 0;
const rational = (value) => value && typeof value === 'object' && Object.keys(value).length === 2
  && integer(value.numerator) && integer(value.denominator) && gcd(value.numerator, value.denominator) === 1;
const gcd = (left, right) => right ? gcd(right, left % right) : left;

export function validPins(value) {
  return value && typeof value === 'object' && Array.isArray(value.pins) && value.pins.length > 0 && text(value.canonical_digest)
    && value.canonical_digest === digest(value.pins).replace('sha256:', '')
    && value.pins.every((pin) => pin && text(pin.dependency_role) && validEntityRef(pin.entity_ref) && pin.version_pin && ['authoring_version', 'party_state_version'].includes(pin.version_pin.pin_kind) && (pin.version_pin.pin_kind === 'authoring_version' ? text(pin.version_pin.authoring_version) && pin.version_pin.state_version == null : Number.isInteger(pin.version_pin.state_version) && pin.version_pin.state_version > 0 && pin.version_pin.authoring_version == null));
}

export function validExpectedStateVersions(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.entries) || !text(value.canonical_digest)) return false;
  if (value.canonical_digest !== digest(value.entries).replace('sha256:', '')) return false;
  let previous = null;
  return value.entries.every((entry) => {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some((key) => !['entity_ref', 'state_version'].includes(key)) || !validEntityRef(entry.entity_ref) || !integer(entry.state_version)) return false;
    const key = `${entry.entity_ref.entity_kind}\u0000${entry.entity_ref.entity_id}`;
    if (previous != null && previous >= key) return false;
    previous = key;
    return true;
  });
}

export function validCapabilityContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = new Set(['cohort_membership_snapshot_pin', 'load_state_pin', 'root_carrier_attachment_pins', 'allowed_movement_methods', 'available_transport_pins', 'equipment_state_pins', 'legal_access_fact_pins', 'allowed_pace_modes', 'dependency_pins', 'canonical_digest']);
  const required = ['cohort_membership_snapshot_pin', 'load_state_pin', 'root_carrier_attachment_pins', 'allowed_movement_methods', 'available_transport_pins', 'equipment_state_pins', 'legal_access_fact_pins', 'allowed_pace_modes', 'dependency_pins', 'canonical_digest'];
  if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (!Array.isArray(value.allowed_movement_methods) || !value.allowed_movement_methods.length || value.allowed_movement_methods.some((method) => !text(method)) || new Set(value.allowed_movement_methods).size !== value.allowed_movement_methods.length || [...value.allowed_movement_methods].sort().some((method, index) => method !== value.allowed_movement_methods[index])) return false;
  if (!Array.isArray(value.allowed_pace_modes) || value.allowed_pace_modes.some((mode) => !text(mode)) || new Set(value.allowed_pace_modes).size !== value.allowed_pace_modes.length || [...value.allowed_pace_modes].sort().some((mode, index) => mode !== value.allowed_pace_modes[index])) return false;
  if (!validPins(value.dependency_pins) || !optionalPin(value.cohort_membership_snapshot_pin) || !optionalPin(value.load_state_pin) || !optionalPinSet(value.root_carrier_attachment_pins) || !optionalPinSet(value.available_transport_pins) || !optionalPinSet(value.equipment_state_pins) || !optionalPinSet(value.legal_access_fact_pins)) return false;
  const sealed = { ...value }; delete sealed.canonical_digest;
  if (value.canonical_digest !== digest(sealed)) return false;
  return capabilityPinsCovered(value);
}

function optionalPin(value) { return value == null || validPins({ pins: [value], canonical_digest: digest([value]).replace('sha256:', '') }); }
function optionalPinSet(value) { return value == null || validPins(value); }
function pinKey(pin) { return `${pin.dependency_role}\u0000${pin.entity_ref.entity_kind}\u0000${pin.entity_ref.entity_id}\u0000${pin.version_pin.pin_kind}\u0000${pin.version_pin.authoring_version ?? ''}\u0000${pin.version_pin.state_version ?? ''}`; }
function capabilityPinsCovered(value) {
  const covered = new Set(value.dependency_pins.pins.map(pinKey));
  const facts = [value.cohort_membership_snapshot_pin, value.load_state_pin, ...(value.root_carrier_attachment_pins?.pins ?? []), ...(value.available_transport_pins?.pins ?? []), ...(value.equipment_state_pins?.pins ?? []), ...(value.legal_access_fact_pins?.pins ?? [])].filter(Boolean);
  return facts.every((pin) => covered.has(pinKey(pin)));
}

export function capabilityContextPins(value) { return validCapabilityContext(value) ? value.dependency_pins : null; }

export function expectedStateVersionsCoverCapability(value, expected) {
  if (!validCapabilityContext(value) || !validExpectedStateVersions(expected)) return false;
  const versions = new Map(expected.entries.map((entry) => [`${entry.entity_ref.entity_kind}\u0000${entry.entity_ref.entity_id}`, entry.state_version]));
  return value.dependency_pins.pins.filter((pin) => pin.version_pin.pin_kind === 'party_state_version').every((pin) => versions.get(`${pin.entity_ref.entity_kind}\u0000${pin.entity_ref.entity_id}`) === pin.version_pin.state_version);
}

export function validMovementCostSummary(value) {
  if (!value || typeof value !== 'object') return false;
  const allowed = new Set(['cost_kind', 'action_units_min', 'action_units_max', 'minutes_min', 'minutes_max', 'precision', 'canonical_digest']);
  if (Object.keys(value).some((key) => !allowed.has(key)) || !['action', 'time', 'segmented'].includes(value.cost_kind) || !['exact', 'bounded', 'unknown'].includes(value.precision)) return false;
  const sealed = { ...value }; delete sealed.canonical_digest;
  if (value.canonical_digest !== digest(sealed)) return false;
  const action = [value.action_units_min, value.action_units_max]; const minutes = [value.minutes_min, value.minutes_max];
  const actionPresent = action.some((item) => item != null); const minutesPresent = minutes.some((item) => item != null);
  if (value.precision === 'unknown') return !actionPresent && !minutesPresent;
  if (actionPresent && (!integer(action[0]) || !integer(action[1]) || action[0] > action[1])) return false;
  if (minutesPresent && (!rational(minutes[0]) || !rational(minutes[1]) || compareRational(minutes[0], minutes[1]) > 0)) return false;
  if (value.cost_kind === 'action' && (!actionPresent || minutesPresent)) return false;
  if (value.cost_kind === 'time' && (!minutesPresent || actionPresent)) return false;
  if (value.cost_kind === 'segmented' && !actionPresent && !minutesPresent) return false;
  return value.precision === 'exact'
    ? (!actionPresent || action[0] === action[1]) && (!minutesPresent || compareRational(minutes[0], minutes[1]) === 0)
    : (!actionPresent || action[0] < action[1]) && (!minutesPresent || compareRational(minutes[0], minutes[1]) < 0);
}

export function validMovementRiskSummary(value) {
  if (!value || typeof value !== 'object') return false;
  const allowed = new Set(['risk_class', 'knowledge_precision', 'visible_risk_tags', 'canonical_digest']);
  if (Object.keys(value).some((key) => !allowed.has(key)) || !['none', 'low', 'moderate', 'high', 'extreme', 'unknown'].includes(value.risk_class) || !['exact', 'rough', 'rumor', 'hidden'].includes(value.knowledge_precision)) return false;
  const tags = value.visible_risk_tags ?? [];
  if (!Array.isArray(tags) || tags.some((tag) => !text(tag)) || new Set(tags).size !== tags.length) return false;
  const sealed = { ...value }; delete sealed.canonical_digest;
  if (value.canonical_digest !== digest(sealed)) return false;
  if (value.knowledge_precision === 'hidden' && (value.risk_class !== 'unknown' || tags.length)) return false;
  return !(value.knowledge_precision === 'rumor' && value.risk_class === 'none');
}

function compareRational(left, right) { return left.numerator * right.denominator - right.numerator * left.denominator; }

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
