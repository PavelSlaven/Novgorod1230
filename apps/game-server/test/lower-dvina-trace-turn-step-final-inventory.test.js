import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFinalTurnStepInventory } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-final-inventory.js';

test('held-only changes do not revalidate unchanged container capacity', () => {
  const committed = fixture();
  delete committed.items[0].inventory_profile.packing_bundle_size;
  const next = structuredClone(committed);
  next.items.push({ item_id: 'portion', template_id: 'portion', quantity: 1,
    inventory_profile: { mass_grams: 500, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1, packing_bundle_size: 1 },
    placement: { holder_character_id: 'actor', physical_position: 'hands' } });
  assert.doesNotThrow(() => validateFinalTurnStepInventory(next, committed));
  next.items.at(-1).inventory_profile.mass_grams = 1000000;
  assert.throws(() => validateFinalTurnStepInventory(next, committed), {
    code: 'INVENTORY_LOAD_EXCEEDED'
  });
});

test('contained quantity/profile, moves in/out, and capacity changes are checked', () => {
  for (const change of [
    (state) => { state.items[0].quantity = 3; },
    (state) => { state.items[0].inventory_profile.packing_slot_cost = 3; },
    (state) => { state.items[1].placement = { container_id: 'bag' }; },
    (state) => { state.items[0].placement = { anchor_id: 'shore' }; },
    (state) => { state.container_profiles[0].capacity = 0; }
  ]) {
    const committed = fixture();
    const next = structuredClone(committed);
    change(next);
    // The second contained item keeps the invalid capacity observable on exit.
    if (next.items[0].placement.container_id == null) {
      committed.items[1].placement = { container_id: 'bag' };
      next.items[1].placement = { container_id: 'bag' };
      committed.items[1].quantity = next.items[1].quantity = 3;
    }
    assert.throws(() => validateFinalTurnStepInventory(next, committed), {
      code: 'CONTAINER_CAPACITY_EXCEEDED'
    });
  }
});

function fixture() {
  return {
    party_id: 'party', actor_id: 'actor', party_state: { state_version: 1 },
    player_profile: { attributes: { strength: { value: 10 } } },
    position: { g5_anchor_id: 'shore' },
    items: ['first', 'second'].map((id, index) => ({
      item_id: id, template_id: id, quantity: 1,
      inventory_profile: { mass_grams: 100, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 1, packing_bundle_size: 1 },
      placement: index === 0 ? { container_id: 'bag' } : { anchor_id: 'shore' }
    })),
    containers: [{ container_id: 'bag', template_id: 'bag' }],
    container_placements: [{ container_id: 'bag', anchor_id: 'shore' }],
    container_profiles: [{ template_id: 'bag', mass_grams: 100,
      external_hand_cost: 0, carry_form: 'compact', packing_slot_cost: 1,
      packing_bundle_size: 1, capacity: 1 }],
    container_compatibility: []
  };
}
