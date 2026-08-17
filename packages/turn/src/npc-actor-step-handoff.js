import { canonicalDigest } from '@rus/materialization';

const KEYS = [
  'schema', 'version', 'request_identity', 'plan_digest', 'operation_digest',
  'objective_pin', 'ordinary_materialization_atomic_write_plan',
  'action_production_atomic_write_plan', 'local_fire_atomic_write_plan',
  'spatial_semantic_atomic_write_plan', 'handoff_digest'
];
const IDENTITY_KEYS = [
  'request_id', 'root_turn_id', 'boundary_id', 'committed_state_version',
  'decision_index', 'npc_ref'
];
const EXTENSION_KEYS = [
  'ordinary_materialization_atomic_write_plan',
  'action_production_atomic_write_plan',
  'local_fire_atomic_write_plan',
  'spatial_semantic_atomic_write_plan'
];

export function createNpcActorStepHandoff(rawInput = {}) {
  const request = snapshotField(rawInput, 'request');
  const plan = snapshotField(rawInput, 'plan');
  const objectivePin = snapshotField(rawInput, 'objective_pin', true);
  const execution = executionExtensions(rawInput);
  if (request == null || plan == null || execution == null
      || objectivePin === BAD) fail();
  const operation = domainOperation(plan);
  const requestIdentity = identity(request, false);
  const extensions = Object.fromEntries(EXTENSION_KEYS.map((key) => [
    key, execution[key]
  ]));
  if (requestIdentity == null || operation == null
      || plan.request_id !== requestIdentity.request_id
      || plan.root_turn_id !== requestIdentity.root_turn_id
      || plan.boundary_id !== requestIdentity.boundary_id
      || plan.committed_state_version
        !== requestIdentity.committed_state_version
      || plan.decision_index !== requestIdentity.decision_index
      || plan.npc_ref !== requestIdentity.npc_ref
      || extensions.action_production_atomic_write_plan != null
      || extensions.local_fire_atomic_write_plan != null
      || extensions.spatial_semantic_atomic_write_plan != null
      || (extensions.ordinary_materialization_atomic_write_plan == null)
        !== (objectivePin == null)) fail();
  const unsigned = {
    schema: 'npc_actor_step_handoff_v1', version: 1,
    request_identity: requestIdentity,
    plan_digest: canonicalDigest(plan),
    operation_digest: canonicalDigest(operation),
    objective_pin: objectivePin,
    ...extensions
  };
  return deepFreeze({ ...unsigned, handoff_digest: canonicalDigest(unsigned) });
}

function snapshotField(rawInput, key, nullable = false) {
  if (!record(rawInput) || Object.getOwnPropertySymbols(rawInput).length > 0) {
    return null;
  }
  const descriptor = Object.getOwnPropertyDescriptor(rawInput, key);
  if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
    return nullable && descriptor === undefined ? null : null;
  }
  if (nullable && descriptor.value === null) return null;
  return strictSnapshot(descriptor.value) ?? BAD;
}

function executionExtensions(rawInput) {
  const descriptor = record(rawInput)
    ? Object.getOwnPropertyDescriptor(rawInput, 'execution') : null;
  if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')
      || !record(descriptor.value)
      || Object.getOwnPropertySymbols(descriptor.value).length > 0) return null;
  const output = {};
  for (const key of EXTENSION_KEYS) {
    const field = Object.getOwnPropertyDescriptor(descriptor.value, key);
    if (field != null && (field.enumerable !== true
      || !Object.hasOwn(field, 'value'))) return null;
    if (field == null || field.value == null) output[key] = null;
    else {
      const snapshot = strictSnapshot(field.value);
      if (snapshot == null) return null;
      output[key] = snapshot;
    }
  }
  return output;
}

export function validateNpcActorStepHandoff(value) {
  const snapshot = strictSnapshot(value);
  if (snapshot == null || !exact(snapshot, KEYS)
      || snapshot.schema !== 'npc_actor_step_handoff_v1'
      || snapshot.version !== 1 || identity(snapshot.request_identity, true) == null
      || !digest(snapshot.plan_digest) || !digest(snapshot.operation_digest)
      || !digest(snapshot.handoff_digest)
      || snapshot.action_production_atomic_write_plan != null
      || snapshot.local_fire_atomic_write_plan != null
      || snapshot.spatial_semantic_atomic_write_plan != null
      || (snapshot.ordinary_materialization_atomic_write_plan == null)
        !== (snapshot.objective_pin == null)) return false;
  const { handoff_digest: ignored, ...unsigned } = snapshot;
  return canonicalDigest(unsigned) === snapshot.handoff_digest;
}

export function npcActorStepAtomicExtensions(value) {
  if (value == null) return Object.freeze(Object.fromEntries(
    EXTENSION_KEYS.map((key) => [key, null])));
  if (!validateNpcActorStepHandoff(value)) fail();
  const snapshot = strictSnapshot(value);
  return deepFreeze(Object.fromEntries(EXTENSION_KEYS.map((key) => [
    key, snapshot[key]
  ])));
}

function domainOperation(plan) {
  return plan?.resolution === 'domain_request'
    && Array.isArray(plan.operations) && plan.operations.length === 1
    ? plan.operations[0] : null;
}
function identity(value, requireExact = true) {
  if (!record(value) || (requireExact && !exact(value, IDENTITY_KEYS))
    || !IDENTITY_KEYS.every((key)=>Object.hasOwn(value,key))
    || !IDENTITY_KEYS.filter((key) =>
    key !== 'committed_state_version' && key !== 'decision_index')
    .every((key) => text(value[key]))
    || !Number.isSafeInteger(value.committed_state_version)
    || value.committed_state_version < 1
    || !Number.isSafeInteger(value.decision_index)
    || value.decision_index < 1) return null;
  return Object.fromEntries(IDENTITY_KEYS.map((key) => [key, value[key]]));
}
function exact(value, keys) { return record(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function record(value) { return value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function text(value) { return typeof value === 'string'
  && value.trim() === value && value.length > 0; }
function digest(value) { return typeof value === 'string'
  && /^(?:sha256:)?[a-f0-9]{64}$/u.test(value); }
function fail() { throw Object.assign(new TypeError(
  'NPC actor-step handoff must be sealed strict JSON data.'), {
  code: 'TURN_NPC_ACTOR_STEP_HANDOFF_INVALID' }); }

function strictSnapshot(input) {
  const seen = new Set();
  function copy(value) {
    if (value === null || typeof value === 'string'
        || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : BAD;
    if (typeof value !== 'object' || seen.has(value)
        || Object.getOwnPropertySymbols(value).length > 0) return BAD;
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype
      : Object.prototype)) return BAD;
    seen.add(value);
    const output = array ? [] : {};
    for (const key of Object.getOwnPropertyNames(value)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true
          || !Object.hasOwn(descriptor, 'value')) return BAD;
      const child = copy(descriptor.value);
      if (child === BAD) return BAD;
      output[key] = child;
    }
    return output;
  }
  const result = copy(input);
  return result === BAD ? null : result;
}
const BAD = Symbol('bad');
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
