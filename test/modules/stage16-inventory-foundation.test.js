import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStage16InventoryFoundation } from '../../packages/new-game/src/stages/stage-16-item-placement/validation/inventory-validation.js';

test('Stage 16 hard-blocks a required inventory foundation without an explicit initial placement candidate', () => {
  const result = evaluateStage16InventoryFoundation({ item_instances: [], container_instances: [] }, { inventory_foundation: { required: true } });
  assert.equal(result.concerns[0].code, 'INITIAL_INVENTORY_PLACEMENT_DATA_GAP');
});

test('Stage 16 records immutable mass, hands, access and capacity evidence from approved inventory candidates', () => {
  const draft = {
    item_instances: [{ item_instance_id: 'knife-1', item_profile_candidate_id: 'knife', item_template_id: 'knife', quantity: 1, placement: { holder_player_character_id: 'hero', physical_position: 'hands' } }],
    container_instances: []
  };
  const input = { inventory_foundation: { required: true, party_id: 'party-1', actor_id: 'hero', strength: 200, item_profiles: { knife: { mass_grams: 300, carry_form: 'compact', external_hand_cost: 1, packing_slot_cost: 1, packing_bundle_size: 1 } }, container_profiles: {}, container_compatibility: [] } };
  const result = evaluateStage16InventoryFoundation(draft, input);
  assert.equal(result.concerns.length, 0);
  assert.deepEqual(result.trace.summary, { total_mass_grams: 300, load_category: 'light', hands_used: 1, hands_free: 1 });
});
