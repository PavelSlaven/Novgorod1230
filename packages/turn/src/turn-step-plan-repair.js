import { deepFreeze } from '@rus/kernel';
import { requestTurnStepPlan } from './turn-step-contracts.js';

export async function requestTurnStepPlanWithRepair({ request, turnStepModel,
  semanticPlanValidator = null,
  preparedChainContext = null,
  allowRepair = true
}) {
  let originalOutput = null;
  try {
    return {
      plan: await requestAndValidateTurnStepPlan({ request,
        turnStepModel: async (safeRequest) => {
          const output = await turnStepModel(safeRequest);
          originalOutput = structuredClone(output);
          return output;
        }, semanticPlanValidator, preparedChainContext, attempt: 1 }),
      repaired: false
    };
  } catch (error) {
    const parseFailure = error?.code === 'json_parse_failed';
    if (error?.code !== 'TURN_STEP_PLAN_INVALID' && !parseFailure) throw error;
    if (allowRepair !== true) {
      error.details = deepFreeze({
        ...error.details,
        repair_attempted: false,
        repair_suppressed: 'prepared_effect_chain_active'
      });
      throw error;
    }
    if (parseFailure) originalOutput = {};
    const repairContext = deepFreeze({ schema: 'turn_step_repair_context_v1',
      attempt: 2,
      original_output: structuredClone(originalOutput),
      structural_errors: parseFailure ? [{ path: '$', code: 'json_parse_failed',
        message: 'Planner output was not valid JSON.' }]
        : structuredClone(error.details?.errors ?? [])
    });
    try {
      return {
        plan: await requestAndValidateTurnStepPlan({
          request,
          turnStepModel: (safeRequest) =>
            turnStepModel(safeRequest, repairContext),
          semanticPlanValidator,
          preparedChainContext,
          attempt: 2
        }),
        repaired: true
      };
    } catch (repairError) {
      if (unresolvedDomainRequest({ error: repairError, originalOutput })) {
        return { plan: noResultPlan(request), repaired: true };
      }
      if (repairError?.code === 'TURN_STEP_PLAN_INVALID') {
        repairError.details = deepFreeze({
          ...repairError.details,
          repair_attempted: true
        });
      }
      throw repairError;
    }
  }
}

function unresolvedDomainRequest({ error, originalOutput }) {
  return error?.code === 'TURN_STEP_PLAN_INVALID'
    && originalOutput?.resolution === 'domain_request'
    && Array.isArray(originalOutput?.operations)
    && originalOutput.operations.length === 0
    && (error.details?.errors ?? []).some(({ path, code, message }) =>
      path === '$.operations' && code === 'resolution'
        && message === 'domain_request requires exactly one domain operation');
}

function noResultPlan(request) {
  return deepFreeze({
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'direct',
    goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: 'domain_operation_unavailable',
    reason: 'Для этой попытки сейчас нет доступной точной операции.'
  });
}

export async function requestAndValidateTurnStepPlan({ request, turnStepModel,
  semanticPlanValidator, preparedChainContext, attempt = 1 }) {
  const plan = await requestTurnStepPlan({ request, turnStepModel });
  if (typeof semanticPlanValidator === 'function') {
    await semanticPlanValidator(deepFreeze({ plan, request: structuredClone(request),
      prepared_chain_context: structuredClone(preparedChainContext), attempt }));
  }
  return plan;
}
