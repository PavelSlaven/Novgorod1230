import { deepFreeze } from '@rus/kernel';
import { requestTurnStepPlan } from './turn-step-contracts.js';
import { contractError } from './turn-step-contracts/validation.js';

export async function requestTurnStepPlanWithRepair({ request, turnStepModel,
  semanticPlanValidator = null,
  preparedChainContext = null,
  allowRepair = true
}) {
  let originalOutput = null;
  // Repair reuses this immutable snapshot and its existing grounding identity.
  let modelRequest = null;
  try {
    return {
      plan: await requestAndValidateTurnStepPlan({ request,
        turnStepModel: async (safeRequest) => {
          modelRequest = safeRequest;
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
        && (!structuralErrors.some(requiresSemanticRepair)
          || canAuditSpeechBeforeRepair(originalOutput, structuralErrors))
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
    if (!structuralErrors.some(requiresSemanticRepair)) {
      const failure = parseFailure
        ? contractError('TURN_STEP_PLAN_INVALID', structuralErrors) : error;
      failure.details = deepFreeze({ ...failure.details,
        repair_attempted: false,
        repair_suppressed: 'deterministic_structure_invalid' });
      throw failure;
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
            turnStepModel(modelRequest ?? safeRequest, repairContext),
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

const SEMANTIC_REPAIR_CODES = new Set([
  'action_production_identity_grounding',
  'continuation_progress',
  'direct_result_kind',
  'domain_owner_unavailable',
  'material_extent_shape',
  'material_transformation_grounding',
  'operation_semantic_grounding',
  'ordinary_discovery_query_identity',
  'source_placement_grounding',
  'source_semantic_grounding'
]);

function requiresSemanticRepair({ code } = {}) {
  return SEMANTIC_REPAIR_CODES.has(code);
}

function canAuditSpeechBeforeRepair(plan, errors) {
  return errors.some(({ code }) => code === 'direct_result_kind')
    && plan.resolution === 'direct'
    && plan.direct_result_kind === 'player_utterance'
    && (plan.operations == null
      || Array.isArray(plan.operations) && plan.operations.length === 0)
    && plan.check == null
    && typeof plan.utterance?.speaker_ref === 'string'
    && typeof plan.utterance?.utterance_text === 'string'
    && ['verbatim', 'intent_paraphrase'].includes(plan.utterance?.input_mode);
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
