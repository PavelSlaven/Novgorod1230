import {
  STAGE25_DRY_RUN_INPUT_SCHEMA,
  STAGE25_POSTCOMMIT_READ_SCHEMA,
  STAGE25_TRANSACTION_INPUT_SCHEMA
} from '../policy/constants.js';
import { buildStage25CommitPreflight } from '../preflight/build-preflight.js';
import { materializeStage25PhysicalPlan } from '../physical-plan/index.js';
import { validateIdempotencyResult } from '../idempotency/validation.js';
import { validateStage25DryRunResult } from '../dry-run/validation.js';
import { validateStage25TransactionResult } from '../transaction/validation.js';
import { buildStage25PostcommitValidation } from '../postcommit/validation.js';
import { buildCommitGateApproval, buildCommitGateResult, validateCommitGateResult } from '../commit-gate/index.js';
import { buildStage25Failure, buildStage25Success, validateStage25Result } from '../result/index.js';
import { array, deepFreeze, extractConcerns, safeClone } from '../shared/utils.js';
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

