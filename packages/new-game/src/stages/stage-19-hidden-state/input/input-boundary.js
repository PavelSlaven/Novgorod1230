import { DEFAULT_STAGE19_HIDDEN_STATE_POLICY, STAGE19_INPUT_SCHEMA, normalizeStage19HiddenStatePolicy } from '../policy/constants.js';
import { array, dedupe, deepEqual, isObject, issue, requireAudit, requireSchema, text } from '../shared/utils.js';
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

export function buildStage19HiddenStateInput(values = {}) {
  const input = isObject(values) ? values : {};
  return {
    version: 1,
    schema: STAGE19_INPUT_SCHEMA,
    request_id: input.request_id ?? null,
    historical_frame: input.historical_frame ?? null,
    weather_state: input.weather_state ?? null,
    selected_start_node: input.selected_start_node ?? null,
    player_character: input.player_character ?? null,
    g5_scene_graph: input.g5_scene_graph ?? null,
    g5_scene_audit: input.g5_scene_audit ?? null,
    initial_npc_placement: input.initial_npc_placement ?? null,
    npc_placement_audit: input.npc_placement_audit ?? null,
    initial_item_placement: input.initial_item_placement ?? null,
    item_placement_audit: input.item_placement_audit ?? null,
    time_light_consistency_audit: input.time_light_consistency_audit ?? null,
    character_knowledge_map: input.character_knowledge_map ?? null,
    character_knowledge_map_audit: input.character_knowledge_map_audit ?? null,
    regional_context_package: input.regional_context_package ?? null,
    world_base_route_snapshot: normalizeRouteSnapshot(input.world_base_route_snapshot),
    hidden_state_policy: normalizeStage19HiddenStatePolicy(input.hidden_state_policy ?? input.policy ?? {})
  };
}

export function validateStage19Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('HIDDEN_STATE_INPUT_INVALID', 'Stage 19 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE19_INPUT_SCHEMA) {
    concerns.push(issue('HIDDEN_STATE_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE19_INPUT_SCHEMA} version 1.`, 'schema'));
  }
  if (!text(input.request_id)) concerns.push(issue('HIDDEN_STATE_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));

  requireSchema(concerns, input.historical_frame, 'historical_frame', 'historical_frame', 'HIDDEN_STATE_HISTORICAL_FRAME_INVALID');
  requireSchema(concerns, input.weather_state, 'weather_state', 'weather_state', 'HIDDEN_STATE_WEATHER_STATE_INVALID');
  requireSchema(concerns, input.selected_start_node, 'selected_start_node', 'selected_start_node', 'HIDDEN_STATE_SELECTED_START_NODE_INVALID');
  requireSchema(concerns, input.player_character, 'player_character_game_profile', 'player_character', 'HIDDEN_STATE_PLAYER_CHARACTER_INVALID');
  requireSchema(concerns, input.g5_scene_graph, 'g5_scene_graph_draft', 'g5_scene_graph', 'HIDDEN_STATE_G5_SCENE_INVALID');
  requireAudit(concerns, input.g5_scene_audit, 'g5_scene_audit', 'g5_scene_audit', 'HIDDEN_STATE_G5_AUDIT_FAILED');
  requireSchema(concerns, input.initial_npc_placement, 'initial_npc_placement_draft', 'initial_npc_placement', 'HIDDEN_STATE_NPC_PLACEMENT_INVALID');
  requireAudit(concerns, input.npc_placement_audit, 'initial_npc_placement_audit', 'npc_placement_audit', 'HIDDEN_STATE_NPC_AUDIT_FAILED');
  requireSchema(concerns, input.initial_item_placement, 'initial_item_placement_draft', 'initial_item_placement', 'HIDDEN_STATE_ITEM_PLACEMENT_INVALID');
  requireAudit(concerns, input.item_placement_audit, 'initial_item_placement_audit', 'item_placement_audit', 'HIDDEN_STATE_ITEM_AUDIT_FAILED');
  requireAudit(concerns, input.time_light_consistency_audit, 'time_light_consistency_audit', 'time_light_consistency_audit', 'HIDDEN_STATE_TIME_LIGHT_AUDIT_FAILED');
  requireSchema(concerns, input.character_knowledge_map, 'character_knowledge_map', 'character_knowledge_map', 'HIDDEN_STATE_KNOWLEDGE_MAP_INVALID');
  requireAudit(concerns, input.character_knowledge_map_audit, 'character_knowledge_map_audit', 'character_knowledge_map_audit', 'HIDDEN_STATE_KNOWLEDGE_AUDIT_FAILED');
  requireSchema(concerns, input.regional_context_package, 'regional_context_package', 'regional_context_package', 'HIDDEN_STATE_REGIONAL_CONTEXT_INVALID');
  requireSchema(concerns, input.world_base_route_snapshot, 'world_base_route_snapshot', 'world_base_route_snapshot', 'HIDDEN_STATE_ROUTE_SNAPSHOT_INVALID');

  for (const key of ['nearby_graph_edges', 'known_route_candidates', 'historical_anchor_candidates', 'route_knowledge_rule_candidates']) {
    if (!Array.isArray(input.world_base_route_snapshot?.[key])) {
      concerns.push(issue('HIDDEN_STATE_ROUTE_SNAPSHOT_INVALID', `${key} must be an array.`, `world_base_route_snapshot.${key}`));
    }
  }

  if (input.character_knowledge_map_audit?.commit_permission
    && input.character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state !== true) {
    concerns.push(issue('HIDDEN_STATE_KNOWLEDGE_AUDIT_FAILED', 'Knowledge audit must allow continuation to hidden state.', 'character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state'));
  }
  if (input.time_light_consistency_audit?.commit_permission
    && input.time_light_consistency_audit.commit_permission.can_continue_to_visible_context !== true) {
    concerns.push(issue('HIDDEN_STATE_TIME_LIGHT_AUDIT_FAILED', 'Time/light audit must allow visible-context construction.', 'time_light_consistency_audit.commit_permission.can_continue_to_visible_context'));
  }

  const authoritativeWeather = input.time_light_consistency_audit?.authoritative_frame?.weather_state;
  if (authoritativeWeather && !deepEqual(authoritativeWeather, input.weather_state)) {
    concerns.push(issue('HIDDEN_STATE_TIME_LIGHT_CONFLICT', 'weather_state differs from Stage 17 authoritative weather.', 'weather_state'));
  }

  for (const [key, expected] of Object.entries(DEFAULT_STAGE19_HIDDEN_STATE_POLICY)) {
    if (input.hidden_state_policy?.[key] !== expected) {
      concerns.push(issue('HIDDEN_STATE_POLICY_INCOMPLETE', `${key} must be ${expected}.`, `hidden_state_policy.${key}`, expected, input.hidden_state_policy?.[key]));
    }
  }

  for (const [key, value] of Object.entries(input)) {
    if (!isObject(value) || !text(value.request_id)) continue;
    if (value.request_id !== input.request_id) {
      concerns.push(issue('HIDDEN_STATE_REQUEST_ID_MISMATCH', `${key}.request_id differs from Stage 19 request_id.`, `${key}.request_id`, input.request_id, value.request_id));
    }
  }
  return dedupe(concerns);
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
