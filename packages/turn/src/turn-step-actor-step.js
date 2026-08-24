import { DC, executeCheck } from '@rus/checks-rng';
import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';
import { buildTurnStepCheckRequest } from './turn-step-check-request.js';
import {
  collectTurnStepExecutionResult,
  createTurnStepExecutionInput
} from './turn-step-execution.js';
import {
  buildTurnStepPreparedChainContext,
  orchestrateTurnStepPreparedEffect
} from './turn-step-prepared-effects.js';

export const TURN_STEP_DIRECT_OPERATIONS = Object.freeze([
  'create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'apply_body_event'
]);
export const TURN_STEP_DOMAIN_OPERATIONS = Object.freeze([
  'request_discovery',
  'request_container_access',
  'request_movement',
  'request_item_use',
  'request_activity',
  'emit_interaction',
  'request_combat',
  'request_world_process'
]);

const DIRECT_OPS = new Set(TURN_STEP_DIRECT_OPERATIONS);
const DOMAIN_OPS = new Set(TURN_STEP_DOMAIN_OPERATIONS);

export async function executeTurnStepActorStep({
  plan,
  request,
  workingProjection,
  preparedChainContext,
  preparedOrdinaryPlan,
  preparedActionProductionPlans,
  priorLocalFirePlans = [],
  registry,
  ports
}) {
  let projection = structuredClone(workingProjection);
  const summaries = [];
  const writes = [];
  const consequences = [];
  const preparedEffects = [];
  const ordinaryPlans = [];
  const actionProducedPlans = [];
  const localFirePlans = [];
  const spatialSemanticPlans = [];
  let boundary = false;
  let progress = true;
  let goalResult = plan.goal_result;
  let continuation = plan.continuation;
  let checkResult = null;
  let checkRequest = null;
  let operations = plan.operations;
  let chainContext = preparedChainContext;

  if (plan.resolution === 'generic_check') {
    const preflightOperations = actionProductionPreflightOperations(plan);
    if (preflightOperations != null
        && typeof ports.preflightActionProduction === 'function') {
      await ports.preflightActionProduction(deepFreeze({
        plan: structuredClone(plan), request: structuredClone(request),
        operations: structuredClone(preflightOperations),
        working_projection: structuredClone(projection),
        prepared_chain_context: chainContext == null ? null
          : structuredClone(chainContext),
        prepared_ordinary_materialization_atomic_write_plan:
          preparedOrdinaryPlan == null ? null
            : structuredClone(preparedOrdinaryPlan),
        prepared_action_production_atomic_write_plans:
          structuredClone(preparedActionProductionPlans)
      }));
    }
    const contextResolver = requireFunction(
      ports.resolveCheckContext,
      'TURN_STEP_CHECK_CONTEXT_MISSING',
      'resolveCheckContext'
    );
    if (!ports.randomSource || typeof ports.randomSource.next !== 'function') {
      throw turnFailure('TURN_RANDOM_SOURCE_REQUIRED',
        'RandomSource.next is required for a generic step check.');
    }
    const context = await contextResolver(deepFreeze({
      check: structuredClone(plan.check),
      actor: structuredClone(request.actor),
      working_projection: structuredClone(projection),
      prepared_chain_context: preparedChainContext == null ? null
        : structuredClone(preparedChainContext)
    }));
    const checkId = `${request.root_turn_id}:step:${request.step_index}`;
    checkRequest = buildTurnStepCheckRequest({
      checkId, difficulty: DC[plan.check.difficulty_id], plan, context
    });
    const { check_policy_ref: _checkPolicy,
      consequence_policy_ref: _consequencePolicy,
      policy_profile_ref: _policyProfile,
      policy_profile_pin: _policyProfilePin,
      ...modifiers } = context;
    checkResult = executeCheck({
      ...structuredClone(modifiers), check_id: checkId,
      difficulty: DC[plan.check.difficulty_id]
    }, ports.randomSource);
    const outcome = plan.check.outcomes[checkResult.outcome.band];
    operations = outcome.operations;
    goalResult = outcome.goal_result;
    continuation = outcome.continuation;
  }

  const domainOperations = operations.filter(({ op }) => DOMAIN_OPS.has(op));
  const directOperations = operations.filter(({ op }) => DIRECT_OPS.has(op));
  if (domainOperations.length > 1) {
    throw turnFailure('TURN_STEP_DOMAIN_OPERATION_COUNT_INVALID',
      'A planned step can invoke at most one domain owner.', {
        count: domainOperations.length
      });
  }
  for (const operation of directOperations) {
    const handler = registry.direct(operation);
    if (!handler) {
      throw turnFailure('TURN_STEP_DIRECT_HANDLER_MISSING',
        `No code-owned handler for ${operation.op}.`, { op: operation.op });
    }
    const applied = await invokeOwner(handler, {
      plan, request, operation, projection, checkResult,
      preparedChainContext: chainContext, preparedOrdinaryPlan,
      preparedActionProductionPlans, priorLocalFirePlans, ports
    });
    chainContext = advanceChainContext(chainContext, applied);
    ({ projection, boundary, progress, goalResult, continuation } =
      collectTurnStepExecutionResult({
        applied, projection, boundary, progress, goalResult, continuation,
        summaries, writes, consequences, preparedEffects, ordinaryPlans,
        actionProducedPlans, localFirePlans, spatialSemanticPlans
      }));
  }

  if (plan.resolution === 'domain_request'
      || (plan.resolution === 'generic_check'
        && domainOperations.length === 1)) {
    const operation = domainOperations[0];
    const handler = registry.domain(operation);
    if (!handler) {
      throw turnFailure('TURN_STEP_DOMAIN_HANDLER_MISSING',
        `No code-owned domain handler for ${operation.op}.`, {
          op: operation.op
        });
    }
    const applied = await invokeOwner(handler, {
      plan, request, operation, projection, checkResult,
      preparedChainContext: chainContext, preparedOrdinaryPlan,
      preparedActionProductionPlans, priorLocalFirePlans, ports
    });
    chainContext = advanceChainContext(chainContext, applied);
    ({ projection, boundary, progress, goalResult, continuation } =
      collectTurnStepExecutionResult({
        applied, projection, boundary, progress, goalResult, continuation,
        summaries, writes, consequences, preparedEffects, ordinaryPlans,
        actionProducedPlans, localFirePlans, spatialSemanticPlans
      }));
  }
  if (plan.activity?.owner === 'semantic') {
    const activities = [plan.activity];
    if (plan.resolution === 'generic_check') {
      const outcome = plan.check.outcomes[checkResult.outcome.band];
      if (outcome.additional_activity) {
        activities.push({ owner: 'semantic', ...outcome.additional_activity });
      }
    }
    for (const activity of activities) {
      const handler = registry.semanticActivity();
      if (!handler) {
        throw turnFailure('TURN_STEP_ACTIVITY_HANDLER_MISSING',
          'Semantic activity requires the code-owned activity handler.');
      }
      const applied = await invokeOwner(handler, {
        plan,
        request,
        operation: { op: 'apply_semantic_activity', activity },
        projection,
        checkResult,
        preparedChainContext: chainContext,
        preparedOrdinaryPlan,
        preparedActionProductionPlans,
        priorLocalFirePlans,
        ports
      });
      chainContext = advanceChainContext(chainContext, applied);
      ({ projection, boundary, progress, goalResult, continuation } =
        collectTurnStepExecutionResult({
          applied, projection, boundary, progress, goalResult, continuation,
          summaries, writes, consequences, preparedEffects, ordinaryPlans,
          actionProducedPlans, localFirePlans, spatialSemanticPlans
        }));
    }
  }

  return {
    workingProjection: projection,
    summary: summaries.filter(Boolean).join('; '),
    boundary,
    progress,
    goalResult,
    continuation,
    checkResult,
    checkRequest,
    writeFragments: writes,
    consequenceFragments: consequences,
    preparedEffects,
    ordinary_materialization_atomic_write_plan: ordinaryPlans[0] ?? null,
    action_production_atomic_write_plan: actionProducedPlans[0] ?? null,
    local_fire_atomic_write_plans: localFirePlans,
    spatial_semantic_atomic_write_plan: spatialSemanticPlans[0] ?? null,
    preparedChainContext: chainContext
  };
}

function actionProductionPreflightOperations(plan) {
  const outcomes = Object.values(plan.check?.outcomes ?? {});
  const operations = outcomes.map((outcome) => (outcome.operations ?? [])
    .find((operation) => operation?.op === 'request_item_use'
      && operation.action_production != null) ?? null);
  if (operations.every((operation) => operation === null)) return null;
  if (operations.some((operation) => operation === null)) {
    throw turnFailure('TURN_STEP_ACTION_PRODUCTION_PREFLIGHT_INVALID',
      'Every generic A1 outcome must use the same authority scope.');
  }
  const expected = preflightIdentity(operations[0]);
  if (operations.slice(1).some((operation) =>
    JSON.stringify(preflightIdentity(operation)) !== JSON.stringify(expected))) {
    throw turnFailure('TURN_STEP_ACTION_PRODUCTION_PREFLIGHT_INVALID',
      'Every generic A1 outcome must use the same authority scope.');
  }
  return operations;
}

function preflightIdentity(operation) {
  return {
    actor_ref: operation.actor_ref,
    item_ref: operation.item_ref,
    target_refs: canonicalRefs(operation.target_refs),
    source_refs: canonicalRefs(operation.action_production.source_refs),
    tool_refs: canonicalRefs(operation.action_production.tool_refs)
  };
}

function canonicalRefs(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function advanceChainContext(context, applied) {
  if (applied?.prepared_effect != null) {
    return buildTurnStepPreparedChainContext({
      priorEffectCount: (context?.prior_effect_count ?? 0) + 1,
      currentClock: applied.prepared_effect.time_update.clock_after,
      currentBodyState: applied.prepared_effect.body_update.state_after
    });
  }
  if (context != null && applied?.body_state_after != null) {
    return buildTurnStepPreparedChainContext({
      priorEffectCount: context.prior_effect_count,
      currentClock: context.current_clock,
      currentBodyState: applied.body_state_after
    });
  }
  return context;
}

async function invokeOwner(handler, {
  plan,
  request,
  operation,
  projection,
  checkResult,
  preparedChainContext,
  preparedOrdinaryPlan,
  preparedActionProductionPlans,
  priorLocalFirePlans,
  ports
}) {
  const applied = await handler(createTurnStepExecutionInput({
    plan, request, operation, projection, checkResult,
    preparedChainContext, preparedOrdinaryPlan,
    preparedActionProductionPlans, priorLocalFirePlans
  }));
  return orchestrateTurnStepPreparedEffect({
    request,
    applied,
    preparedChainContext,
    priorLocalFirePlans,
    timeOwner: ports.preparedEffectTimeOwner,
    bodyOwner: ports.preparedEffectBodyOwner,
    projectionOwner: ports.preparedEffectProjectionOwner
  });
}

function requireFunction(value, code, label) {
  if (typeof value !== 'function') {
    throw turnFailure(code, `${label} must be an injected function.`);
  }
  return value;
}
