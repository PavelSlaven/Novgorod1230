import { PARTY_PUBLIC_STATE_SCHEMA, STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA } from '@rus/contracts';


export const STAGE25_INPUT_SCHEMA = 'commit_gate_input';
export const STAGE25_PREFLIGHT_SCHEMA = 'stage25_commit_preflight';
export const STAGE25_DRY_RUN_INPUT_SCHEMA = 'party_write_plan_dry_run_input';
export const STAGE25_DRY_RUN_SCHEMA = 'party_write_plan_dry_run_result';
export const STAGE25_GATE_SCHEMA = 'commit_gate_result';
export const STAGE25_TRANSACTION_INPUT_SCHEMA = 'approved_party_transaction_input';
export const STAGE25_TRANSACTION_SCHEMA = 'party_transaction_result';
export const STAGE25_POSTCOMMIT_READ_SCHEMA = 'party_postcommit_read_input';
export const STAGE25_POSTCOMMIT_STATE_SCHEMA = 'party_postcommit_state';
export const STAGE25_POSTCOMMIT_SCHEMA = 'party_postcommit_validation';
export const STAGE25_RESULT_SCHEMA = 'stage25_party_start_commit_result';
export const STAGE25_APPROVAL_SCHEMA = STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA;
export const STAGE25_PUBLIC_READ_MODEL_SCHEMA = PARTY_PUBLIC_STATE_SCHEMA;
export const STAGE25_IDEMPOTENCY_SCHEMA = 'party_commit_idempotency_result';
export const STAGE25_PHYSICAL_PLAN_SCHEMA = 'party_physical_write_plan';
export const STAGE25_MAPPING_REPORT_SCHEMA = 'party_physical_plan_mapping_report';

export const REQUIRED_COMMIT_POLICY = Object.freeze({
  require_all_previous_audits_passed: true,
  require_write_plan_audit_passed: true,
  require_atomic_transaction: true,
  require_dry_run: true,
  require_idempotency_check: true,
  require_fk_validation: true,
  require_enum_validation: true,
  require_schema_validation: true,
  require_source_id_validation: true,
  require_candidate_id_validation: true,
  require_no_world_base_mutation: true,
  require_no_hidden_state_public_leak: true,
  require_postconditions: true,
  require_postcommit_readback: true,
  require_rollback_available: true,
  reject_partial_commit: true,
  reject_silent_repair: true,
  reject_player_output_before_commit: true
});

export const REQUIRED_MANIFEST_ARTIFACT_KEYS = Object.freeze([
  'historical_frame',
  'weather_state',
  'selected_start_node',
  'start_place_audit',
  'player_character',
  'player_character_audit',
  'g5_scene_graph',
  'g5_scene_audit',
  'initial_npc_placement',
  'npc_placement_audit',
  'initial_item_placement',
  'item_placement_audit',
  'time_light_consistency_audit',
  'character_knowledge_map',
  'character_knowledge_map_audit',
  'character_knowledge_write_projection',
  'full_hidden_scene_state',
  'full_hidden_state_audit',
  'visible_context_package',
  'visible_context_audit_approval',
  'narrator_starting_prose',
  'narrator_prose_audit_approval'
]);

export const REQUIRED_AUDIT_ARTIFACT_KEYS = Object.freeze([
  'start_place_audit',
  'player_character_audit',
  'g5_scene_audit',
  'npc_placement_audit',
  'item_placement_audit',
  'time_light_consistency_audit',
  'character_knowledge_map_audit',
  'full_hidden_state_audit',
  'visible_context_audit_approval',
  'narrator_prose_audit_approval'
]);

export const REQUIRED_DRY_RUN_CHECKS = Object.freeze([
  'schema_validation',
  'required_columns',
  'type_validation',
  'enum_validation',
  'not_null_validation',
  'foreign_key_validation',
  'unique_constraint_validation',
  'check_constraint_validation',
  'source_id_validation',
  'candidate_id_validation',
  'graph_reference_validation',
  'write_order_validation',
  'dependency_validation',
  'idempotency_validation',
  'world_base_immutability',
  'hidden_public_boundary',
  'rollback_simulation',
  'postconditions_simulation'
]);

export const REQUIRED_POSTCOMMIT_CHECKS = Object.freeze([
  'party_state_ready',
  'player_output_allowed',
  'current_position_exists',
  'current_clock_exists',
  'player_character_exists',
  'anchors_match_plan',
  'routes_match_plan',
  'npcs_match_plan',
  'items_match_plan',
  'containers_match_plan',
  'knowledge_hash_matches',
  'knowledge_counts_match',
  'single_current_knowledge_map',
  'visible_context_digest_matches',
  'narrator_prose_digest_matches',
  'audit_snapshots_complete',
  'source_trace_complete',
  'hidden_public_boundary_valid',
  'idempotency_record_committed'
]);

export const FORBIDDEN_STAGE25_INPUT_KEYS = new Set([
  'context',
  'pipeline_context',
  'registry',
  'lifecycle',
  'database_client',
  'db',
  'client',
  'party_start_committed',
  'transaction_result',
  'postcommit_result',
  'stage_outputs'
]);

export const FORBIDDEN_PUBLIC_KEYS = new Set([
  'hidden_state',
  'private_motives',
  'private_knowledge',
  'closed_container_contents',
  'future_event_timers',
  'truth_status_for_system',
  'actual_truth_hidden_from_character',
  'audit_state',
  'diagnostics',
  'source_trace'
]);

export const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
