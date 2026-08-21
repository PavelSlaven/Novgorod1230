import test from 'node:test';
import assert from 'node:assert/strict';
import { actionProducedTraceActionRef,
  validActionProducedOuterCausalBinding } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-causal-binding.js';

test('trace P16 binds action-produced action and step to approved trace', () => {
  const approvedPlan = { schema: 'turn_step_plan_v1', request_id: 'request-1',
    step_index: 2, operations: [{ op: 'request_item_use' }] };
  const rootTurnId = 'turn-1';
  const actionPlan = { actor_ref: 'pc', transition_proposal: {
    context_pin: { context_ref: 'context-1' },
    causal_identity: { request_id: 'request-1', root_turn_id: rootTurnId,
      step_index: 2, action_ref: actionProducedTraceActionRef({ rootTurnId,
        stepIndex: 2, approvedPlan }) } } };
  const plan = { operation_kind: 'trace_turn_step', request_id: 'request-1',
    idempotency_record_id: 'idem-1', owner_keys: ['actor:pc'],
    visible_package_envelope: { turn_id: rootTurnId },
    semantic_command_snapshot: { semantic_trace: { step_traces: [
      { step_index: 1, approved_plan: { request_id: 'request-1' } },
      { step_index: 2, approved_plan: approvedPlan }
    ] } } };
  assert.equal(validActionProducedOuterCausalBinding(plan, actionPlan), true);
  const forgedAction = structuredClone(actionPlan);
  forgedAction.transition_proposal.causal_identity.action_ref = 'forged';
  assert.equal(validActionProducedOuterCausalBinding(plan, forgedAction),
    false);
  const forgedStep = structuredClone(actionPlan);
  forgedStep.transition_proposal.causal_identity.step_index = 1;
  assert.equal(validActionProducedOuterCausalBinding(plan, forgedStep), false);
});
