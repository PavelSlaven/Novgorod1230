import { VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA, STAGE22_INPUT_SCHEMA, STAGE22_OUTPUT_SCHEMA, STAGE22_PRECHECK_SCHEMA, STAGE22_RESULT_SCHEMA, STAGE22_ALLOWED_STATUSES, STAGE22_ALLOWED_ACTION_KINDS, STAGE22_ALLOWED_BASES, STAGE22_ALLOWED_RISK_HINTS, STAGE22_ALLOWED_BLOCK_REASONS } from '@rus/contracts';
import { boundedInteger, isObject } from '../shared/utils.js';

export { STAGE22_INPUT_SCHEMA, STAGE22_OUTPUT_SCHEMA, STAGE22_PRECHECK_SCHEMA, STAGE22_RESULT_SCHEMA, STAGE22_ALLOWED_STATUSES, STAGE22_ALLOWED_ACTION_KINDS, STAGE22_ALLOWED_BASES, STAGE22_ALLOWED_RISK_HINTS, STAGE22_ALLOWED_BLOCK_REASONS };
export const STAGE22_APPROVAL_SCHEMA = VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA;

export const DEFAULT_STAGE22_NARRATOR_POLICY = Object.freeze({
  write_only_from_visible_context_package: true,
  do_not_add_new_world_facts: true,
  do_not_reveal_hidden_state: true,
  do_not_explain_private_motives: true,
  do_not_reveal_closed_container_contents: true,
  do_not_reveal_future_events: true,
  do_not_upgrade_rumors_to_facts: true,
  do_not_upgrade_uncertainty_to_fact: true,
  do_not_change_clock_weather_light: true,
  do_not_change_position: true,
  respect_must_include: true,
  respect_must_not_include: true,
  action_options_only_from_available_actions_context: true,
  do_not_promise_action_outcomes: true,
  avoid_raw_ids_in_prose: true,
  avoid_raw_json: true,
  avoid_system_language: true,
  avoid_debug_language: true,
  output_player_facing_text: true,
  allow_action_suggestions: true,
  max_opening_paragraphs: 4,
  max_action_options: 6
});

export const REQUIRED_TRUE_POLICY_FIELDS = Object.freeze(Object.entries(DEFAULT_STAGE22_NARRATOR_POLICY)
  .filter(([, value]) => value === true)
  .map(([key]) => key));

export const SELF_CHECK_FIELDS = Object.freeze([
  'used_only_visible_context',
  'did_not_add_new_world_facts',
  'did_not_reveal_hidden_state',
  'preserved_time_weather_light',
  'preserved_position',
  'rumors_remain_rumors',
  'uncertainty_remains_uncertain'
]);

export const FORBIDDEN_INPUT_KEYS = new Set([
  'full_hidden_scene_state',
  'full_hidden_state_audit',
  'character_knowledge_map',
  'character_knowledge_map_audit',
  'repair_history',
  'audit_history',
  'diagnostics',
  'world_base',
  'pipeline_context',
  'stage_outputs'
]);

export const FORBIDDEN_OUTPUT_KEYS = new Set([
  'full_hidden_scene_state',
  'character_knowledge_map',
  'repair_history',
  'audit_history',
  'visible_context_package',
  'visible_context_audit',
  'pipeline_context',
  'stage_outputs'
]);

export const TECHNICAL_TEXT_PATTERNS = Object.freeze([
  /\bfull_hidden_scene_state\b/iu,
  /\bcharacter_knowledge_map\b/iu,
  /\brepair_route\b/iu,
  /\bsemantic_audit\b/iu,
  /\bdebug\b/iu,
  /\bpipeline\b/iu,
  /\bjson\b/iu,
  /\bschema\b/iu
]);


export function normalizeStage22NarratorPolicy(policy = {}) {
  const source = isObject(policy) ? policy : {};
  return Object.freeze({
    ...DEFAULT_STAGE22_NARRATOR_POLICY,
    ...source,
    max_opening_paragraphs: boundedInteger(source.max_opening_paragraphs, 1, 4, DEFAULT_STAGE22_NARRATOR_POLICY.max_opening_paragraphs),
    max_action_options: boundedInteger(source.max_action_options, 0, 6, DEFAULT_STAGE22_NARRATOR_POLICY.max_action_options)
  });
}
