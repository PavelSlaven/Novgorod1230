import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceTemporalNpcDecisionBoundary } from
  '../src/temporal-advance.js';

const at = (wholeMinutes) => ({
  whole_minutes: String(wholeMinutes),
  subminute_numerator: '0',
  subminute_denominator: '1'
});

test('NPC actor-step starts at the paused timestamp before continuation',
  async () => {
    const calls = [];
    const flow = await advanceTemporalNpcDecisionBoundary({
      advanceToBoundary: async () => {
        calls.push('advance:25');
        return { result: { temporal_status: 'paused', clock_after: at(25) },
          projection: { phase: 'decision' } };
      },
      resolveDecision: async ({ temporal }) => {
        calls.push(`decision:${temporal.result.clock_after.whole_minutes}`);
        return { boundary: { scheduled_at: at(25) }, plan: { op: 'wait' } };
      },
      executeActorStep: async ({ temporal, decision }) => {
        calls.push(`actor:${decision.boundary.scheduled_at.whole_minutes}`);
        return { started_at: at(25), working_projection: {
          ...temporal.projection, active_operation: decision.plan.op
        } };
      },
      continueAdvance: async ({ actor_step: actorStep }) => {
        calls.push(`continue:${actorStep.working_projection.active_operation}`);
        return { result: { clock_before: at(25), clock_after: at(30) } };
      }
    });
    assert.deepEqual(calls,
      ['advance:25', 'decision:25', 'actor:25', 'continue:wait']);
    assert.equal(flow.actor_step.working_projection.active_operation, 'wait');
    assert.equal(Object.isFrozen(flow), true);
  });
