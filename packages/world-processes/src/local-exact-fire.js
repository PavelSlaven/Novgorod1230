import { deepFreeze } from '@rus/kernel';
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
  'quantity', 'bound_process_ref'
];
const REQUEST_KEYS = [
  'schema', 'action', 'process_ref', 'at_timestamp', 'scope_ref',
  'causal_basis_ref', 'cause', 'policy', 'process', 'fuel_units', 'affect'
];

export function resolveLocalExactFire(rawInput) {
  const input = strictSnapshot(rawInput);
  if (!input || !exact(input, REQUEST_KEYS)
      || input.schema !== 'rus.world_processes.local_fire_transition_request.v1'
      || !['start', 'add_fuel', 'due_boundary', 'affect'].includes(input.action)
      || !text(input.scope_ref) || !text(input.causal_basis_ref)
      || !validTimestamp(input.at_timestamp)) invalid();
  validateCause(input.cause, input.action);
  validatePolicy(input.policy);
  if (!Array.isArray(input.fuel_units)) invalid();
  const fuels = input.fuel_units.map((fuel) => validateFuel(fuel, input.policy));
  unique(fuels.map(({ fuel_ref: ref }) => ref));

  if (input.action === 'start') return start(input, fuels);
  validateProcess(input.process, input);
  if (input.process_ref !== input.process.process_ref) invalid();
  if (input.action === 'add_fuel') return addFuel(input, fuels);
  if (input.action === 'affect') return affect(input, fuels);
  return due(input, fuels);
}

export function isLocalWorldProcessState(value) {
  try { validateProcess(strictSnapshot(value), null); return true; }
  catch { return false; }
}

function start(input, fuels) {
  if (!text(input.process_ref) || input.process !== null || input.affect !== null
      || fuels.length === 0
      || fuels.some(({ bound_process_ref: bound }) => bound !== null)) invalid();
  return proposal(input, null, state(input, input.process_ref, fuels, 'active',
    input.at_timestamp, addElapsedTime(input.at_timestamp,
      input.policy.recheck_interval), 1), 'started',
  fuels.map(({ fuel_ref: ref }) => ref), [], null);
}

function addFuel(input, fuels) {
  if (input.affect !== null || input.process.status !== 'active'
      || fuels.length === 0
      || fuels.some(({ bound_process_ref: bound }) => bound !== null)
      || fuels.some(({ fuel_ref: ref }) => input.process.fuel_bindings
        .some(({ fuel_ref: current }) => current === ref))) invalid();
  return proposal(input, input.process, state(input, input.process_ref,
    [...input.process.fuel_bindings, ...fuels], 'active',
    input.process.started_at, input.process.next_boundary_at,
    input.process.state_version + 1), 'fuel_added',
  fuels.map(({ fuel_ref: ref }) => ref), [], null);
}

function due(input, fuels) {
  if (input.affect !== null || input.process.status !== 'active'
      || input.process.next_boundary_at === null
      || compareGameTimestamp(input.at_timestamp,
        input.process.next_boundary_at) !== 0
      || fuels.length !== input.process.fuel_bindings.length
      || fuels.some((fuel, index) =>
        fuel.fuel_ref !== input.process.fuel_bindings[index].fuel_ref
        || fuel.bound_process_ref !== input.process_ref)) invalid();
  const consumed = fuels[0].fuel_ref;
  const remaining = fuels.slice(1);
  return proposal(input, input.process, state(input, input.process_ref,
    remaining, remaining.length ? 'active' : 'completed',
    input.process.started_at, remaining.length
      ? addElapsedTime(input.at_timestamp, input.policy.recheck_interval) : null,
    input.process.state_version + 1),
  remaining.length ? 'fuel_consumed' : 'completed', [], [consumed], consumed);
}

function affect(input, fuels) {
  if (input.process.status !== 'active' || fuels.length !== 0
      || !exact(input.affect, ['process_outcome', 'consumed_item_ref'])
      || !['no_effect', 'continue', 'complete']
        .includes(input.affect.process_outcome)
      || input.affect.consumed_item_ref !== null
        && !text(input.affect.consumed_item_ref)) invalid();
  const complete = input.affect.process_outcome === 'complete';
  const released = complete
    ? input.process.fuel_bindings.map(({ fuel_ref: ref }) => ref) : [];
  const after = state(input, input.process_ref,
    complete ? [] : input.process.fuel_bindings,
    complete ? 'completed' : 'active', input.process.started_at,
    complete ? null : input.process.next_boundary_at,
    input.process.state_version + 1);
  return proposal(input, input.process, after, input.affect.process_outcome,
    [], released, input.affect.consumed_item_ref);
}

function state(input, processRef, fuelUnits, status, startedAt,
  nextBoundaryAt, stateVersion) {
  return { schema: 'local_world_process_state_v1', process_ref: processRef,
    process_mode: 'local_exact', process_kind: 'fire', scope_ref: input.scope_ref,
    causal_basis_ref: input.causal_basis_ref, status, started_at: startedAt,
    next_boundary_at: nextBoundaryAt,
    fuel_bindings: fuelUnits.map(({ fuel_ref: ref }) => ({
      fuel_ref: ref, fuel_class: 'ordinary_solid_fuel_unit'
    })), state_version: stateVersion };
}

function proposal(input, before, after, outcome, added, released, consumed) {
  return deepFreeze({
    schema: 'rus.world_processes.local_fire_transition_proposal.v1',
    action: input.action, at_timestamp: structuredClone(input.at_timestamp),
    cause: structuredClone(input.cause),
    process_before: before === null ? null : structuredClone(before),
    process_after: structuredClone(after), outcome,
    added_fuel_refs: [...added], released_fuel_refs: [...released],
    consumed_item_ref: consumed
  });
}

function validateProcess(value, input) {
  if (!exact(value, PROCESS_KEYS)
      || value.schema !== 'local_world_process_state_v1'
      || !text(value.process_ref) || value.process_mode !== 'local_exact'
      || value.process_kind !== 'fire' || !text(value.scope_ref)
      || !text(value.causal_basis_ref)
      || !['active', 'completed'].includes(value.status)
      || !validTimestamp(value.started_at) || !safePositive(value.state_version)
      || !Array.isArray(value.fuel_bindings)) invalid();
  unique(value.fuel_bindings.map((binding) => {
    if (!exact(binding, ['fuel_ref', 'fuel_class']) || !text(binding.fuel_ref)
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
  if (!exact(value, POLICY_KEYS) || value.schema !== 'local_fire_policy_v1'
      || !text(value.policy_ref) || value.version !== 1
      || !exactRational(value.recheck_interval)
      || !safePositive(value.fuel_unit_mass_grams_min)
      || !safePositive(value.fuel_unit_mass_grams_max)
      || value.fuel_unit_mass_grams_min > value.fuel_unit_mass_grams_max) invalid();
}

function validateFuel(value, policy) {
  if (!exact(value, FUEL_KEYS) || !text(value.fuel_ref)
      || value.fuel_class !== 'ordinary_solid_fuel_unit'
      || !safePositive(value.state_version) || value.lifecycle_state !== 'active'
      || !safePositive(value.mass_grams) || value.quantity !== 1
      || value.bound_process_ref !== null && !text(value.bound_process_ref)
      || value.mass_grams < policy.fuel_unit_mass_grams_min
      || value.mass_grams > policy.fuel_unit_mass_grams_max) invalid();
  return value;
}

function validateCause(value, action) {
  if (action === 'due_boundary') {
    if (!exact(value, ['kind', 'boundary_id',
      'expected_process_state_version', 'due_at'])
        || value.kind !== 'temporal_boundary' || !text(value.boundary_id)
        || !safePositive(value.expected_process_state_version)
        || !validTimestamp(value.due_at)) invalid();
    return;
  }
  if (!exact(value, ['kind', 'request_id', 'root_turn_id', 'step_index'])
      || value.kind !== 'actor_step' || !text(value.request_id)
      || !text(value.root_turn_id) || !safePositive(value.step_index)
      || value.step_index > 8) invalid();
}

function exactRational(value) {
  if (!exact(value, ['exact_minutes'])
      || !exact(value.exact_minutes, ['numerator', 'denominator'])) return false;
  return /^(?:0|[1-9][0-9]*)$/u.test(value.exact_minutes.numerator)
    && /^[1-9][0-9]*$/u.test(value.exact_minutes.denominator)
    && BigInt(value.exact_minutes.numerator) > 0n;
}

function strictSnapshot(value) {
  const seen = new WeakSet();
  function visit(entry) {
    if (entry === null || typeof entry === 'string'
        || typeof entry === 'boolean'
        || typeof entry === 'number' && Number.isFinite(entry)) return entry;
    if (!entry || typeof entry !== 'object' || seen.has(entry)
        || Object.getOwnPropertySymbols(entry).length) return undefined;
    const array = Array.isArray(entry);
    if (Object.getPrototypeOf(entry)
        !== (array ? Array.prototype : Object.prototype)) return undefined;
    seen.add(entry);
    const names = Object.getOwnPropertyNames(entry);
    if (array && (names.length !== entry.length + 1
        || !names.includes('length'))) return undefined;
    const output = array ? [] : {};
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return undefined;
      }
      const child = visit(descriptor.value);
      if (child === undefined) return undefined;
      if (array) {
        if (key !== String(output.length)) return undefined;
        output.push(child);
      } else output[key] = child;
    }
    return output;
  }
  return visit(value);
}

function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function unique(values) {
  if (new Set(values).size !== values.length) {
    fail('LOCAL_FIRE_DUPLICATE_FUEL', 'Fuel identities must be unique.');
  }
}
function validTimestamp(value) {
  return exact(value, ['whole_minutes', 'subminute_numerator',
    'subminute_denominator'])
    && /^(?:0|[1-9][0-9]*)$/u.test(value.whole_minutes)
    && /^(?:0|[1-9][0-9]*)$/u.test(value.subminute_numerator)
    && /^[1-9][0-9]*$/u.test(value.subminute_denominator)
    && BigInt(value.subminute_numerator) < BigInt(value.subminute_denominator);
}
function safePositive(value) { return Number.isSafeInteger(value) && value > 0; }
function text(value) { return typeof value === 'string' && value.length > 0; }
function invalid() { fail('LOCAL_FIRE_INPUT_INVALID', 'Local fire input is invalid.'); }
function fail(code, message) { throw Object.assign(new Error(message), { code }); }
