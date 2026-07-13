import { DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY, STAGE20_INPUT_SCHEMA, normalizeStage20VisibleContextPolicy } from '../policy/constants.js';
import { array, dedupe, deepEqual, isObject, issue, requireAudit, requireSchema, text } from '../../../visible-context/shared.js';

export function buildStage20VisibleContextInput(values = {}) {
  const input = isObject(values) ? values : {};
  return {
    version: 1,
    schema: STAGE20_INPUT_SCHEMA,
    request_id: input.request_id ?? null,
    historical_frame: input.historical_frame ?? null,
    weather_state: input.weather_state ?? null,
    selected_start_node: input.selected_start_node ?? null,
    player_character: input.player_character ?? null,
    current_position: input.current_position ?? null,
    g5_scene_graph: input.g5_scene_graph ?? null,
    g5_scene_audit: input.g5_scene_audit ?? null,
    initial_npc_placement: input.initial_npc_placement ?? null,
    npc_placement_audit: input.npc_placement_audit ?? null,
    initial_item_placement: input.initial_item_placement ?? null,
    item_placement_audit: input.item_placement_audit ?? null,
    time_light_consistency_audit: input.time_light_consistency_audit ?? null,
    character_knowledge_map: input.character_knowledge_map ?? null,
    character_knowledge_map_audit: input.character_knowledge_map_audit ?? null,
    full_hidden_scene_state: input.full_hidden_scene_state ?? null,
    full_hidden_state_audit: input.full_hidden_state_audit ?? null,
    visible_context_policy: normalizeStage20VisibleContextPolicy(input.visible_context_policy ?? input.policy ?? {})
  };
}

export function validateStage20Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('VISIBLE_CONTEXT_INPUT_INVALID', 'Stage 20 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE20_INPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE20_INPUT_SCHEMA} version 1.`, 'schema'));
  if (!text(input.request_id)) concerns.push(issue('VISIBLE_CONTEXT_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  requireSchema(concerns, input.historical_frame, 'historical_frame', 'historical_frame', 'VISIBLE_CONTEXT_HISTORICAL_FRAME_INVALID');
  requireSchema(concerns, input.weather_state, 'weather_state', 'weather_state', 'VISIBLE_CONTEXT_WEATHER_STATE_INVALID');
  requireSchema(concerns, input.selected_start_node, 'selected_start_node', 'selected_start_node', 'VISIBLE_CONTEXT_SELECTED_START_NODE_INVALID');
  requireSchema(concerns, input.player_character, 'player_character_game_profile', 'player_character', 'VISIBLE_CONTEXT_PLAYER_CHARACTER_INVALID');
  requireSchema(concerns, input.g5_scene_graph, 'g5_scene_graph_draft', 'g5_scene_graph', 'VISIBLE_CONTEXT_G5_SCENE_INVALID');
  requireAudit(concerns, input.g5_scene_audit, 'g5_scene_audit', 'g5_scene_audit', 'VISIBLE_CONTEXT_G5_AUDIT_FAILED');
  requireSchema(concerns, input.initial_npc_placement, 'initial_npc_placement_draft', 'initial_npc_placement', 'VISIBLE_CONTEXT_NPC_PLACEMENT_INVALID');
  requireAudit(concerns, input.npc_placement_audit, 'initial_npc_placement_audit', 'npc_placement_audit', 'VISIBLE_CONTEXT_NPC_AUDIT_FAILED');
  requireSchema(concerns, input.initial_item_placement, 'initial_item_placement_draft', 'initial_item_placement', 'VISIBLE_CONTEXT_ITEM_PLACEMENT_INVALID');
  requireAudit(concerns, input.item_placement_audit, 'initial_item_placement_audit', 'item_placement_audit', 'VISIBLE_CONTEXT_ITEM_AUDIT_FAILED');
  requireAudit(concerns, input.time_light_consistency_audit, 'time_light_consistency_audit', 'time_light_consistency_audit', 'VISIBLE_CONTEXT_TIME_LIGHT_AUDIT_FAILED');
  requireSchema(concerns, input.character_knowledge_map, 'character_knowledge_map', 'character_knowledge_map', 'VISIBLE_CONTEXT_KNOWLEDGE_MAP_INVALID');
  requireAudit(concerns, input.character_knowledge_map_audit, 'character_knowledge_map_audit', 'character_knowledge_map_audit', 'VISIBLE_CONTEXT_KNOWLEDGE_AUDIT_FAILED');
  requireSchema(concerns, input.full_hidden_scene_state, 'full_hidden_scene_state', 'full_hidden_scene_state', 'VISIBLE_CONTEXT_HIDDEN_STATE_INVALID');
  requireAudit(concerns, input.full_hidden_state_audit, 'full_hidden_state_audit', 'full_hidden_state_audit', 'VISIBLE_CONTEXT_HIDDEN_AUDIT_FAILED');
  validateCurrentPosition(input, concerns);

  if (input.time_light_consistency_audit?.commit_permission?.can_continue_to_visible_context !== true) concerns.push(issue('VISIBLE_CONTEXT_TIME_LIGHT_AUDIT_FAILED', 'Stage 17 must allow continuation to visible context.', 'time_light_consistency_audit.commit_permission.can_continue_to_visible_context'));
  if (input.character_knowledge_map_audit?.commit_permission?.can_continue_to_hidden_state !== true) concerns.push(issue('VISIBLE_CONTEXT_KNOWLEDGE_AUDIT_FAILED', 'Stage 18 audit must be commit-ready.', 'character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state'));
  for (const [key, expected] of Object.entries(DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY)) {
    if (input.visible_context_policy?.[key] !== expected) concerns.push(issue('VISIBLE_CONTEXT_POLICY_INCOMPLETE', `${key} must be ${expected}.`, `visible_context_policy.${key}`, expected, input.visible_context_policy?.[key]));
  }
  const authoritativeWeather = input.time_light_consistency_audit?.authoritative_frame?.weather_state;
  if (authoritativeWeather && !deepEqual(authoritativeWeather, input.weather_state)) concerns.push(issue('VISIBLE_CONTEXT_WEATHER_MISMATCH', 'weather_state differs from Stage 17 authoritative weather.', 'weather_state'));
  return dedupe(concerns);
}

export function validateCurrentPosition(input, concerns) {
  const position = input?.current_position;
  if (!isObject(position)) { concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position is required.', 'current_position')); return; }
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) if (!text(position[key])) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', `current_position.${key} is required.`, `current_position.${key}`));
  if (position.last_route_id != null) concerns.push(issue('VISIBLE_CONTEXT_CREATED_ROUTE', 'last_route_id must be null before initial commit.', 'current_position.last_route_id'));
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
    if (!text(value)) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', `Stage 13 player_start_position/parent_location must define ${key}.`, `g5_scene_graph.player_start_position.${key}`));
    else if (position[key] !== value) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', `current_position.${key} must come only from audited Stage 13 G5 state.`, `current_position.${key}`, value, position[key]));
  }
  if (position.region_id !== input?.historical_frame?.region?.region_id) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position.region_id must match historical_frame.region.region_id.', 'current_position.region_id'));
  const anchors = new Map(array(input?.g5_scene_graph?.g5_anchors ?? input?.g5_scene_graph?.anchors).map((item) => [item?.g5_anchor_id ?? item?.anchor_id ?? item?.id, item]));
  const minilocIds = new Set(array(input?.g5_scene_graph?.g5_minilocations ?? input?.g5_scene_graph?.minilocations).map((item) => item?.g5_minilocation_id ?? item?.minilocation_id ?? item?.id).filter(text));
  if (!anchors.has(position.anchor_id)) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position.anchor_id must exist in G5 anchors.', 'current_position.anchor_id'));
  if (!minilocIds.has(position.minilocation_id)) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position.minilocation_id must exist in G5 minilocations.', 'current_position.minilocation_id'));
  const anchor = anchors.get(position.anchor_id);
  const anchorParent = anchor?.parent_minilocation_id ?? anchor?.minilocation_id ?? anchor?.g5_minilocation_id;
  if (text(anchorParent) && anchorParent !== position.minilocation_id) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position anchor must belong to current minilocation.', 'current_position.anchor_id'));
}
