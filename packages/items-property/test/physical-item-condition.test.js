import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePhysicalItemCondition } from '../src/index.js';

test('physical condition separates runtime lifecycle marker from damage', () => {
  const item = { template_id: null,
    condition_state: 'ordinary_runtime_instance', state: {
      lifecycle_status: 'active',
      runtime_instance_mechanics_snapshot: snapshot()
    } };
  assert.equal(resolvePhysicalItemCondition(item), 'serviceable');
  item.state.condition_state = 'damaged';
  assert.equal(resolvePhysicalItemCondition(item), 'damaged');
  item.state.lifecycle_status = 'retired';
  assert.equal(resolvePhysicalItemCondition(item), null);
});

function snapshot() {
  return { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: {
      source_kind: 'ordinary_world_materialization', root_turn_id: 'turn:1',
      step_index: 1, operation_ref: 'operation:1', origin_kind: 'crafted',
      source_refs: ['source:1']
    }, mechanics: { mass_grams: 500, external_hand_cost: 0,
      carry_form: 'regular', packing_slot_cost: 2, quantity: null,
      container: null } };
}
