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
     WHERE p.party_id=$1 FOR UPDATE OF p,a`, [plan.party_id]);
  const used = await client.query(
    `SELECT p.item_id FROM party_runtime.party_item_placements p
     JOIN party_runtime.party_items i
       ON i.party_id=p.party_id AND i.item_id=p.item_id
     WHERE p.party_id=$1 AND p.anchor_id=$2
       AND COALESCE(i.state->>'lifecycle_status','active') <> 'retired'
     ORDER BY p.item_id FOR UPDATE OF p,i`,
  [plan.party_id, pin.anchor_id]);
  const value = selected.rows.length === 1 ? {
    anchor_id: selected.rows[0].anchor_id,
    item_capacity: Number(selected.rows[0].item_capacity),
    used_item_ids: used.rows.map(({ item_id: itemId }) => itemId)
  } : null;
  if (value == null || !isDeepStrictEqual(value, {
    anchor_id: pin.anchor_id,
    item_capacity: pin.item_capacity,
    used_item_ids: pin.used_item_ids
  })
      || !actionProducedDestinationFits(pin, plan.source_updates,
        plan.result_items)) fail('ACTION_PRODUCED_DESTINATION_STALE');
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
