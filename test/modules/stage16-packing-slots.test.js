import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStage16ItemPlacementCodePrecheck, runStage16ItemPlacementBlock, validateStage16ItemPlacementDraft } from '@rus/new-game/stages/stage-16/compat';
import { makeStage16Input, makeStage16Draft } from '../fixtures/stage13-16-fixtures.mjs';

function overfilledPackingFixture() {
  const input = makeStage16Input();
  input.item_profile_candidate_set.item_profile_candidates = [{
    item_profile_candidate_id: 'item-candidate-1',
    item_template_id: 'item-template-1',
    packing_slot_cost: 2,
    packing_bundle_size: 1
  }];
  input.item_profile_candidate_set.container_profile_candidates = [{
    container_profile_candidate_id: 'container-candidate-1',
    container_template_id: 'container-template-1',
    capacity: 1,
    packing_slot_cost: 1,
    capacity_policy: { version: 1, mode: 'packing_slots', unit: 'packing_slot' }
  }];
  const draft = makeStage16Draft({
    placement_status: 'placed',
    item_instances: [{ item_instance_id: 'item-instance-1', item_profile_candidate_id: 'item-candidate-1', quantity: 1, placement: { container_instance_id: 'container-instance-1' } }],
    container_instances: [{ container_instance_id: 'container-instance-1', container_profile_candidate_id: 'container-candidate-1', placement: { g5_anchor_id: 'anchor-1' } }]
  });
  return { input, draft };
}

test('Stage 16 capacity check hard-blocks overflow with an immutable packing trace', () => {
  const { input, draft } = overfilledPackingFixture();
  const before = structuredClone(input);
  const concerns = validateStage16ItemPlacementDraft(draft, input);
  const overflow = concerns.find((concern) => concern.code === 'CONTAINER_CAPACITY_EXCEEDED');
  assert.deepEqual(overflow?.container_template_id, 'container-template-1');
  assert.deepEqual(overflow?.capacity, 1);
  assert.deepEqual(overflow?.required_slots, 2);
  assert.deepEqual(overflow?.line_breakdown, [{ item_template_id: 'item-template-1', quantity: 1, packing_slot_cost: 2, packing_bundle_size: 1, required_slots: 2 }]);
  const trace = buildStage16ItemPlacementCodePrecheck(draft, input).evidence.find((entry) => entry.kind === 'packing_slots_v1');
  assert.deepEqual(trace?.containers[0], {
    capacity_policy_version: 1,
    container_template_id: 'container-template-1',
    capacity: 1,
    used_slots: 2,
    remaining_slots: -1,
    line_breakdown: [{ item_template_id: 'item-template-1', quantity: 1, packing_slot_cost: 2, packing_bundle_size: 1, required_slots: 2 }]
  });
  assert.deepEqual(input, before);
});

test('Stage 16 stops before audit when selected container capacity is exceeded', async () => {
  const { input, draft } = overfilledPackingFixture();
  let auditCalled = false;
  await assert.rejects(
    () => runStage16ItemPlacementBlock({ input, materialize: () => draft, audit: async () => { auditCalled = true; return {}; } }),
    (error) => error.lifecycle?.concerns?.some((concern) => concern.code === 'CONTAINER_CAPACITY_EXCEEDED')
  );
  assert.equal(auditCalled, false);
});
