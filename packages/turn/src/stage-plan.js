import { deepFreeze } from '@rus/kernel';
import { TURN_WORKFLOW_STAGE_IDS } from './contracts.js';

export const TURN_WORKFLOW_STAGE_PLAN = deepFreeze(TURN_WORKFLOW_STAGE_IDS.map((id, index) => ({ id, order: index + 1 })));

export function validateTurnWorkflowStagePlan(plan = TURN_WORKFLOW_STAGE_PLAN) {
  const ids = Array.isArray(plan) ? plan.map((stage) => stage?.id) : [];
  if (ids.length !== TURN_WORKFLOW_STAGE_IDS.length) throw new Error('Turn stage plan has invalid length.');
  if (ids.some((id, index) => id !== TURN_WORKFLOW_STAGE_IDS[index])) throw new Error('Turn stage plan order is invalid.');
  return plan;
}
