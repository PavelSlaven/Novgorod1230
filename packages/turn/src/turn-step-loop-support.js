import { isDeepStrictEqual } from 'node:util';
import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';
import { buildTurnStepPreparedChainContext } from './turn-step-prepared-effects.js';
import { requestAndValidateTurnStepPlan } from './turn-step-plan-repair.js';

export async function requestPendingDiscoveryPlan({ request, pendingDiscovery }) {
  if (pendingDiscovery == null) return null;
  const plan = pendingDiscoveryPlan(request, pendingDiscovery);
  return { plan: await requestAndValidateTurnStepPlan({ request,
    turnStepModel: async () => plan }), repaired: false };
}

function pendingDiscoveryPlan(request, pending) {
  const [targetRef, ...remainingTargetRefs] = pending.remainingTargetRefs;
  const operation = { ...structuredClone(pending.operation), target_refs: [targetRef] };
  const continuation = remainingTargetRefs.length === 0 ? structuredClone(pending.after)
    : { remaining_intent: operation.query, depends_on_refs: [], pending_discovery: {
      remaining_target_refs: remainingTargetRefs, after: structuredClone(pending.after) } };
  return {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: operation.query, adaptation: pending.adaptation },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], check: null, continuation, clarification: null,
    direct_result_kind: null, reason_code: 'canonical_discovery_followup',
    reason: 'Code-owned single-target discovery continuation.'
  };
}

export function nextPendingDiscovery({ plan, continuation }) {
  const pending = continuation?.pending_discovery;
  const operation = plan.operations?.length === 1 && plan.operations[0]?.op === 'request_discovery'
    ? plan.operations[0] : null;
  return pending == null || operation == null ? null : {
    operation: { ...structuredClone(operation), target_refs: [] },
    remainingTargetRefs: structuredClone(pending.remaining_target_refs),
    after: structuredClone(pending.after), adaptation: plan.interpretation.adaptation
  };
}

export async function requestPreparedFollowupPlan({ request, preparedFollowup,
  semanticPlanValidator, admitPreparedDomainPlan, workingProjection,
  preparedChainContext, revalidateCommittedState, expectedVersion }) {
  if (typeof semanticPlanValidator !== 'function' || typeof admitPreparedDomainPlan !== 'function'
    || preparedFollowup == null || !request.available_domain_operations?.some(
      (operation) => sameJson(operation, preparedFollowup.operation))) return null;
  const plan = {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: preparedFollowup.adaptation },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [structuredClone(preparedFollowup.operation)], check: null,
    continuation: null, clarification: null, direct_result_kind: null,
    reason_code: 'prepared_followup', reason: 'Prepared code-owned continuation remains applicable.'
  };
  try {
    await requestAndValidateTurnStepPlan({ request, turnStepModel: async () => plan,
      semanticPlanValidator, preparedChainContext });
  } catch (error) {
    if (error?.code === 'TURN_STEP_PLAN_INVALID') return null;
    throw error;
  }
  await revalidateBaseVersion({ revalidateCommittedState, expectedVersion, request, plan });
  try {
    return await admitPreparedDomainPlan(deepFreeze({ plan: structuredClone(plan),
      request: structuredClone(request), working_projection: structuredClone(workingProjection),
      prepared_chain_context: structuredClone(preparedChainContext) })) === true ? plan : null;
  } catch (error) {
    if (error?.code === 'TURN_STEP_PREPARED_DOMAIN_PLAN_UNSUPPORTED') return null;
    throw error;
  }
}

export function selectedPreparedFollowup({ plan, request, continuation }) {
  const marker = continuation?.prepared_followup_ref;
  if (typeof marker !== 'string' || plan.operations?.length !== 1) return null;
  const candidates = request.prepared_followup_candidates?.filter((value) =>
    value.prepared_followup_ref === marker && sameJson(value.precursor_operation, plan.operations[0])) ?? [];
  return candidates.length !== 1 ? null : { operation: structuredClone(candidates[0].operation),
    adaptation: plan.interpretation.adaptation };
}

export function initialPreparedChainContext(value) {
  if (value == null) return null;
  return buildTurnStepPreparedChainContext({ priorEffectCount: 0,
    currentClock: value.current_clock, currentBodyState: value.current_body_state });
}

export async function revalidateBaseVersion({ revalidateCommittedState, expectedVersion, request, plan }) {
  const current = await revalidateCommittedState(deepFreeze({ expected_state_version: expectedVersion,
    root_turn_id: request.root_turn_id, step_index: request.step_index, plan: structuredClone(plan) }));
  if (current === true) return;
  const actual = Number(current?.party_state?.state_version ?? current?.state_version ?? current);
  if (!Number.isSafeInteger(actual) || actual !== expectedVersion) throw turnFailure(
    'TURN_STEP_STATE_STALE', 'Committed state changed during semantic step planning.', {
      expected_state_version: expectedVersion,
      actual_state_version: Number.isSafeInteger(actual) ? actual : null });
}

export function traceFor({ plan, request, repaired, applied, checkResult = null,
  checkRequest = null, boundary = false }) {
  return {
    step_index: plan.step_index, working_revision: plan.working_revision,
    resolution: plan.resolution, goal_result: plan.goal_result, repaired, applied,
    check_outcome: checkResult?.outcome?.band ?? null,
    check_binding: checkRequest == null ? null : structuredClone(checkRequest),
    approved_plan: structuredClone(plan), plan_request: structuredClone(request),
    player_response_boundary: boundary, reason_code: plan.reason_code
  };
}

export function preparedDirectContinuation(plan) {
  return plan.resolution === 'direct' && plan.operations.length === 0
    && plan.activity?.owner === 'semantic' && plan.activity.duration_class === 'moment'
    && plan.activity.effort === 'none';
}

function sameJson(left, right) { return isDeepStrictEqual(left, right); }
