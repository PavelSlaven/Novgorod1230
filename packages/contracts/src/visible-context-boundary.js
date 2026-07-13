export const STAGE20_INPUT_SCHEMA = 'visible_context_builder_input';

export const STAGE20_OUTPUT_SCHEMA = 'visible_context_package';

export const STAGE20_VISIBILITY_FILTER_SCHEMA = 'visible_context_visibility_filter';

export const STAGE20_PRECHECK_SCHEMA = 'visible_context_code_precheck';

export const STAGE20_RESULT_SCHEMA = 'stage20_visible_context_result';

export const STAGE21_INPUT_SCHEMA = 'visible_context_audit_input';

export const STAGE21_OUTPUT_SCHEMA = 'visible_context_audit';

export const STAGE21_PRECHECK_SCHEMA = 'visible_context_audit_code_precheck';

export const STAGE21_ROUTE_SCHEMA = 'visible_context_audit_repair_route';

export const STAGE21_RESULT_SCHEMA = 'stage21_visible_context_audit_result';

export const STAGE21_REQUIRED_CHECKS = Object.freeze([
  'schema_and_structure',
  'position_consistency',
  'time_weather_light_consistency',
  'g5_anchor_consistency',
  'npc_consistency',
  'item_consistency',
  'container_consistency',
  'hidden_state_leak_check',
  'character_knowledge_boundary_check',
  'rumor_uncertainty_check',
  'available_actions_check',
  'narrator_scope_check',
  'source_trace_check',
  'package_digest_check',
  'commit_readiness'
]);

export const STAGE21_ALLOWED_SEVERITIES = Object.freeze([
  'warning', 'repairable', 'hard_block', 'upstream_block'
]);

export const STAGE21_ALLOWED_CONCERN_CODES = Object.freeze([
  'VISIBLE_CONTEXT_SCHEMA_MISMATCH',
  'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING',
  'VISIBLE_CONTEXT_REQUEST_ID_MISMATCH',
  'VISIBLE_CONTEXT_PACKAGE_DIGEST_MISMATCH',
  'VISIBLE_CONTEXT_POSITION_CONFLICT',
  'VISIBLE_CONTEXT_CLOCK_CONFLICT',
  'VISIBLE_CONTEXT_SEASON_CONFLICT',
  'VISIBLE_CONTEXT_WEATHER_CONFLICT',
  'VISIBLE_CONTEXT_LIGHT_CONFLICT',
  'VISIBLE_CONTEXT_INVALID_ANCHOR_REF',
  'VISIBLE_CONTEXT_INVALID_EXIT_REF',
  'VISIBLE_CONTEXT_INVALID_NPC_REF',
  'VISIBLE_CONTEXT_INVALID_ITEM_REF',
  'VISIBLE_CONTEXT_INVALID_CONTAINER_REF',
  'VISIBLE_CONTEXT_UNSEEN_NPC',
  'VISIBLE_CONTEXT_UNSEEN_ITEM',
  'VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK',
  'VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK',
  'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK',
  'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK',
  'VISIBLE_CONTEXT_UNKNOWN_OWNERSHIP_LEAK',
  'VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK',
  'VISIBLE_CONTEXT_RUMOR_AS_FACT',
  'VISIBLE_CONTEXT_UNCERTAINTY_AS_FACT',
  'VISIBLE_CONTEXT_ACTION_HIDDEN_TRUTH_LEAK',
  'VISIBLE_CONTEXT_KNOWLEDGE_BOUNDARY_CONFLICT',
  'VISIBLE_CONTEXT_NEW_WORLD_FACT',
  'VISIBLE_CONTEXT_NEW_ENTITY',
  'VISIBLE_CONTEXT_NARRATOR_PROSE_PRESENT',
  'VISIBLE_CONTEXT_SOURCE_TRACE_MISSING',
  'VISIBLE_CONTEXT_AUDIT_EVIDENCE_MISSING',
  'VISIBLE_CONTEXT_MUST_NOT_INCLUDE_INCOMPLETE',
  'VISIBLE_CONTEXT_STAGE20_PRECHECK_MISMATCH',
  'VISIBLE_CONTEXT_G5_AUDIT_CONFLICT',
  'VISIBLE_CONTEXT_NPC_PLACEMENT_CONFLICT',
  'VISIBLE_CONTEXT_ITEM_PLACEMENT_CONFLICT',
  'VISIBLE_CONTEXT_TIME_LIGHT_UPSTREAM_CONFLICT',
  'VISIBLE_CONTEXT_CHARACTER_KNOWLEDGE_UPSTREAM_CONFLICT',
  'VISIBLE_CONTEXT_HIDDEN_STATE_UPSTREAM_CONFLICT'
]);

export const STAGE21_ALLOWED_RETURN_STAGES = Object.freeze([
  'stage20_visible_context',
  'stage19_hidden_state',
  'stage18_character_knowledge',
  'stage17_time_light',
  'stage16_item_placement',
  'stage15_npc_placement',
  'stage14_g5_audit',
  'stage13_g5_materialization'
]);

export const STAGE21_ALLOWED_REPAIR_KINDS = Object.freeze([
  'repair_visible_context_projection',
  'remove_hidden_leak',
  'repair_knowledge_boundary_projection',
  'repair_hidden_state',
  'repair_character_knowledge',
  'repair_time_light',
  'repair_item_placement',
  'repair_npc_placement',
  'repair_g5_audit',
  'repair_g5_graph'
]);
