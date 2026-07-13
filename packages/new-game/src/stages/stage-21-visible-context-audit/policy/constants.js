import { STAGE21_INPUT_SCHEMA, STAGE21_OUTPUT_SCHEMA, STAGE21_PRECHECK_SCHEMA, STAGE21_ROUTE_SCHEMA, STAGE21_RESULT_SCHEMA, STAGE21_REQUIRED_CHECKS, STAGE21_ALLOWED_SEVERITIES, STAGE21_ALLOWED_CONCERN_CODES, STAGE21_ALLOWED_RETURN_STAGES, STAGE21_ALLOWED_REPAIR_KINDS } from '@rus/contracts';
import { isObject } from '../../../visible-context/shared.js';

export { STAGE21_INPUT_SCHEMA, STAGE21_OUTPUT_SCHEMA, STAGE21_PRECHECK_SCHEMA, STAGE21_ROUTE_SCHEMA, STAGE21_RESULT_SCHEMA, STAGE21_REQUIRED_CHECKS, STAGE21_ALLOWED_SEVERITIES, STAGE21_ALLOWED_CONCERN_CODES, STAGE21_ALLOWED_RETURN_STAGES, STAGE21_ALLOWED_REPAIR_KINDS };

export const DEFAULT_STAGE21_AUDIT_POLICY = Object.freeze({
  require_schema: true,
  require_position_match: true,
  require_clock_match: true,
  require_weather_match: true,
  require_light_match: true,
  require_all_refs_exist: true,
  require_hidden_state_filter: true,
  require_character_knowledge_boundary: true,
  require_narrator_scope: true,
  require_must_not_include: true,
  require_source_trace: true,
  require_nonempty_success_evidence: true,
  require_package_digest_match: true,
  reject_private_motive_leak: true,
  reject_private_knowledge_leak: true,
  reject_closed_container_contents_leak: true,
  reject_future_event_leak: true,
  reject_true_ownership_leak_if_unknown: true,
  reject_hidden_route_truth_leak: true,
  reject_unseen_items: true,
  reject_unseen_npcs: true,
  reject_rumor_as_fact: true,
  reject_uncertainty_as_fact: true,
  reject_action_labels_using_hidden_truth: true,
  reject_new_world_facts: true,
  reject_narrator_prose: true
});

export const FORMAT_CODES = new Set([
  'VISIBLE_CONTEXT_AUDIT_INVALID_JSON',
  'VISIBLE_CONTEXT_AUDIT_SCHEMA_MISMATCH',
  'VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING',
  'VISIBLE_CONTEXT_AUDIT_ARRAY_INVALID'
]);

export const RETURN_STAGE_NUMBER = Object.freeze({
  stage20_visible_context: 20,
  stage19_hidden_state: 19,
  stage18_character_knowledge: 18,
  stage17_time_light: 17,
  stage16_item_placement: 16,
  stage15_npc_placement: 15,
  stage14_g5_audit: 14,
  stage13_g5_materialization: 13
});

export const CODE_ROUTE_COMPATIBILITY = Object.freeze({
  VISIBLE_CONTEXT_G5_AUDIT_CONFLICT: ['stage14_g5_audit', 'stage13_g5_materialization'],
  VISIBLE_CONTEXT_INVALID_ANCHOR_REF: ['stage20_visible_context', 'stage14_g5_audit', 'stage13_g5_materialization'],
  VISIBLE_CONTEXT_INVALID_EXIT_REF: ['stage20_visible_context', 'stage14_g5_audit', 'stage13_g5_materialization'],
  VISIBLE_CONTEXT_NPC_PLACEMENT_CONFLICT: ['stage15_npc_placement'],
  VISIBLE_CONTEXT_INVALID_NPC_REF: ['stage20_visible_context', 'stage15_npc_placement'],
  VISIBLE_CONTEXT_UNSEEN_NPC: ['stage20_visible_context', 'stage15_npc_placement', 'stage17_time_light'],
  VISIBLE_CONTEXT_ITEM_PLACEMENT_CONFLICT: ['stage16_item_placement'],
  VISIBLE_CONTEXT_INVALID_ITEM_REF: ['stage20_visible_context', 'stage16_item_placement'],
  VISIBLE_CONTEXT_INVALID_CONTAINER_REF: ['stage20_visible_context', 'stage16_item_placement'],
  VISIBLE_CONTEXT_UNSEEN_ITEM: ['stage20_visible_context', 'stage16_item_placement', 'stage17_time_light'],
  VISIBLE_CONTEXT_TIME_LIGHT_UPSTREAM_CONFLICT: ['stage17_time_light'],
  VISIBLE_CONTEXT_CLOCK_CONFLICT: ['stage20_visible_context', 'stage17_time_light'],
  VISIBLE_CONTEXT_SEASON_CONFLICT: ['stage20_visible_context', 'stage17_time_light'],
  VISIBLE_CONTEXT_WEATHER_CONFLICT: ['stage20_visible_context', 'stage17_time_light'],
  VISIBLE_CONTEXT_LIGHT_CONFLICT: ['stage20_visible_context', 'stage17_time_light'],
  VISIBLE_CONTEXT_CHARACTER_KNOWLEDGE_UPSTREAM_CONFLICT: ['stage18_character_knowledge'],
  VISIBLE_CONTEXT_KNOWLEDGE_BOUNDARY_CONFLICT: ['stage20_visible_context', 'stage18_character_knowledge'],
  VISIBLE_CONTEXT_HIDDEN_STATE_UPSTREAM_CONFLICT: ['stage19_hidden_state'],
  VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK: ['stage20_visible_context', 'stage19_hidden_state'],
  VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK: ['stage20_visible_context', 'stage19_hidden_state'],
  VISIBLE_CONTEXT_FUTURE_EVENT_LEAK: ['stage20_visible_context', 'stage19_hidden_state'],
  VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK: ['stage20_visible_context', 'stage19_hidden_state'],
  VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK: ['stage20_visible_context', 'stage16_item_placement', 'stage19_hidden_state']
});

export function normalizeStage21AuditPolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE21_AUDIT_POLICY,
    ...(isObject(policy) ? policy : {})
  });
}
