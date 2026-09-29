import { isDeepStrictEqual } from 'node:util';

export function committedBlockedMovementReasonCode(modeResolution) {
  const traces = modeResolution?.decision_trace?.step_traces;
  if (!Array.isArray(traces)) return null;
  for (let index = traces.length - 1; index >= 0; index -= 1) {
    const trace = traces[index];
    if (trace?.applied !== false) continue;
    const plan = trace.approved_plan;
    const request = trace.plan_request;
    const occupied = destinationOccupiedCode(plan, request);
    if (occupied != null) return occupied;
    if (structuralActorMovementBlocked(plan)) return 'actor_movement_blocked';
    return null;
  }
  return null;
}

function destinationOccupiedCode(plan, request) {
  if (plan?.resolution !== 'domain_request' || !Array.isArray(plan.operations)) {
    return null;
  }
  const grounding = request?.player_safe_state?.available_domain_operation_grounding;
  if (!Array.isArray(grounding)) return null;
  for (const operation of plan.operations) {
    if (grounding.some((entry) => entry?.semantic_scope?.destination_status === 'occupied'
        && isDeepStrictEqual(entry.operation, operation))) {
      return 'destination_occupied';
    }
  }
  return null;
}

function structuralActorMovementBlocked(plan) {
  return plan?.resolution === 'direct'
    && plan?.goal_result === 'not_achieved'
    && Array.isArray(plan?.operations)
    && plan.operations.length === 0;
}
