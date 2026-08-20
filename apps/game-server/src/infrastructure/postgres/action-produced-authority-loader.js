import { actionProducedText as text,
  failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export async function loadActionProducedOutputDestination(client, input) {
  const selected = await client.query(
    `SELECT p.g5_anchor_id AS anchor_id,a.item_capacity
     FROM party_runtime.party_positions p
     JOIN party_runtime.party_g5_anchors a
       ON a.party_id=p.party_id AND a.anchor_id=p.g5_anchor_id
     WHERE p.party_id=$1`, [input.party_id]);
  if (selected.rows.length === 0) return null;
  if (selected.rows.length !== 1 || !text(selected.rows[0].anchor_id)) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  const itemCapacity = Number(selected.rows[0].item_capacity);
  if (!Number.isSafeInteger(itemCapacity) || itemCapacity < 0) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  const used = await client.query(
    `SELECT p.item_id FROM party_runtime.party_item_placements p
     JOIN party_runtime.party_items i
       ON i.party_id=p.party_id AND i.item_id=p.item_id
     WHERE p.party_id=$1 AND p.anchor_id=$2
       AND COALESCE(i.state->>'lifecycle_status','active') <> 'retired'
     ORDER BY p.item_id`,
  [input.party_id, selected.rows[0].anchor_id]);
  const usedItemIds = used.rows.map(({ item_id: itemId }) => itemId);
  if (!refs(usedItemIds) || usedItemIds.length > itemCapacity) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  const value = { anchor_id: selected.rows[0].anchor_id,
    item_capacity: itemCapacity, used_item_ids: usedItemIds };
  return { schema: 'action_production_output_destination_pin_v1',
    destination_kind: 'party_current_anchor', ...value };
}

function refs(values) {
  return Array.isArray(values) && values.every(text)
    && new Set(values).size === values.length;
}
