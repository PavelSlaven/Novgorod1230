const PLAYER_PHYSICAL_POSITIONS = new Set(['hands', 'worn', 'worn_quick', 'equipped', 'external', 'external_load']);

export function approvedPlayerPlacement(placement = {}, path) {
  const hasCharacterHolder = Boolean(placement.holder_player_character_id);
  const position = placement.physical_position ?? null;
  const slot = placement.equipment_slot_category_id ?? null;
  if (!hasCharacterHolder) {
    if (position != null || slot != null) throw stage24BuildError('WRITE_PLAN_PHYSICAL_POSITION_INVALID', `${path} has physical position or equipment slot without a player holder.`);
    return { physical_position: null, equipment_slot_category_id: null };
  }
  if (!PLAYER_PHYSICAL_POSITIONS.has(position)) throw stage24BuildError('WRITE_PLAN_PHYSICAL_POSITION_REQUIRED', `${path}.placement.physical_position is required for a player holder.`);
  if (position === 'equipped' && !String(slot).trim()) throw stage24BuildError('WRITE_PLAN_EQUIPMENT_SLOT_REQUIRED', `${path}.placement.equipment_slot_category_id is required when equipped.`);
  if (position !== 'equipped' && slot != null) throw stage24BuildError('WRITE_PLAN_EQUIPMENT_SLOT_INVALID', `${path}.placement.equipment_slot_category_id is only valid when equipped.`);
  return { physical_position: position, equipment_slot_category_id: slot };
}

function stage24BuildError(code, message) { return Object.assign(new Error(message), { code }); }
