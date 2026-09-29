import assert from 'node:assert/strict';
import test from 'node:test';
import { committedBlockedMovementReasonCode } from '../src/stages/blocked-movement-reason.js';

const operation = { op: 'request_movement', actor_ref: 'actor', target_ref: 'edge:1',
  movement_kind: 'local', description: 'Проход 1' };

test('occupied grounding yields destination_occupied without trusting planner reason_code',
  () => {
  const code = committedBlockedMovementReasonCode({ decision_trace: { step_traces: [{
    applied: false,
    approved_plan: { resolution: 'domain_request', reason_code: 'model_wording',
      operations: [operation] },
    plan_request: { player_safe_state: { available_domain_operation_grounding: [{
      operation, semantic_scope: { destination_status: 'occupied' }
    }] } }
  }] } });
  assert.equal(code, 'destination_occupied');
});

test('direct not-achieved without operations yields actor_movement_blocked', () => {
  const code = committedBlockedMovementReasonCode({ decision_trace: { step_traces: [{
    applied: false,
    approved_plan: { resolution: 'direct', goal_result: 'not_achieved',
      reason_code: 'visible_movement', operations: [] },
    plan_request: {}
  }] } });
  assert.equal(code, 'actor_movement_blocked');
});
