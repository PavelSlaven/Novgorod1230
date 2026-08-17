import { deepFreeze } from '@rus/kernel';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { addElapsedTime, compareGameTimestamp } from
  '@rus/time-events-history';

const PROCESS_KEYS = [
  'schema', 'process_ref', 'process_mode', 'process_kind', 'scope_ref',
  'causal_basis_ref', 'status', 'started_at', 'next_boundary_at',
  'fuel_bindings', 'state_version'
];
const POLICY_KEYS = [
  'schema', 'policy_ref', 'version', 'recheck_interval',
  'fuel_unit_mass_grams_min', 'fuel_unit_mass_grams_max'
];
const FUEL_KEYS = [
  'fuel_ref', 'fuel_class', 'state_version', 'lifecycle_state', 'mass_grams',
  'quantity', 'bound_process_ref', 'placement_ref', 'property_digest',
  'mechanics_digest'
];

export function resolveLocalExactFire(rawInput) {
  const input = strictSnapshot(rawInput);
  if (!input) fail('LOCAL_FIRE_INPUT_INVALID', 'Local fire input must be strict JSON data.');
  exact(input, ['schema', 'action', 'at_timestamp', 'scope_ref',
    'causal_basis_ref', 'causal_identity', 'policy', 'process', 'fuel_units']);
  if (input.schema !== 'rus.world_processes.local_fire_transition_request.v1'
      || !['start', 'add_fuel', 'due_boundary'].includes(input.action)
      || !text(input.scope_ref) || !text(input.causal_basis_ref)
      || !validTimestamp(input.at_timestamp)) invalid();
  validateCausal(input.causal_identity);
  validatePolicy(input.policy);
  if (!Array.isArray(input.fuel_units)) invalid();
  const fuelUnits = input.fuel_units.map((fuel) => validateFuel(fuel, input.policy));
  unique(fuelUnits.map(({ fuel_ref: ref }) => ref));

  if (input.action === 'start') {
    if (input.process !== null || fuelUnits.length === 0
        || fuelUnits.some(({ bound_process_ref: bound }) => bound !== null)) invalid();
    const processRef = `local-fire:${computeSpatialV3CanonicalDigest({
      domain: 'rus.world_processes.local_fire.process_ref.v1',
      causal_identity: input.causal_identity, scope_ref: input.scope_ref,
      causal_basis_ref: input.causal_basis_ref
    })}`;
    return seal(input, null, state({ processRef, input, fuelUnits,
      status: 'active', startedAt: input.at_timestamp,
      nextBoundaryAt: addElapsedTime(input.at_timestamp,
        input.policy.recheck_interval), stateVersion: 1 }),
    'started', fuelUnits.map(({ fuel_ref: ref }) => ref), null);
  }

  validateProcess(input.process, input);
  if (input.action === 'add_fuel') {
    if (input.process.status !== 'active' || fuelUnits.length === 0
        || fuelUnits.some(({ bound_process_ref: bound }) => bound !== null)
        || fuelUnits.some(({ fuel_ref: ref }) =>
          input.process.fuel_bindings.some(({ fuel_ref: current }) => current === ref))) invalid();
    return seal(input, input.process, state({
      processRef: input.process.process_ref, input,
      fuelUnits: [...input.process.fuel_bindings, ...fuelUnits], status: 'active',
      startedAt: input.process.started_at,
      nextBoundaryAt: input.process.next_boundary_at,
      stateVersion: input.process.state_version + 1
    }), 'fuel_added', fuelUnits.map(({ fuel_ref: ref }) => ref), null);
  }

  if (fuelUnits.length !== input.process.fuel_bindings.length
      || fuelUnits.some((fuel, index) =>
        fuel.fuel_ref !== input.process.fuel_bindings[index].fuel_ref
        || fuel.bound_process_ref !== input.process.process_ref)
      || input.process.status !== 'active'
      || input.process.next_boundary_at === null
      || compareGameTimestamp(input.at_timestamp,
        input.process.next_boundary_at) !== 0) invalid();
  const retired = fuelUnits[0].fuel_ref;
  const remaining = fuelUnits.slice(1);
  return seal(input, input.process, state({ processRef: input.process.process_ref,
    input, fuelUnits: remaining, status: remaining.length ? 'active' : 'completed',
    startedAt: input.process.started_at,
    nextBoundaryAt: remaining.length
      ? addElapsedTime(input.at_timestamp, input.policy.recheck_interval) : null,
    stateVersion: input.process.state_version + 1
  }), remaining.length ? 'fuel_consumed' : 'completed', [], retired);
}

export function isLocalWorldProcessState(value) {
  try { validateProcess(strictSnapshot(value), null); return true; } catch { return false; }
}

function state({ processRef, input, fuelUnits, status, startedAt,
  nextBoundaryAt, stateVersion }) {
  return { schema: 'local_world_process_state_v1', process_ref: processRef,
    process_mode: 'local_exact', process_kind: 'fire', scope_ref: input.scope_ref,
    causal_basis_ref: input.causal_basis_ref, status, started_at: startedAt,
    next_boundary_at: nextBoundaryAt,
    fuel_bindings: fuelUnits.map(({ fuel_ref: ref }) => ({
      fuel_ref: ref, fuel_class: 'ordinary_solid_fuel_unit'
    })), state_version: stateVersion };
}

function seal(input, before, after, outcome, addedFuelRefs, retiredFuelRef) {
  const draft = {
    schema: 'rus.world_processes.local_fire_transition_proposal.v1',
    version: 1, status: 'sealed', action: input.action,
    at_timestamp: structuredClone(input.at_timestamp),
    causal_identity: structuredClone(input.causal_identity),
    policy_pin: { policy_ref: input.policy.policy_ref,
      version: input.policy.version },
    process_before: before === null ? null : structuredClone(before),
    process_after: structuredClone(after), outcome,
    added_fuel_refs: [...addedFuelRefs],
    retired_fuel_ref: retiredFuelRef,
    subject_changed_refs: retiredFuelRef === null ? [] : [retiredFuelRef]
  };
  return deepFreeze({ ...draft,
    proposal_digest: computeSpatialV3CanonicalDigest(draft) });
}

function validateProcess(value, input) {
  exact(value, PROCESS_KEYS);
  if (value.schema !== 'local_world_process_state_v1'
      || !text(value.process_ref) || value.process_mode !== 'local_exact'
      || value.process_kind !== 'fire' || !text(value.scope_ref)
      || !text(value.causal_basis_ref)
      || !['active', 'completed'].includes(value.status)
      || !validTimestamp(value.started_at) || !safePositive(value.state_version)
      || !Array.isArray(value.fuel_bindings)) invalid();
  unique(value.fuel_bindings.map((binding) => {
    exact(binding, ['fuel_ref', 'fuel_class']);
    if (!text(binding.fuel_ref)
        || binding.fuel_class !== 'ordinary_solid_fuel_unit') invalid();
    return binding.fuel_ref;
  }));
  const active = value.status === 'active';
  if (active !== (value.fuel_bindings.length > 0)
      || active !== (value.next_boundary_at !== null)
      || value.next_boundary_at !== null && !validTimestamp(value.next_boundary_at)
      || input && (value.scope_ref !== input.scope_ref
        || value.causal_basis_ref !== input.causal_basis_ref)) invalid();
}

function validatePolicy(value) {
  exact(value, POLICY_KEYS);
  if (value.schema !== 'local_fire_policy_v1' || !text(value.policy_ref)
      || value.version !== 1 || !exactRational(value.recheck_interval)
      || !safePositive(value.fuel_unit_mass_grams_min)
      || !safePositive(value.fuel_unit_mass_grams_max)
      || value.fuel_unit_mass_grams_min > value.fuel_unit_mass_grams_max) invalid();
}

function validateFuel(value, policy) {
  exact(value, FUEL_KEYS);
  if (!text(value.fuel_ref) || value.fuel_class !== 'ordinary_solid_fuel_unit'
      || !safePositive(value.state_version) || value.lifecycle_state !== 'active'
      || !safePositive(value.mass_grams) || value.quantity !== 1
      || value.bound_process_ref !== null && !text(value.bound_process_ref)
      || !text(value.placement_ref) || !digest(value.property_digest)
      || !digest(value.mechanics_digest)
      || value.mass_grams < policy.fuel_unit_mass_grams_min
      || value.mass_grams > policy.fuel_unit_mass_grams_max) invalid();
  return value;
}

function validateCausal(value) {
  exact(value, ['request_id', 'root_turn_id', 'action_ref', 'step_index']);
  if (![value.request_id, value.root_turn_id, value.action_ref].every(text)
      || !Number.isSafeInteger(value.step_index)
      || value.step_index < 1 || value.step_index > 8) invalid();
}

function exactRational(value) {
  try { exact(value, ['exact_minutes']); exact(value.exact_minutes,
    ['numerator', 'denominator']); } catch { return false; }
  return /^(?:0|[1-9][0-9]*)$/u.test(value.exact_minutes.numerator)
    && /^[1-9][0-9]*$/u.test(value.exact_minutes.denominator)
    && BigInt(value.exact_minutes.numerator) > 0n;
}

function strictSnapshot(value) {
  const seen = new WeakSet();
  function visit(entry) {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean'
        || typeof entry === 'number' && Number.isFinite(entry)) return entry;
    if (!entry || typeof entry !== 'object' || seen.has(entry)
        || Object.getOwnPropertySymbols(entry).length) return undefined;
    const array = Array.isArray(entry);
    if (Object.getPrototypeOf(entry) !== (array ? Array.prototype : Object.prototype)) return undefined;
    seen.add(entry);
    const names = Object.getOwnPropertyNames(entry);
    if (array && (names.length !== entry.length + 1 || !names.includes('length'))) return undefined;
    const output = array ? [] : {};
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return undefined;
      const child = visit(descriptor.value);
      if (child === undefined) return undefined;
      if (array) { if (key !== String(output.length)) return undefined; output.push(child); }
      else output[key] = child;
    }
    return output;
  }
  return visit(value);
}

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).length !== keys.length
      || keys.some((key) => !Object.hasOwn(value, key))) invalid();
}
function unique(values) {
  if (new Set(values).size !== values.length) fail('LOCAL_FIRE_DUPLICATE_FUEL',
    'Fuel identities must be unique.');
}
function validTimestamp(value) {
  try { exact(value, ['whole_minutes', 'subminute_numerator',
    'subminute_denominator']); } catch { return false; }
  return /^(?:0|[1-9][0-9]*)$/u.test(value.whole_minutes)
    && /^(?:0|[1-9][0-9]*)$/u.test(value.subminute_numerator)
    && /^[1-9][0-9]*$/u.test(value.subminute_denominator)
    && BigInt(value.subminute_numerator) < BigInt(value.subminute_denominator);
}
function safePositive(value) { return Number.isSafeInteger(value) && value > 0; }
function text(value) { return typeof value === 'string' && value.length > 0; }
function digest(value) { return typeof value === 'string' && /^(?:sha256:)?[0-9a-f]{64}$/u.test(value); }
function invalid() { fail('LOCAL_FIRE_INPUT_INVALID', 'Local fire input is invalid.'); }
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
