/** The Phase 1A and Phase 2 owner read for ordinary item rows. */
export async function loadLowerDvinaTraceItems(query, partyId, runIds) {
  if (typeof query !== 'function') throw new TypeError('query function is required.');
  const ids = [...new Set(runIds ?? [])];
  if (ids.length === 0) return [];
  return (await query(
    `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,i.quantity,i.state_version,i.condition_state,i.legal_status,i.state,
            to_jsonb(i)->>'created_change_set_id' AS item_created_change_set_id,
            to_jsonb(i)->>'updated_change_set_id' AS item_updated_change_set_id,
            ip.item_id AS placement_item_id,
            ip.anchor_id,ip.container_id AS placement_container_id,ip.holder_npc_id,ip.holder_character_id,
            ip.physical_position,ip.equipment_slot_category_id,ip.attached_item_id,
            to_jsonb(ip)->>'created_change_set_id' AS placement_created_change_set_id,
            to_jsonb(ip)->>'updated_change_set_id' AS placement_updated_change_set_id,
            o.ownership_id,o.container_id AS ownership_container_id,o.owner_npc_id,o.owner_character_id,o.owner_party,o.owner_external_ref,
            o.controller_npc_id,o.controller_character_id,o.claim_state,
            to_jsonb(o)->>'created_change_set_id' AS ownership_created_change_set_id,
            to_jsonb(o)->>'updated_change_set_id' AS ownership_updated_change_set_id
       FROM party_runtime.party_items i
       LEFT JOIN party_runtime.party_item_placements ip ON ip.party_id=i.party_id AND ip.item_id=i.item_id
       LEFT JOIN party_runtime.party_ownership o ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1 AND i.run_id=ANY($2::text[]) ORDER BY i.item_id`,
    [partyId, ids]
  )).rows;
}

export function projectLowerDvinaTraceItemRow(item) {
  return {
    item_id: item.item_id,
    run_id: item.run_id,
    template_id: item.template_id,
    profile_id: item.profile_id,
    category_id: item.category_id,
    quantity: item.quantity,
    state_version: Number(item.state_version),
    condition_state: item.condition_state,
    legal_status: item.legal_status,
    state: item.state,
    placement: {
      item_id: item.item_id,
      anchor_id: item.anchor_id,
      container_id: item.placement_container_id,
      holder_npc_id: item.holder_npc_id,
      holder_character_id: item.holder_character_id,
      physical_position: item.physical_position,
      equipment_slot_category_id: item.equipment_slot_category_id,
      attached_item_id: item.attached_item_id
    },
    ownership: {
      item_id: item.item_id,
      ownership_id: item.ownership_id,
      owner_npc_id: item.owner_npc_id,
      owner_character_id: item.owner_character_id,
      owner_external_ref: item.owner_external_ref,
      owner_party: item.owner_party,
      controller_npc_id: item.controller_npc_id,
      controller_character_id: item.controller_character_id,
      claim_state: item.claim_state
    }
  };
}
