const PLAYER_PHYSICAL_POSITIONS = new Set(['hands', 'worn', 'worn_quick', 'equipped', 'external', 'external_load']);

export function approvedActorPlacement(placement = {}, path) {
  const hasCharacterHolder = Boolean(placement.holder_player_character_id);
  const hasNpcHolder = Boolean(placement.holder_npc_instance_id);
  const position = placement.physical_position ?? null;
  const slot = placement.equipment_slot_category_id ?? null;
  if (!hasCharacterHolder && !hasNpcHolder) {
    if (position != null || slot != null) throw stage24BuildError('WRITE_PLAN_PHYSICAL_POSITION_INVALID', `${path} has physical position or equipment slot without an actor holder.`);
    return { physical_position: null, equipment_slot_category_id: null };
  }
  if (!PLAYER_PHYSICAL_POSITIONS.has(position)) throw stage24BuildError('WRITE_PLAN_PHYSICAL_POSITION_REQUIRED', `${path}.placement.physical_position is required for an actor holder.`);
  if (position === 'equipped' && !String(slot).trim()) throw stage24BuildError('WRITE_PLAN_EQUIPMENT_SLOT_REQUIRED', `${path}.placement.equipment_slot_category_id is required when equipped.`);
  if (position !== 'equipped' && slot != null) throw stage24BuildError('WRITE_PLAN_EQUIPMENT_SLOT_INVALID', `${path}.placement.equipment_slot_category_id is only valid when equipped.`);
  return { physical_position: position, equipment_slot_category_id: slot };
}

export function approvedContainerPlacement(placement = {}, path) {
  if (placement.holder_npc_instance_id
      && !placement.holder_player_character_id) {
    if (placement.physical_position != null
        || placement.equipment_slot_category_id != null) {
      throw stage24BuildError('WRITE_PLAN_PHYSICAL_POSITION_INVALID',
        `${path} cannot equip a container.`);
    }
    return { physical_position: null, equipment_slot_category_id: null };
  }
  return approvedActorPlacement(placement, path);
}

export const approvedPlayerPlacement = approvedActorPlacement;

export function buildItemPlacementRecord(partyId, item) {
  const placement = item.placement ?? {};
  const record = {
    party_id: partyId,
    item_id: item.item_instance_id ?? item.item_id,
    anchor_id: null,
    container_id: null,
    holder_npc_id: null,
    holder_character_id: null
  };
  const targets = [
    'g5_anchor_id',
    'container_instance_id',
    'holder_npc_instance_id',
    'holder_player_character_id'
  ].filter((key) => placement[key]);
  if (targets.length !== 1) {
    throw stage24BuildError('WRITE_PLAN_ITEM_PLACEMENT_INVALID',
      `Item ${record.item_id} must have exactly one approved placement target.`);
  }
  if (placement.container_instance_id) {
    record.container_id = placement.container_instance_id;
  } else if (placement.holder_npc_instance_id) {
    record.holder_npc_id = placement.holder_npc_instance_id;
    Object.assign(record, approvedActorPlacement(
      placement,
      `item ${record.item_id}`
    ));
  } else if (placement.holder_player_character_id) {
    record.holder_character_id = placement.holder_player_character_id;
    Object.assign(record, approvedActorPlacement(
      placement,
      `item ${record.item_id}`
    ));
  } else {
    record.anchor_id = placement.g5_anchor_id;
  }
  return record;
}

function stage24BuildError(code, message) { return Object.assign(new Error(message), { code }); }
