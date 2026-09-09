import { deepFreeze } from '@rus/kernel';
import { requestTurnStepPlan } from './turn-step-contracts.js';
import { contractError } from './turn-step-contracts/validation.js';

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
      const normalizedError = repairError?.code === 'json_parse_failed'
        ? contractError('TURN_STEP_PLAN_INVALID', [{ path: '$',
          code: 'json_parse_failed',
          message: 'Planner repair output was not valid JSON.' }])
        : repairError;
      if (normalizedError?.code === 'TURN_STEP_PLAN_INVALID') {
        normalizedError.details = deepFreeze({
          ...normalizedError.details,
          repair_attempted: true
        });
      }
      throw normalizedError;
    }
  }
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
