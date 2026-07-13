import { STAGE25_PREFLIGHT_SCHEMA, SHA256_PATTERN } from '../policy/constants.js';
import { validateStage25CommitInput } from '../input/input-boundary.js';
import { materializeStage25PhysicalPlan, validatePhysicalMaterializationResult } from '../physical-plan/index.js';
import { extractConcerns, issue, passCheck, safeClone } from '../shared/utils.js';
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

