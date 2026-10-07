import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { committedMechanics as attempted } from
  '../src/runtime/releases/lower-dvina-trace-a1-pre-attempt.js';
import { committedMechanics as conserved } from
  '../src/infrastructure/postgres/action-produced-mass-conservation.js';

const base = { mass_grams: 600, external_hand_cost: 0, carry_form: 'regular' };
const mechanics = { ...base, packing_slot_cost: 0, quantity: null, container: null };
const callers = [attempted, conserved];

function authored(overrides = {}) {
  return { template_id: 'shirt', state: { inventory_profile_snapshot: {
    ...base, status: 'approved', ...overrides
  } } };
}

function runtime(version) {
  const provenance = version === 1 ? {
    source_kind: 'ordinary_direct_action_result', root_turn_id: 'turn:1',
    step_index: 1, operation_ref: 'output:1', origin_kind: 'direct_partition',
    source_refs: ['source:1']
  } : {
    source_kind: 'ordinary_world_materialization', causal_ref: 'causal:1',
    request_id: 'request:1', candidate_key: 'candidate:1', coverage_key: 'coverage:1',
    context_version: 'context:1', policy_ref: 'policy:1', source_refs: ['basis:1']
  };
  return { template_id: null, state: { runtime_instance_mechanics_snapshot: {
    schema: `rus.items.runtime_instance_mechanics_snapshot.v${version}`,
    version, provenance, mechanics: { ...mechanics, mass_grams: 350,
      packing_slot_cost: 2, external_hand_cost: 1, carry_form: 'compact',
      quantity: { value: 1, unit: version === 2 ? 'item' : 'piece' } }
  } } };
}

test('both adapters delegate profile interpretation to the item owner', async () => {
  const files = [
    '../src/runtime/releases/lower-dvina-trace-a1-pre-attempt.js',
    '../src/infrastructure/postgres/action-produced-mass-conservation.js'
  ];
  for (const [index, file] of files.entries()) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source,
      /import\s*\{[^}]*\bprojectCommittedInventoryMechanicsProfile\b[^}]*\}\s*from\s*['"]@rus\/items-property['"]/u,
      `${file}: projection must come from the public item owner`);
    const body = callers[index].toString();
    assert.match(body, /\bprojectCommittedInventoryMechanicsProfile\s*\(/u);
    assert.doesNotMatch(body, /\bpacking_slot_cost\s*=\s*0|\bquantity\s*=\s*null|\bcontainer\s*=\s*null/u,
      `${file}: adapter must not retain its own interpretation defaults`);
  }
});

test('v5 defaults and explicit values preserve both adapter outputs without mutating rows', () => {
  const cases = [
    [{}, mechanics],
    [{ packing_slot_cost: undefined, quantity: undefined, container: undefined }, mechanics],
    [{ packing_slot_cost: 3, quantity: null, container: null },
      { ...mechanics, packing_slot_cost: 3 }],
    [{ quantity: { value: 0.5, unit: 'piece' } },
      { ...mechanics, quantity: { value: 0.5, unit: 'piece' } }]
  ];
  for (const [profile, expected] of cases) {
    for (const caller of callers) {
      const item = authored(profile);
      const before = structuredClone(item);
      const result = caller(item);
      assert.deepEqual(result, expected);
      assert.deepEqual(item, before);
      if (result.quantity !== null) {
        assert.notEqual(result.quantity, item.state.inventory_profile_snapshot.quantity);
        result.quantity.value = 999;
        assert.deepEqual(item, before);
      }
    }
  }
});

test('A1 and persistence retain their different validation boundaries', () => {
  for (const overrides of [
    { packing_slot_cost: null }, { mass_grams: -1 },
    { external_hand_cost: 3 }, { carry_form: 'invalid' },
    { quantity: { value: 0, unit: 'piece' } }, { container: { capacity: 3 } }
  ]) {
    const item = authored(overrides);
    assert.throws(() => attempted(item), { code: 'TRACE_A1_ITEM_MECHANICS_INVALID' });
    // Conservation reads a profile here; allocation validation follows later.
    assert.deepEqual(conserved(item), { ...mechanics, ...overrides });
  }
  assert.throws(() => attempted(null), { code: 'TRACE_A1_ITEM_MECHANICS_INVALID' });
  assert.throws(() => conserved(null), { code: 'ACTION_PRODUCED_RESULT_INVALID' });
  const missing = { template_id: null, state: {} };
  assert.throws(() => attempted(missing), { code: 'TRACE_A1_ITEM_MECHANICS_INVALID' });
  assert.throws(() => conserved(missing), { code: 'ACTION_PRODUCED_RESULT_INVALID' });
});

test('direct-action v1 and ordinary-world v2 snapshots keep exact mechanics', () => {
  for (const version of [1, 2]) {
    const item = runtime(version);
    const before = structuredClone(item);
    for (const caller of callers) {
      assert.deepEqual(caller(item), before.state.runtime_instance_mechanics_snapshot.mechanics);
      assert.deepEqual(item, before);
    }
  }
});

test('undefined template id retains the existing adapter asymmetry', () => {
  const item = runtime(1);
  delete item.template_id;
  assert.deepEqual(attempted(item), item.state.runtime_instance_mechanics_snapshot.mechanics);
  assert.throws(() => conserved(item), { code: 'ACTION_PRODUCED_RESULT_INVALID' });
});
