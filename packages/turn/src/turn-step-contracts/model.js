import { deepFreeze } from '@rus/kernel';
import { validateTurnStepPlan } from './plan-validator.js';
import { validateTurnStepRequest } from './request-validator.js';
import { contractError } from './validation.js';

export async function requestTurnStepPlan({ request, turnStepModel } = {}) {
  const requestValidation = validateTurnStepRequest(request);
  if (!requestValidation.ok) {
    throw contractError('TURN_STEP_REQUEST_INVALID', requestValidation.errors);
  }
  if (typeof turnStepModel !== 'function') {
    throw contractError('TURN_STEP_MODEL_MISSING', [{
      path: '$.turnStepModel',
      code: 'required',
      message: 'must be a function'
    }]);
  }
  const safeRequest = deepFreeze(structuredClone(request));
  const rawPlan = await turnStepModel(safeRequest);
  const planValidation = validateTurnStepPlan(rawPlan, {
    request: safeRequest
  });
  if (!planValidation.ok) {
    throw contractError('TURN_STEP_PLAN_INVALID', planValidation.errors);
  }
  return deepFreeze(structuredClone(rawPlan));
}
