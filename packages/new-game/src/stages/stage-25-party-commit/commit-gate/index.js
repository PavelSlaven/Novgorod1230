import { STAGE25_GATE_SCHEMA } from '../policy/constants.js';
import { computeStage25Digest } from '../input/input-boundary.js';
import { array, isObject, issue, passCheck, safeClone } from '../shared/utils.js';
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

