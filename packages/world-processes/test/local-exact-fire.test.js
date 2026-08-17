import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocalExactFire } from '@rus/world-processes/local-exact-fire';

const digest = `sha256:${'a'.repeat(64)}`;
const clock = (whole_minutes) => ({ whole_minutes: String(whole_minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const policy = () => ({ schema: 'local_fire_policy_v1', policy_ref: 'f1:p',
  version: 1, recheck_interval: { exact_minutes: { numerator: '5', denominator: '1' } },
  fuel_unit_mass_grams_min: 100, fuel_unit_mass_grams_max: 1000 });
const fuel = (ref, bound_process_ref = null) => ({ fuel_ref: ref,
  fuel_class: 'ordinary_solid_fuel_unit', state_version: 1,
  lifecycle_state: 'active', mass_grams: 300, quantity: 1,
  bound_process_ref, placement_ref: 'place:shore', property_digest: digest,
  mechanics_digest: digest });
const request = () => ({ schema: 'rus.world_processes.local_fire_transition_request.v1',
  action: 'start', at_timestamp: clock(10), scope_ref: 'place:shore',
  causal_basis_ref: 'item:ignition', causal_identity: { request_id: 'req:1',
    root_turn_id: 'turn:1', action_ref: 'action:turn:1:step:1', step_index: 1 },
  policy: policy(), process: null, fuel_units: [fuel('item:f1'), fuel('item:f2')] });

test('local exact fire starts, appends and consumes one whole unit per due boundary', () => {
  const started = resolveLocalExactFire(request());
  assert.equal(started.process_after.process_ref.startsWith('local-fire:'), true);
  assert.deepEqual(started.process_after.next_boundary_at, clock(15));
  const add = request(); add.action = 'add_fuel'; add.at_timestamp = clock(11);
  add.process = structuredClone(started.process_after); add.fuel_units = [fuel('item:f3')];
  const added = resolveLocalExactFire(add);
  assert.deepEqual(added.process_after.fuel_bindings.map((x) => x.fuel_ref),
    ['item:f1', 'item:f2', 'item:f3']);
  const due = request(); due.action = 'due_boundary'; due.at_timestamp = clock(15);
  due.process = structuredClone(started.process_after);
  due.fuel_units = [fuel('item:f1', due.process.process_ref),
    fuel('item:f2', due.process.process_ref)];
  const burned = resolveLocalExactFire(due);
  assert.equal(burned.retired_fuel_ref, 'item:f1');
  assert.deepEqual(burned.process_after.next_boundary_at, clock(20));
  assert.deepEqual(burned.subject_changed_refs, ['item:f1']);
});

test('last due fuel completes and has no next boundary', () => {
  const started = resolveLocalExactFire({ ...request(), fuel_units: [fuel('item:f1')] });
  const due = request(); due.action = 'due_boundary'; due.at_timestamp = clock(15);
  due.process = structuredClone(started.process_after);
  due.fuel_units = [fuel('item:f1', due.process.process_ref)];
  const completed = resolveLocalExactFire(due);
  assert.equal(completed.process_after.status, 'completed');
  assert.equal(completed.process_after.next_boundary_at, null);
});

test('fuel bounds, stack, duplicate, bound conflict and non-due boundary fail closed', () => {
  for (const mutate of [
    (x) => { x.fuel_units[0].mass_grams = 99; },
    (x) => { x.fuel_units[0].mass_grams = 1001; },
    (x) => { x.fuel_units[0].quantity = { value: 2, unit: 'unit' }; },
    (x) => { x.fuel_units.push(structuredClone(x.fuel_units[0])); },
    (x) => { x.fuel_units[0].bound_process_ref = 'local-fire:other'; }
  ]) { const value = request(); mutate(value); assert.throws(() => resolveLocalExactFire(value)); }
  const started = resolveLocalExactFire(request());
  const due = request(); due.action = 'due_boundary'; due.at_timestamp = clock(14);
  due.process = structuredClone(started.process_after);
  due.fuel_units = due.process.fuel_bindings.map(({ fuel_ref: ref }) =>
    fuel(ref, due.process.process_ref));
  assert.throws(() => resolveLocalExactFire(due));
});

test('input boundary rejects getters, symbols, aliases and custom prototypes without reads', () => {
  let reads = 0; const getter = request();
  Object.defineProperty(getter, 'policy', { enumerable: true,
    get() { reads += 1; return policy(); } });
  assert.throws(() => resolveLocalExactFire(getter)); assert.equal(reads, 0);
  for (const hostile of [
    (() => { const x = request(); x[Symbol('x')] = 1; return x; })(),
    (() => { const x = request(); x.policy = x.causal_identity; return x; })(),
    (() => { const x = request(); Object.setPrototypeOf(x.policy, null); return x; })()
  ]) assert.throws(() => resolveLocalExactFire(hostile));
});
