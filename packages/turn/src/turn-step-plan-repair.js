import { deepFreeze } from '@rus/kernel';
import { requestTurnStepPlan } from './turn-step-contracts.js';

export async function requestTurnStepPlanWithRepair({ request, turnStepModel,
  semanticPlanValidator = null,
  preparedChainContext = null,
  allowRepair = true
}) {
  try {
    return {
      plan: await requestAndValidateTurnStepPlan({ request, turnStepModel,
        semanticPlanValidator, preparedChainContext }),
      repaired: false
    };
  } catch (error) {
    if (error?.code !== 'TURN_STEP_PLAN_INVALID') throw error;
    if (allowRepair !== true) {
      error.details = deepFreeze({
        ...error.details,
        repair_attempted: false,
        repair_suppressed: 'prepared_effect_chain_active'
      });
      throw error;
    }
    const repairContext = deepFreeze({ schema: 'turn_step_repair_context_v1',
      attempt: 2,
      structural_errors: structuredClone(error.details?.errors ?? [])
    });
    try {
      return {
        plan: await requestAndValidateTurnStepPlan({
          request,
          turnStepModel: (safeRequest) =>
            turnStepModel(safeRequest, repairContext),
          semanticPlanValidator,
          preparedChainContext
        }),
        repaired: true
      };
    } catch (repairError) {
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

export async function requestAndValidateTurnStepPlan({ request, turnStepModel,
  semanticPlanValidator, preparedChainContext }) {
  const plan = await requestTurnStepPlan({ request, turnStepModel });
  if (typeof semanticPlanValidator === 'function') {
    await semanticPlanValidator(deepFreeze({ plan, request: structuredClone(request),
      prepared_chain_context: structuredClone(preparedChainContext) }));
  }
  return plan;
}
