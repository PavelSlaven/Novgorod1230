const known = (value) => typeof value === 'string' && value !== '';

/**
 * Temporary proxy for Spatial v3 co-presence: two actors share a scene when
 * they stand in the same G6 (acoustically uniform, default_clear visibility;
 * scene_position_node is only a unit below G6). The G6 of each position of the
 * current site comes from `scene_position_g6`, read per turn. It should delegate
 * to the Spatial v3 visibility/acoustic owners.
 */
export function sceneLocus(state, entity) {
  const schedule = known(entity?.instance_id)
    ? (state?.npc_schedule_runtime ?? []).find(
      ({ npc_id: id }) => id === entity.instance_id) : null;
  const positionId = schedule?.current_position_node_id
    ?? entity?.position_id ?? null;
  return {
    position_id: positionId,
    g6_id: g6Of(state, positionId),
    anchor_id: entity?.g5_anchor_id ?? entity?.anchor_id ?? null
  };
}

/**
 * true / false / null (not comparable). Positions decide when both sides have
 * one: same position, else same G6; an unknown G6 is never co-presence. The g5
 * anchor decides only when a side has no position. null never equals null.
 */
export function compareSceneLocus(left, right) {
  if (known(left.position_id) && known(right.position_id)) {
    if (left.position_id === right.position_id) return true;
    return known(left.g6_id) && known(right.g6_id) && left.g6_id === right.g6_id;
  }
  if (known(left.anchor_id) && known(right.anchor_id)) {
    return left.anchor_id === right.anchor_id;
  }
  return null;
}

export const sameSceneLocus = (left, right) =>
  compareSceneLocus(left, right) === true;

export const npcSharesPlayerScene = (state, npc) => sameSceneLocus(
  sceneLocus(state, npc), sceneLocus(state, state?.position));

// The G6 of a scene position: the current site's positions (read per turn, not
// persisted), else the player's own G6 for the player's position.
function g6Of(state, positionId) {
  if (!known(positionId)) return null;
  const mapped = state?.scene_position_g6?.[positionId];
  if (known(mapped)) return mapped;
  const own = state?.position;
  const g6 = own?.g6_instance_id ?? own?.g6_id;
  return own?.position_id === positionId && known(g6) ? g6 : null;
}
