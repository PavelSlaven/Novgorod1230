import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';

export function localFireItemQuery(lock) { return `SELECT i.item_id,i.run_id,
  i.template_id,i.profile_id,i.category_id,i.quantity,i.condition_state,
  i.legal_status,i.state,i.state_version,p.anchor_id,p.container_id,
  p.holder_npc_id,p.holder_character_id,p.physical_position,
  p.equipment_slot_category_id,p.attached_item_id,o.ownership_id,
  o.owner_npc_id,o.owner_character_id,o.owner_party,o.controller_npc_id,
  o.controller_character_id,o.claim_state,b.process_ref AS bound_process_ref
 FROM party_runtime.party_items i
 JOIN party_runtime.party_item_placements p
   ON p.party_id=i.party_id AND p.item_id=i.item_id
 JOIN party_runtime.party_ownership o
   ON o.party_id=i.party_id AND o.item_id=i.item_id
 LEFT JOIN party_runtime.party_local_world_process_fuel_bindings b
   ON b.party_id=i.party_id AND b.fuel_item_id=i.item_id
   AND b.released_at_change_set_id IS NULL
 WHERE i.party_id=$1 AND i.item_id=$2${lock ? ' FOR UPDATE OF i,p,o' : ''}`; }

export function localFireFuelPin(row) {
  const base = localFireEntityPin(row);
  const { item, placement } = base;
  const classification = item.state?.local_fire_fuel;
  const mechanics = classification?.mechanics;
  if (classification?.schema !== 'rus.items.local_fire_fuel.v1'
      || classification.fuel_class !== 'ordinary_solid_fuel_unit'
      || classification.whole_unit !== true || item.quantity !== 1
      || item.state?.lifecycle_status === 'retired'
      || !Number.isSafeInteger(mechanics?.mass_grams)) fail();
  const placementRef = placement.anchor_id ?? placement.container_id
    ?? placement.holder_character_id ?? placement.holder_npc_id;
  return { ...base, fuel_snapshot: { fuel_ref: row.item_id,
    fuel_class: classification.fuel_class, state_version: item.state_version,
    lifecycle_state: 'active', mass_grams: mechanics.mass_grams,
    quantity: item.quantity, bound_process_ref: row.bound_process_ref ?? null,
    placement_ref: placementRef,
    property_digest: digest(item.state?.property_state),
    mechanics_digest: digest(mechanics) } };
}

export function localFireEntityPin(row) {
  const item = { item_id: row.item_id, run_id: row.run_id,
    template_id: row.template_id, profile_id: row.profile_id,
    category_id: row.category_id, quantity: row.quantity,
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
  return { item_id: row.item_id, item, placement, ownership,
    item_digest: digest(item), placement_digest: digest(placement),
    ownership_digest: digest(ownership) };
}

export function localFireAccessible(pin, actorRef, scopeRef) {
  const ownership = pin.ownership;
  const actorOwned = ownership.owner_character_id === actorRef
    && ownership.owner_npc_id === null && ownership.owner_party === false;
  const partyOwned = ownership.owner_character_id === null
    && ownership.owner_npc_id === null && ownership.owner_party === true;
  const controlled = ownership.claim_state === 'owned'
    && ownership.controller_character_id === actorRef
    && ownership.controller_npc_id === null;
  const placement = pin.placement;
  const atScope = placement.anchor_id === scopeRef
    && placement.container_id === null && placement.holder_npc_id === null
    && placement.holder_character_id === null
    && placement.attached_item_id === null;
  const heldByActor = placement.anchor_id === null
    && placement.container_id === null && placement.holder_npc_id === null
    && placement.holder_character_id === actorRef
    && placement.attached_item_id === null;
  return (actorOwned || partyOwned) && controlled && (atScope || heldByActor);
}
function fail() { throw Object.assign(new Error('LOCAL_FIRE_FUEL_INVALID'),
  { code: 'LOCAL_FIRE_FUEL_INVALID' }); }
