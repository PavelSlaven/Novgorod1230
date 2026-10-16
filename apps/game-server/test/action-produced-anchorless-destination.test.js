import assert from 'node:assert/strict';
import test from 'node:test';
import { loadActionProducedOutputDestination } from
  '../src/infrastructure/postgres/action-produced-authority-loader.js';
import { actionProducedOutputPlacement, actionProducedOwnerOutputDestination,
  validateActionProducedDestinationPin } from
  '../src/infrastructure/postgres/action-produced-atomic-write-plan-pins.js';
import { actionProducedPhysicalKeysForPlan } from
  '../src/infrastructure/postgres/action-produced-physical-keys.js';

/** A party that walked to a place: party_positions has no g5 anchor, the actor stands on a scene position. */
const client = (anchorRows, sceneRows) => ({ async query(sql) {
  if (sql.includes('party_positions')) return { rows: anchorRows };
  if (sql.includes('party_journey_locations\n     WHERE')) return { rows: sceneRows };
  if (sql.includes('FROM party_runtime.scene_position_nodes')) return { rows: [{ capacity: 7, occupancy: 1 }] };
  return { rows: [] };
} });
const input = { party_id: 'party:1', actor_ref: 'player_character_1' };
const walked = { schema: 'action_production_output_destination_pin_v1',
  destination_kind: 'party_current_scene_position', anchor_id: null, item_capacity: 0, used_item_ids: [],
  scene_position_id: 'canonical:x:baseline:position:arrival:0', scene_capacity: 7, scene_occupancy: 1 };

test('no anchor but a scene position: the destination is the scene position alone', async () => {
  const pin = await loadActionProducedOutputDestination(
    client([], [{ scene_position_id: walked.scene_position_id }]), input);
  assert.deepEqual(pin, walked);
});

test('neither an anchor nor a scene position: still no destination', async () => {
  assert.equal(await loadActionProducedOutputDestination(client([], []), input), null);
});

test('an anchorless pin is valid only for a scene position and places the result on it', () => {
  assert.deepEqual(validateActionProducedDestinationPin(walked), walked);
  assert.throws(() => validateActionProducedDestinationPin({ ...walked,
    destination_kind: 'party_current_anchor', scene_position_id: undefined }),
  { code: 'ACTION_PRODUCED_DESTINATION_INVALID' });
  assert.deepEqual(actionProducedOutputPlacement(walked), { anchor_id: null,
    scene_position_id: walked.scene_position_id, container_id: null, holder_npc_id: null,
    holder_character_id: null, physical_position: null, equipment_slot_category_id: null,
    attached_item_id: null });
  assert.deepEqual(actionProducedOwnerOutputDestination(walked, 'player_character_1'),
    { schema: 'rus.items.action_produced_output_destination.v1', placement_kind: 'scene_position',
      target_ref: walked.scene_position_id, holder_ref: null, controller_ref: 'player_character_1' });
});

test('an anchorless plan locks no anchor keys', () => {
  const keys = actionProducedPhysicalKeysForPlan({ party_id: 'party:1', output_destination_pin: walked,
    source_pins: [], tool_pins: [], result_items: [] });
  assert.deepEqual(keys, []);
});
