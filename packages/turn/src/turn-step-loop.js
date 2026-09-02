import { isDeepStrictEqual } from 'node:util';
import { deepFreeze, sha256 } from '@rus/kernel';
import { turnFailure } from './errors.js';
import { executeTurnStepActorStep } from './turn-step-actor-step.js';
import {
  buildTurnStepPreparedChainContext,
  buildTurnStepPreparedEffectLedger
} from './turn-step-prepared-effects.js';
import {
  createTurnStepExecutionRegistry,
  requireTurnStepExecutionRegistry
} from './turn-step-execution-registry.js';
import {
  requestAndValidateTurnStepPlan,
  requestTurnStepPlanWithRepair
} from './turn-step-plan-repair.js';

export {
  createTurnStepExecutionRegistry,
  requireTurnStepExecutionRegistry
};
export { requestTurnStepPlanWithRepair };

export async function runTurnStepLoop(input = {}, ports = {}) {
  const identity = normalizeInput(input);
  const registry = requireTurnStepExecutionRegistry(ports.executionRegistry);
  requireFunction(ports.turnStepModel, 'TURN_STEP_MODEL_MISSING',
    'turnStepModel');
  requireFunction(ports.projectPlayerSafeState,
    'TURN_STEP_PLAYER_SAFE_PROJECTOR_MISSING', 'projectPlayerSafeState');
  requireFunction(ports.revalidateCommittedState,
    'TURN_STEP_REVALIDATOR_MISSING', 'revalidateCommittedState');

  let workingProjection = cloneObject(
    input.initialWorkingProjection,
    'TURN_STEP_WORKING_PROJECTION_INVALID'
  );
  let remainingIntent = identity.rootPlayerAction;
  let workingRevision = 0;
  let stepIndex = 1;
  let stopReason = null;
  let clarification = null;
  const completedSteps = [];
  const stepTraces = [];
  const checkResults = [];
  const checkRequests = [];
  const writeFragments = [];
  const consequenceFragments = [];
  const preparedEffects = [];
  const ordinaryPlans = [];
  const actionProducedPlans = [];
  const localFirePlans = [];
  const spatialSemanticPlans = [];
  const backgroundNpcSemanticPlans = [];
  let preparedChainContext = initialPreparedChainContext(
    ports.preparedEffectContext);
  let preparedFollowup = null;
  const seen = new Set();

  while (stepIndex <= identity.maxInternalSteps) {
    const projectedPlayerSafeState = deepFreeze(await ports.projectPlayerSafeState(deepFreeze({
      working_projection: structuredClone(workingProjection),
      completed_steps: structuredClone(completedSteps),
      local_fire_atomic_write_plans: structuredClone(localFirePlans),
      prepared_ordinary_materialization_atomic_write_plan:
        structuredClone(ordinaryPlans[0] ?? null),
      prepared_chain_context: structuredClone(preparedChainContext),
      remaining_intent: remainingIntent
    })));
    const playerSafeState = projectedPlayerSafeState?.player_safe_state
      ?? projectedPlayerSafeState;
    const availableDomainOperations =
      projectedPlayerSafeState?.available_domain_operations ?? [];
    const request = {
      schema: 'turn_step_request_v1',
      request_id: `${identity.requestId}:step:${stepIndex}`,
      root_turn_id: identity.rootTurnId,
      committed_state_version: identity.committedStateVersion,
      working_revision: workingRevision,
      step_index: stepIndex,
      max_internal_steps: identity.maxInternalSteps,
      root_player_action: identity.rootPlayerAction,
      remaining_intent: remainingIntent,
      completed_steps: structuredClone(completedSteps),
      actor: identity.actor,
      player_safe_state: playerSafeState,
      available_domain_operations: availableDomainOperations,
      ...(projectedPlayerSafeState?.prepared_followup_candidates?.length
        ? { prepared_followup_candidates:
          structuredClone(projectedPlayerSafeState.prepared_followup_candidates) }
        : {})
    };
    const inputDigest = sha256({
      remaining_intent: remainingIntent,
      player_safe_state: playerSafeState,
      available_domain_operations: availableDomainOperations,
      prepared_followup_candidates:
        projectedPlayerSafeState?.prepared_followup_candidates ?? []
    });
    if (seen.has(inputDigest)) {
      stopReason = 'no_progress';
      break;
    }
    seen.add(inputDigest);

    const preparedPlan = await requestPreparedFollowupPlan({ request,
      preparedFollowup, semanticPlanValidator: ports.semanticPlanValidator,
      admitPreparedDomainPlan: ports.admitPreparedDomainPlan,
      revalidateCommittedState: ports.revalidateCommittedState,
      expectedVersion: identity.committedStateVersion,
      workingProjection, preparedChainContext });
    const { plan, repaired } = preparedPlan == null
      ? await requestTurnStepPlanWithRepair({ request,
          turnStepModel: ports.turnStepModel,
          semanticPlanValidator: ports.semanticPlanValidator,
          preparedChainContext,
          allowRepair: preparedEffects.length === 0
        })
      : { plan: preparedPlan, repaired: false };
    if (preparedPlan == null) {
      await revalidateBaseVersion({
        revalidateCommittedState: ports.revalidateCommittedState,
        expectedVersion: identity.committedStateVersion,
        request,
        plan
      });
    }
    const preparedContinuationAllowed = preparedPlan != null
      || preparedEffects.length === 0
      || preparedDirectContinuation(plan)
      || (plan.resolution === 'domain_request'
        && typeof ports.admitPreparedDomainPlan === 'function'
        && await ports.admitPreparedDomainPlan(deepFreeze({
          plan: structuredClone(plan),
          request: structuredClone(request),
          working_projection: structuredClone(workingProjection),
          prepared_chain_context: structuredClone(preparedChainContext)
        })) === true);
    if (!preparedContinuationAllowed) {
      const requiresClarification =
        plan.resolution === 'clarification_required';
      clarification = requiresClarification
        ? structuredClone(plan.clarification) : null;
      stopReason = requiresClarification
        ? 'clarification_required' : 'player_response';
      remainingIntent = request.remaining_intent;
      stepTraces.push(traceFor({
        plan, request, repaired, applied: false, boundary: true
      }));
      break;
    }
    if (plan.resolution === 'clarification_required') {
      clarification = structuredClone(plan.clarification);
      stopReason = 'clarification_required';
      stepTraces.push(traceFor({
        plan, request, repaired, applied: false
      }));
      break;
    }

    const execution = await executeTurnStepActorStep({
      plan,
      request,
      workingProjection,
      preparedChainContext,
      preparedOrdinaryPlan: ordinaryPlans[0] ?? null,
      preparedActionProductionPlans: actionProducedPlans,
      priorLocalFirePlans: localFirePlans,
      registry,
      ports
    });
    workingProjection = execution.workingProjection;
    writeFragments.push(...execution.writeFragments);
    consequenceFragments.push(...execution.consequenceFragments);
    preparedEffects.push(...execution.preparedEffects);
    if (execution.ordinary_materialization_atomic_write_plan != null) {
      if (ordinaryPlans.length !== 0) throw turnFailure(
        'TURN_STEP_ORDINARY_PLAN_DUPLICATE',
        'Only one ordinary atomic plan is allowed per turn.');
      ordinaryPlans.push(execution.ordinary_materialization_atomic_write_plan);
    }
    if (execution.action_production_atomic_write_plan != null) {
      actionProducedPlans.push(execution.action_production_atomic_write_plan);
    }
    if (execution.local_fire_atomic_write_plans != null) {
      if (!Array.isArray(execution.local_fire_atomic_write_plans)) throw turnFailure(
        'TURN_STEP_LOCAL_FIRE_PLAN_INVALID',
        'Local-fire atomic plans must be an ordered array.');
      localFirePlans.push(...execution.local_fire_atomic_write_plans);
    }
    if (execution.spatial_semantic_atomic_write_plan != null) {
      if (spatialSemanticPlans.length !== 0) throw turnFailure(
        'TURN_STEP_SPATIAL_SEMANTIC_PLAN_DUPLICATE',
        'Only one spatial semantic atomic plan is allowed per turn.');
      spatialSemanticPlans.push(execution.spatial_semantic_atomic_write_plan);
    }
    if (execution.background_npc_semantic_atomic_write_plan != null) {
      if (backgroundNpcSemanticPlans.length !== 0) throw turnFailure(
        'TURN_STEP_BACKGROUND_NPC_SEMANTIC_PLAN_DUPLICATE',
        'Only one background NPC semantic atomic plan is allowed per turn.');
      backgroundNpcSemanticPlans.push(
        execution.background_npc_semantic_atomic_write_plan);
    }
    preparedChainContext = execution.preparedChainContext;
    if (preparedEffects.length > 2) {
      throw turnFailure('TURN_STEP_PREPARED_EFFECT_COUNT_INVALID',
        'A turn-step loop can prepare at most route and direct effect slices.');
    }
    const preparedSequenceComplete = preparedEffects.length === 2;
    if (execution.checkResult) {
      checkResults.push(execution.checkResult);
      checkRequests.push(execution.checkRequest);
    }
    const summary = plan.interpretation.grounded_attempt;
    completedSteps.push({ step_index: stepIndex, summary });
    workingRevision += 1;
    stepTraces.push(traceFor({
      plan,
      request,
      repaired,
      applied: true,
      checkResult: execution.checkResult,
      checkRequest: execution.checkRequest,
      boundary: execution.boundary || preparedSequenceComplete
    }));

    const continuation = execution.continuation;
    if (execution.boundary || preparedSequenceComplete) {
      stopReason = 'player_response';
      remainingIntent = continuation?.remaining_intent ?? '';
      break;
    }
    if (execution.goalResult !== 'pending' || continuation == null) {
      stopReason = 'terminal';
      remainingIntent = '';
      break;
    }
    if (execution.progress === false) {
      stopReason = 'no_progress';
      remainingIntent = continuation.remaining_intent;
      break;
    }
    preparedFollowup = selectedPreparedFollowup({ plan, request,
      continuation });
    remainingIntent = continuation.remaining_intent;
    stepIndex += 1;
    if (stepIndex > identity.maxInternalSteps) {
      stopReason = 'step_limit';
      break;
    }
  }

  const preparedEffectLedger = preparedEffects.length === 0 ? null
    : buildTurnStepPreparedEffectLedger({
        rootTurnId: identity.rootTurnId,
        committedStateVersion: identity.committedStateVersion,
        effects: preparedEffects
      });
  return deepFreeze({
    version: 1,
    schema: 'turn_step_loop_result_v1',
    root_turn_id: identity.rootTurnId,
    request_id: identity.requestId,
    committed_state_version: identity.committedStateVersion,
    status: stopReason === 'terminal' ? 'resolved' : 'player_response_required',
    stop_reason: stopReason ?? 'step_limit',
    working_revision: workingRevision,
    next_step_index: workingRevision + 1,
    remaining_intent: remainingIntent || null,
    completed_steps: completedSteps,
    working_projection: workingProjection,
    step_traces: stepTraces,
    check_results: checkResults,
    check_requests: checkRequests,
    write_fragments: writeFragments,
    consequence_fragments: consequenceFragments,
    prepared_effect_ledger: preparedEffectLedger,
    ordinary_materialization_atomic_write_plan: ordinaryPlans[0] ?? null,
    action_production_atomic_write_plans: actionProducedPlans,
    local_fire_atomic_write_plans: localFirePlans,
    spatial_semantic_atomic_write_plan: spatialSemanticPlans[0] ?? null,
    background_npc_semantic_atomic_write_plan:
      backgroundNpcSemanticPlans[0] ?? null,
    clarification
  });
}

async function requestPreparedFollowupPlan({ request, preparedFollowup,
  semanticPlanValidator, admitPreparedDomainPlan, workingProjection,
  preparedChainContext, revalidateCommittedState, expectedVersion }) {
  if (typeof semanticPlanValidator !== 'function'
    || typeof admitPreparedDomainPlan !== 'function'
    || preparedFollowup == null || !request.available_domain_operations?.some(
    (operation) => sameJson(operation, preparedFollowup.operation)
  )) return null;
  const plan = {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: preparedFollowup.adaptation
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [structuredClone(preparedFollowup.operation)],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'prepared_followup',
    reason: 'Prepared code-owned continuation remains applicable.'
  };
  try {
    await requestAndValidateTurnStepPlan({ request,
      turnStepModel: async () => plan,
      semanticPlanValidator,
      preparedChainContext });
  } catch (error) {
    if (error?.code === 'TURN_STEP_PLAN_INVALID') return null;
    throw error;
  }
  await revalidateBaseVersion({ revalidateCommittedState, expectedVersion,
    request, plan });
  try {
    return await admitPreparedDomainPlan(deepFreeze({
      plan: structuredClone(plan),
      request: structuredClone(request),
      working_projection: structuredClone(workingProjection),
      prepared_chain_context: structuredClone(preparedChainContext)
    })) === true ? plan : null;
  } catch (error) {
    if (error?.code === 'TURN_STEP_PREPARED_DOMAIN_PLAN_UNSUPPORTED') {
      return null;
    }
    throw error;
  }
}

function selectedPreparedFollowup({ plan, request, continuation }) {
  const marker = continuation?.prepared_followup_ref;
  if (typeof marker !== 'string' || plan.operations?.length !== 1) return null;
  const candidates = request.prepared_followup_candidates?.filter((value) =>
    value.prepared_followup_ref === marker
      && sameJson(value.precursor_operation, plan.operations[0])) ?? [];
  return candidates.length !== 1 ? null : {
    operation: structuredClone(candidates[0].operation),
    adaptation: plan.interpretation.adaptation
  };
}

function sameJson(left, right) {
  return isDeepStrictEqual(left, right);
}

function initialPreparedChainContext(value) {
  if (value == null) return null;
  return buildTurnStepPreparedChainContext({ priorEffectCount: 0,
    currentClock: value.current_clock, currentBodyState: value.current_body_state });
}

async function revalidateBaseVersion({
  revalidateCommittedState,
  expectedVersion,
  request,
  plan
}) {
  const current = await revalidateCommittedState(deepFreeze({
    expected_state_version: expectedVersion,
    root_turn_id: request.root_turn_id,
    step_index: request.step_index,
    plan: structuredClone(plan)
  }));
  if (current === true) return;
  const actual = Number(current?.party_state?.state_version
    ?? current?.state_version ?? current);
  if (!Number.isSafeInteger(actual) || actual !== expectedVersion) {
    throw turnFailure('TURN_STEP_STATE_STALE',
      'Committed state changed during semantic step planning.', {
        expected_state_version: expectedVersion,
        actual_state_version: Number.isSafeInteger(actual) ? actual : null
      });
  }
}

function traceFor({ plan, request, repaired, applied, checkResult = null,
  checkRequest = null,
  boundary = false }) {
  return {
    step_index: plan.step_index,
    working_revision: plan.working_revision,
    resolution: plan.resolution,
    goal_result: plan.goal_result,
    repaired,
    applied,
    check_outcome: checkResult?.outcome?.band ?? null,
    check_binding: checkRequest == null
      ? null : structuredClone(checkRequest),
    approved_plan: structuredClone(plan),
    plan_request: structuredClone(request),
    player_response_boundary: boundary,
    reason_code: plan.reason_code
  };
}

function preparedDirectContinuation(plan) {
  return plan.resolution === 'direct'
    && plan.operations.length === 0
    && plan.activity?.owner === 'semantic'
    && plan.activity.duration_class === 'moment'
    && plan.activity.effort === 'none';
}

function normalizeInput(input) {
  const requestId = text(input.requestId ?? input.request_id);
  const rootTurnId = text(input.rootTurnId ?? input.root_turn_id);
  const rootPlayerAction = text(
    input.rootPlayerAction ?? input.root_player_action
  );
  const committedStateVersion = Number(
    input.committedStateVersion ?? input.committed_state_version
  );
  if (!requestId || !rootTurnId || !rootPlayerAction
      || !Number.isSafeInteger(committedStateVersion)
      || committedStateVersion < 0 || !plain(input.actor)) {
    throw turnFailure('TURN_STEP_LOOP_INPUT_INVALID',
      'Root identity, actor and committed state version are required.');
  }
  const maxInternalSteps = Number(
    input.maxInternalSteps ?? input.max_internal_steps ?? 8
  );
  if (maxInternalSteps !== 8) {
    throw turnFailure('TURN_STEP_LOOP_INPUT_INVALID',
      'Initial turn step loop cap must be exactly 8.');
  }
  return {
    requestId,
    rootTurnId,
    rootPlayerAction,
    committedStateVersion,
    maxInternalSteps,
    actor: deepFreeze(cloneObject(input.actor, 'TURN_STEP_LOOP_INPUT_INVALID'))
  };
}

function requireFunction(value, code, label) {
  if (typeof value !== 'function') throw turnFailure(code,
    `${label} must be an injected function.`);
  return value;
}

function cloneObject(value, code) {
  if (!plain(value)) throw turnFailure(code, 'Expected a JSON object.');
  try { return structuredClone(value); } catch {
    throw turnFailure(code, 'Expected cloneable JSON data.');
  }
}

function plain(value) {
  return Boolean(value) && typeof value === 'object'
    && !Array.isArray(value);
}

function text(value) { return String(value ?? '').trim(); }
