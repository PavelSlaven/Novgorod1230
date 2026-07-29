import {
  PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA,
  STAGE24_AUDIT_SCHEMA,
  STAGE24_INPUT_SCHEMA,
  STAGE24_MANIFEST_SCHEMA,
  STAGE24_PLAN_SCHEMA,
  STAGE24_PRECHECK_SCHEMA,
  STAGE24_RESULT_SCHEMA,
  STAGE24_ROUTE_SCHEMA,
  WORLD_BASE_REFERENCE_SCHEMA
} from '@rus/contracts';

export {
  PARTY_DB_SCHEMA_SNAPSHOT_SCHEMA,
  STAGE24_AUDIT_SCHEMA,
  STAGE24_INPUT_SCHEMA,
  STAGE24_MANIFEST_SCHEMA,
  STAGE24_PLAN_SCHEMA,
  STAGE24_PRECHECK_SCHEMA,
  STAGE24_RESULT_SCHEMA,
  STAGE24_ROUTE_SCHEMA,
  WORLD_BASE_REFERENCE_SCHEMA
};

export const REQUIRED_WRITE_POLICY = Object.freeze({
  require_all_previous_audits_passed: true,
  require_atomic_transaction: true,
  require_idempotency_keys: true,
  require_fk_precheck: true,
  require_no_world_base_mutation: true,
  require_source_trace: true,
  require_rollback_plan: true,
  require_write_order: true,
  reject_unapproved_entities: true,
  reject_hidden_state_to_player_tables: true,
  reject_player_output_before_commit: true,
  require_knowledge_projection_exact_match: true,
  require_plan_digest_binding: true,
  allow_snapshot_tables: true
});

export const REQUIRED_ARTIFACT_KEYS = Object.freeze([
  'historical_frame','weather_state','selected_start_node','start_place_audit','player_character',
  'player_character_audit','g5_scene_graph','g5_scene_audit','initial_npc_placement',
  'npc_placement_audit','initial_item_placement','item_placement_audit',
  'time_light_consistency_audit','character_knowledge_map','character_knowledge_map_audit',
  'character_knowledge_write_projection','full_hidden_scene_state','full_hidden_state_audit',
  'visible_context_package','visible_context_audit_approval','narrator_starting_prose',
  'narrator_prose_audit_approval'
]);

export const STAGE24_STANDARD_PIPELINE_PROFILE = 'standard_new_game';
export const LOWER_DVINA_TRACE_PHASE_1A_PIPELINE_PROFILE = 'lower_dvina_trace_phase_1a_internal_materialization';
export const LOWER_DVINA_TRACE_PHASE_1A_ARTIFACT_KEYS = Object.freeze([
  'scenario_definition',
  'materialization_result',
  'player_character_audit',
  'sealed_selection_closure'
]);

export const ARTIFACT_STAGE_IDS = Object.freeze({
  historical_frame: 3, weather_state: 17, selected_start_node: 9, start_place_audit: 10,
  player_character: 11, player_character_audit: 12, g5_scene_graph: 13, g5_scene_audit: 14,
  initial_npc_placement: 15, npc_placement_audit: 1502, initial_item_placement: 16,
  item_placement_audit: 1602, time_light_consistency_audit: 17, character_knowledge_map: 18,
  character_knowledge_map_audit: 1802, character_knowledge_write_projection: 1803,
  full_hidden_scene_state: 19, full_hidden_state_audit: 1902, visible_context_package: 20,
  visible_context_audit_approval: 21, narrator_starting_prose: 22,
  narrator_prose_audit_approval: 23
});

export const LOWER_DVINA_TRACE_PHASE_1A_ARTIFACT_STAGE_IDS = Object.freeze({
  scenario_definition: 0,
  materialization_result: 1,
  player_character_audit: 12,
  sealed_selection_closure: 13
});

export function isLowerDvinaTracePhase1AInput(input) {
  return input?.pipeline_profile === LOWER_DVINA_TRACE_PHASE_1A_PIPELINE_PROFILE;
}

export function requiredArtifactKeysForInput(input) {
  return isLowerDvinaTracePhase1AInput(input)
    ? LOWER_DVINA_TRACE_PHASE_1A_ARTIFACT_KEYS
    : REQUIRED_ARTIFACT_KEYS;
}

export function artifactStageIdForProfile(key, pipelineProfile) {
  return pipelineProfile === LOWER_DVINA_TRACE_PHASE_1A_PIPELINE_PROFILE
    ? LOWER_DVINA_TRACE_PHASE_1A_ARTIFACT_STAGE_IDS[key]
    : ARTIFACT_STAGE_IDS[key];
}

export const REQUIRED_AUDIT_CHECKS = Object.freeze([
  'plan_schema','transaction_atomicity','database_schema_compliance','write_order','dependency_graph',
  'approved_entities_only','npc_projection','item_container_projection','position_projection','g5_projection',
  'knowledge_projection','hidden_visible_boundary','narrator_output_projection','source_trace',
  'audit_snapshots','forbidden_writes','world_base_immutability','rollback_completeness','idempotency',
  'commit_readiness'
]);

export const STAGE24_CONCERN_CODES = Object.freeze([
  'WRITE_PLAN_INPUT_BINDING_INVALID','WRITE_PLAN_SCHEMA_INVALID','WRITE_PLAN_TRANSACTION_INVALID',
  'WRITE_PLAN_NON_ATOMIC','WRITE_PLAN_WRITE_ORDER_INVALID','WRITE_PLAN_DEPENDENCY_INVALID',
  'WRITE_PLAN_DEPENDENCY_CYCLE','WRITE_PLAN_UNKNOWN_TABLE','WRITE_PLAN_UNKNOWN_COLUMN',
  'WRITE_PLAN_INVALID_OPERATION','WRITE_PLAN_ENUM_INVALID','WRITE_PLAN_FK_INVALID',
  'WRITE_PLAN_UNAPPROVED_NPC','WRITE_PLAN_UNAPPROVED_ITEM','WRITE_PLAN_UNAPPROVED_CONTAINER',
  'WRITE_PLAN_UNAPPROVED_ANCHOR','WRITE_PLAN_UNAPPROVED_ROUTE','WRITE_PLAN_POSITION_MISMATCH',
  'WRITE_PLAN_CLOCK_MISMATCH','WRITE_PLAN_VISIBLE_CONTEXT_MISMATCH','WRITE_PLAN_HIDDEN_STATE_MISMATCH',
  'WRITE_PLAN_HIDDEN_PUBLIC_LEAK','WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE',
  'WRITE_PLAN_KNOWLEDGE_PROJECTION_EXTRA','WRITE_PLAN_SOURCE_TRACE_INCOMPLETE',
  'WRITE_PLAN_AUDIT_SNAPSHOT_INCOMPLETE','WRITE_PLAN_WORLD_BASE_MUTATION',
  'WRITE_PLAN_ROLLBACK_INCOMPLETE','WRITE_PLAN_IDEMPOTENCY_INVALID',
  'WRITE_PLAN_PLAYER_OUTPUT_BEFORE_COMMIT','WRITE_PLAN_DATABASE_SCHEMA_INVALID',
  'WRITE_PLAN_MANIFEST_INVALID','WRITE_PLAN_FORMAT_INVALID','WRITE_PLAN_AUDIT_INVALID',
  'WRITE_PLAN_AUDIT_DIGEST_MISMATCH'
]);

export const STAGE24_SEVERITIES = Object.freeze(['format_error','repairable','upstream_block','hard_block','manual_review']);
export const STAGE24_REPAIR_ROUTES = Object.freeze([
  'party_db_write_plan_format_repair','party_db_write_plan_semantic_repair','party_db_write_plan_rebuild',
  'party_database_schema_reload','approved_pipeline_output_repair','character_knowledge_projection_repair',
  'blocked','manual_review'
]);

export const FORMAT_PLAN_CODES = new Set([
  'WRITE_PLAN_FORMAT_INVALID','WRITE_PLAN_SCHEMA_INVALID','WRITE_PLAN_TRANSACTION_INVALID',
  'WRITE_PLAN_WRITE_ORDER_INVALID','WRITE_PLAN_SOURCE_TRACE_INCOMPLETE',
  'WRITE_PLAN_AUDIT_SNAPSHOT_INCOMPLETE'
]);
export const FORBIDDEN_INPUT_KEYS = new Set([
  'context','pipeline_context','stage_registry','stage_outputs','database','db','client',
  'transaction_client','pipeline_diagnostics','repair_logs','generation_history'
]);
export const FORBIDDEN_AUDIT_KEYS = new Set([
  'party_db_write_plan','write_plan','modified_write_plan','new_write_plan','full_hidden_scene_state',
  'hidden_state','character_knowledge_map','visible_context_package','approved_pipeline_outputs','repair_payload'
]);
export const PUBLIC_TABLE_PATTERN = /(public|player|narrator|visible|ui|message|screen|journal)/i;
export const WORLD_BASE_PATTERN = /(^|[._-])world_base([._-]|$)/i;
export const HIDDEN_FIELD_PATTERN = /(hidden_state|hidden_truth|private_motive|future_event|closed_container_contents|actual_truth_hidden)/i;
export const PLAYER_OUTPUT_FIELD_PATTERN = /(player_visible_message|opening_scene_presented|first_game_screen|narrator_output_committed)/i;
export const ALLOWED_PLAN_KEYS = new Set([
  'version','schema','request_id','plan_status','source_input_digest','party_database_schema_digest',
  'world_base_reference_digest','approved_pipeline_manifest_digest','transaction','preconditions',
  'write_batches','postconditions','forbidden_writes','derived_indexes','audit_snapshots','rollback_plan',
  'source_trace','knowledge_projection_validation','self_audit'
]);
export const ALLOWED_AUDIT_KEYS = new Set([
  'version','schema','request_id','party_db_write_plan_digest','pass','checks','concerns','evidence',
  'proposed_repair_route','commit_permission'
]);
