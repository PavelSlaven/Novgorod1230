const known = (value) => typeof value === 'string' && value !== '';

/**
 * Temporary proxy for Spatial v3 co-presence: two actors share a scene when
 * they stand in the same G6 (acoustically uniform, default_clear visibility;
 * scene_position_node is only a unit below G6). It should delegate to the
 * Spatial v3 visibility/acoustic owners once they are reachable from turn state.
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
    anchor_id: entity?.g5_anchor_id ?? entity?.anchor_id ?? null,
    location_ref: entity?.location_ref ?? entity?.location_profile_ref ?? null
  };
}

/**
 * true / false / null (not comparable). Positions decide when both sides have
 * one: same position, else same G6. When a G6 is not known for either side the
 * same place stands in for it (never null = null). The g5 anchor decides only
 * when a side has no position.
 */
export function compareSceneLocus(left, right) {
  if (known(left.position_id) && known(right.position_id)) {
    if (left.position_id === right.position_id) return true;
    if (known(left.g6_id) && known(right.g6_id)) return left.g6_id === right.g6_id;
    return known(left.location_ref) && left.location_ref === right.location_ref;
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

// The G6 of a scene position, from what the committed state carries: the
// player's own G6, the rows of the prepared scenes, the first-entry target.
function g6Of(state, positionId) {
  if (!known(positionId)) return null;
  if (state?.position?.position_id === positionId && known(state.position.g6_id)) {
    return state.position.g6_id;
  }
  const target = state?.first_entry_preparation?.spatial_v3?.target;
  if (target?.position_id === positionId && known(target.g6_instance_id)) {
    return target.g6_instance_id;
  }
  const scenes = [state?.first_entry_preparation?.scene, ...(state?.prepared_scenes ?? [])];
  for (const scene of scenes) {
    const row = (scene?.rows ?? []).find(({ target_table: table, id }) =>
      table === 'scene_position_nodes' && id === positionId);
    if (known(row?.record?.g6_instance_id)) return row.record.g6_instance_id;
  }
  return null;
}
