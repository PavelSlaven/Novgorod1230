import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';

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
    `SELECT item_id FROM party_runtime.party_item_placements
     WHERE party_id=$1 AND anchor_id=$2 ORDER BY item_id FOR UPDATE`,
  [plan.party_id, pin.anchor_id]);
  const value = selected.rows.length === 1 ? {
    anchor_id: selected.rows[0].anchor_id,
    item_capacity: Number(selected.rows[0].item_capacity),
    used_item_ids: used.rows.map(({ item_id: itemId }) => itemId)
  } : null;
  if (value == null || digest(value) !== pin.destination_digest
      || value.used_item_ids.length + plan.result_items.length
        > value.item_capacity) fail('ACTION_PRODUCED_DESTINATION_STALE');
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
