import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrdinaryWorldRuntimeInstanceMechanicsSnapshot,
  resolvePhysicalItemCondition } from '../src/index.js';

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
  return createOrdinaryWorldRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
    provenance: { source_kind: 'ordinary_world_materialization',
      causal_ref: 'ordinary:1', request_id: 'request:1',
      candidate_key: 'candidate:1', coverage_key: 'coverage:1',
      context_version: 'context:1', policy_ref: 'policy:1',
      source_refs: ['source:1'] },
    mechanics: { mass_grams: 500, external_hand_cost: 0,
      carry_form: 'regular', packing_slot_cost: 2,
      quantity: { value: 1, unit: 'item' }, container: null }
  });
}
