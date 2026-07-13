import { createHash } from 'node:crypto';
import {
  adaptPartyWritePlanTargets,
  validatePartyAdapterTargetSafety
} from '../../party-schema-mapping.js';
import {
  buildStage24Approval,
  computePartyDbWritePlanDigest,
  computeStage24Digest,
  STAGE24_MANIFEST_SCHEMA,
  STAGE24_PLAN_SCHEMA,
  STAGE24_PRECHECK_SCHEMA,
  STAGE24_RESULT_SCHEMA,
  validatePartyDatabaseSchemaSnapshot,
  validateWorldBaseReferenceSnapshot
} from './stage24-party-db-write-plan.js';

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
export const STAGE25_APPROVAL_SCHEMA = 'stage25_party_commit_approval';
export const STAGE25_PUBLIC_READ_MODEL_SCHEMA = 'party_public_state';
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

const REQUIRED_MANIFEST_ARTIFACT_KEYS = Object.freeze([
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

const REQUIRED_AUDIT_ARTIFACT_KEYS = Object.freeze([
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

const REQUIRED_DRY_RUN_CHECKS = Object.freeze([
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

const REQUIRED_POSTCOMMIT_CHECKS = Object.freeze([
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

const FORBIDDEN_STAGE25_INPUT_KEYS = new Set([
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

const FORBIDDEN_PUBLIC_KEYS = new Set([
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

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export function canonicalStage25Json(value) {
  return JSON.stringify(sortValue(value));
}

export function computeStage25Digest(value) {
  return `sha256:${createHash('sha256').update(canonicalStage25Json(value)).digest('hex')}`;
}

export function normalizeStage25CommitPolicy(additionalPolicy = {}) {
  if (!isObject(additionalPolicy)) throw new Error('Stage 25 additional_commit_policy must be an object.');
  for (const [key, value] of Object.entries(additionalPolicy)) {
    if (Object.hasOwn(REQUIRED_COMMIT_POLICY, key) && value !== true) {
      throw new Error(`Stage 25 commit policy cannot weaken required invariant: ${key}.`);
    }
  }
  return Object.freeze({ ...REQUIRED_COMMIT_POLICY, ...safeClone(additionalPolicy) });
}

export function buildStage25CommitInput({
  request_id,
  party_creation_context,
  stage24_result,
  party_database_schema,
  world_base_reference_snapshot,
  approved_pipeline_manifest,
  additional_commit_policy = {}
} = {}) {
  if (!isObject(stage24_result) || stage24_result.schema !== STAGE24_RESULT_SCHEMA || stage24_result.pass !== true) {
    throw new Error('Stage 25 requires a successful Stage 24 result bundle.');
  }
  const partyContext = safeClone(party_creation_context ?? {});
  if (!text(partyContext.payload_hash)) {
    partyContext.payload_hash = computeStage25Digest({
      party_id: partyContext.party_id ?? null,
      player_character_id: partyContext.player_character_id ?? null,
      idempotency_key: partyContext.idempotency_key ?? null,
      party_db_write_plan_digest: stage24_result.party_db_write_plan_digest ?? null,
      approved_pipeline_manifest_digest: stage24_result.approved_pipeline_manifest_digest ?? null
    });
  }
  return {
    version: 1,
    schema: STAGE25_INPUT_SCHEMA,
    request_id,
    party_creation_context: partyContext,
    stage24_result_approval: buildStage24Approval(stage24_result),
    party_db_write_plan: safeClone(stage24_result.party_db_write_plan),
    party_database_schema: safeClone(party_database_schema),
    world_base_reference_snapshot: safeClone(world_base_reference_snapshot),
    approved_pipeline_manifest: safeClone(approved_pipeline_manifest),
    commit_policy: normalizeStage25CommitPolicy(additional_commit_policy)
  };
}

export function validateStage25CommitInput(input = {}) {
  const concerns = [];
  if (!isObject(input) || input.version !== 1 || input.schema !== STAGE25_INPUT_SCHEMA) {
    return [issue('STAGE25_INPUT_SCHEMA_INVALID', 'commit_gate_input version 1 is required.', 'input')];
  }
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_STAGE25_INPUT_KEYS.has(key)) concerns.push(issue('STAGE25_FORBIDDEN_INPUT_FIELD', `Forbidden Stage 25 input field: ${key}.`, key));
  }
  if (!text(input.request_id)) concerns.push(issue('STAGE25_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  concerns.push(...validatePartyCreationContext(input.party_creation_context, input.request_id));
  concerns.push(...validateStage24ApprovalBinding(input));
  concerns.push(...validateManifestStructure(input.approved_pipeline_manifest, input.request_id));
  for (const item of validatePartyDatabaseSchemaSnapshot(input.party_database_schema)) {
    concerns.push(issue('STAGE25_DB_SCHEMA_INVALID', item.message, item.path ?? 'party_database_schema'));
  }
  for (const item of validateWorldBaseReferenceSnapshot(input.world_base_reference_snapshot)) {
    concerns.push(issue('STAGE25_WORLD_REFERENCE_INVALID', item.message, item.path ?? 'world_base_reference_snapshot'));
  }
  for (const [key, expected] of Object.entries(REQUIRED_COMMIT_POLICY)) {
    if (input.commit_policy?.[key] !== expected) concerns.push(issue('STAGE25_POLICY_WEAKENED', `commit_policy.${key} must remain ${String(expected)}.`, `commit_policy.${key}`));
  }
  if (input.party_db_write_plan?.schema !== STAGE24_PLAN_SCHEMA || input.party_db_write_plan?.version !== 1) {
    concerns.push(issue('STAGE25_PLAN_SCHEMA_INVALID', 'party_db_write_plan version 1 is required.', 'party_db_write_plan'));
  }
  return concerns;
}

export function materializeStage25PhysicalPlan({ logical_plan, party_database_schema, world_base_reference_snapshot } = {}) {
  const logical = safeClone(logical_plan);
  const logicalDigest = computePartyDbWritePlanDigest(logical);
  const physical = adaptPartyWritePlanTargets(logical);
  physical.schema = STAGE25_PHYSICAL_PLAN_SCHEMA;
  physical.logical_plan_schema = logical.schema;
  physical.logical_plan_digest = logicalDigest;
  const mappingConcerns = validateMappingInvariants(logical, physical);
  const schemaConcerns = validatePhysicalWritePlan(physical, party_database_schema, world_base_reference_snapshot);
  const concerns = [...mappingConcerns, ...schemaConcerns];
  if (concerns.length > 0) throw stage25Error('preflight', concerns, 'Physical plan materialization failed.');
  const physicalDigest = computeStage25Digest(physical);
  return {
    physical_write_plan: physical,
    physical_write_plan_digest: physicalDigest,
    mapping_report: {
      version: 1,
      schema: STAGE25_MAPPING_REPORT_SCHEMA,
      logical_plan_digest: logicalDigest,
      physical_plan_digest: physicalDigest,
      batch_count: array(physical.write_batches).length,
      record_count: array(physical.write_batches).reduce((sum, batch) => sum + array(batch.records).length, 0),
      mappings: array(physical.write_batches).map((batch) => ({
        batch_id: batch.batch_id,
        spec_target_table: batch.spec_target_table ?? batch.target_table,
        physical_target_table: batch.target_table,
        adapter_version: batch.adapter_target?.version ?? null
      })),
      concerns: []
    }
  };
}

export function buildStage25CommitPreflight(input = {}, {
  physicalPlanAdapter = materializeStage25PhysicalPlan,
  idempotencyChecker,
  dryRunExecutor,
  transactionExecutor,
  postcommitReader
} = {}) {
  const concerns = validateStage25CommitInput(input);
  let physical = null;
  if (concerns.length === 0) {
    try {
      physical = physicalPlanAdapter({
        logical_plan: safeClone(input.party_db_write_plan),
        party_database_schema: safeClone(input.party_database_schema),
        world_base_reference_snapshot: safeClone(input.world_base_reference_snapshot)
      });
      concerns.push(...validatePhysicalMaterializationResult(physical, input));
    } catch (error) {
      concerns.push(...extractConcerns(error, 'STAGE25_PHYSICAL_PLAN_INVALID', 'Physical plan adapter failed.'));
    }
  }
  if (typeof idempotencyChecker !== 'function') concerns.push(issue('STAGE25_IDEMPOTENCY_CHECKER_MISSING', 'Stage 25 requires idempotencyChecker.', 'idempotencyChecker'));
  if (typeof dryRunExecutor !== 'function') concerns.push(issue('STAGE25_DRY_RUN_EXECUTOR_MISSING', 'Stage 25 requires dryRunExecutor.', 'dryRunExecutor'));
  if (typeof transactionExecutor !== 'function') concerns.push(issue('STAGE25_TRANSACTION_EXECUTOR_MISSING', 'Stage 25 requires transactionExecutor.', 'transactionExecutor'));
  if (typeof postcommitReader !== 'function') concerns.push(issue('STAGE25_POSTCOMMIT_READER_MISSING', 'Stage 25 requires postcommitReader.', 'postcommitReader'));

  const codes = new Set(concerns.map((item) => item.code));
  const checks = {
    input_schema_valid: passCheck(!codes.has('STAGE25_INPUT_SCHEMA_INVALID')),
    request_id_consistent: passCheck(!codes.has('STAGE25_REQUEST_ID_MISSING') && !codes.has('STAGE25_REQUEST_ID_MISMATCH')),
    party_creation_context_valid: passCheck(!concerns.some((item) => item.path?.startsWith('party_creation_context'))),
    stage24_approval_valid: passCheck(!codes.has('STAGE25_STAGE24_APPROVAL_INVALID')),
    stage24_permissions_valid: passCheck(!codes.has('STAGE25_STAGE24_PERMISSION_DENIED')),
    logical_plan_digest_valid: passCheck(!codes.has('STAGE25_PLAN_DIGEST_MISMATCH')),
    schema_digest_valid: passCheck(!codes.has('STAGE25_DB_SCHEMA_DIGEST_MISMATCH')),
    world_base_digest_valid: passCheck(!codes.has('STAGE25_WORLD_DIGEST_MISMATCH')),
    manifest_digest_valid: passCheck(!codes.has('STAGE25_MANIFEST_DIGEST_MISMATCH')),
    manifest_structure_valid: passCheck(!codes.has('STAGE25_MANIFEST_INVALID')),
    audit_chain_complete: passCheck(!codes.has('STAGE25_AUDIT_CHAIN_INCOMPLETE')),
    transaction_contract_valid: passCheck(!codes.has('STAGE25_TRANSACTION_CONTRACT_INVALID')),
    idempotency_context_valid: passCheck(!codes.has('STAGE25_IDEMPOTENCY_CONTEXT_INVALID')),
    physical_adapter_valid: passCheck(Boolean(physical) && !codes.has('STAGE25_PHYSICAL_PLAN_INVALID')),
    physical_plan_digest_valid: passCheck(Boolean(physical?.physical_write_plan_digest) && SHA256_PATTERN.test(physical?.physical_write_plan_digest ?? '')),
    database_schema_validation_passed: passCheck(!codes.has('STAGE25_DB_SCHEMA_INVALID') && !codes.has('STAGE25_UNKNOWN_TABLE') && !codes.has('STAGE25_UNKNOWN_COLUMN')),
    enum_validation_passed: passCheck(!codes.has('STAGE25_ENUM_INVALID')),
    fk_validation_passed: passCheck(!codes.has('STAGE25_FK_INVALID')),
    constraints_validation_passed: passCheck(!['STAGE25_CONSTRAINT_INVALID', 'STAGE25_UNIQUE_CONSTRAINT_INVALID', 'STAGE25_CHECK_CONSTRAINT_INVALID', 'STAGE25_TYPE_INVALID'].some((code) => codes.has(code))),
    source_ids_valid: passCheck(!codes.has('STAGE25_SOURCE_ID_INVALID')),
    candidate_ids_valid: passCheck(!codes.has('STAGE25_CANDIDATE_ID_INVALID')),
    graph_references_valid: passCheck(!codes.has('STAGE25_GRAPH_REFERENCE_INVALID')),
    position_valid: passCheck(!codes.has('STAGE25_POSITION_INVALID')),
    npc_references_valid: passCheck(!codes.has('STAGE25_NPC_REFERENCE_INVALID')),
    item_container_references_valid: passCheck(!codes.has('STAGE25_ITEM_CONTAINER_REFERENCE_INVALID')),
    knowledge_projection_valid: passCheck(!codes.has('STAGE25_KNOWLEDGE_PROJECTION_INVALID')),
    hidden_visible_boundary_valid: passCheck(!codes.has('STAGE25_HIDDEN_PUBLIC_LEAK')),
    world_base_immutability_valid: passCheck(!codes.has('STAGE25_WORLD_BASE_MUTATION')),
    write_order_valid: passCheck(!codes.has('STAGE25_WRITE_ORDER_INVALID')),
    dependency_graph_valid: passCheck(!codes.has('STAGE25_DEPENDENCY_INVALID')),
    rollback_plan_valid: passCheck(!codes.has('STAGE25_ROLLBACK_INVALID')),
    postconditions_present: passCheck(!codes.has('STAGE25_POSTCONDITIONS_MISSING')),
    dry_run_executor_present: passCheck(typeof dryRunExecutor === 'function'),
    transaction_executor_present: passCheck(typeof transactionExecutor === 'function'),
    postcommit_reader_present: passCheck(typeof postcommitReader === 'function')
  };

  return {
    version: 1,
    schema: STAGE25_PREFLIGHT_SCHEMA,
    request_id: input.request_id ?? null,
    pass: concerns.length === 0,
    digests: {
      logical_plan_digest: input.stage24_result_approval?.party_db_write_plan_digest ?? null,
      physical_plan_digest: physical?.physical_write_plan_digest ?? null,
      party_database_schema_digest: input.stage24_result_approval?.party_database_schema_digest ?? null,
      world_base_reference_digest: input.stage24_result_approval?.world_base_reference_digest ?? null,
      approved_pipeline_manifest_digest: input.stage24_result_approval?.approved_pipeline_manifest_digest ?? null
    },
    checks,
    concerns,
    evidence: concerns.length === 0 ? ['Stage 25 exact input, Stage 24 binding, physical plan and required executors passed preflight.'] : [],
    physical_write_plan: physical?.physical_write_plan ?? null,
    physical_plan_mapping_report: physical?.mapping_report ?? null
  };
}

export function validateStage25DryRunResult(result = {}, input = {}, physicalPlanDigest = null) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE25_DRY_RUN_SCHEMA) {
    return [issue('STAGE25_DRY_RUN_RESULT_INVALID', `Expected ${STAGE25_DRY_RUN_SCHEMA} version 1.`, 'dry_run_result')];
  }
  if (result.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Dry-run request_id mismatch.', 'dry_run_result.request_id'));
  if (result.physical_write_plan_digest !== physicalPlanDigest) concerns.push(issue('STAGE25_DRY_RUN_DIGEST_MISMATCH', 'Dry-run physical plan digest mismatch.', 'dry_run_result.physical_write_plan_digest'));
  if (typeof result.pass !== 'boolean') concerns.push(issue('STAGE25_DRY_RUN_RESULT_INVALID', 'Dry-run pass must be boolean.', 'dry_run_result.pass'));
  for (const key of REQUIRED_DRY_RUN_CHECKS) {
    if (result.checks?.[key]?.pass !== true) concerns.push(issue('STAGE25_DRY_RUN_CHECK_FAILED', `Dry-run check failed or missing: ${key}.`, `dry_run_result.checks.${key}`));
  }
  if (result.pass === true) {
    if (array(result.concerns).length !== 0) concerns.push(issue('STAGE25_DRY_RUN_RESULT_INVALID', 'Successful dry-run cannot contain concerns.', 'dry_run_result.concerns'));
    if (array(result.evidence).length === 0) concerns.push(issue('STAGE25_DRY_RUN_RESULT_INVALID', 'Successful dry-run requires evidence.', 'dry_run_result.evidence'));
    if (result.rollback_completed !== true) concerns.push(issue('STAGE25_DRY_RUN_ROLLBACK_FAILED', 'Dry-run must complete rollback.', 'dry_run_result.rollback_completed'));
  } else {
    if (array(result.concerns).length === 0) concerns.push(issue('STAGE25_DRY_RUN_RESULT_INVALID', 'Failed dry-run requires concerns.', 'dry_run_result.concerns'));
  }
  return concerns;
}

export function validateStage25TransactionResult(result = {}, input = {}, physicalPlanDigest = null, physicalPlan = null) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE25_TRANSACTION_SCHEMA) {
    return [issue('STAGE25_TRANSACTION_RESULT_INVALID', `Expected ${STAGE25_TRANSACTION_SCHEMA} version 1.`, 'transaction_result')];
  }
  if (result.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Transaction request_id mismatch.', 'transaction_result.request_id'));
  if (result.party_id !== input.party_creation_context?.party_id) concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Transaction party_id mismatch.', 'transaction_result.party_id'));
  if (result.transaction_id !== input.party_db_write_plan?.transaction?.transaction_id) concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Transaction ID mismatch.', 'transaction_result.transaction_id'));
  if (result.physical_write_plan_digest !== physicalPlanDigest) concerns.push(issue('STAGE25_TRANSACTION_DIGEST_MISMATCH', 'Transaction physical plan digest mismatch.', 'transaction_result.physical_write_plan_digest'));
  if (result.pass !== true || result.commit_status !== 'committed') concerns.push(issue('STAGE25_TRANSACTION_NOT_COMMITTED', 'Transaction result must be committed.', 'transaction_result.commit_status'));
  if (result.rollback?.attempted === true || result.rollback?.completed === true) concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Successful transaction cannot report rollback.', 'transaction_result.rollback'));
  const expectedBatches = array(physicalPlan?.transaction?.write_order);
  if (!sameScalarSet(result.executed_batches, expectedBatches) || array(result.executed_batches).length !== expectedBatches.length) {
    concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Transaction executed_batches must exactly match physical plan write_order.', 'transaction_result.executed_batches'));
  }
  for (const item of array(result.batch_results)) {
    if (!text(item.batch_id) || !Number.isInteger(item.attempted_rows) || !Number.isInteger(item.affected_rows)) concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Invalid batch result row counts.', 'transaction_result.batch_results'));
    if (item.affected_rows < item.attempted_rows && item.operation !== 'upsert_with_idempotency') concerns.push(issue('STAGE25_ROW_COUNT_MISMATCH', `Batch ${item.batch_id} affected fewer rows than expected.`, 'transaction_result.batch_results'));
  }
  if (array(result.postcondition_checks).some((item) => item?.pass !== true)) concerns.push(issue('STAGE25_POSTCONDITION_FAILED', 'Transaction postconditions did not all pass.', 'transaction_result.postcondition_checks'));
  return concerns;
}

export function validateStage25PostcommitState(state = {}, input = {}, transactionResult = {}, physicalPlanDigest = null) {
  const concerns = [];
  if (!isObject(state) || state.version !== 1 || state.schema !== STAGE25_POSTCOMMIT_STATE_SCHEMA) {
    return [issue('STAGE25_POSTCOMMIT_STATE_INVALID', `Expected ${STAGE25_POSTCOMMIT_STATE_SCHEMA} version 1.`, 'postcommit_state')];
  }
  if (state.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Postcommit request_id mismatch.', 'postcommit_state.request_id'));
  if (state.party_id !== input.party_creation_context?.party_id) concerns.push(issue('STAGE25_POSTCOMMIT_STATE_INVALID', 'Postcommit party_id mismatch.', 'postcommit_state.party_id'));
  if (state.transaction_id !== transactionResult.transaction_id) concerns.push(issue('STAGE25_POSTCOMMIT_STATE_INVALID', 'Postcommit transaction_id mismatch.', 'postcommit_state.transaction_id'));
  if (state.physical_write_plan_digest !== physicalPlanDigest) concerns.push(issue('STAGE25_POSTCOMMIT_DIGEST_MISMATCH', 'Postcommit physical plan digest mismatch.', 'postcommit_state.physical_write_plan_digest'));
  if (state.party_state?.status !== 'ready' || state.party_state?.is_ready_for_player !== true || state.party_state?.current_phase !== 'awaiting_player_input') concerns.push(issue('STAGE25_PARTY_NOT_READY', 'Live party state is not ready for player.', 'postcommit_state.party_state'));
  if (!isObject(state.current_position)) concerns.push(issue('STAGE25_POSTCOMMIT_POSITION_MISSING', 'Live current position is required.', 'postcommit_state.current_position'));
  if (!isObject(state.current_clock)) concerns.push(issue('STAGE25_POSTCOMMIT_CLOCK_MISSING', 'Live current clock is required.', 'postcommit_state.current_clock'));
  if (!isObject(state.player_character)) concerns.push(issue('STAGE25_POSTCOMMIT_PLAYER_MISSING', 'Live player character is required.', 'postcommit_state.player_character'));
  if (!text(state.player_output_ref?.narrator_output_id) || state.player_output_ref?.player_visible_message_ready !== true) concerns.push(issue('STAGE25_POSTCOMMIT_OUTPUT_MISSING', 'Committed narrator output reference is required.', 'postcommit_state.player_output_ref'));
  if (state.idempotency_record?.idempotency_key !== input.party_creation_context?.idempotency_key || state.idempotency_record?.payload_hash !== input.party_creation_context?.payload_hash || state.idempotency_record?.status !== 'committed') concerns.push(issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', 'Committed idempotency record mismatch.', 'postcommit_state.idempotency_record'));
  const leakedPaths = findForbiddenPublicPaths(state.party_public_state);
  for (const path of leakedPaths) concerns.push(issue('STAGE25_HIDDEN_PUBLIC_LEAK', `Forbidden public field at ${path}.`, `postcommit_state.party_public_state.${path}`));
  return concerns;
}

export function buildStage25PostcommitValidation(state = {}, input = {}, transactionResult = {}, physicalPlanDigest = null) {
  const concerns = validateStage25PostcommitState(state, input, transactionResult, physicalPlanDigest);
  const checks = {
    party_state_ready: passCheck(state.party_state?.status === 'ready' && state.party_state?.is_ready_for_player === true),
    player_output_allowed: passCheck(state.player_output_ref?.player_visible_message_ready === true),
    current_position_exists: passCheck(isObject(state.current_position)),
    current_clock_exists: passCheck(isObject(state.current_clock)),
    player_character_exists: passCheck(isObject(state.player_character)),
    anchors_match_plan: passCheck(state.integrity?.anchors_match_plan !== false),
    routes_match_plan: passCheck(state.integrity?.routes_match_plan !== false),
    npcs_match_plan: passCheck(state.integrity?.npcs_match_plan !== false),
    items_match_plan: passCheck(state.integrity?.items_match_plan !== false),
    containers_match_plan: passCheck(state.integrity?.containers_match_plan !== false),
    knowledge_hash_matches: passCheck(state.integrity?.knowledge_hash_matches !== false),
    knowledge_counts_match: passCheck(state.integrity?.knowledge_counts_match !== false),
    single_current_knowledge_map: passCheck(state.integrity?.single_current_knowledge_map !== false),
    visible_context_digest_matches: passCheck(state.integrity?.visible_context_digest_matches !== false),
    narrator_prose_digest_matches: passCheck(state.integrity?.narrator_prose_digest_matches !== false),
    audit_snapshots_complete: passCheck(state.integrity?.audit_snapshots_complete !== false),
    source_trace_complete: passCheck(state.integrity?.source_trace_complete !== false),
    hidden_public_boundary_valid: passCheck(findForbiddenPublicPaths(state.party_public_state).length === 0),
    idempotency_record_committed: passCheck(state.idempotency_record?.status === 'committed')
  };
  for (const key of REQUIRED_POSTCOMMIT_CHECKS) {
    if (checks[key]?.pass !== true && !concerns.some((item) => item.path === `checks.${key}`)) concerns.push(issue('STAGE25_POSTCOMMIT_CHECK_FAILED', `Postcommit check failed: ${key}.`, `checks.${key}`));
  }
  return {
    version: 1,
    schema: STAGE25_POSTCOMMIT_SCHEMA,
    request_id: input.request_id ?? null,
    party_id: state.party_id ?? null,
    transaction_id: state.transaction_id ?? null,
    physical_write_plan_digest: physicalPlanDigest,
    pass: concerns.length === 0,
    checks,
    concerns,
    evidence: concerns.length === 0 ? ['Committed live party state passed Stage 25 postcommit validation.'] : []
  };
}

export async function runStage25PartyCommitBlock({
  input,
  physicalPlanAdapter = materializeStage25PhysicalPlan,
  idempotencyChecker,
  dryRunExecutor,
  transactionExecutor,
  postcommitReader
} = {}) {
  let phase = 'input_validation';
  let preflight = null;
  let dryRunResult = null;
  let gateResult = null;
  let transactionResult = null;
  let postcommitState = null;
  let postcommitValidation = null;
  try {
    preflight = buildStage25CommitPreflight(input, {
      physicalPlanAdapter,
      idempotencyChecker,
      dryRunExecutor,
      transactionExecutor,
      postcommitReader
    });
    if (preflight.pass !== true) return buildStage25Failure({ input, phase: 'preflight', concerns: preflight.concerns, preflight });

    const physicalPlan = deepFreeze(safeClone(preflight.physical_write_plan));
    const physicalDigest = preflight.digests.physical_plan_digest;

    phase = 'idempotency';
    const idempotencyResult = await idempotencyChecker({
      version: 1,
      schema: 'party_commit_idempotency_input',
      request_id: input.request_id,
      party_creation_context: safeClone(input.party_creation_context),
      logical_plan_digest: preflight.digests.logical_plan_digest,
      physical_write_plan_digest: physicalDigest
    });
    const idempotencyConcerns = validateIdempotencyResult(idempotencyResult, input, physicalDigest);
    if (idempotencyConcerns.length > 0) return buildStage25Failure({ input, phase, concerns: idempotencyConcerns, preflight });
    if (idempotencyResult.status === 'replay_committed') {
      const prior = safeClone(idempotencyResult.committed_result);
      const priorConcerns = validateStage25Result(prior);
      if (priorConcerns.length > 0) return buildStage25Failure({ input, phase, concerns: priorConcerns, preflight });
      return prior;
    }

    phase = 'dry_run';
    const dryRunInput = {
      version: 1,
      schema: STAGE25_DRY_RUN_INPUT_SCHEMA,
      request_id: input.request_id,
      party_creation_context: safeClone(input.party_creation_context),
      physical_write_plan: physicalPlan,
      physical_write_plan_digest: physicalDigest,
      party_database_schema: safeClone(input.party_database_schema),
      party_database_schema_digest: input.stage24_result_approval.party_database_schema_digest,
      world_base_reference_snapshot: safeClone(input.world_base_reference_snapshot),
      approved_pipeline_manifest: safeClone(input.approved_pipeline_manifest)
    };
    dryRunResult = await dryRunExecutor(dryRunInput);
    const dryRunConcerns = validateStage25DryRunResult(dryRunResult, input, physicalDigest);
    if (dryRunConcerns.length > 0 || dryRunResult.pass !== true) {
      return buildStage25Failure({ input, phase, concerns: [...dryRunConcerns, ...array(dryRunResult?.concerns)], preflight, dryRunResult });
    }

    gateResult = buildCommitGateResult({ input, preflight, dryRunResult });
    const gateConcerns = validateCommitGateResult(gateResult, input, preflight, dryRunResult);
    if (gateConcerns.length > 0) return buildStage25Failure({ input, phase: 'commit_gate', concerns: gateConcerns, preflight, dryRunResult, gateResult });

    phase = 'transaction';
    const transactionInput = {
      version: 1,
      schema: STAGE25_TRANSACTION_INPUT_SCHEMA,
      request_id: input.request_id,
      party_creation_context: safeClone(input.party_creation_context),
      commit_gate_approval: buildCommitGateApproval(gateResult),
      physical_write_plan: physicalPlan,
      physical_write_plan_digest: physicalDigest,
      party_database_schema: safeClone(input.party_database_schema),
      postconditions: safeClone(input.party_db_write_plan.postconditions)
    };
    transactionResult = await transactionExecutor(transactionInput);
    const transactionConcerns = validateStage25TransactionResult(transactionResult, input, physicalDigest, physicalPlan);
    if (transactionConcerns.length > 0) return buildStage25Failure({ input, phase, concerns: transactionConcerns, preflight, dryRunResult, gateResult, transactionResult, rollback: transactionResult?.rollback });

    phase = 'postcommit';
    const readInput = {
      version: 1,
      schema: STAGE25_POSTCOMMIT_READ_SCHEMA,
      request_id: input.request_id,
      party_id: input.party_creation_context.party_id,
      transaction_id: transactionResult.transaction_id,
      physical_write_plan_digest: physicalDigest,
      party_creation_context: safeClone(input.party_creation_context)
    };
    postcommitState = await postcommitReader(readInput);
    postcommitValidation = buildStage25PostcommitValidation(postcommitState, input, transactionResult, physicalDigest);
    if (postcommitValidation.pass !== true) {
      return buildStage25Failure({ input, phase, concerns: postcommitValidation.concerns, preflight, dryRunResult, gateResult, transactionResult, postcommitState, postcommitValidation, commitStatus: 'commit_error' });
    }

    return buildStage25Success({ input, preflight, dryRunResult, gateResult, transactionResult, postcommitState, postcommitValidation });
  } catch (error) {
    return buildStage25Failure({
      input,
      phase,
      concerns: extractConcerns(error, 'STAGE25_EXECUTION_FAILED', error?.message ?? 'Stage 25 execution failed.'),
      preflight,
      dryRunResult,
      gateResult,
      transactionResult,
      postcommitState,
      postcommitValidation,
      rollback: error?.rollback ?? transactionResult?.rollback
    });
  }
}

export function buildCommitGateResult({ input, preflight, dryRunResult } = {}) {
  const physicalDigest = preflight?.digests?.physical_plan_digest ?? null;
  const dryRunDigest = computeStage25Digest(dryRunResult);
  return {
    version: 1,
    schema: STAGE25_GATE_SCHEMA,
    request_id: input.request_id,
    pass: true,
    logical_plan_digest: preflight.digests.logical_plan_digest,
    physical_plan_digest: physicalDigest,
    dry_run_result_digest: dryRunDigest,
    transaction_permission: {
      can_execute_atomic_commit: true,
      can_mark_party_ready: false,
      can_prepare_player_output_after_commit: false
    },
    checks: {
      preflight: passCheck(preflight.pass === true, preflight.evidence),
      audit_chain: preflight.checks.audit_chain_complete,
      schema_validation: preflight.checks.database_schema_validation_passed,
      enum_validation: preflight.checks.enum_validation_passed,
      fk_validation: preflight.checks.fk_validation_passed,
      constraint_validation: preflight.checks.constraints_validation_passed,
      candidate_id_validation: preflight.checks.candidate_ids_valid,
      source_id_validation: preflight.checks.source_ids_valid,
      graph_reference_validation: preflight.checks.graph_references_valid,
      position_validation: preflight.checks.position_valid,
      npc_validation: preflight.checks.npc_references_valid,
      item_container_validation: preflight.checks.item_container_references_valid,
      knowledge_validation: preflight.checks.knowledge_projection_valid,
      hidden_visible_boundary_validation: preflight.checks.hidden_visible_boundary_valid,
      write_plan_order_validation: preflight.checks.write_order_valid,
      dependency_validation: preflight.checks.dependency_graph_valid,
      idempotency_validation: passCheck(true, ['Idempotency check passed before dry-run.']),
      world_base_immutability_validation: preflight.checks.world_base_immutability_valid,
      dry_run_validation: passCheck(dryRunResult.pass === true, dryRunResult.evidence),
      rollback_validation: passCheck(dryRunResult.rollback_completed === true)
    },
    commit_execution_plan: {
      transaction_id: input.party_db_write_plan.transaction.transaction_id,
      physical_plan_digest: physicalDigest,
      write_order: [...array(preflight.physical_write_plan?.transaction?.write_order)],
      rollback_strategy: input.party_db_write_plan.transaction.rollback_strategy,
      postconditions: safeClone(input.party_db_write_plan.postconditions)
    },
    concerns: [],
    evidence: ['Stage 25 preflight and exact-plan dry-run passed.'],
    repair_route: null
  };
}

export function validateCommitGateResult(result = {}, input = {}, preflight = {}, dryRunResult = {}) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE25_GATE_SCHEMA || result.pass !== true) concerns.push(issue('STAGE25_GATE_RESULT_INVALID', 'Successful commit_gate_result is required.', 'commit_gate_result'));
  if (result.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Commit gate request_id mismatch.', 'commit_gate_result.request_id'));
  if (result.logical_plan_digest !== preflight.digests?.logical_plan_digest || result.physical_plan_digest !== preflight.digests?.physical_plan_digest) concerns.push(issue('STAGE25_GATE_DIGEST_MISMATCH', 'Commit gate plan digest mismatch.', 'commit_gate_result'));
  if (result.dry_run_result_digest !== computeStage25Digest(dryRunResult)) concerns.push(issue('STAGE25_GATE_DIGEST_MISMATCH', 'Commit gate dry-run digest mismatch.', 'commit_gate_result.dry_run_result_digest'));
  if (result.transaction_permission?.can_execute_atomic_commit !== true) concerns.push(issue('STAGE25_GATE_PERMISSION_DENIED', 'Atomic commit permission is required.', 'commit_gate_result.transaction_permission.can_execute_atomic_commit'));
  if (result.transaction_permission?.can_mark_party_ready !== false || result.transaction_permission?.can_prepare_player_output_after_commit !== false) concerns.push(issue('STAGE25_GATE_RESULT_INVALID', 'Ready/player-output permissions must remain false before postcommit validation.', 'commit_gate_result.transaction_permission'));
  if (result.repair_route != null || array(result.concerns).length !== 0 || array(result.evidence).length === 0) concerns.push(issue('STAGE25_GATE_RESULT_INVALID', 'Successful commit gate concerns/evidence/route are inconsistent.', 'commit_gate_result'));
  for (const [key, value] of Object.entries(result.checks ?? {})) if (value?.pass !== true) concerns.push(issue('STAGE25_GATE_CHECK_FAILED', `Commit gate check failed: ${key}.`, `commit_gate_result.checks.${key}`));
  return concerns;
}

export function buildCommitGateApproval(gateResult = {}) {
  return {
    version: 1,
    schema: 'commit_gate_approval',
    request_id: gateResult.request_id ?? null,
    pass: gateResult.pass === true,
    logical_plan_digest: gateResult.logical_plan_digest ?? null,
    physical_plan_digest: gateResult.physical_plan_digest ?? null,
    dry_run_result_digest: gateResult.dry_run_result_digest ?? null,
    transaction_id: gateResult.commit_execution_plan?.transaction_id ?? null,
    can_execute_atomic_commit: gateResult.transaction_permission?.can_execute_atomic_commit === true
  };
}

export function validateStage25Result(result = {}) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE25_RESULT_SCHEMA) return [issue('STAGE25_RESULT_INVALID', `Expected ${STAGE25_RESULT_SCHEMA} version 1.`, 'stage25_result')];
  if (result.pass !== true || result.commit_status !== 'committed') concerns.push(issue('STAGE25_RESULT_INVALID', 'Successful Stage 25 result must be committed.', 'stage25_result.commit_status'));
  if (result.transaction_result?.commit_status !== 'committed' || result.postcommit_validation?.pass !== true) concerns.push(issue('STAGE25_RESULT_INVALID', 'Transaction and postcommit validation must pass.', 'stage25_result'));
  for (const key of ['can_start_stage_26', 'can_show_player_output', 'can_accept_player_input']) if (result.handoff_permission?.[key] !== true) concerns.push(issue('STAGE25_RESULT_INVALID', `handoff_permission.${key} must be true.`, `stage25_result.handoff_permission.${key}`));
  if (result.physical_plan_digest !== result.transaction_result?.physical_write_plan_digest || result.physical_plan_digest !== result.postcommit_validation?.physical_write_plan_digest) concerns.push(issue('STAGE25_RESULT_DIGEST_MISMATCH', 'Stage 25 physical plan digest chain mismatch.', 'stage25_result.physical_plan_digest'));
  if (result.postcommit_state_digest !== computeStage25Digest(result.postcommit_state)) concerns.push(issue('STAGE25_RESULT_DIGEST_MISMATCH', 'Stage 25 postcommit state digest mismatch.', 'stage25_result.postcommit_state_digest'));
  if (result.party_start_committed_digest !== computeStage25Digest(result.party_start_committed)) concerns.push(issue('STAGE25_RESULT_DIGEST_MISMATCH', 'Stage 25 committed-state digest mismatch.', 'stage25_result.party_start_committed_digest'));
  if (result.party_public_state_digest !== computeStage25Digest(result.party_public_state)) concerns.push(issue('STAGE25_RESULT_DIGEST_MISMATCH', 'Stage 25 public read-model digest mismatch.', 'stage25_result.party_public_state_digest'));
  if (computeStage25Digest(result.postcommit_state?.party_public_state) !== result.party_public_state_digest) concerns.push(issue('STAGE25_RESULT_DIGEST_MISMATCH', 'Stage 25 public read model is not the one embedded in postcommit state.', 'stage25_result.postcommit_state.party_public_state'));
  return concerns;
}

export function validateStage25ToStage26Handoff(result = {}) {
  const concerns = validateStage25Result(result);
  if (result.party_start_committed?.commit_status !== 'committed') concerns.push(issue('STAGE25_STAGE26_HANDOFF_INVALID', 'party_start_committed is required.', 'stage25_result.party_start_committed'));
  if (result.party_start_committed?.party_id !== result.party_id || result.party_start_committed?.transaction_id !== result.transaction_id) concerns.push(issue('STAGE25_STAGE26_HANDOFF_INVALID', 'Committed party identifiers mismatch.', 'stage25_result.party_start_committed'));
  if (result.party_public_state?.schema !== STAGE25_PUBLIC_READ_MODEL_SCHEMA || result.party_public_state?.version !== 1) concerns.push(issue('STAGE25_STAGE26_HANDOFF_INVALID', 'Committed public read model is required.', 'stage25_result.party_public_state'));
  if (result.party_public_state?.request_id !== result.request_id || result.party_public_state?.party_id !== result.party_id || result.party_public_state?.transaction_id !== result.transaction_id) concerns.push(issue('STAGE25_STAGE26_HANDOFF_INVALID', 'Committed public read-model identifiers mismatch.', 'stage25_result.party_public_state'));
  return concerns;
}

export function buildStage25Approval(result = {}) {
  return {
    version: 1,
    schema: STAGE25_APPROVAL_SCHEMA,
    request_id: result.request_id ?? null,
    pass: result.pass === true,
    commit_status: result.commit_status ?? null,
    party_id: result.party_id ?? null,
    transaction_id: result.transaction_id ?? null,
    physical_plan_digest: result.physical_plan_digest ?? null,
    postcommit_state_digest: result.postcommit_state_digest ?? null,
    party_start_committed_digest: result.party_start_committed_digest ?? null,
    party_public_state_digest: result.party_public_state_digest ?? null,
    permissions: safeClone(result.handoff_permission ?? {})
  };
}

export function validateProvidedStage25Result() {
  throw new Error('Provided Stage 25 gate/transaction/postcommit/committed output is forbidden in all environments. Stub Stage 25 infrastructure executors instead.');
}

function buildStage25Success({ input, preflight, dryRunResult, gateResult, transactionResult, postcommitState, postcommitValidation }) {
  const committedPublicReadModel = buildCommittedPublicReadModel(postcommitState, input.request_id);
  const normalizedPostcommitState = {
    ...safeClone(postcommitState),
    party_public_state: committedPublicReadModel
  };
  const partyStartCommitted = {
    version: 1,
    schema: 'party_start_committed',
    request_id: input.request_id,
    commit_status: 'committed',
    party_id: normalizedPostcommitState.party_id,
    transaction_id: normalizedPostcommitState.transaction_id,
    party_state: safeClone(normalizedPostcommitState.party_state),
    current_position: safeClone(normalizedPostcommitState.current_position),
    current_clock: safeClone(normalizedPostcommitState.current_clock),
    player_output_ref: safeClone(normalizedPostcommitState.player_output_ref)
  };
  const result = {
    version: 1,
    schema: STAGE25_RESULT_SCHEMA,
    request_id: input.request_id,
    pass: true,
    commit_status: 'committed',
    party_id: postcommitState.party_id,
    transaction_id: postcommitState.transaction_id,
    idempotency_key: input.party_creation_context.idempotency_key,
    payload_hash: input.party_creation_context.payload_hash,
    logical_plan_digest: preflight.digests.logical_plan_digest,
    physical_plan_digest: preflight.digests.physical_plan_digest,
    dry_run_result_digest: computeStage25Digest(dryRunResult),
    transaction_result_digest: computeStage25Digest(transactionResult),
    postcommit_state_digest: computeStage25Digest(normalizedPostcommitState),
    party_start_committed_digest: computeStage25Digest(partyStartCommitted),
    party_public_state_digest: computeStage25Digest(committedPublicReadModel),
    commit_preflight: stripPhysicalPlan(preflight),
    physical_plan_mapping_report: safeClone(preflight.physical_plan_mapping_report),
    dry_run_result: safeClone(dryRunResult),
    commit_gate_result: safeClone(gateResult),
    transaction_result: safeClone(transactionResult),
    postcommit_state: safeClone(normalizedPostcommitState),
    postcommit_validation: safeClone(postcommitValidation),
    party_start_committed: partyStartCommitted,
    party_public_state: safeClone(committedPublicReadModel),
    handoff_permission: {
      can_start_stage_26: true,
      can_show_player_output: true,
      can_accept_player_input: true
    }
  };
  return deepFreeze(result);
}


export function buildCommittedPublicReadModel(postcommitState = {}, requestId = null) {
  const source = isObject(postcommitState.party_public_state) ? safeClone(postcommitState.party_public_state) : {};
  return deepFreeze({
    ...source,
    version: 1,
    schema: STAGE25_PUBLIC_READ_MODEL_SCHEMA,
    request_id: requestId ?? postcommitState.request_id ?? null,
    party_id: postcommitState.party_id ?? null,
    transaction_id: postcommitState.transaction_id ?? null,
    current_turn_number: postcommitState.party_state?.current_turn_number ?? source.current_turn_number ?? 0,
    current_position_ref: safeClone(postcommitState.current_position ?? source.current_position_ref ?? null),
    current_clock_ref: safeClone(postcommitState.current_clock ?? source.current_clock_ref ?? null),
    read_model_source: 'live_postcommit_readback'
  });
}

function buildStage25Failure({
  input,
  phase,
  concerns = [],
  preflight = null,
  dryRunResult = null,
  gateResult = null,
  transactionResult = null,
  postcommitState = null,
  postcommitValidation = null,
  rollback = null,
  commitStatus = null
} = {}) {
  const normalized = normalizeConcerns(concerns);
  const rollbackState = {
    attempted: rollback?.attempted === true || transactionResult?.rollback?.attempted === true,
    completed: rollback?.completed === true || transactionResult?.rollback?.completed === true
  };
  const status = commitStatus ?? (rollbackState.completed ? 'rolled_back' : phase === 'postcommit' ? 'commit_error' : 'blocked');
  return {
    version: 1,
    schema: STAGE25_RESULT_SCHEMA,
    request_id: input?.request_id ?? null,
    pass: false,
    commit_status: status,
    failed_phase: phase ?? 'unknown',
    concerns: normalized,
    evidence: normalized.map((item) => item.message),
    rollback: rollbackState,
    party_state_status: status === 'commit_error' ? 'commit_error' : status === 'rolled_back' ? 'rolled_back' : 'not_created',
    player_output_status: 'blocked',
    repair_route: {
      return_to_stage: 24,
      repair_kind: routeKindForPhase(phase),
      reason: normalized.map((item) => item.code).join(',') || 'Stage 25 blocked.'
    },
    commit_preflight: preflight ? stripPhysicalPlan(preflight) : null,
    dry_run_result: safeClone(dryRunResult),
    commit_gate_result: safeClone(gateResult),
    transaction_result: safeClone(transactionResult),
    postcommit_state: safeClone(postcommitState),
    postcommit_validation: safeClone(postcommitValidation),
    handoff_permission: {
      can_start_stage_26: false,
      can_show_player_output: false,
      can_accept_player_input: false
    }
  };
}

function validatePartyCreationContext(context, requestId) {
  const concerns = [];
  if (!isObject(context)) return [issue('STAGE25_PARTY_CONTEXT_INVALID', 'party_creation_context is required.', 'party_creation_context')];
  for (const key of ['party_id', 'player_character_id', 'schema_version', 'idempotency_key', 'payload_hash']) {
    if (!text(context[key])) concerns.push(issue('STAGE25_PARTY_CONTEXT_INVALID', `party_creation_context.${key} is required.`, `party_creation_context.${key}`));
  }
  if (text(context.payload_hash) && !SHA256_PATTERN.test(context.payload_hash)) concerns.push(issue('STAGE25_IDEMPOTENCY_CONTEXT_INVALID', 'party_creation_context.payload_hash must be sha256.', 'party_creation_context.payload_hash'));
  if (context.request_id != null && context.request_id !== requestId) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'party_creation_context.request_id mismatch.', 'party_creation_context.request_id'));
  return concerns;
}

function validateStage24ApprovalBinding(input) {
  const concerns = [];
  const approval = input.stage24_result_approval;
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== 'stage24_party_db_write_plan_approval' || approval.pass !== true) return [issue('STAGE25_STAGE24_APPROVAL_INVALID', 'Successful Stage 24 approval is required.', 'stage24_result_approval')];
  if (approval.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Stage 24 approval request_id mismatch.', 'stage24_result_approval.request_id'));
  for (const key of ['can_send_to_commit_gate', 'can_execute_transaction', 'can_write_party_snapshots']) if (approval.permissions?.[key] !== true) concerns.push(issue('STAGE25_STAGE24_PERMISSION_DENIED', `Stage 24 permission ${key} must be true.`, `stage24_result_approval.permissions.${key}`));
  if (approval.party_db_write_plan_digest !== computePartyDbWritePlanDigest(input.party_db_write_plan)) concerns.push(issue('STAGE25_PLAN_DIGEST_MISMATCH', 'Stage 24 plan digest mismatch.', 'party_db_write_plan'));
  if (approval.party_database_schema_digest !== computeStage24Digest(input.party_database_schema)) concerns.push(issue('STAGE25_DB_SCHEMA_DIGEST_MISMATCH', 'Party database schema digest mismatch.', 'party_database_schema'));
  if (approval.world_base_reference_digest !== computeStage24Digest(input.world_base_reference_snapshot)) concerns.push(issue('STAGE25_WORLD_DIGEST_MISMATCH', 'World-base reference digest mismatch.', 'world_base_reference_snapshot'));
  if (approval.approved_pipeline_manifest_digest !== computeStage24Digest(input.approved_pipeline_manifest)) concerns.push(issue('STAGE25_MANIFEST_DIGEST_MISMATCH', 'Approved pipeline manifest digest mismatch.', 'approved_pipeline_manifest'));
  const tx = input.party_db_write_plan?.transaction;
  if (tx?.party_id !== input.party_creation_context?.party_id || tx?.idempotency_key !== input.party_creation_context?.idempotency_key || tx?.is_atomic !== true || tx?.is_dry_run_first !== true) concerns.push(issue('STAGE25_TRANSACTION_CONTRACT_INVALID', 'Stage 24 transaction contract does not match party_creation_context.', 'party_db_write_plan.transaction'));
  return concerns;
}

function validateManifestStructure(manifest, requestId) {
  const concerns = [];
  if (!isObject(manifest) || manifest.version !== 1 || manifest.schema !== STAGE24_MANIFEST_SCHEMA || manifest.request_id !== requestId) return [issue('STAGE25_MANIFEST_INVALID', 'Approved pipeline manifest schema/version/request_id is invalid.', 'approved_pipeline_manifest')];
  const entries = array(manifest.artifacts);
  const byKey = new Map();
  const stageKeys = new Set();
  for (const entry of entries) {
    if (!text(entry?.artifact_key) || !Number.isInteger(entry?.stage_id) || !text(entry?.artifact_schema) || !SHA256_PATTERN.test(entry?.artifact_digest ?? '')) {
      concerns.push(issue('STAGE25_MANIFEST_INVALID', 'Manifest entry is incomplete.', 'approved_pipeline_manifest.artifacts'));
      continue;
    }
    if (byKey.has(entry.artifact_key)) concerns.push(issue('STAGE25_MANIFEST_INVALID', `Duplicate manifest artifact_key ${entry.artifact_key}.`, 'approved_pipeline_manifest.artifacts'));
    const stageKey = `${entry.stage_id}:${entry.artifact_schema}`;
    if (stageKeys.has(stageKey)) concerns.push(issue('STAGE25_MANIFEST_INVALID', `Duplicate manifest stage/schema ${stageKey}.`, 'approved_pipeline_manifest.artifacts'));
    byKey.set(entry.artifact_key, entry);
    stageKeys.add(stageKey);
  }
  for (const key of REQUIRED_MANIFEST_ARTIFACT_KEYS) if (!byKey.has(key)) concerns.push(issue('STAGE25_MANIFEST_INVALID', `Manifest artifact missing: ${key}.`, 'approved_pipeline_manifest.artifacts'));
  for (const key of REQUIRED_AUDIT_ARTIFACT_KEYS) if (!byKey.has(key)) concerns.push(issue('STAGE25_AUDIT_CHAIN_INCOMPLETE', `Audit-chain artifact missing: ${key}.`, 'approved_pipeline_manifest.artifacts'));
  return concerns;
}

function validatePhysicalMaterializationResult(result, input) {
  const concerns = [];
  if (!isObject(result?.physical_write_plan) || result.physical_write_plan.schema !== STAGE25_PHYSICAL_PLAN_SCHEMA) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'physical_write_plan is invalid.', 'physical_write_plan'));
  if (!SHA256_PATTERN.test(result?.physical_write_plan_digest ?? '') || result.physical_write_plan_digest !== computeStage25Digest(result.physical_write_plan)) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'physical_write_plan_digest mismatch.', 'physical_write_plan_digest'));
  if (result?.mapping_report?.schema !== STAGE25_MAPPING_REPORT_SCHEMA || result.mapping_report.physical_plan_digest !== result.physical_write_plan_digest || result.mapping_report.logical_plan_digest !== input.stage24_result_approval?.party_db_write_plan_digest) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'Physical plan mapping report is invalid.', 'mapping_report'));
  return concerns;
}

function validateMappingInvariants(logical, physical) {
  const concerns = [];
  const logicalBatches = array(logical.write_batches);
  const physicalBatches = array(physical.write_batches);
  if (logicalBatches.length !== physicalBatches.length) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'Schema adapter changed batch count.', 'physical_write_plan.write_batches'));
  const physicalById = new Map(physicalBatches.map((batch) => [batch.batch_id, batch]));
  for (const batch of logicalBatches) {
    const adapted = physicalById.get(batch.batch_id);
    if (!adapted) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', `Schema adapter removed batch ${batch.batch_id}.`, 'physical_write_plan.write_batches'));
    else if (array(adapted.records).length !== array(batch.records).length) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', `Schema adapter changed record count for ${batch.batch_id}.`, 'physical_write_plan.write_batches'));
    else if (adapted.operation_mode !== batch.operation_mode || canonicalStage25Json(adapted.depends_on_batches ?? []) !== canonicalStage25Json(batch.depends_on_batches ?? [])) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', `Schema adapter changed operation/dependencies for ${batch.batch_id}.`, 'physical_write_plan.write_batches'));
  }
  if (canonicalStage25Json(physical.transaction?.write_order) !== canonicalStage25Json(logical.transaction?.write_order)) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'Schema adapter changed write_order.', 'physical_write_plan.transaction.write_order'));
  return concerns;
}

export function validatePhysicalWritePlan(plan = {}, schema = {}, worldSnapshot = null) {
  const concerns = [];
  const schemaIndex = buildSchemaIndex(schema, worldSnapshot);
  const graph = validateBatchGraph(plan);
  concerns.push(...graph);
  const safety = validatePartyAdapterTargetSafety(plan);
  for (const item of array(safety.concerns)) concerns.push(issue(item.code === 'PARTY_ADAPTER_WORLD_BASE_WRITE_FORBIDDEN' ? 'STAGE25_WORLD_BASE_MUTATION' : 'STAGE25_HIDDEN_PUBLIC_LEAK', item.message, item.path ?? 'physical_write_plan'));

  for (const batch of array(plan.write_batches)) {
    const table = schemaIndex.tables.get(batch.target_table);
    if (!table) {
      concerns.push(issue('STAGE25_UNKNOWN_TABLE', `Unknown party table ${batch.target_table}.`, `write_batches.${batch.batch_id}.target_table`));
      continue;
    }
    const allowedOps = table.allowedOperations.size ? table.allowedOperations : schemaIndex.globalOperations;
    if (!allowedOps.has(batch.operation_mode)) concerns.push(issue('STAGE25_INVALID_OPERATION', `Operation ${batch.operation_mode} is not allowed for ${batch.target_table}.`, `write_batches.${batch.batch_id}.operation_mode`));
    for (const record of array(batch.records)) {
      for (const key of Object.keys(record)) if (!table.columns.has(key)) concerns.push(issue('STAGE25_UNKNOWN_COLUMN', `Unknown column ${batch.target_table}.${key}.`, `write_batches.${batch.batch_id}.records.${key}`));
      if (['insert_only', 'snapshot_insert', 'upsert_with_idempotency'].includes(batch.operation_mode)) {
        for (const required of table.requiredColumns) if (!(required in record) || record[required] == null) concerns.push(issue('STAGE25_CONSTRAINT_INVALID', `Required column ${batch.target_table}.${required} is missing.`, `write_batches.${batch.batch_id}.records.${required}`));
      }
      if (batch.operation_mode === 'update_only' && !text(record.id)) concerns.push(issue('STAGE25_CONSTRAINT_INVALID', `${batch.batch_id} update_only requires id.`, `write_batches.${batch.batch_id}.records.id`));
      concerns.push(...validateRecordTypes(record, batch.target_table, table.columns));
      concerns.push(...validateRecordEnums(record, batch.target_table, schemaIndex));
      concerns.push(...validateRecordChecks(record, batch.target_table, schemaIndex));
      concerns.push(...validateApprovedRecordRefs(record, schemaIndex.worldSnapshot));
    }
    if (array(batch.source_trace).length === 0) concerns.push(issue('STAGE25_SOURCE_TRACE_MISSING', `Batch ${batch.batch_id} requires source_trace.`, `write_batches.${batch.batch_id}.source_trace`));
  }
  concerns.push(...validatePlanUniqueConstraints(plan, schemaIndex));
  concerns.push(...validatePlanForeignKeys(plan, schemaIndex));
  const knowledge = plan.knowledge_projection_validation;
  if (!isObject(knowledge) || canonicalStage25Json(knowledge.expected_counts) !== canonicalStage25Json(knowledge.planned_counts) || canonicalStage25Json(knowledge.expected_record_keys) !== canonicalStage25Json(knowledge.planned_record_keys) || !text(knowledge.source_content_hash)) concerns.push(issue('STAGE25_KNOWLEDGE_PROJECTION_INVALID', 'Knowledge projection counts/keys/hash do not match.', 'knowledge_projection_validation'));
  const batchIds = array(plan.write_batches).map((batch) => batch.batch_id);
  if (!isObject(plan.rollback_plan) || plan.rollback_plan.strategy !== 'full_transaction_rollback' || !sameScalarSet(plan.rollback_plan.covered_batch_ids, batchIds)) concerns.push(issue('STAGE25_ROLLBACK_INVALID', 'Rollback plan must cover every batch.', 'rollback_plan'));
  if (array(plan.postconditions).length === 0) concerns.push(issue('STAGE25_POSTCONDITIONS_MISSING', 'Stage 25 requires write-plan postconditions.', 'postconditions'));
  if (array(plan.source_trace).length === 0) concerns.push(issue('STAGE25_SOURCE_TRACE_MISSING', 'Top-level source_trace is required.', 'source_trace'));
  return concerns;
}

function buildSchemaIndex(schema, worldSnapshot = null) {
  const tables = new Map();
  const globalOperations = new Set(array(schema.allowed_operations));
  const topColumns = array(schema.columns);
  for (const raw of array(schema.tables)) {
    const name = raw.name ?? raw.table_name;
    const embedded = array(raw.columns);
    const external = topColumns.filter((column) => (column.table_name ?? column.table) === name);
    const columns = new Map();
    const requiredColumns = new Set();
    for (const column of [...embedded, ...external]) {
      const columnName = typeof column === 'string' ? column : column.name ?? column.column_name;
      if (!columnName) continue;
      columns.set(columnName, column);
      const nullable = typeof column === 'string' ? true : column.nullable;
      const generated = typeof column === 'string' ? false : column.generated === true || column.default != null;
      if ((nullable === false || nullable === 'no') && !generated) requiredColumns.add(columnName);
    }
    tables.set(name, {
      raw,
      columns,
      requiredColumns,
      allowedOperations: new Set(array(raw.allowed_operations ?? raw.allowedOperations))
    });
  }
  const enumMap = new Map();
  for (const item of array(schema.enum_definitions ?? schema.enums)) {
    const key = item.column ? `${item.table ?? item.table_name}.${item.column ?? item.column_name}` : item.enum_name;
    const values = enumMap.get(key) ?? new Set();
    for (const value of array(item.values ?? [item.value])) if (value != null) values.add(value);
    enumMap.set(key, values);
  }
  return {
    tables,
    globalOperations,
    enumMap,
    foreignKeys: array(schema.foreign_keys ?? schema.relationships),
    uniqueConstraints: array(schema.unique_constraints),
    checkConstraints: array(schema.check_constraints ?? schema.validation_rules),
    worldSnapshot
  };
}

function validateRecordTypes(record, tableName, columns) {
  const concerns = [];
  for (const [key, value] of Object.entries(record)) {
    if (value == null) continue;
    const column = columns.get(key);
    if (!column || typeof column === 'string') continue;
    const type = String(column.data_type ?? column.type ?? '').toUpperCase();
    let valid = true;
    if (/^(?:SMALLINT|INTEGER|INT|BIGINT|NUMERIC|DECIMAL|REAL|DOUBLE)/u.test(type)) valid = typeof value === 'number' && Number.isFinite(value);
    else if (/^(?:BOOLEAN|BOOL)/u.test(type)) valid = typeof value === 'boolean';
    else if (/^(?:TEXT|VARCHAR|CHAR|UUID)/u.test(type)) valid = typeof value === 'string';
    else if (/^(?:JSON|JSONB)/u.test(type)) valid = typeof value === 'object' || typeof value === 'string';
    else if (/^(?:TIMESTAMP|DATE|TIME)/u.test(type)) valid = typeof value === 'string' || value instanceof Date;
    if (!valid) concerns.push(issue('STAGE25_TYPE_INVALID', `Invalid value type for ${tableName}.${key}; expected ${type}.`, `${tableName}.${key}`));
  }
  return concerns;
}

function validateRecordEnums(record, tableName, schemaIndex) {
  const concerns = [];
  for (const [key, value] of Object.entries(record)) {
    const values = schemaIndex.enumMap.get(`${tableName}.${key}`);
    if (values?.size && value != null && !values.has(value)) concerns.push(issue('STAGE25_ENUM_INVALID', `Invalid enum ${tableName}.${key}=${String(value)}.`, `${tableName}.${key}`));
  }
  return concerns;
}

function validateRecordChecks(record, tableName, schemaIndex) {
  const concerns = [];
  for (const check of schemaIndex.checkConstraints) {
    const checkTable = check.table ?? check.table_name;
    if (checkTable && checkTable !== tableName) continue;
    const column = check.column ?? check.column_name;
    if (!column || !(column in record) || record[column] == null) continue;
    const value = record[column];
    const allowed = array(check.allowed_values ?? check.values);
    if (allowed.length > 0 && !allowed.includes(value)) concerns.push(issue('STAGE25_CHECK_CONSTRAINT_INVALID', `Check constraint rejected ${tableName}.${column}.`, `${tableName}.${column}`));
    if (Number.isFinite(Number(check.min)) && Number(value) < Number(check.min)) concerns.push(issue('STAGE25_CHECK_CONSTRAINT_INVALID', `${tableName}.${column} is below minimum.`, `${tableName}.${column}`));
    if (Number.isFinite(Number(check.max)) && Number(value) > Number(check.max)) concerns.push(issue('STAGE25_CHECK_CONSTRAINT_INVALID', `${tableName}.${column} exceeds maximum.`, `${tableName}.${column}`));
  }
  return concerns;
}

function validatePlanUniqueConstraints(plan, schemaIndex) {
  const concerns = [];
  const byTable = recordsByTable(plan);
  for (const constraint of schemaIndex.uniqueConstraints) {
    const table = constraint.table ?? constraint.table_name;
    const columns = array(constraint.columns ?? constraint.column_names ?? (constraint.column ? [constraint.column] : []));
    if (!table || columns.length === 0) continue;
    const seen = new Set();
    for (const record of byTable.get(table) ?? []) {
      const values = columns.map((column) => record[column]);
      if (values.some((value) => value == null)) continue;
      const key = canonicalStage25Json(values);
      if (seen.has(key)) concerns.push(issue('STAGE25_UNIQUE_CONSTRAINT_INVALID', `Duplicate values for ${table} unique constraint (${columns.join(',')}).`, table));
      seen.add(key);
    }
  }
  return concerns;
}

function validatePlanForeignKeys(plan, schemaIndex) {
  const concerns = [];
  const byTable = recordsByTable(plan);
  for (const fk of schemaIndex.foreignKeys) {
    const fromTable = fk.from_table ?? fk.table ?? fk.source_table;
    const fromColumn = fk.from_column ?? fk.column ?? fk.source_column;
    const toTable = fk.to_table ?? fk.references_table ?? fk.target_table;
    const toColumn = fk.to_column ?? fk.references_column ?? fk.target_column ?? 'id';
    if (!fromTable || !fromColumn || !toTable || !byTable.has(fromTable) || !byTable.has(toTable)) continue;
    const targets = new Set((byTable.get(toTable) ?? []).map((record) => record[toColumn]).filter((value) => value != null));
    for (const record of byTable.get(fromTable) ?? []) {
      const value = record[fromColumn];
      if (value != null && !targets.has(value)) concerns.push(issue('STAGE25_FK_INVALID', `In-plan FK ${fromTable}.${fromColumn}=${String(value)} does not resolve to ${toTable}.${toColumn}.`, `${fromTable}.${fromColumn}`));
    }
  }
  return concerns;
}

function recordsByTable(plan) {
  const map = new Map();
  for (const batch of array(plan.write_batches)) {
    const list = map.get(batch.target_table) ?? [];
    list.push(...array(batch.records));
    map.set(batch.target_table, list);
  }
  return map;
}

function validateApprovedRecordRefs(record, worldSnapshot) {
  if (!isObject(worldSnapshot)) return [];
  const concerns = [];
  const checks = [
    ['region_id', 'allowed_region_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['world_base_region_id', 'allowed_region_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['canonical_node_id', 'allowed_graph_node_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['canonical_edge_id', 'allowed_graph_edge_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['route_id', 'allowed_graph_edge_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['anchor_id', 'allowed_graph_node_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['canonical_anchor_id', 'allowed_graph_node_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['npc_candidate_id', 'allowed_npc_candidate_ids', 'STAGE25_NPC_REFERENCE_INVALID'],
    ['canonical_npc_id', 'allowed_npc_candidate_ids', 'STAGE25_NPC_REFERENCE_INVALID'],
    ['item_profile_id', 'allowed_item_profile_ids', 'STAGE25_ITEM_CONTAINER_REFERENCE_INVALID'],
    ['canonical_item_template_id', 'allowed_item_profile_ids', 'STAGE25_ITEM_CONTAINER_REFERENCE_INVALID'],
    ['container_profile_id', 'allowed_container_profile_ids', 'STAGE25_ITEM_CONTAINER_REFERENCE_INVALID'],
    ['property_rule_id', 'allowed_property_rule_ids', 'STAGE25_ITEM_CONTAINER_REFERENCE_INVALID'],
    ['source_id', 'allowed_source_ids', 'STAGE25_SOURCE_ID_INVALID']
  ];
  for (const [key, allowKey, code] of checks) {
    if (record[key] == null) continue;
    const allowed = new Set(array(worldSnapshot[allowKey]));
    if (allowed.size > 0 && !allowed.has(record[key])) concerns.push(issue(code, `Unapproved reference ${key}=${record[key]}.`, key));
  }
  return concerns;
}

function validateBatchGraph(plan) {
  const concerns = [];
  const batches = array(plan.write_batches);
  const byId = new Map();
  for (const batch of batches) {
    if (!text(batch.batch_id) || byId.has(batch.batch_id)) concerns.push(issue('STAGE25_WRITE_ORDER_INVALID', `Duplicate or missing batch_id ${String(batch.batch_id)}.`, 'write_batches'));
    else byId.set(batch.batch_id, batch);
  }
  const order = array(plan.transaction?.write_order);
  if (order.length !== batches.length || new Set(order).size !== order.length || !sameScalarSet(order, [...byId.keys()])) concerns.push(issue('STAGE25_WRITE_ORDER_INVALID', 'write_order must contain every batch exactly once.', 'transaction.write_order'));
  const positions = new Map(order.map((id, index) => [id, index]));
  for (const batch of batches) {
    for (const dep of array(batch.depends_on_batches)) {
      if (!byId.has(dep) || positions.get(dep) >= positions.get(batch.batch_id)) concerns.push(issue('STAGE25_DEPENDENCY_INVALID', `Dependency ${dep} must exist and precede ${batch.batch_id}.`, `write_batches.${batch.batch_id}.depends_on_batches`));
    }
  }
  if (hasDependencyCycle(byId)) concerns.push(issue('STAGE25_DEPENDENCY_INVALID', 'Batch dependency graph contains a cycle.', 'write_batches'));
  return concerns;
}

function validateIdempotencyResult(result, input, physicalDigest) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE25_IDEMPOTENCY_SCHEMA || result.pass !== true) return [issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', `Successful ${STAGE25_IDEMPOTENCY_SCHEMA} is required.`, 'idempotency_result')];
  if (!['new', 'replay_committed'].includes(result.status)) concerns.push(issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', 'Unsupported idempotency status.', 'idempotency_result.status'));
  if (result.idempotency_key !== input.party_creation_context?.idempotency_key || result.payload_hash !== input.party_creation_context?.payload_hash || result.physical_write_plan_digest !== physicalDigest) concerns.push(issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', 'Idempotency binding mismatch.', 'idempotency_result'));
  if (result.status === 'replay_committed' && !isObject(result.committed_result)) concerns.push(issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', 'replay_committed requires committed_result.', 'idempotency_result.committed_result'));
  return concerns;
}

function buildStage25ErrorConcern(error, code, fallback) {
  return issue(code, error?.message ?? fallback, null);
}

function extractConcerns(error, code, fallback) {
  if (Array.isArray(error?.concerns) && error.concerns.length > 0) return normalizeConcerns(error.concerns);
  return [buildStage25ErrorConcern(error, code, fallback)];
}

function stage25Error(phase, concerns, message) {
  const error = new Error(message);
  error.phase = phase;
  error.concerns = normalizeConcerns(concerns);
  return error;
}

function normalizeConcerns(concerns) {
  return array(concerns).map((item) => isObject(item)
    ? { code: text(item.code) || 'STAGE25_UNKNOWN_ERROR', severity: item.severity ?? 'hard_block', message: text(item.message) || String(item.code ?? 'Stage 25 failure.'), ...(item.path ? { path: item.path } : {}) }
    : issue('STAGE25_UNKNOWN_ERROR', String(item)));
}

function stripPhysicalPlan(preflight) {
  if (!isObject(preflight)) return preflight;
  const next = safeClone(preflight);
  delete next.physical_write_plan;
  return next;
}

function routeKindForPhase(phase) {
  if (['input_validation', 'preflight', 'commit_gate'].includes(phase)) return 'stage24_result_rebuild';
  if (phase === 'dry_run') return 'party_db_write_plan_or_schema_repair';
  if (phase === 'idempotency') return 'manual_idempotency_review';
  if (phase === 'transaction') return 'transaction_infrastructure_or_plan_repair';
  if (phase === 'postcommit') return 'manual_postcommit_recovery';
  return 'stage24_result_rebuild';
}

function hasDependencyCycle(byId) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of array(byId.get(id)?.depends_on_batches)) if (byId.has(dep) && visit(dep)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...byId.keys()].some(visit);
}

function findForbiddenPublicPaths(value, path = '') {
  const results = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => results.push(...findForbiddenPublicPaths(item, `${path}[${index}]`)));
    return results;
  }
  if (!isObject(value)) return results;
  for (const [key, item] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) results.push(nextPath);
    results.push(...findForbiddenPublicPaths(item, nextPath));
  }
  return results;
}

function passCheck(pass, evidence = []) {
  return { pass: pass === true, evidence: array(evidence) };
}

function issue(code, message, path = null) {
  return { code, severity: 'hard_block', message, ...(path ? { path } : {}) };
}

function sameScalarSet(a, b) {
  const left = array(a);
  const right = array(b);
  return left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length && left.every((item) => right.includes(item));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function safeClone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
