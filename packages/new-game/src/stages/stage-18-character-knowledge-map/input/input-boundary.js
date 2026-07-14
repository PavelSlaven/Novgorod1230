import { DEFAULT_STAGE18_KNOWLEDGE_POLICY, STAGE18_INPUT_SCHEMA, normalizeStage18KnowledgePolicy } from '../policy/constants.js';
import { array, dedupe, firstText, isObject, issue, requireAudit, requireSchema, text } from '../shared/utils.js';
export function emptyWorldBaseRouteSnapshot() {
  return {
    version: 1,
    schema: 'world_base_route_snapshot',
    nearby_graph_edges: [],
    known_route_candidates: [],
    historical_anchor_candidates: [],
    route_knowledge_rule_candidates: []
  };
}

export function buildStage18CharacterKnowledgeInput(values = {}) {
  const input = isObject(values) ? values : {};
  return {
    version: 1,
    schema: STAGE18_INPUT_SCHEMA,
    request_id: input.request_id ?? null,
    historical_frame: input.historical_frame ?? null,
    weather_state: input.weather_state ?? null,
    selected_start_node: input.selected_start_node ?? null,
    start_place_audit: input.start_place_audit ?? null,
    player_character: input.player_character ?? null,
    player_character_audit: input.player_character_audit ?? null,
    current_position: input.current_position ?? null,
    g5_scene_graph: input.g5_scene_graph ?? null,
    g5_scene_audit: input.g5_scene_audit ?? null,
    initial_npc_placement: input.initial_npc_placement ?? null,
    npc_placement_audit: input.npc_placement_audit ?? null,
    initial_item_placement: input.initial_item_placement ?? null,
    item_placement_audit: input.item_placement_audit ?? null,
    time_light_consistency_audit: input.time_light_consistency_audit ?? null,
    regional_context_package: input.regional_context_package ?? null,
    world_base_route_snapshot: normalizeRouteSnapshot(input.world_base_route_snapshot),
    knowledge_policy: normalizeStage18KnowledgePolicy(input.knowledge_policy ?? input.policy ?? {})
  };
}

export function validateStage18Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('KNOWLEDGE_MAP_INPUT_INVALID', 'Stage 18 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE18_INPUT_SCHEMA) {
    concerns.push(issue('KNOWLEDGE_MAP_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE18_INPUT_SCHEMA} version 1.`, 'schema'));
  }
  if (!text(input.request_id)) concerns.push(issue('KNOWLEDGE_MAP_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  requireSchema(concerns, input.historical_frame, 'historical_frame', 'historical_frame', 'KNOWLEDGE_MAP_HISTORICAL_FRAME_INVALID');
  requireSchema(concerns, input.weather_state, 'weather_state', 'weather_state', 'KNOWLEDGE_MAP_WEATHER_STATE_INVALID');
  requireSchema(concerns, input.selected_start_node, 'selected_start_node', 'selected_start_node', 'KNOWLEDGE_MAP_SELECTED_START_NODE_INVALID');
  requireAudit(concerns, input.start_place_audit, 'start_place_audit', 'start_place_audit', 'KNOWLEDGE_MAP_START_PLACE_AUDIT_FAILED');
  requireSchema(concerns, input.player_character, 'player_character_game_profile', 'player_character', 'KNOWLEDGE_MAP_PLAYER_CHARACTER_INVALID');
  requireAudit(concerns, input.player_character_audit, 'player_character_audit', 'player_character_audit', 'KNOWLEDGE_MAP_PLAYER_CHARACTER_AUDIT_FAILED');
  requireSchema(concerns, input.g5_scene_graph, 'g5_scene_graph_draft', 'g5_scene_graph', 'KNOWLEDGE_MAP_G5_SCENE_INVALID');
  requireAudit(concerns, input.g5_scene_audit, 'g5_scene_audit', 'g5_scene_audit', 'KNOWLEDGE_MAP_G5_AUDIT_FAILED');
  requireSchema(concerns, input.initial_npc_placement, 'initial_npc_placement_draft', 'initial_npc_placement', 'KNOWLEDGE_MAP_NPC_PLACEMENT_INVALID');
  requireAudit(concerns, input.npc_placement_audit, 'initial_npc_placement_audit', 'npc_placement_audit', 'KNOWLEDGE_MAP_NPC_AUDIT_FAILED');
  requireSchema(concerns, input.initial_item_placement, 'initial_item_placement_draft', 'initial_item_placement', 'KNOWLEDGE_MAP_ITEM_PLACEMENT_INVALID');
  requireAudit(concerns, input.item_placement_audit, 'initial_item_placement_audit', 'item_placement_audit', 'KNOWLEDGE_MAP_ITEM_AUDIT_FAILED');
  requireAudit(concerns, input.time_light_consistency_audit, 'time_light_consistency_audit', 'time_light_consistency_audit', 'KNOWLEDGE_MAP_TIME_LIGHT_AUDIT_FAILED');
  requireSchema(concerns, input.regional_context_package, 'regional_context_package', 'regional_context_package', 'KNOWLEDGE_MAP_REGIONAL_CONTEXT_INVALID');
  requireSchema(concerns, input.world_base_route_snapshot, 'world_base_route_snapshot', 'world_base_route_snapshot', 'KNOWLEDGE_MAP_ROUTE_SNAPSHOT_INVALID');
  validateCurrentPositionInput(input, concerns);

  for (const key of ['nearby_graph_edges', 'known_route_candidates', 'historical_anchor_candidates', 'route_knowledge_rule_candidates']) {
    if (!Array.isArray(input.world_base_route_snapshot?.[key])) {
      concerns.push(issue('KNOWLEDGE_MAP_ROUTE_SNAPSHOT_INVALID', `${key} must be an array.`, `world_base_route_snapshot.${key}`));
    }
  }
  for (const [key, expected] of Object.entries(DEFAULT_STAGE18_KNOWLEDGE_POLICY)) {
    if (input.knowledge_policy?.[key] !== expected) {
      concerns.push(issue('KNOWLEDGE_MAP_POLICY_INCOMPLETE', `${key} must be ${expected}.`, `knowledge_policy.${key}`, expected, input.knowledge_policy?.[key]));
    }
  }
  if (input.time_light_consistency_audit?.commit_permission
    && input.time_light_consistency_audit.commit_permission.can_continue_to_visible_context !== true) {
    concerns.push(issue('KNOWLEDGE_MAP_TIME_LIGHT_AUDIT_FAILED', 'Stage 17 must allow continuation to visible-context construction.', 'time_light_consistency_audit.commit_permission.can_continue_to_visible_context'));
  }
  return dedupe(concerns);
}
export function validateCurrentPositionInput(input, concerns) {
  const position = input?.current_position;
  if (!isObject(position)) {
    concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position is required.', 'current_position'));
    return;
  }
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) if (!text(position[key])) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', `current_position.${key} is required.`, `current_position.${key}`));
  if (position.last_route_id != null) concerns.push(issue('KNOWLEDGE_MAP_CREATED_ROUTE', 'last_route_id must be null before initial commit.', 'current_position.last_route_id', null, position.last_route_id));
  const start = input?.g5_scene_graph?.player_start_position ?? {};
  const parent = input?.g5_scene_graph?.parent_location ?? {};
  const expected = {
    region_id: start.region_id ?? parent.region_id ?? null,
    place_id: start.place_id ?? parent.place_id ?? null,
    location_id: start.location_id ?? start.g4_node_id ?? parent.location_id ?? parent.g4_node_id ?? null,
    minilocation_id: start.minilocation_id ?? start.g5_minilocation_id ?? null,
    anchor_id: start.anchor_id ?? start.g5_anchor_id ?? null
  };
  for (const [key, value] of Object.entries(expected)) {
    if (!text(value)) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', `Stage 13 player_start_position/parent_location must define ${key}.`, `g5_scene_graph.player_start_position.${key}`));
    else if (position[key] !== value) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', `current_position.${key} must come only from audited Stage 13 G5 state.`, `current_position.${key}`, value, position[key]));
  }
  if (position.region_id !== input?.historical_frame?.region?.region_id) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position.region_id must match historical_frame.', 'current_position.region_id'));
  const anchors = new Map(array(input?.g5_scene_graph?.g5_anchors ?? input?.g5_scene_graph?.anchors).map((item) => [item?.g5_anchor_id ?? item?.anchor_id ?? item?.id, item]));
  const minilocIds = new Set(array(input?.g5_scene_graph?.g5_minilocations ?? input?.g5_scene_graph?.minilocations).map((item) => item?.g5_minilocation_id ?? item?.minilocation_id ?? item?.id).filter(text));
  if (!anchors.has(position.anchor_id)) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position.anchor_id must exist in G5.', 'current_position.anchor_id'));
  if (!minilocIds.has(position.minilocation_id)) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position.minilocation_id must exist in G5.', 'current_position.minilocation_id'));
  const anchor = anchors.get(position.anchor_id);
  const anchorParent = anchor?.parent_minilocation_id ?? anchor?.minilocation_id ?? anchor?.g5_minilocation_id;
  if (text(anchorParent) && anchorParent !== position.minilocation_id) concerns.push(issue('KNOWLEDGE_MAP_POSITION_REF_MISMATCH', 'current_position anchor must belong to current minilocation.', 'current_position.anchor_id'));
}
export function normalizeRouteSnapshot(value) {
  const source = isObject(value) ? value : emptyWorldBaseRouteSnapshot();
  return {
    version: source.version ?? 1,
    schema: source.schema ?? 'world_base_route_snapshot',
    nearby_graph_edges: array(source.nearby_graph_edges),
    known_route_candidates: array(source.known_route_candidates),
    historical_anchor_candidates: array(source.historical_anchor_candidates),
    route_knowledge_rule_candidates: array(source.route_knowledge_rule_candidates)
  };
}
