import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { resolveLocalExactFire } from '@rus/world-processes/local-exact-fire';
import { localFireAccessible } from './local-fire-persistence-pins.js';

const INVALID = Symbol('invalid-local-fire-data');
const REQUEST_KEYS = ['schema', 'party_id', 'base_party_state_version',
  'change_set_id', 'actor_ref', 'authority_pin', 'ignition_basis_pin',
  'process_state', 'fuel_pins',
  'action', 'at_timestamp', 'causal_identity'];
const PLAN_KEYS = ['schema', 'party_id', 'base_party_state_version',
  'change_set_id', 'actor_ref', 'authority_pin', 'ignition_basis_pin', 'fuel_pins',
  'transition_proposal', 'write_plan_digest'];

export function createLocalFireAtomicWritePlan(rawInput) {
  const input = snapshot(rawInput);
  if (input === INVALID) fail('LOCAL_FIRE_PLAN_INVALID');
  if (input?.schema === 'local_fire_atomic_write_plan_v1') {
    validateSealed(input); return deepFreeze(input);
  }
  if (!exact(input, REQUEST_KEYS)
      || input.schema !== 'local_fire_atomic_write_request_v1'
      || !text(input.party_id) || !text(input.change_set_id)
      || !text(input.actor_ref)
      || !Number.isSafeInteger(input.base_party_state_version)
      || input.base_party_state_version < 0
      || !Array.isArray(input.fuel_pins)) fail('LOCAL_FIRE_PLAN_INVALID');
  const authority = validateAuthority(input.authority_pin, input.party_id);
  validateIgnition(input.ignition_basis_pin, authority.persisted_row,
    input.action, input.actor_ref);
  validatePins(input.fuel_pins, authority.persisted_row,
    input.action, input.process_state?.process_ref ?? null, input.actor_ref);
  const proposal = resolveLocalExactFire({
    schema: 'rus.world_processes.local_fire_transition_request.v1',
    action: input.action, at_timestamp: input.at_timestamp,
    scope_ref: authority.persisted_row.scope_ref,
    causal_basis_ref: authority.persisted_row.ignition_basis_item_id,
    causal_identity: input.causal_identity,
    policy: policyFrom(authority.persisted_row),
    process: input.process_state,
    fuel_units: input.fuel_pins.map((pin) => pin.fuel_snapshot)
  });
  const plan = { schema: 'local_fire_atomic_write_plan_v1',
    party_id: input.party_id,
    base_party_state_version: input.base_party_state_version,
    change_set_id: input.change_set_id, actor_ref: input.actor_ref,
    authority_pin: authority, ignition_basis_pin: input.ignition_basis_pin,
    fuel_pins: input.fuel_pins,
    transition_proposal: proposal };
  const sealed = { ...plan, write_plan_digest: digest(plan) };
  validateSealed(sealed); return deepFreeze(sealed);
}

export function localFirePhysicalKeys(plan) {
  if (plan == null) return [];
  const sealed = createLocalFireAtomicWritePlan(plan);
  const party = sealed.party_id;
  return [
    `party_runtime.party_local_fire_authorities:${party}:${sealed.authority_pin.persisted_row.context_ref}`,
    `party_runtime.party_local_world_processes:${party}:${sealed.transition_proposal.process_after.process_ref}`,
    `party_runtime.party_items:${party}:${sealed.ignition_basis_pin.item_id}`,
    `party_runtime.party_item_placements:${party}:${sealed.ignition_basis_pin.item_id}`,
    `party_runtime.party_ownership:${party}:${sealed.ignition_basis_pin.ownership.ownership_id}`,
    ...sealed.fuel_pins.flatMap(({ item_id: id, ownership }) => [
      `party_runtime.party_items:${party}:${id}`,
      `party_runtime.party_item_placements:${party}:${id}`,
      `party_runtime.party_ownership:${party}:${ownership.ownership_id}`
    ])
  ];
}

function validateSealed(value) {
  if (!exact(value, PLAN_KEYS)
      || value.schema !== 'local_fire_atomic_write_plan_v1'
      || !text(value.party_id) || !text(value.change_set_id)
      || !text(value.actor_ref)
      || !Number.isSafeInteger(value.base_party_state_version)
      || value.base_party_state_version < 0
      || !Array.isArray(value.fuel_pins)) fail('LOCAL_FIRE_PLAN_INVALID');
  const authority = validateAuthority(value.authority_pin, value.party_id);
  validateIgnition(value.ignition_basis_pin, authority.persisted_row,
    value.transition_proposal?.action, value.actor_ref);
  const proposal = value.transition_proposal;
  validatePins(value.fuel_pins, authority.persisted_row, proposal.action,
    proposal.process_before?.process_ref ?? null, value.actor_ref);
  const expected = resolveLocalExactFire({
    schema: 'rus.world_processes.local_fire_transition_request.v1',
    action: proposal.action, at_timestamp: proposal.at_timestamp,
    scope_ref: authority.persisted_row.scope_ref,
    causal_basis_ref: authority.persisted_row.ignition_basis_item_id,
    causal_identity: proposal.causal_identity,
    policy: policyFrom(authority.persisted_row),
    process: proposal.process_before,
    fuel_units: value.fuel_pins.map((pin) => pin.fuel_snapshot)
  });
  if (digest(proposal) !== digest(expected)
      || digest(Object.fromEntries(Object.entries(value)
        .filter(([key]) => key !== 'write_plan_digest')))
        !== value.write_plan_digest) fail('LOCAL_FIRE_PLAN_INVALID');
}

function validateIgnition(pin, authority, action, actorRef) {
  if (!exact(pin, ['item_id','item','placement','ownership','item_digest',
    'placement_digest','ownership_digest'])
      || !validEntityIdentity(pin)
      || pin.item_id !== authority.ignition_basis_item_id
      || pin.item?.state?.local_fire_ignition_basis?.schema
        !== 'rus.items.local_fire_ignition_basis.v1'
      || pin.item.state.lifecycle_status !== 'active'
      || digest(pin.item) !== pin.item_digest
      || digest(pin.placement) !== pin.placement_digest
      || digest(pin.ownership) !== pin.ownership_digest
      || action !== 'due_boundary'
        && !localFireAccessible(pin, actorRef, authority.scope_ref)) {
    fail('LOCAL_FIRE_IGNITION_BASIS_INVALID');
  }
}

function validateAuthority(value, partyId) {
  if (!exact(value, ['persisted_row', 'authority_digest'])) fail('LOCAL_FIRE_AUTHORITY_INVALID');
  const row = value.persisted_row;
  const keys = ['party_id', 'context_ref', 'profile_ref', 'profile_version',
    'policy_ref', 'policy_version', 'scope_ref', 'ignition_basis_item_id',
    'approved_fuel_item_ids', 'recheck_interval',
    'fuel_unit_mass_grams_min', 'fuel_unit_mass_grams_max',
    'authority_state_version', 'status'];
  if (!exact(row, keys) || row.party_id !== partyId || row.status !== 'committed'
      || row.policy_version !== 1 || !Array.isArray(row.approved_fuel_item_ids)
      || new Set(row.approved_fuel_item_ids).size !== row.approved_fuel_item_ids.length
      || !row.approved_fuel_item_ids.every(text)
      || value.authority_digest !== digest(row)) fail('LOCAL_FIRE_AUTHORITY_INVALID');
  return value;
}

function validatePins(pins, authority, action, processRef, actorRef) {
  const approved = new Set(authority.approved_fuel_item_ids);
  if (!pins.length || new Set(pins.map(({ item_id: id }) => id)).size !== pins.length) {
    fail('LOCAL_FIRE_FUEL_INVALID');
  }
  for (const pin of pins) {
    if (!exact(pin, ['item_id', 'item', 'placement', 'ownership',
      'item_digest', 'placement_digest', 'ownership_digest', 'fuel_snapshot'])
        || !validEntityIdentity(pin)
        || !approved.has(pin.item_id)
        || pin.item_id !== pin.fuel_snapshot?.fuel_ref
        || digest(pin.item) !== pin.item_digest
        || digest(pin.placement) !== pin.placement_digest
        || digest(pin.ownership) !== pin.ownership_digest
        || action !== 'due_boundary'
          && !localFireAccessible(pin, actorRef, authority.scope_ref)
        || (action === 'due_boundary'
          ? pin.fuel_snapshot.bound_process_ref !== processRef
          : pin.fuel_snapshot.bound_process_ref !== null)) {
      fail('LOCAL_FIRE_FUEL_INVALID');
    }
  }
}

function validEntityIdentity(pin) {
  return text(pin.item_id) && pin.item?.item_id === pin.item_id
    && pin.placement?.item_id === pin.item_id
    && pin.ownership?.item_id === pin.item_id
    && text(pin.ownership.ownership_id);
}

function policyFrom(row) {
  return { schema: 'local_fire_policy_v1', policy_ref: row.policy_ref,
    version: row.policy_version, recheck_interval: row.recheck_interval,
    fuel_unit_mass_grams_min: row.fuel_unit_mass_grams_min,
    fuel_unit_mass_grams_max: row.fuel_unit_mass_grams_max };
}

function snapshot(value) {
  const seen = new WeakSet();
  function visit(input) {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : INVALID;
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length) return INVALID;
    const array = Array.isArray(input);
    if (Object.getPrototypeOf(input) !== (array ? Array.prototype : Object.prototype)) return INVALID;
    seen.add(input); const names = Object.getOwnPropertyNames(input);
    if (array && (names.length !== input.length + 1 || !names.includes('length'))) return INVALID;
    const output = array ? [] : {};
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return INVALID;
      const child = visit(descriptor.value); if (child === INVALID) return INVALID;
      if (array) { if (key !== String(output.length)) return INVALID; output.push(child); }
      else output[key] = child;
    }
    return output;
  }
  return visit(value);
}
function exact(value, keys) { return value && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; }
function text(value) { return typeof value === 'string' && value.length > 0; }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
