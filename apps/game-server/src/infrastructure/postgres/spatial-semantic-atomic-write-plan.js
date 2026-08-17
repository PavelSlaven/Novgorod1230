import { validateSpatialSemanticResolution } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

const KEYS = ['schema', 'party_id', 'base_party_state_version', 'change_set_id',
  'causal_identity', 'envelope_ref', 'expected_envelope_state_version',
  'resolution'];

export function createSpatialSemanticAtomicWritePlan(input) {
  const plan = clone(input);
  if (!exact(plan, KEYS)
      || plan.schema !== 'spatial_semantic_atomic_write_plan_v1'
      || !text(plan.party_id) || !text(plan.change_set_id) || !text(plan.envelope_ref)
      || !integer(plan.base_party_state_version, 0)
      || !integer(plan.expected_envelope_state_version, 1)
      || !identity(plan.causal_identity) || !resolution(plan.resolution)
      || plan.resolution.party_id !== plan.party_id
      || plan.resolution.request_id !== plan.causal_identity.request_id
      || plan.resolution.causal_request_ref !== plan.causal_identity.action_ref
      || plan.resolution.envelope_ref !== plan.envelope_ref) fail();
  return freeze(plan);
}

export function spatialSemanticPhysicalKeys(input) {
  if (input == null) return [];
  const plan = createSpatialSemanticAtomicWritePlan(input);
  return [
    `party_runtime.party_spatial_semantic_envelopes:${plan.party_id}:${plan.envelope_ref}`,
    `party_runtime.party_spatial_semantic_resolutions:${plan.party_id}:${plan.causal_identity.request_id}`
  ];
}

function resolution(value) { try { validateSpatialSemanticResolution(value); return true; } catch { return false; } }
function identity(value) { return exact(value, ['request_id','root_turn_id','action_ref','step_index','actor_ref']) && ['request_id','root_turn_id','action_ref','actor_ref'].every((key) => text(value[key])) && integer(value.step_index, 1) && value.step_index <= 8; }
function exact(value, keys) { return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return typeof value === 'string' && value.length > 0; }
function integer(value, min) { return Number.isSafeInteger(value) && value >= min; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function clone(value) { try { return structuredClone(value); } catch { fail(); } }
function fail() { const error = new Error('SPATIAL_SEMANTIC_PLAN_INVALID'); error.code = 'SPATIAL_SEMANTIC_PLAN_INVALID'; throw error; }
