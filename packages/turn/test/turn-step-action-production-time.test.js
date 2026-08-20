import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTurnStepExecutionRegistry,
  executeTurnStepActorStep
} from '../src/index.js';
import { buildTurnStepPreparedChainContext } from
  '../src/turn-step-prepared-effects.js';

const request = {
  root_turn_id: 'turn:1', step_index: 1,
  actor: { actor_ref: 'actor:1' }
};
const activity = { owner: 'semantic', duration_class: 'brief', effort: 'light' };
const operation = {
  op: 'request_item_use', actor_ref: 'actor:1', item_ref: 'item:board',
  use_kind: 'other', target_refs: [], action_production: {}
};

function registry(calls) {
  return createTurnStepExecutionRegistry({
    domain: { request_item_use: async ({ working_projection: projection }) => ({
      working_projection: projection, summary: 'physical change',
      action_production_atomic_write_plan: {
        schema: 'test-action-plan'
      }
    }), request_movement: async ({ working_projection: projection }) => ({
      working_projection: projection, summary: 'movement' }) },
    applySemanticActivity: async ({ operation: applied,
      working_projection: projection }) => {
      calls.activities += 1;
      assert.deepEqual(applied.activity, activity);
      return { working_projection: projection, summary: 'time applied',
        prepared_effect_request: { effect_kind: 'semantic_activity',
          owner_ref: 'shared-semantic-activity',
          operation_ref: 'activity:a1', availability: null,
          consequence: { duration_minutes: 5 } } };
    }
  });
}

function ports(calls) {
  return {
    randomSource: { next() { calls.rng += 1; return 0.5; } },
    resolveCheckContext: async () => ({
      attribute_value: 10, skill_bonus: 0, situational_modifier: 0
    }),
    preparedEffectTimeOwner: async ({ prepared_chain_context: context }) => ({
      version: 2, schema: 'turn_time_update',
      owner: '@rus/time-events-history', clock_before: context.current_clock,
      clock_after: at(5), exact_elapsed: minutes(5), nearest_boundary: null
    }),
    preparedEffectBodyOwner: async ({ prepared_chain_context: context }) => ({
      version: 1, schema: 'turn_body_update', owner: '@rus/body-state',
      applied: false, proposal: null,
      state_after: context.current_body_state
    })
  };
}

test('deterministic A1 domain request applies semantic activity once without RNG', async () => {
  const calls = { activities: 0, rng: 0 };
  const result = await executeTurnStepActorStep({
    plan: { resolution: 'domain_request', activity, operations: [operation],
      goal_result: 'pending', continuation: null }, request,
    workingProjection: {}, preparedChainContext: chainContext(),
    preparedOrdinaryPlan: null, preparedActionProductionPlans: [],
    registry: registry(calls), ports: ports(calls)
  });
  assert.equal(calls.activities, 1);
  assert.equal(calls.rng, 0);
  assert.equal(result.action_production_atomic_write_plan.schema,
    'test-action-plan');
  assert.equal(result.preparedEffects.length, 1);
  assert.deepEqual(result.preparedEffects[0].effect.time_update.exact_elapsed,
    minutes(5));
});

test('unrelated domain request retains domain-owned time', async () => {
  const calls = { activities: 0, rng: 0 };
  await executeTurnStepActorStep({
    plan: { resolution: 'domain_request',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_movement' }], goal_result: 'pending',
      continuation: null }, request, workingProjection: {},
    preparedChainContext: null, preparedOrdinaryPlan: null,
    preparedActionProductionPlans: [], registry: registry(calls),
    ports: ports(calls)
  });
  assert.equal(calls.activities, 0);
  assert.equal(calls.rng, 0);
});

function chainContext() {
  return buildTurnStepPreparedChainContext({ priorEffectCount: 0,
    currentClock: at(0), currentBodyState: { fatigue: 0 } });
}
function at(value) {
  return { whole_minutes: String(value), subminute_numerator: '0',
    subminute_denominator: '1' };
}
function minutes(value) {
  return { exact_minutes: { numerator: String(value), denominator: '1' } };
}
