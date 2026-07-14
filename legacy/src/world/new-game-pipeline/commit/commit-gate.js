import {
  buildCommitGateResult,
  buildStage25CommitPreflight,
  materializeStage25PhysicalPlan,
  STAGE25_DRY_RUN_INPUT_SCHEMA,
  STAGE25_GATE_SCHEMA,
  validateCommitGateResult,
  validatePhysicalWritePlan,
  validateStage25DryRunResult
} from '../stages/stage25-party-commit.js';

export function auditPartyDbWritePlan() {
  throw new Error('Code-only auditPartyDbWritePlan cannot replace the mandatory independent Stage 24 LLM audit.');
}

export function validatePartyDbWritePlan(writePlan = {}, { party_database_schema, world_base_reference_snapshot } = {}) {
  if (!party_database_schema) {
    return {
      pass: false,
      concerns: [{ code: 'STAGE25_DB_SCHEMA_INVALID', severity: 'hard_block', message: 'party_database_schema is required.' }],
      evidence: [],
      adapted_write_plan: null
    };
  }
  try {
    const materialized = materializeStage25PhysicalPlan({
      logical_plan: writePlan,
      party_database_schema,
      world_base_reference_snapshot
    });
    const concerns = validatePhysicalWritePlan(materialized.physical_write_plan, party_database_schema, world_base_reference_snapshot);
    return {
      pass: concerns.length === 0,
      concerns,
      evidence: concerns.length === 0 ? ['Stage 25 physical plan passed strict technical validation.'] : [],
      adapted_write_plan: materialized.physical_write_plan,
      physical_write_plan_digest: materialized.physical_write_plan_digest,
      mapping_report: materialized.mapping_report
    };
  } catch (error) {
    return {
      pass: false,
      concerns: error.concerns ?? [{ code: 'STAGE25_PHYSICAL_PLAN_INVALID', severity: 'hard_block', message: error.message }],
      evidence: [],
      adapted_write_plan: null
    };
  }
}

export async function runCommitGate(input = {}, {
  physicalPlanAdapter = materializeStage25PhysicalPlan,
  idempotencyChecker,
  dryRun
} = {}) {
  const preflight = buildStage25CommitPreflight(input, {
    physicalPlanAdapter,
    idempotencyChecker,
    dryRunExecutor: dryRun,
    transactionExecutor: async () => {},
    postcommitReader: async () => {}
  });
  if (preflight.pass !== true) return failedGate(input, preflight.concerns, preflight);

  const idempotency = await idempotencyChecker({
    version: 1,
    schema: 'party_commit_idempotency_input',
    request_id: input.request_id,
    party_creation_context: structuredClone(input.party_creation_context),
    logical_plan_digest: preflight.digests.logical_plan_digest,
    physical_write_plan_digest: preflight.digests.physical_plan_digest
  });
  if (idempotency?.pass !== true || !['new', 'replay_committed'].includes(idempotency?.status)) {
    return failedGate(input, idempotency?.concerns ?? [{ code: 'STAGE25_IDEMPOTENCY_RESULT_INVALID', severity: 'hard_block', message: 'Idempotency check failed.' }], preflight);
  }
  if (idempotency.status === 'replay_committed') {
    return failedGate(input, [{ code: 'STAGE25_IDEMPOTENCY_REPLAY_REQUIRES_FULL_BLOCK', severity: 'hard_block', message: 'Replay must be resolved by runStage25PartyCommitBlock.' }], preflight);
  }

  const dryRunInput = {
    version: 1,
    schema: STAGE25_DRY_RUN_INPUT_SCHEMA,
    request_id: input.request_id,
    party_creation_context: structuredClone(input.party_creation_context),
    physical_write_plan: structuredClone(preflight.physical_write_plan),
    physical_write_plan_digest: preflight.digests.physical_plan_digest,
    party_database_schema: structuredClone(input.party_database_schema),
    party_database_schema_digest: input.stage24_result_approval.party_database_schema_digest,
    world_base_reference_snapshot: structuredClone(input.world_base_reference_snapshot),
    approved_pipeline_manifest: structuredClone(input.approved_pipeline_manifest)
  };
  const dryRunResult = await dryRun(dryRunInput);
  const dryRunConcerns = validateStage25DryRunResult(dryRunResult, input, preflight.digests.physical_plan_digest);
  if (dryRunConcerns.length > 0 || dryRunResult.pass !== true) return failedGate(input, [...dryRunConcerns, ...(dryRunResult.concerns ?? [])], preflight, dryRunResult);

  const result = buildCommitGateResult({ input, preflight, dryRunResult });
  const resultConcerns = validateCommitGateResult(result, input, preflight, dryRunResult);
  return resultConcerns.length === 0 ? result : failedGate(input, resultConcerns, preflight, dryRunResult);
}

export function validateStage24ResultShape(result = {}) {
  return result?.version === 1 && result?.schema === 'stage24_party_db_write_plan_result' && result?.pass === true;
}

function failedGate(input, concerns, preflight = null, dryRunResult = null) {
  return {
    version: 1,
    schema: STAGE25_GATE_SCHEMA,
    request_id: input?.request_id ?? null,
    pass: false,
    transaction_permission: {
      can_execute_atomic_commit: false,
      can_mark_party_ready: false,
      can_prepare_player_output_after_commit: false
    },
    checks: {
      preflight: { pass: preflight?.pass === true, evidence: preflight?.evidence ?? [] },
      dry_run_validation: { pass: dryRunResult?.pass === true, evidence: dryRunResult?.evidence ?? [] }
    },
    commit_execution_plan: null,
    concerns: Array.isArray(concerns) ? concerns : [],
    evidence: [],
    repair_route: { return_to_stage: 24, repair_kind: 'stage24_result_rebuild' }
  };
}
