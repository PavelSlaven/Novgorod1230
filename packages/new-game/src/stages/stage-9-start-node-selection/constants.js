export const STAGE9_INPUT_SCHEMA = 'start_node_selector_input';

export const STAGE9_OUTPUT_SCHEMA = 'selected_start_node';

export const DEFAULT_STAGE9_SELECTION_POLICY = Object.freeze({
  prefer_g4: true,
  allow_g3_fallback: true,
  allow_g2_fallback: false,
  allow_g1_fallback: false,
  require_candidate_place_template_link: true,
  require_npc_candidate_support: false,
  require_item_profile_support: false,
  prefer_player_request_match: true,
  prefer_low_contradiction_risk: true,
  prefer_g5_ready: true,
  prefer_full_parent_chain: true,
  require_sources: true,
  do_not_create_world_entities: true,
  max_selector_attempts: 3
});

export const HARD_INVALID_SELECTION_CODES = new Set([
  'STAGE9_SELECTED_CANDIDATE_NOT_ALLOWED',
  'STAGE9_SELECTED_TEMPLATE_LINK_NOT_ALLOWED',
  'STAGE9_SELECTED_TEMPLATE_LINK_CANDIDATE_MISMATCH',
  'STAGE9_SELECTED_NODE_ID_NOT_FROM_SELECTED_CANDIDATE',
  'STAGE9_SELECTED_PLACE_TEMPLATE_ID_MISMATCH',
  'STAGE9_G1_FALLBACK_FORBIDDEN',
  'STAGE9_G2_FALLBACK_FORBIDDEN',
  'STAGE9_G3_SELECTED_WHEN_VALID_G4_EXISTS',
  'STAGE9_NON_G5_READY_SELECTED_WHEN_G5_READY_EXISTS',
  'STAGE9_FORBIDDEN_WORLD_ENTITY_CREATION'
]);

export const FORBIDDEN_KEYS = new Set([
  'new_place', 'generated_place_name', 'created_location', 'location_description',
  'g5_anchor', 'g5_anchor_id', 'minilocation_id', 'anchor_id',
  'npc', 'npcs', 'npc_id', 'npc_name', 'character', 'characters',
  'item', 'items', 'item_id', 'container_contents', 'inventory', 'equipment',
  'visible_scene', 'intro_prose', 'start_prose', 'narrator_prose',
  'quest', 'start_quest', 'hidden_event', 'secret', 'route', 'arrival_route',
  'weather_event', 'current_action', 'owner', 'owner_id'
]);
