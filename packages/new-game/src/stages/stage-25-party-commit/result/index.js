import { buildStage25PartyCommitApproval } from '@rus/contracts';
import { STAGE25_PUBLIC_READ_MODEL_SCHEMA, STAGE25_RESULT_SCHEMA } from '../policy/constants.js';
import { computeStage25Digest } from '../input/input-boundary.js';
import { deepFreeze, isObject, issue, normalizeConcerns, routeKindForPhase, safeClone, stripPhysicalPlan } from '../shared/utils.js';
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
  return buildStage25PartyCommitApproval(result);
}

export function validateProvidedStage25Result() {
  throw new Error('Provided Stage 25 gate/transaction/postcommit/committed output is forbidden in all environments. Stub Stage 25 infrastructure executors instead.');
}

export function buildStage25Success({ input, preflight, dryRunResult, gateResult, transactionResult, postcommitState, postcommitValidation }) {
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

export function buildStage25Failure({
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

