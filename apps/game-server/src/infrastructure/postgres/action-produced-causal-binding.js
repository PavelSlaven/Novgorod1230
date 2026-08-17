import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { createActionProducedTraceActionRef } from
  '@rus/turn/action-produced-result';

export function actionProducedTraceActionRef({ rootTurnId, stepIndex,
  approvedPlan }) {
  return createActionProducedTraceActionRef({ root_turn_id: rootTurnId,
    step_index: stepIndex, approved_plan: approvedPlan });
}

export function validActionProducedOuterCausalBinding(plan, sealed) {
  if (sealed.causal_identity.root_turn_id
      !== plan.visible_package_envelope?.turn_id
      || !plan.owner_keys.includes(`actor:${sealed.actor_ref}`)) return false;
  if (plan.operation_kind === 'action_production') {
    return sealed.causal_identity.request_id === plan.idempotency_record_id
      && plan.canonical_input_digest === digest({
        schema: 'action_production_p16_causal_input_v1',
        request_id: sealed.causal_identity.request_id,
        root_turn_id: sealed.causal_identity.root_turn_id,
        action_ref: sealed.causal_identity.action_ref,
        step_index: sealed.causal_identity.step_index,
        actor_ref: sealed.actor_ref,
        context_ref: sealed.context_pin.context_ref
      });
  }
  if (plan.operation_kind !== 'trace_turn_step'
      || sealed.causal_identity.request_id !== plan.request_id) return false;
  const trace = plan.semantic_command_snapshot?.semantic_trace
    ?.step_traces?.[sealed.causal_identity.step_index - 1];
  return trace?.step_index === sealed.causal_identity.step_index
    && trace.approved_plan != null
    && sealed.causal_identity.action_ref === actionProducedTraceActionRef({
      rootTurnId: sealed.causal_identity.root_turn_id,
      stepIndex: sealed.causal_identity.step_index,
      approvedPlan: trace.approved_plan
    });
}
