import { array, text, walk } from '../shared/utils.js';

export function buildApprovedReferenceIndex(input) {
  const sets = {
    npcIds: new Set(),
    actorIds: new Set(),
    itemIds: new Set(),
    containerIds: new Set(),
    anchorIds: new Set(),
    routeIds: new Set(),
    playerCharacterIds: new Set()
  };
  const outputs = input.approved_pipeline_outputs ?? {};
  const phase1A = outputs.materialization_result;
  if (phase1A?.schema === 'rus.lower_dvina_trace_party_materialization_result.v1') {
    for (const item of array(phase1A.immediate?.items)) if (text(item?.instance_id)) sets.itemIds.add(item.instance_id);
    if (text(phase1A.immediate?.spatial?.anchor?.instance_id)) sets.anchorIds.add(phase1A.immediate.spatial.anchor.instance_id);
    for (const scene of array(phase1A.immediate?.prepared_scenes)) {
      if (text(scene?.anchor?.instance_id)) sets.anchorIds.add(scene.anchor.instance_id);
    }
    for (const npc of array(phase1A.immediate?.npcs)) {
      if (text(npc?.instance_id)) sets.npcIds.add(npc.instance_id);
      if (text(npc?.anchor_id)) sets.anchorIds.add(npc.anchor_id);
    }
    if (text(phase1A.immediate?.player?.instance_id)) sets.playerCharacterIds.add(phase1A.immediate.player.instance_id);
  }
  collectIds(outputs.initial_npc_placement, sets, 'npc');
  collectIds(outputs.initial_item_placement, sets, 'item');
  collectIds(outputs.initial_item_placement, sets, 'container');
  collectIds(outputs.g5_scene_graph, sets, 'anchor');
  collectIds(outputs.g5_scene_graph, sets, 'route');
  collectIds(outputs.character_knowledge_map, sets, 'route');
  collectIds(outputs.player_character, sets, 'playerCharacter');
  for (const value of array(input.world_base_reference_snapshot?.allowed_graph_edge_ids)) sets.routeIds.add(value);
  for (const value of sets.npcIds) sets.actorIds.add(value);
  for (const value of sets.playerCharacterIds) sets.actorIds.add(value);
  return sets;
}

export function collectIds(value, sets, kind) {
  const rules = {
    npc: { keys: /^(npc_id|npc_instance_id|actor_id|id)$/i, set: sets.npcIds },
    item: { keys: /^(item_id|item_instance_id|id)$/i, set: sets.itemIds },
    container: { keys: /^(container_id|container_instance_id|id)$/i, set: sets.containerIds },
    anchor: { keys: /^(anchor_id|g5_anchor_id|id)$/i, set: sets.anchorIds },
    route: { keys: /^(route_id|edge_id|g5_edge_id|graph_edge_id|id)$/i, set: sets.routeIds },
    playerCharacter: { keys: /^(player_character_id|character_id|id)$/i, set: sets.playerCharacterIds }
  };
  const rule = rules[kind];
  walk(value, (key, current) => { if (rule.keys.test(key) && text(current)) rule.set.add(current); });
}

export function referenceRule(key) {
  if (/^(npc_id|npc_instance_id)$/i.test(key)) return { set: 'npcIds', code: 'WRITE_PLAN_UNAPPROVED_NPC' };
  if (/^actor_id$/i.test(key)) return { set: 'actorIds', code: 'WRITE_PLAN_UNAPPROVED_NPC' };
  if (/^(item_id|item_instance_id)$/i.test(key)) return { set: 'itemIds', code: 'WRITE_PLAN_UNAPPROVED_ITEM' };
  if (/^(container_id|container_instance_id)$/i.test(key)) return { set: 'containerIds', code: 'WRITE_PLAN_UNAPPROVED_CONTAINER' };
  if (/^(anchor_id|g5_anchor_id)$/i.test(key)) return { set: 'anchorIds', code: 'WRITE_PLAN_UNAPPROVED_ANCHOR' };
  if (/^(route_id|edge_id|g5_edge_id|graph_edge_id)$/i.test(key)) return { set: 'routeIds', code: 'WRITE_PLAN_UNAPPROVED_ROUTE' };
  if (/^(player_character_id|character_id)$/i.test(key)) return { set: 'playerCharacterIds', code: 'WRITE_PLAN_INPUT_BINDING_INVALID' };
  return null;
}

export function findCurrentPosition(outputs) {
  return outputs?.materialization_result?.immediate?.spatial?.position
    ?? outputs?.character_knowledge_map?.current_position_ref
    ?? outputs?.g5_scene_graph?.player_start_position
    ?? outputs?.visible_context_package?.frame?.position
    ?? outputs?.visible_context_package?.frame?.current_position
    ?? null;
}

export function currentPositionMatchesApprovedScene(outputs) {
  const position = findCurrentPosition(outputs);
  if (!position) return false;
  const start = outputs?.materialization_result?.immediate?.spatial?.position
    ?? outputs?.g5_scene_graph?.player_start_position
    ?? {};
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) {
    if (position[key] != null && start[key] != null && position[key] !== start[key]) return false;
  }
  return true;
}

export function findFirstField(value, key, tablePattern) {
  for (const batch of array(value)) {
    if (!tablePattern.test(batch?.target_table ?? '')) continue;
    for (const record of array(batch.records)) if (record?.[key] != null) return record[key];
  }
  return null;
}
