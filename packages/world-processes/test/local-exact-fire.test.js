import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocalExactFire } from '@rus/world-processes/local-exact-fire';

const clock = (whole_minutes) => ({ whole_minutes: String(whole_minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const policy = () => ({ schema: 'local_fire_policy_v1', policy_ref: 'f1:p',
  version: 1, recheck_interval: { exact_minutes: { numerator: '5', denominator: '1' } },
  fuel_unit_mass_grams_min: 100, fuel_unit_mass_grams_max: 1000 });
const fuel = (ref, bound_process_ref = null) => ({ fuel_ref: ref,
  fuel_class: 'ordinary_solid_fuel_unit', state_version: 1,
  lifecycle_state: 'active', mass_grams: 300, quantity: 1,
  bound_process_ref });
const request = () => ({ schema: 'rus.world_processes.local_fire_transition_request.v1',
  action: 'start', process_ref: 'local-fire:party:turn:1:step:1',
  at_timestamp: clock(10), scope_ref: 'place:shore',
  causal_basis_ref: 'item:ignition', cause: { kind: 'actor_step',
    request_id: 'req:1', root_turn_id: 'turn:1', step_index: 1 },
  policy: policy(), process: null, fuel_units: [fuel('item:f1'), fuel('item:f2')],
  affect: null });
const dueCause = (process, dueAt) => ({ kind: 'temporal_boundary',
  boundary_id: `local-fire:${process.process_ref}:state:${process.state_version}`,
  expected_process_state_version: process.state_version,
  due_at: structuredClone(dueAt) });

test('local exact fire starts, appends and consumes one whole unit per due boundary', () => {
  const started = resolveLocalExactFire(request());
  assert.equal(started.process_after.process_ref,
    'local-fire:party:turn:1:step:1');
  assert.equal(Object.hasOwn(started, 'proposal_digest'), false);
  assert.equal(Object.hasOwn(started, 'status'), false);
  assert.deepEqual(started.process_after.next_boundary_at, clock(15));
  const add = request(); add.action = 'add_fuel'; add.at_timestamp = clock(11);
  add.process = structuredClone(started.process_after); add.fuel_units = [fuel('item:f3')];
  const added = resolveLocalExactFire(add);
  assert.deepEqual(added.process_after.fuel_bindings.map((x) => x.fuel_ref),
    ['item:f1', 'item:f2', 'item:f3']);
  const due = request(); due.action = 'due_boundary'; due.at_timestamp = clock(15);
  due.process = structuredClone(started.process_after);
  due.cause = dueCause(due.process, due.at_timestamp);
  due.fuel_units = [fuel('item:f1', due.process.process_ref),
    fuel('item:f2', due.process.process_ref)];
  const burned = resolveLocalExactFire(due);
  assert.equal(burned.consumed_item_ref, 'item:f1');
  assert.deepEqual(burned.process_after.next_boundary_at, clock(20));
  assert.deepEqual(burned.released_fuel_refs, ['item:f1']);
});

test('qualitative water affect consumes input and completes without stale fuel bindings', () => {
  const started = resolveLocalExactFire(request());
  const affect = request(); affect.action = 'affect';
  affect.process_ref = started.process_after.process_ref;
  affect.process = structuredClone(started.process_after);
  affect.fuel_units = [];
  affect.affect = { process_outcome: 'complete',
    consumed_item_ref: 'item:water' };
  const completed = resolveLocalExactFire(affect);
  assert.equal(completed.process_after.status, 'completed');
  assert.deepEqual(completed.process_after.fuel_bindings, []);
  assert.deepEqual(completed.released_fuel_refs, ['item:f1', 'item:f2']);
  assert.equal(completed.consumed_item_ref, 'item:water');
});

test('last due fuel completes and has no next boundary', () => {
  const started = resolveLocalExactFire({ ...request(), fuel_units: [fuel('item:f1')] });
  const due = request(); due.action = 'due_boundary'; due.at_timestamp = clock(15);
  due.process = structuredClone(started.process_after);
  due.cause = dueCause(due.process, due.at_timestamp);
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
  due.cause = dueCause(due.process, due.at_timestamp);
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
    (() => { const x = request(); x.policy = x.cause; return x; })(),
    (() => { const x = request(); Object.setPrototypeOf(x.policy, null); return x; })()
  ]) assert.throws(() => resolveLocalExactFire(hostile));
});
