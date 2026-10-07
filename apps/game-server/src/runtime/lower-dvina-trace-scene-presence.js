const known = (value) => typeof value === 'string' && value !== '';

/** Marks NPC records read from the party database for the current scene; never persisted in a snapshot. */
export const SCENE_NPC_SOURCE = 'party_db_scene_read';

/** The schedule row keeps the slim snapshot the loader gives it, never a full scene-read record. */
export const routineNpcSnapshot = (npc) => npc?.runtime_source === SCENE_NPC_SOURCE
  ? { instance_id: npc.instance_id, anchor_id: npc.anchor_id ?? null,
    machine_state: npc.machine_state }
  : npc?.scene_readback_present === true ? strip(npc) : npc;

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
 * one: same position, else same G6. Where the G6 of a side is unknown (authored
 * scenes without a site) the g5 anchor stands in, and it decides alone when a side
 * has no position. Without an anchor an unknown G6 is never co-presence and null
 * never equals null.
 */
export function compareSceneLocus(left, right) {
  const bothPositions = known(left.position_id) && known(right.position_id);
  if (bothPositions && left.position_id === right.position_id) return true;
  if (bothPositions && known(left.g6_id) && known(right.g6_id)) {
    return left.g6_id === right.g6_id;
  }
  if (known(left.anchor_id) && known(right.anchor_id)) {
    return left.anchor_id === right.anchor_id;
  }
  return bothPositions ? false : null;
}

/** Location of the player for conversation: the authored location, else the site of a generated scene. */
export const sceneLocationRef = (state) => {
  const { location_ref: location, site_id: site } = state?.position ?? {};
  return known(location) ? location : known(site) ? site : null;
};

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

/**
 * Drops every scene-read NPC record and the position→G6 map from a snapshot. The
 * records also travel inside working copies (conversation working_state.world_state,
 * turn envelopes), so arrays are filtered at any depth; unchanged branches keep identity.
 */
export function withoutSceneNpcs(state) {
  if (state == null || typeof state !== 'object') return state;
  if (!Object.hasOwn(state, 'scene_position_g6')) return strip(state);
  const { scene_position_g6: _positions, ...rest } = state;
  return strip(rest);
}

/**
 * withoutSceneNpcs plus the position→G6 map at any depth: for a command whose
 * consequence carries a copy of the state, cut before the turn envelope is digested.
 */
export function withoutSceneRead(value) { return strip(value, true); }

/** True when a scene-read NPC record sits anywhere (array element or object property). */
export function containsSceneNpc(value) {
  if (value == null || typeof value !== 'object') return false;
  if (value.runtime_source === SCENE_NPC_SOURCE) return true;
  return Object.values(value).some(containsSceneNpc);
}

function strip(value, dropMap = false) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let changed = false;
    const kept = [];
    for (const entry of value) {
      if (entry?.runtime_source === SCENE_NPC_SOURCE) { changed = true; continue; }
      const next = strip(entry, dropMap);
      if (next !== entry) changed = true;
      kept.push(next);
    }
    return changed ? kept : value;
  }
  let changed = false;
  const out = {};
  const sceneReadback = value.scene_readback_present === true;
  const priorLocus = value.scene_readback_prior_locus;
  for (const [key, child] of Object.entries(value)) {
    if (dropMap && key === 'scene_position_g6') { changed = true; continue; }
    if (key === 'scene_readback_present'
        || key === 'scene_readback_prior_locus'
        || key === 'body_state_initialization_profile') {
      changed = true; continue;
    }
    if (sceneReadback && priorLocus != null
        && ['position_id', 'g6_instance_id'].includes(key)) {
      const previous = priorLocus[key];
      if (previous?.present === true) out[key] = previous.value;
      changed = true;
      continue;
    }
    const next = strip(child, dropMap);
    if (next !== child) changed = true;
    out[key] = next;
  }
  if (sceneReadback && priorLocus != null) {
    for (const key of ['position_id', 'g6_instance_id']) {
      const previous = priorLocus[key];
      if (previous?.present === true && !Object.hasOwn(out, key)) {
        out[key] = previous.value;
        changed = true;
      }
    }
  }
  return changed ? out : value;
}
