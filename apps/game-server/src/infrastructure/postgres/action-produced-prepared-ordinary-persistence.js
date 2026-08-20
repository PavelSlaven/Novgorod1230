import { isDeepStrictEqual } from 'node:util';
import { failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export async function lockAndVerifyPreparedActionProducedPin(client, plan,
  pin) {
  const selected = await client.query(
    `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,
       i.quantity,i.condition_state,i.legal_status,i.state,i.state_version,
       p.anchor_id,p.container_id,p.holder_npc_id,p.holder_character_id,
       p.physical_position,p.equipment_slot_category_id,p.attached_item_id
     FROM party_runtime.party_items i
     JOIN party_runtime.party_item_placements p
       ON p.party_id=i.party_id AND p.item_id=i.item_id
     WHERE i.party_id=$1 AND i.item_id=$2 FOR UPDATE OF i,p`,
  [plan.party_id, pin.item_id]);
  const committed = await client.query(
    `SELECT x.item_id
     FROM party_runtime.party_ordinary_materialization_commits c
     JOIN party_runtime.party_ordinary_materialization_commit_items x
       ON x.party_id=c.party_id AND x.request_identity=c.request_identity
     WHERE c.party_id=$1 AND c.request_identity=$2 AND x.item_id=$3`,
  [plan.party_id, pin.prepared_ordinary.request_identity, pin.item_id]);
  if (selected.rows.length !== 1 || committed.rows.length !== 1) stale(pin);
  const row = selected.rows[0];
  const item = { item_id: row.item_id, run_id: row.run_id,
    template_id: row.template_id, profile_id: row.profile_id,
    category_id: row.category_id, quantity: Number(row.quantity),
    condition_state: row.condition_state, legal_status: row.legal_status,
    state: row.state, state_version: Number(row.state_version) };
  const placement = { anchor_id: row.anchor_id, container_id: row.container_id,
    holder_npc_id: row.holder_npc_id,
    holder_character_id: row.holder_character_id,
    physical_position: row.physical_position,
    equipment_slot_category_id: row.equipment_slot_category_id,
    attached_item_id: row.attached_item_id };
  if (!isDeepStrictEqual(item, pin.item)
      || !isDeepStrictEqual(placement, pin.placement)) stale(pin);
}

function stale(pin) {
  fail(pin.role === 'tool'
    ? 'ACTION_PRODUCED_TOOL_STALE' : 'ACTION_PRODUCED_SOURCE_STALE');
}
