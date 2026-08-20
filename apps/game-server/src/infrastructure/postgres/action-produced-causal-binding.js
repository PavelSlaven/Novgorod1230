import { createActionProducedTraceActionRef } from
  '@rus/turn/action-produced-result';

export function actionProducedTraceActionRef({ rootTurnId, stepIndex,
  approvedPlan }) {
  return createActionProducedTraceActionRef({ root_turn_id: rootTurnId,
    step_index: stepIndex, approved_plan: approvedPlan });
}

export function validActionProducedOuterCausalBinding(plan, actionPlan) {
  const causal = actionPlan.transition_proposal.causal_identity;
  if (causal.root_turn_id
      !== plan.visible_package_envelope?.turn_id
      || !plan.owner_keys.includes(`actor:${actionPlan.actor_ref}`)) return false;
  if (plan.operation_kind === 'action_production') {
    return causal.request_id === plan.idempotency_record_id;
  }
  if (plan.operation_kind !== 'trace_turn_step'
      || causal.request_id !== plan.request_id) return false;
  const trace = plan.semantic_command_snapshot?.semantic_trace
    ?.step_traces?.[causal.step_index - 1];
  return trace?.step_index === causal.step_index
    && trace.approved_plan != null
    && causal.action_ref === actionProducedTraceActionRef({
      rootTurnId: causal.root_turn_id,
      stepIndex: causal.step_index,
      approvedPlan: trace.approved_plan
    });
}
