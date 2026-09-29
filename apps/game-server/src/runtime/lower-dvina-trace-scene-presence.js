const known = (value) => typeof value === 'string' && value !== '';

/**
 * Where an actor or the player stands in the scene. Generated scenes live on
 * scene_position_nodes (position_id); authored scenes on g5 anchors. A routine
 * that moved an NPC updates only its schedule runtime row.
 */
export function sceneLocus(state, entity) {
  const schedule = known(entity?.instance_id)
    ? (state?.npc_schedule_runtime ?? []).find(
      ({ npc_id: id }) => id === entity.instance_id) : null;
  return {
    position_id: schedule?.current_position_node_id ?? entity?.position_id ?? null,
    anchor_id: entity?.g5_anchor_id ?? entity?.anchor_id ?? null
  };
}

/** true / false when both sides expose the same kind of place, null otherwise. */
export function compareSceneLocus(left, right) {
  if (known(left.position_id) && known(right.position_id)) {
    return left.position_id === right.position_id;
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
