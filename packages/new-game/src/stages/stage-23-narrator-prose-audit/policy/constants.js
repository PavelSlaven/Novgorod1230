import { STAGE23_INPUT_SCHEMA, STAGE23_PRECHECK_SCHEMA, STAGE23_AUDIT_SCHEMA, STAGE23_ROUTE_SCHEMA, STAGE23_RESULT_SCHEMA, STAGE23_UPSTREAM_REPAIR_SCHEMA } from '@rus/contracts';
import { isObject } from '../shared/utils.js';
export { STAGE23_INPUT_SCHEMA, STAGE23_PRECHECK_SCHEMA, STAGE23_AUDIT_SCHEMA, STAGE23_ROUTE_SCHEMA, STAGE23_RESULT_SCHEMA, STAGE23_UPSTREAM_REPAIR_SCHEMA };

export const STAGE23_REQUIRED_CHECKS = Object.freeze([
  'schema_and_structure',
  'visible_context_compliance',
  'new_fact_check',
  'npc_check',
  'item_check',
  'container_check',
  'door_exit_route_check',
  'time_light_weather_check',
  'position_check',
  'g5_anchor_check',
  'knowledge_boundary_check',
  'hidden_state_leak_check',
  'rumor_uncertainty_check',
  'action_options_check',
  'technical_text_check',
  'must_include_check',
  'must_not_include_check',
  'commit_readiness'
]);

export const STAGE23_CONCERN_CODES = Object.freeze([
  'NARRATOR_PROSE_INVALID_SCHEMA',
  'NARRATOR_PROSE_REQUEST_ID_MISMATCH',
  'NARRATOR_PROSE_EMPTY',
  'NARRATOR_PROSE_OUTSIDE_VISIBLE_CONTEXT',
  'NARRATOR_PROSE_USED_UNAVAILABLE_CONTEXT',
  'NARRATOR_PROSE_USED_HIDDEN_FILTERED_OUT_CONTEXT',
  'NARRATOR_PROSE_ADDED_FACT',
  'NARRATOR_PROSE_ADDED_NPC',
  'NARRATOR_PROSE_ADDED_ITEM',
  'NARRATOR_PROSE_ADDED_CONTAINER',
  'NARRATOR_PROSE_ADDED_EXIT',
  'NARRATOR_PROSE_ADDED_THREAT',
  'NARRATOR_PROSE_TIME_CONFLICT',
  'NARRATOR_PROSE_WEATHER_CONFLICT',
  'NARRATOR_PROSE_LIGHT_CONFLICT',
  'NARRATOR_PROSE_POSITION_CONFLICT',
  'NARRATOR_PROSE_INVALID_G5_REF',
  'NARRATOR_PROSE_KNOWLEDGE_BOUNDARY_VIOLATION',
  'NARRATOR_PROSE_HIDDEN_STATE_LEAK',
  'NARRATOR_PROSE_PRIVATE_MOTIVE_LEAK',
  'NARRATOR_PROSE_CLOSED_CONTAINER_LEAK',
  'NARRATOR_PROSE_FUTURE_EVENT_LEAK',
  'NARRATOR_PROSE_UNKNOWN_TRUE_OWNERSHIP',
  'NARRATOR_PROSE_RUMOR_UPGRADED',
  'NARRATOR_PROSE_UNCERTAINTY_UPGRADED',
  'NARRATOR_PROSE_ACTION_USES_HIDDEN_TRUTH',
  'NARRATOR_PROSE_TECHNICAL_TEXT',
  'NARRATOR_PROSE_MUST_INCLUDE_MISSING',
  'NARRATOR_PROSE_MUST_NOT_INCLUDE_VIOLATION',
  'NARRATOR_PROSE_AUDIT_FORMAT_INVALID',
  'NARRATOR_PROSE_AUDIT_INTERNAL_INCONSISTENCY'
]);

export const STAGE23_SEVERITIES = Object.freeze(['warning', 'repairable', 'hard_block', 'upstream_block']);
export const STAGE23_ROUTES = Object.freeze([
  'narrator_prose_format_repair',
  'narrator_prose_semantic_repair',
  'visible_context_semantic_repair',
  'visible_context_audit',
  'time_light_semantic_repair',
  'character_knowledge_map_semantic_repair',
  'full_hidden_state_semantic_repair',
  'blocked'
]);

export const DEFAULT_STAGE23_AUDIT_POLICY = Object.freeze({
  compare_only_against_visible_context_package: true,
  reject_added_facts: true,
  reject_added_npcs: true,
  reject_added_items: true,
  reject_added_containers: true,
  reject_added_doors_or_exits: true,
  reject_added_threats: true,
  reject_added_time_of_day: true,
  reject_added_character_knowledge: true,
  reject_hidden_leaks: true,
  reject_private_motives: true,
  reject_closed_container_contents: true,
  reject_future_events: true,
  reject_unknown_true_ownership: true,
  reject_rumor_as_fact: true,
  reject_uncertainty_as_fact: true,
  reject_action_labels_using_hidden_truth: true,
  reject_raw_json_or_debug_text: true,
  reject_time_light_conflict: true,
  reject_position_conflict: true,
  require_must_include_coverage: true,
  require_must_not_include_compliance: true,
  require_evidence: true,
  require_repair_route_on_fail: true
});

export const INPUT_KEYS = new Set([
  'version', 'schema', 'request_id', 'visible_context_package',
  'visible_context_package_digest', 'visible_context_approval',
  'narrator_starting_prose', 'narrator_starting_prose_digest', 'audit_policy'
]);
export const FORBIDDEN_INPUT_KEYS = new Set([
  'full_hidden_scene_state', 'hidden_state', 'character_knowledge_map',
  'visible_context_audit', 'stage22_result', 'generation_history', 'diagnostics',
  'repair_history', 'world_base', 'pipeline_context', 'stage_outputs', 'context'
]);
export const AUDIT_TOP_LEVEL_KEYS = new Set([
  'version', 'schema', 'request_id', 'pass', 'checks', 'concerns', 'evidence',
  'repair_route', 'commit_permission'
]);
export const FORBIDDEN_AUDIT_KEYS = new Set([
  'prose', 'new_prose', 'modified_prose', 'narrator_starting_prose',
  'modified_action_options', 'visible_context_package', 'full_hidden_scene_state',
  'character_knowledge_map', 'hidden_state', 'repair_payload', 'world_base',
  'pipeline_context', 'stage_outputs'
]);
export const COMMIT_PERMISSION_KEYS = Object.freeze([
  'can_show_to_player',
  'can_write_player_visible_message',
  'can_mark_opening_scene_presented'
]);
export const TECHNICAL_TEXT_PATTERNS = Object.freeze([
  /\bfull_hidden_scene_state\b/iu,
  /\bcharacter_knowledge_map\b/iu,
  /\brepair_route\b/iu,
  /\bsemantic_audit\b/iu,
  /\bpipeline\b/iu,
  /\bdebug\b/iu,
  /\bschema\b/iu,
  /\bjson\b/iu
]);


export function normalizeStage23AuditPolicy(policy = {}) {
  const source = isObject(policy) ? policy : {};
  return Object.freeze({ ...DEFAULT_STAGE23_AUDIT_POLICY, ...source });
}
