import { array, addText, collectByKeys, collectSourceIds } from '../shared/utils.js';
export function buildStage18ReferenceIndex(input) {
  const refs = {
    routeIds: new Set(),
    graphEdgeIds: new Set(),
    g5EdgeIds: new Set(),
    placeIds: new Set(),
    nodeIds: new Set(),
    anchorIds: new Set(),
    minilocationIds: new Set(),
    npcIds: new Set(),
    itemIds: new Set(),
    containerIds: new Set(),
    playerCharacterIds: new Set(),
    sourceIds: new Set()
  };
  for (const edge of routeSnapshotRows(input?.world_base_route_snapshot)) {
    addText(refs.graphEdgeIds, edge?.graph_edge_id ?? edge?.edge_id ?? edge?.id);
    addText(refs.routeIds, edge?.route_id);
    collectByKeys(edge, refs.nodeIds, ['from_node_id', 'to_node_id', 'node_id', 'g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']);
    collectByKeys(edge, refs.placeIds, ['place_id', 'location_id']);
    collectSourceIds(edge, refs.sourceIds);
  }
  for (const edge of array(input?.g5_scene_graph?.g5_edges ?? input?.g5_scene_graph?.edges)) {
    addText(refs.g5EdgeIds, edge?.g5_edge_id ?? edge?.edge_id ?? edge?.id);
  }
  for (const anchor of array(input?.g5_scene_graph?.g5_anchors ?? input?.g5_scene_graph?.anchors)) {
    addText(refs.anchorIds, anchor?.g5_anchor_id ?? anchor?.anchor_id ?? anchor?.id);
  }
  for (const miniloc of array(input?.g5_scene_graph?.g5_minilocations ?? input?.g5_scene_graph?.minilocations)) {
    addText(refs.minilocationIds, miniloc?.g5_minilocation_id ?? miniloc?.minilocation_id ?? miniloc?.id);
  }
  collectByKeys(input?.selected_start_node, refs.nodeIds, ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id', 'selected_node_id', 'graph_node_id']);
  collectByKeys(input?.selected_start_node, refs.placeIds, ['place_id', 'location_id']);
  collectByKeys(input?.g5_scene_graph?.parent_location, refs.nodeIds, ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']);
  collectByKeys(input?.g5_scene_graph?.parent_location, refs.placeIds, ['place_id', 'location_id']);
  collectByKeys(input?.initial_npc_placement, refs.npcIds, ['npc_instance_id', 'npc_id', 'npc_candidate_id', 'key_npc_seed_id']);
  collectByKeys(input?.initial_item_placement, refs.itemIds, ['item_instance_id', 'item_id']);
  collectByKeys(input?.initial_item_placement, refs.containerIds, ['container_instance_id', 'container_id']);
  collectByKeys(input?.player_character, refs.playerCharacterIds, ['player_character_id', 'character_id']);
  collectSourceIds(input?.regional_context_package, refs.sourceIds);
  collectSourceIds(input?.world_base_route_snapshot, refs.sourceIds);
  collectSourceIds(input?.player_character, refs.sourceIds);
  return refs;
}
export function routeSnapshotRows(snapshot) {
  return [
    ...array(snapshot?.nearby_graph_edges),
    ...array(snapshot?.known_route_candidates),
    ...array(snapshot?.historical_anchor_candidates),
    ...array(snapshot?.route_knowledge_rule_candidates)
  ];
}
