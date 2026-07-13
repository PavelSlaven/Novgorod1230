export const STAGE10_INPUT_SCHEMA = 'start_place_audit_input';

export const STAGE10_OUTPUT_SCHEMA = 'start_place_audit';

export const DEFAULT_STAGE10_AUDIT_POLICY = Object.freeze({
  require_world_base_node: true,
  require_candidate_set_membership: true,
  require_place_template_link: true,
  require_full_parent_chain_for_g4: true,
  require_region_match: true,
  require_year_match: true,
  require_season_match: true,
  require_clock_match: true,
  require_access_edge: true,
  require_player_hard_constraints_match: true,
  require_social_status_compatibility: false,
  require_npc_candidate_support: false,
  require_item_profile_support: false,
  require_g5_readiness: true,
  require_sources: true,
  reject_rejected_or_conflict_records: true,
  require_semantic_llm_audit: false,
  allow_g1_fallback: false,
  allow_g2_fallback: false,
  allow_g3_fallback: true
});

export const ALLOWED_REPAIR_STAGES = Object.freeze([
  'start_node_selector',
  'start_candidate_retriever',
  'place_template_retriever',
  'historical_frame_selector'
]);

export const REQUIRED_CHECK_KEYS = Object.freeze([
  'world_base_existence',
  'candidate_set_membership',
  'node_chain',
  'region_compatibility',
  'year_compatibility',
  'season_compatibility',
  'clock_compatibility',
  'place_template_compatibility',
  'access_compatibility',
  'player_request_compatibility',
  'social_status_compatibility',
  'npc_support',
  'item_support',
  'g5_readiness',
  'source_trace',
  'downstream_entity_leak_check'
]);

export const FORBIDDEN_OUTPUT_KEYS = Object.freeze([
  'new_place',
  'generated_place',
  'generated_place_name',
  'created_location',
  'created_node',
  'g5',
  'g5_scene',
  'g5_anchor',
  'g5_anchor_id',
  'minilocation',
  'minilocation_id',
  'anchor_id',
  'npc',
  'npcs',
  'npc_id',
  'npc_name',
  'item',
  'items',
  'item_id',
  'container_contents',
  'inventory',
  'equipment',
  'visible_scene',
  'intro_prose',
  'start_prose',
  'narrator_prose',
  'party_current_position',
  'current_position',
  'weather_event',
  'quest',
  'hidden_event',
  'hidden_state',
  'secret',
  'owner_id',
  'route',
  'arrival_route'
]);
