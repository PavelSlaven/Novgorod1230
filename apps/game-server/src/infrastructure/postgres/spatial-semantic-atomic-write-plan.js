import { canonicalDigest } from '@rus/materialization';
import { validateSpatialSemanticResolution } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

const PLAN_KEYS = ['schema', 'party_id', 'base_party_state_version',
  'change_set_id', 'causal_identity', 'envelope_pin', 'reservation_pin',
  'resolution', 'write_plan_digest'];
const REQUEST_KEYS = PLAN_KEYS.filter((key) => key !== 'write_plan_digest');

// A small descriptor-safe boundary: it accepts only detached JSON, rebuilds
// every digest and never gives a caller a way to add topology or mechanics.
export function createSpatialSemanticAtomicWritePlan(raw) {
  const input = clone(raw);
  const plan = input?.schema === 'spatial_semantic_atomic_write_request_v1'
    && exact(input, REQUEST_KEYS)
    ? sealRequest(input) : input;
  if (!exact(plan, PLAN_KEYS)
      || plan.schema !== 'spatial_semantic_atomic_write_plan_v1'
      || !text(plan.party_id) || !text(plan.change_set_id)
      || !integer(plan.base_party_state_version, 0)
      || !identity(plan.causal_identity)
      || !pin(plan.envelope_pin, 'authority_digest')
      || !pin(plan.reservation_pin, 'reservation_digest', false)
      || !resolution(plan.resolution)) fail();
  if (plan.resolution.party_id !== plan.party_id
      || plan.resolution.request_id !== plan.causal_identity.request_id
      || plan.resolution.causal_request_ref !== plan.causal_identity.action_ref
      || plan.resolution.reservation.reservation_ref
        !== plan.reservation_pin.row.reservation_ref
      || plan.resolution.reservation.envelope.envelope_ref
        !== plan.envelope_pin.row.envelope_ref
      || plan.resolution.reservation.reservation_ref
        !== spatialSemanticReservationRef({ partyId: plan.party_id,
          rootTurnId: plan.causal_identity.root_turn_id,
          stepIndex: plan.causal_identity.step_index,
          envelopeRef: plan.envelope_pin.row.envelope_ref })) fail();
  const unsigned = omit(plan, 'write_plan_digest');
  if (plan.write_plan_digest !== `sha256:${canonicalDigest(unsigned)}`) fail();
  return deepFreeze(plan);
}

function sealRequest(input) {
  const unsigned = { ...input, schema: 'spatial_semantic_atomic_write_plan_v1' };
  return { ...unsigned,
    write_plan_digest: `sha256:${canonicalDigest(unsigned)}` };
}

export function spatialSemanticPhysicalKeys(input) {
  if (input == null) return [];
  const plan = createSpatialSemanticAtomicWritePlan(input);
  const party = plan.party_id;
  const envelope = plan.resolution.reservation.envelope;
  return [
    `party_runtime.party_g5_sites:${envelope.g5_ref}`,
    `party_runtime.party_scene_baselines:${envelope.baseline_ref}`,
    `party_runtime.party_g6_instances:${envelope.g6_ref}`,
    `party_runtime.scene_position_nodes:${envelope.position_ref}`,
    `party_runtime.party_spatial_semantic_envelopes:${party}:${plan.envelope_pin.row.envelope_ref}`,
    `party_runtime.party_spatial_semantic_reservations:${party}:${plan.reservation_pin.row.reservation_ref}`,
    `party_runtime.party_spatial_semantic_resolutions:${party}:${plan.resolution.structural.structural_identity}`
  ];
}

function resolution(value) { try { validateSpatialSemanticResolution(value); return true; } catch { return false; } }
function pin(value, digestKey, derivedFromRow = true) {
  return exact(value, ['row', digestKey]) && plain(value.row)
    && text(value[digestKey])
    && (!derivedFromRow || value[digestKey] === `sha256:${canonicalDigest(value.row)}`);
}
function identity(value) {
  return exact(value, ['request_id','root_turn_id','action_ref','step_index',
    'actor_ref','operation_digest'])
    && text(value.request_id) && text(value.root_turn_id)
    && text(value.action_ref) && text(value.actor_ref)
    && /^sha256:[0-9a-f]{64}$/u.test(value.operation_digest)
    && integer(value.step_index, 1) && value.step_index <= 8;
}

export function spatialSemanticTraceActionRef({ rootTurnId, stepIndex,
  approvedPlan }) {
  return `spatial-semantic-action:${canonicalDigest({
    domain: 'rus.s1_spatial_semantic.trace_action_ref.v1',
    root_turn_id: rootTurnId, step_index: stepIndex,
    approved_plan: approvedPlan
  })}`;
}
export function spatialSemanticReservationRef({ partyId, rootTurnId, stepIndex,
  envelopeRef }) {
  return `s1-reservation:${canonicalDigest({
    domain: 'rus.s1_spatial_semantic.reservation_ref.v1',
    party_id: partyId, root_turn_id: rootTurnId, step_index: stepIndex,
    envelope_ref: envelopeRef
  }).slice(0, 32)}`;
}
function omit(value, key) { const { [key]: _ignored, ...rest } = value; return rest; }
function exact(value, keys) { return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return typeof value === 'string' && value.length > 0; }
function integer(value, min) { return Number.isSafeInteger(value) && value >= min; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function clone(value) {
  const seen = new WeakSet();
  const copy = (input) => {
    if (input == null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') { if (Number.isFinite(input)) return input; fail(); }
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length
        || Object.getPrototypeOf(input) !== (Array.isArray(input) ? Array.prototype : Object.prototype)) fail();
    seen.add(input);
    const names = Object.getOwnPropertyNames(input);
    if (Array.isArray(input) && (names.length !== input.length + 1 || !names.includes('length'))) fail();
    const output = Array.isArray(input) ? [] : {};
    for (const key of names) {
      if (key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
          || (Array.isArray(input) && key !== String(output.length))) fail();
      if (Array.isArray(output)) output.push(copy(descriptor.value));
      else output[key] = copy(descriptor.value);
    }
    return output;
  };
  return copy(value);
}
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
function fail() { const error = new Error('SPATIAL_SEMANTIC_PLAN_INVALID'); error.code = 'SPATIAL_SEMANTIC_PLAN_INVALID'; throw error; }
