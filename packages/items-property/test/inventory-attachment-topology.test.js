import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateInventoryMass,
  validateInventoryTopology
} from '../src/index.js';

const actorId = 'actor-1';
const profiles = {
  knife: { mass_grams: 300 },
  coat: { mass_grams: 900 }
};

test('attached items require one active target and inherit carried mass', () => {
  const attached = inventory({
    items: [item('knife-1', 'knife'), item('coat-1', 'coat')],
    item_placements: [
      {
        item_id: 'knife-1', holder_character_id: actorId,
        physical_position: 'hands'
      },
      { item_id: 'coat-1', attached_item_id: 'knife-1' }
    ]
  });
  assert.equal(validateInventoryTopology(attached).pass, true);
  assert.equal(calculateInventoryMass(attached).total_mass_grams, 1200);

  const missing = inventory({
    items: [item('coat-1', 'coat')],
    item_placements: [{ item_id: 'coat-1', attached_item_id: 'missing' }]
  });
  assert.ok(validateInventoryTopology(missing).errors.some(({ code }) =>
    code === 'INVENTORY_ITEM_NOT_FOUND'));

  const multiple = inventory({
    items: [item('coat-1', 'coat')],
    item_placements: [{
      item_id: 'coat-1', holder_character_id: actorId,
      physical_position: 'worn', attached_item_id: 'coat-1'
    }]
  });
  assert.ok(validateInventoryTopology(multiple).errors.some(({ code }) =>
    code === 'INVENTORY_PLACEMENT_EXACTLY_ONE_REQUIRED'));
  assert.ok(validateInventoryTopology(multiple).errors.some(({ code }) =>
    code === 'INVENTORY_CYCLE_DETECTED'));
});

function inventory(overrides) {
  return {
    party_id: 'party-1', actor_id: actorId,
    items: [], containers: [], item_placements: [],
    container_placements: [], item_profiles: profiles,
    container_profiles: {}, ...overrides
  };
}

function item(itemId, templateId) {
  return { item_id: itemId, template_id: templateId, quantity: 1 };
}
