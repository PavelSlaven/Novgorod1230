export function localFireItemQuery(lock) { return `SELECT i.item_id,i.run_id,
  i.template_id,i.profile_id,i.category_id,i.quantity,i.condition_state,
  i.legal_status,i.state,i.state_version,p.anchor_id,p.container_id,
  p.holder_npc_id,p.holder_character_id,p.physical_position,
  p.equipment_slot_category_id,p.attached_item_id,o.ownership_id,
  o.owner_npc_id,o.owner_character_id,o.owner_party,o.controller_npc_id,
  o.controller_character_id,o.claim_state,b.process_ref AS bound_process_ref,
  c.anchor_id AS container_anchor_id,
  c.parent_container_id AS container_parent_container_id,
  c.holder_npc_id AS container_holder_npc_id,
  c.holder_character_id AS container_holder_character_id,
  c.physical_position AS container_physical_position,
  c.closure_state AS container_closure_state,
  c.state_version AS container_state_version
 FROM party_runtime.party_items i
 JOIN party_runtime.party_item_placements p
   ON p.party_id=i.party_id AND p.item_id=i.item_id
 JOIN party_runtime.party_ownership o
   ON o.party_id=i.party_id AND o.item_id=i.item_id
 LEFT JOIN party_runtime.party_containers c
   ON c.party_id=i.party_id AND c.container_id=p.container_id
 LEFT JOIN party_runtime.party_local_world_process_fuel_bindings b
   ON b.party_id=i.party_id AND b.fuel_item_id=i.item_id
   AND b.released_at_change_set_id IS NULL
 WHERE i.party_id=$1 AND i.item_id=$2${lock ? ' FOR UPDATE OF i,p,o' : ''}`; }

export function localFireItemPin(row) {
  const item = { item_id: row.item_id, run_id: row.run_id,
    template_id: row.template_id, profile_id: row.profile_id,
    category_id: row.category_id, quantity: Number(row.quantity),
    condition_state: row.condition_state, legal_status: row.legal_status,
    state: row.state, state_version: Number(row.state_version) };
  const placement = { item_id: row.item_id, anchor_id: row.anchor_id,
    container_id: row.container_id, holder_npc_id: row.holder_npc_id,
    holder_character_id: row.holder_character_id,
    physical_position: row.physical_position,
    equipment_slot_category_id: row.equipment_slot_category_id,
    attached_item_id: row.attached_item_id };
  const ownership = { ownership_id: row.ownership_id,
    item_id: row.item_id, owner_npc_id: row.owner_npc_id,
    owner_character_id: row.owner_character_id, owner_party: row.owner_party,
    controller_npc_id: row.controller_npc_id,
    controller_character_id: row.controller_character_id,
    claim_state: row.claim_state };
  const container=row.container_id==null?null:{container_id:row.container_id,
    anchor_id:row.container_anchor_id,parent_container_id:
      row.container_parent_container_id,holder_npc_id:
      row.container_holder_npc_id,holder_character_id:
      row.container_holder_character_id,physical_position:
      row.container_physical_position,closure_state:row.container_closure_state,
      state_version:Number(row.container_state_version)};
  return { item_id: row.item_id, item, placement, ownership,container,
    bound_process_ref: row.bound_process_ref ?? null };
}
