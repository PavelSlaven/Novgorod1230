import { NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA, STAGE26_SCREEN_APPROVAL_SCHEMA } from '@rus/contracts';

export const STAGE26_INPUT_SCHEMA = 'first_game_screen_input';

export const STAGE26_PRECHECK_SCHEMA = 'first_screen_code_precheck';

export const STAGE26_SCREEN_SCHEMA = 'first_game_screen';

export const STAGE26_CODE_VALIDATION_SCHEMA = 'first_screen_code_validation';

export const STAGE26_SAFETY_AUDIT_SCHEMA = 'first_screen_safety_audit';

export const STAGE26_ACTION_AUDIT_SCHEMA = 'first_screen_action_label_audit';

export const STAGE26_RESULT_SCHEMA = 'stage26_first_game_screen_result';

export const STAGE26_APPROVAL_SCHEMA = STAGE26_SCREEN_APPROVAL_SCHEMA;

export const STAGE26_NARRATOR_APPROVAL_SCHEMA = NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA;

export const STAGE26_DELIVERY_POLICY_SCHEMA = 'first_screen_delivery_policy';

export const STAGE26_SEVERITIES = Object.freeze([
  'format_error',
  'repairable',
  'upstream_block',
  'hard_block',
  'delivery_block'
]);

export const STAGE26_REPAIR_ROUTES = Object.freeze([
  'first_screen_format_repair',
  'first_screen_label_semantic_repair',
  'first_screen_action_label_repair',
  'party_public_read_model_repair',
  'stage25_postcommit_repair',
  'narrator_prose_repair',
  'visible_context_repair',
  'delivery_state_repair',
  'blocked',
  'manual_review'
]);

export const STAGE26_CONCERN_CODES = Object.freeze([
  'FIRST_SCREEN_INPUT_INVALID',
  'FIRST_SCREEN_FORBIDDEN_INPUT_FIELD',
  'FIRST_SCREEN_REQUEST_ID_MISMATCH',
  'FIRST_SCREEN_STAGE25_APPROVAL_INVALID',
  'FIRST_SCREEN_STAGE25_PERMISSION_DENIED',
  'FIRST_SCREEN_STAGE25_DIGEST_MISMATCH',
  'FIRST_SCREEN_PARTY_NOT_COMMITTED',
  'FIRST_SCREEN_PARTY_NOT_READY',
  'FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID',
  'FIRST_SCREEN_PUBLIC_STATE_DIGEST_MISMATCH',
  'FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED',
  'FIRST_SCREEN_NARRATOR_DIGEST_MISMATCH',
  'FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED',
  'FIRST_SCREEN_VISIBLE_CONTEXT_DIGEST_MISMATCH',
  'FIRST_SCREEN_POLICY_WEAKENED',
  'FIRST_SCREEN_SCHEMA_MISMATCH',
  'FIRST_SCREEN_NOT_READY',
  'FIRST_SCREEN_MAIN_PROSE_MISMATCH',
  'FIRST_SCREEN_POSITION_MISMATCH',
  'FIRST_SCREEN_TIME_PANEL_CLOCK_CONFLICT',
  'FIRST_SCREEN_LIGHT_PANEL_CONFLICT',
  'FIRST_SCREEN_WEATHER_PANEL_CONFLICT',
  'FIRST_SCREEN_ATTENTION_REF_NOT_FOUND',
  'FIRST_SCREEN_ACTION_OPTION_NOT_APPROVED',
  'FIRST_SCREEN_ACTION_REF_NOT_FOUND',
  'FIRST_SCREEN_ACTION_CREATED_TARGET',
  'FIRST_SCREEN_ACTION_LABEL_HIDDEN_LEAK',
  'FIRST_SCREEN_ACTION_PROMISES_OUTCOME',
  'FIRST_SCREEN_ACTION_USES_HIDDEN_TRUTH',
  'FIRST_SCREEN_MAP_REF_NOT_KNOWN',
  'FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK',
  'FIRST_SCREEN_HIDDEN_STATE_LEAK',
  'FIRST_SCREEN_PRIVATE_MOTIVE_LEAK',
  'FIRST_SCREEN_CLOSED_CONTAINER_CONTENTS_LEAK',
  'FIRST_SCREEN_FUTURE_EVENT_LEAK',
  'FIRST_SCREEN_TRUE_OWNERSHIP_LEAK',
  'FIRST_SCREEN_RAW_JSON_LEAK',
  'FIRST_SCREEN_AUDIT_TEXT_LEAK',
  'FIRST_SCREEN_SOURCE_TRACE_LEAK',
  'FIRST_SCREEN_DEBUG_TEXT_LEAK',
  'FIRST_SCREEN_RAW_ID_LEAK',
  'FIRST_SCREEN_TECHNICAL_TEXT',
  'FIRST_SCREEN_FREE_TEXT_DISABLED',
  'FIRST_SCREEN_INPUT_CONTRACT_INVALID',
  'FIRST_SCREEN_DELIVERY_ID_MISSING',
  'FIRST_SCREEN_OPENING_PRESENTED_WITHOUT_ACK',
  'FIRST_SCREEN_AUDIT_INVALID',
  'FIRST_SCREEN_AUDIT_FAILED',
  'FIRST_SCREEN_REPAIR_INVALID',
  'FIRST_SCREEN_REPAIR_EXHAUSTED'
]);

export const REQUIRED_SCREEN_POLICY = Object.freeze({
  show_narrator_prose: true,
  show_public_position: true,
  show_time_and_light: true,
  show_body_status: true,
  show_attention_options: true,
  show_action_options: true,
  show_free_text_input: true,
  show_debug_ids: false,
  show_json: false,
  show_audit: false,
  show_source_trace: false,
  show_hidden_state: false,
  require_safe_labels: true,
  require_action_options_from_approved_refs: true,
  require_attention_from_committed_refs: true,
  require_map_from_current_knowledge: true,
  require_first_turn_input_as_intent_not_fact: true,
  require_delivery_ack_before_presented: true,
  require_delivery_ack_before_first_turn: true
});

export const READY_PHASE = 'awaiting_player_input';

export const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export const TECHNICAL_TOKEN_PATTERN = /\b(?:G[1-5]_|g[1-5]_|npc_|item_|container_|anchor_|place_|location_|minilocation_|region_|candidate_|source_|audit_|hidden_)[A-Za-z0-9_-]+\b/u;

export const INPUT_KEYS = new Set([
  'version', 'schema', 'request_id', 'stage25_party_commit_approval', 'party_start_committed',
  'committed_public_read_model', 'approved_narrator_output', 'narrator_output_digest',
  'narrator_prose_approval', 'approved_visible_context', 'visible_context_package_digest',
  'visible_context_approval', 'screen_policy'
]);

export const FORBIDDEN_PUBLIC_KEYS = new Set([
  'hidden_state', 'private_motives', 'private_knowledge', 'closed_container_contents',
  'future_event_timers', 'truth_status_for_system', 'actual_truth_hidden_from_character',
  'audit', 'audit_result', 'repair_route', 'source_trace', 'prompt', 'raw_json',
  'llm_diagnostics', 'diagnostics', 'debug', 'full_hidden_scene_state'
]);

export const SAFETY_CHECK_KEYS = Object.freeze([
  'no_new_world_facts', 'hidden_state_absent', 'private_motives_absent',
  'closed_container_truth_absent', 'future_events_absent', 'unknown_route_destination_absent',
  'position_time_consistent', 'technical_text_absent', 'screen_grounded_in_approved_data'
]);

export const ACTION_CHECK_KEYS = Object.freeze([
  'attention_labels_grounded', 'action_labels_grounded', 'no_hidden_truth',
  'no_outcome_promises', 'no_created_targets', 'no_unknown_destination',
  'uncertainty_preserved'
]);

export const SCREEN_FORMAT_CODES = new Set([
  'FIRST_SCREEN_SCHEMA_MISMATCH', 'FIRST_SCREEN_NOT_READY', 'FIRST_SCREEN_FREE_TEXT_DISABLED',
  'FIRST_SCREEN_INPUT_CONTRACT_INVALID', 'FIRST_SCREEN_DELIVERY_ID_MISSING'
]);

export const ACTION_REPAIR_CODES = new Set([
  'FIRST_SCREEN_ACTION_PROMISES_OUTCOME', 'FIRST_SCREEN_ACTION_USES_HIDDEN_TRUTH',
  'FIRST_SCREEN_ACTION_LABEL_HIDDEN_LEAK', 'FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK'
]);

export const LABEL_REPAIR_CODES = new Set([
  'FIRST_SCREEN_HIDDEN_STATE_LEAK', 'FIRST_SCREEN_PRIVATE_MOTIVE_LEAK',
  'FIRST_SCREEN_CLOSED_CONTAINER_CONTENTS_LEAK', 'FIRST_SCREEN_FUTURE_EVENT_LEAK',
  'FIRST_SCREEN_TRUE_OWNERSHIP_LEAK', 'FIRST_SCREEN_RAW_ID_LEAK', 'FIRST_SCREEN_TECHNICAL_TEXT'
]);
