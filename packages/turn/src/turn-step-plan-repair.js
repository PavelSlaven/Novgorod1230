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
    const structuralErrors = parseFailure ? [{ path: '$',
      code: 'json_parse_failed', message: 'Planner output was not valid JSON.' }]
      : [...(error.details?.errors ?? [])];
    if (!parseFailure && originalOutput != null
        && typeof semanticPlanValidator === 'function') {
      try {
        await semanticPlanValidator(deepFreeze({ plan: originalOutput,
          request: structuredClone(request), prepared_chain_context:
            structuredClone(preparedChainContext), attempt: 1 }));
      } catch (semanticError) {
        if (semanticError?.code !== 'TURN_STEP_PLAN_INVALID') throw semanticError;
        structuralErrors.push(...(semanticError.details?.errors ?? []));
      }
    }
    const repairContext = deepFreeze({ schema: 'turn_step_repair_context_v1',
      attempt: 2,
      original_output: structuredClone(originalOutput),
      structural_errors: structuredClone(structuralErrors)
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
      if (unresolvedDomainRequest(repairError)
          || unavailableOwnerAfterRepair(repairError, originalOutput)
          || forbiddenOperationChoiceAfterRepair(repairError)
          || unresolvedSemanticGrounding(repairError)
          || unresolvedContinuation(repairError)) {
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

function forbiddenOperationChoiceAfterRepair(error) {
  const repairedErrors = error?.details?.errors;
  return error?.code === 'TURN_STEP_PLAN_INVALID'
    && Array.isArray(repairedErrors) && repairedErrors.length > 0
    && repairedErrors.every(({ path, code }) =>
      path === '$.operation_choice' && code === 'additional_property');
}

function unavailableOwnerAfterRepair(error, originalOutput) {
  const repairedErrors = error?.details?.errors;
  const unavailable = ({ code }) => code === 'domain_owner_unavailable';
  const incompleteRemoval = ({ path, code }) => code === 'resolution'
    && ['$.activity.owner', '$.operations'].includes(path);
  return error?.code === 'TURN_STEP_PLAN_INVALID'
    && originalOutput?.resolution !== 'domain_request'
    && Array.isArray(repairedErrors) && repairedErrors.length > 0
    && repairedErrors.every((item) => unavailable(item) || incompleteRemoval(item));
}

const SEMANTIC_GROUNDING_CODES = new Set([
  'operation_semantic_grounding',
  'source_semantic_grounding',
  'material_transformation_grounding',
  'source_placement_grounding',
  'action_production_identity_grounding'
]);

function unresolvedSemanticGrounding(error) {
  const errors = error?.details?.errors;
  return error?.code === 'TURN_STEP_PLAN_INVALID'
    && Array.isArray(errors) && errors.length > 0
    && errors.every(({ code }) => SEMANTIC_GROUNDING_CODES.has(code));
}

function unresolvedContinuation(error) {
  const errors = error?.details?.errors;
  return error?.code === 'TURN_STEP_PLAN_INVALID'
    && Array.isArray(errors) && errors.length > 0
    && errors.every(({ code }) => code === 'continuation_progress');
}

function unresolvedDomainRequest(error) {
  const errors = error?.details?.errors;
  const unresolved = ({ path, code }) => path === '$.operations'
    && code === 'resolution';
  const related = (item) => unresolved(item)
    || (item.path === '$.operations' && item.code === 'type')
    || item.code === 'continuation_progress';
  return error?.code === 'TURN_STEP_PLAN_INVALID'
    && Array.isArray(errors) && errors.some(unresolved)
    && errors.every(related);
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
