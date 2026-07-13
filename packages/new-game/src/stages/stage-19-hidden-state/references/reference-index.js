import { addText, array, isObject, text, walk } from '../shared/utils.js';
export function buildStage19ReferenceIndex(input) {
  const refs = {
    npcIds: new Set(),
    itemIds: new Set(),
    containerIds: new Set(),
    anchorIds: new Set(),
    minilocationIds: new Set(),
    g5EdgeIds: new Set(),
    graphEdgeIds: new Set(),
    nodeIds: new Set(),
    propertyBindingIds: new Set(),
    playerCharacterIds: new Set(),
    containerContentIds: new Map(),
    accessStateByTarget: new Map(),
    propertyBindingByTarget: new Map()
  };

  collectByKeys(input.initial_npc_placement, refs.npcIds, ['npc_instance_id', 'npc_id']);
  collectByKeys(input.initial_item_placement, refs.itemIds, ['item_instance_id', 'item_id']);
  collectByKeys(input.initial_item_placement, refs.containerIds, ['container_instance_id', 'container_id']);
  collectByKeys(input.initial_item_placement, refs.propertyBindingIds, ['property_binding_id']);
  collectByKeys(input.player_character, refs.playerCharacterIds, ['player_character_id', 'character_id']);

  const anchors = array(input.g5_scene_graph?.g5_anchors ?? input.g5_scene_graph?.anchors ?? input.g5_scene_graph?.scene_anchors);
  for (const anchor of anchors) addText(refs.anchorIds, anchor?.g5_anchor_id ?? anchor?.anchor_id ?? anchor?.id);
  const minilocations = array(input.g5_scene_graph?.g5_minilocations ?? input.g5_scene_graph?.minilocations);
  for (const location of minilocations) addText(refs.minilocationIds, location?.g5_minilocation_id ?? location?.minilocation_id ?? location?.id);
  const g5Edges = array(input.g5_scene_graph?.g5_edges ?? input.g5_scene_graph?.edges);
  for (const edge of g5Edges) addText(refs.g5EdgeIds, edge?.g5_edge_id ?? edge?.edge_id ?? edge?.id);

  for (const edge of routeSnapshotEdges(input.world_base_route_snapshot)) {
    addText(refs.graphEdgeIds, edge?.graph_edge_id ?? edge?.edge_id ?? edge?.id);
  }

  collectByKeys(input.selected_start_node, refs.nodeIds, ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id', 'selected_node_id', 'graph_node_id']);
  collectByKeys(input.g5_scene_graph?.parent_location, refs.nodeIds, ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']);

  for (const container of array(input.initial_item_placement?.container_instances ?? input.initial_item_placement?.containers)) {
    const containerId = container?.container_instance_id ?? container?.container_id ?? container?.id;
    if (!text(containerId)) continue;
    const ids = new Set(array(container?.content_instance_ids ?? container?.item_instance_ids ?? container?.contents)
      .map((value) => isObject(value) ? value.item_instance_id ?? value.item_id ?? value.id : value)
      .filter(text));
    refs.containerContentIds.set(containerId, ids);
  }

  indexAccessStates(input.g5_scene_graph?.access_model, refs.accessStateByTarget);
  indexPropertyBindings(input.initial_item_placement, refs.propertyBindingByTarget);
  return refs;
}
export function routeSnapshotEdges(snapshot) {
  return [
    ...array(snapshot?.nearby_graph_edges),
    ...array(snapshot?.known_route_candidates),
    ...array(snapshot?.historical_anchor_candidates),
    ...array(snapshot?.route_knowledge_rule_candidates)
  ];
}

export function indexAccessStates(value, map) {
  walk(value, (node) => {
    if (!isObject(node)) return;
    const targetId = node.target_id ?? node.anchor_id ?? node.g5_anchor_id ?? node.g5_edge_id ?? node.minilocation_id;
    const state = node.actual_state ?? node.access_state ?? node.state;
    if (text(targetId) && text(state)) map.set(targetId, state);
  });
}

export function indexPropertyBindings(value, map) {
  walk(value, (node) => {
    if (!isObject(node)) return;
    const targetId = node.item_instance_id ?? node.container_instance_id ?? node.target_id;
    const hasProperty = node.property_binding_id || node.owner_id || node.holder_id || node.controller_id || node.ownership;
    if (text(targetId) && hasProperty) map.set(targetId, node);
  });
}

export function collectByKeys(value, target, keys) {
  const keySet = new Set(keys);
  walk(value, (node) => {
    if (!isObject(node)) return;
    for (const [key, raw] of Object.entries(node)) {
      if (!keySet.has(key)) continue;
      if (Array.isArray(raw)) raw.forEach((item) => addText(target, isObject(item) ? item.id ?? item[key.replace(/s$/, '')] : item));
      else addText(target, raw);
    }
  });
}

