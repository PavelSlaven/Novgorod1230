import { isDeepStrictEqual } from 'node:util';
import { actionProducedDestinationFits } from
  './action-produced-atomic-write-plan-pins.js';

export async function lockAndVerifyActionProducedContext(client, plan) {
  await lockDestination(client, plan);
}

async function lockDestination(client, plan) {
  const pin = plan.output_destination_pin;
  if (pin == null) return;
  const selected = await client.query(
    `SELECT p.g5_anchor_id AS anchor_id,a.item_capacity
     FROM party_runtime.party_positions p
     JOIN party_runtime.party_g5_anchors a
       ON a.party_id=p.party_id AND a.anchor_id=p.g5_anchor_id
     WHERE p.party_id=$1
     FOR UPDATE OF p,a`, [plan.party_id]);
  const direct = await client.query(
    `SELECT scene_position_id
     FROM party_runtime.party_journey_locations
     WHERE party_id=$1 AND owner_kind='actor' AND owner_id=$2
       AND location_kind='scene' FOR UPDATE`, [plan.party_id, plan.actor_ref]);
  const carried = await client.query(
    `SELECT position_node_id AS scene_position_id
     FROM party_runtime.party_actor_carrier_positions
     WHERE party_id=$1 AND actor_id=$2 AND status='active' FOR UPDATE`,
  [plan.party_id, plan.actor_ref]);
  const positions = [...direct.rows, ...carried.rows];
  const used = pin.destination_kind === 'party_current_scene_position'
    ? { rows: [] } : await client.query(
    `SELECT p.item_id FROM party_runtime.party_item_placements p
     JOIN party_runtime.party_items i
       ON i.party_id=p.party_id AND i.item_id=p.item_id
     WHERE p.party_id=$1 AND p.anchor_id=$2
       AND COALESCE(i.state->>'lifecycle_status','active') <> 'retired'
     ORDER BY p.item_id FOR UPDATE OF p,i`,
  [plan.party_id, pin.anchor_id]);
  const scene = pin.destination_kind === 'party_current_scene_position'
    ? await lockSceneOccupancy(client, plan.party_id, pin.scene_position_id)
    : null;
  const value = selected.rows.length === 1
    ? pin.destination_kind === 'party_current_scene_position'
      ? { anchor_id: selected.rows[0].anchor_id,
        scene_position_id: positions.length === 1
          ? positions[0].scene_position_id : null,
        scene_capacity: scene?.capacity, scene_occupancy: scene?.occupancy }
      : { anchor_id: selected.rows[0].anchor_id,
        item_capacity: Number(selected.rows[0].item_capacity),
        used_item_ids: used.rows.map(({ item_id: itemId }) => itemId) }
    : null;
  const expected = pin.destination_kind === 'party_current_scene_position'
    ? { anchor_id: pin.anchor_id, scene_position_id: pin.scene_position_id,
      scene_capacity: pin.scene_capacity, scene_occupancy: pin.scene_occupancy }
    : { anchor_id: pin.anchor_id, item_capacity: pin.item_capacity,
      used_item_ids: pin.used_item_ids };
  if (value == null || !isDeepStrictEqual(value, expected)
      || !actionProducedDestinationFits(pin, plan.source_updates,
        plan.result_items, plan.source_pins)) fail('ACTION_PRODUCED_DESTINATION_STALE');
}

async function lockSceneOccupancy(client, partyId, positionId) {
  const position = await client.query(
    `SELECT capacity FROM party_runtime.scene_position_nodes
     WHERE party_id=$1 AND id=$2 FOR UPDATE`, [partyId, positionId]);
  const journeys = await client.query(
    `SELECT id FROM party_runtime.party_journey_locations
     WHERE party_id=$1 AND location_kind='scene' AND scene_position_id=$2
     FOR UPDATE`, [partyId, positionId]);
  const placements = await client.query(
    `SELECT occupies_capacity_units FROM party_runtime.entity_placements
     WHERE party_id=$1 AND position_node_id=$2 FOR UPDATE`,
  [partyId, positionId]);
  const capacity = Number(position.rows[0]?.capacity);
  const occupancy = journeys.rows.length + placements.rows.reduce(
    (total, row) => total + Number(row.occupies_capacity_units), 0);
  return position.rows.length === 1 && Number.isSafeInteger(capacity)
    && capacity > 0 && Number.isSafeInteger(occupancy) && occupancy >= 0
    && occupancy <= capacity ? { capacity, occupancy } : null;
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
