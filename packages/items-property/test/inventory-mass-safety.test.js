import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateInventoryMass } from '../src/index.js';

test('inventory mass fails closed when safe instance masses overflow', () => {
  const items = ['runtime-1', 'runtime-2'].map((itemId, index) => ({
    item_id: itemId,
    runtime_instance_mechanics_snapshot: snapshot(`operation-${index + 1}`)
  }));
  const result = calculateInventoryMass({
    party_id: 'party-1', actor_id: 'actor-1', items, containers: [],
    item_placements: items.map(({ item_id: itemId }) => ({
      item_id: itemId,
      holder_character_id: 'actor-1',
      physical_position: 'worn'
    })),
    container_placements: [], item_profiles: {}, container_profiles: {}
  });

  assert.equal(result.pass, false);
  assert.equal(result.total_mass_grams, null);
  assert.equal(result.errors[0].code, 'ITEM_MASS_SAFE_INTEGER_EXCEEDED');
  assert.equal(result.errors[0].category, 'data_gap');
});

function snapshot(operationRef) {
  return {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party-1:7', step_index: 1,
      operation_ref: operationRef, origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: {
      mass_grams: Number.MAX_SAFE_INTEGER,
      external_hand_cost: 0,
      carry_form: 'compact',
      packing_slot_cost: 1,
      quantity: null,
      container: null
    }
  };
}
