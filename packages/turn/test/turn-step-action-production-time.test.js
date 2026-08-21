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
      attribute_value: 10, skill_bonus: 0, situational_modifier: 0,
      check_policy_ref: { entity_kind: 'check_policy',
        entity_id: 'check-policy', authoring_version: '1' },
      consequence_policy_ref: { entity_kind: 'consequence_policy',
        entity_id: 'consequence-policy', authoring_version: '1' },
      policy_profile_ref: 'policy-profile',
      policy_profile_pin: { artifact_id: 'policy-profile', revision: 1,
        digest: 'a'.repeat(64) }
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

test('A1 generic check preflights authority before RNG', async () => {
  const calls = { activities: 0, rng: 0, preflight: 0 };
  const exactPorts = ports(calls);
  exactPorts.preflightActionProduction = async () => {
    calls.preflight += 1;
    throw Object.assign(new Error('denied'), {
      code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED'
    });
  };
  await assert.rejects(() => executeTurnStepActorStep({
    plan: genericPlan(), request, workingProjection: {},
    preparedChainContext: chainContext(), preparedOrdinaryPlan: null,
    preparedActionProductionPlans: [], registry: registry(calls),
    ports: exactPorts
  }), { code: 'ACTION_PRODUCED_ITEM_ACCESS_DENIED' });
  assert.deepEqual(calls, { activities: 0, rng: 0, preflight: 1 });
});

test('A1 generic check preflights every qualitative outcome before RNG',
  async () => {
    const calls = { activities: 0, rng: 0, preflight: 0 };
    const exactPorts = ports(calls);
    exactPorts.preflightActionProduction = async ({ operations }) => {
      calls.preflight += 1;
      assert.equal(operations.length, 5);
      assert.deepEqual(new Set(operations[0].target_refs),
        new Set(operations[1].target_refs));
      if (operations.some(({ action_production: result }) =>
        result.material_extent === 'minor')) {
        throw Object.assign(new Error('finite partial unsupported'), {
          code: 'ITEM_ACTION_PRODUCED_FINITE_PARTIAL_UNSUPPORTED'
        });
      }
    };
    const plan = genericPlan();
    const outcomes = Object.values(plan.check.outcomes);
    outcomes[0].operations[0].target_refs = ['item:knife', 'item:stone'];
    outcomes[0].operations[0].action_production.tool_refs =
      ['item:knife', 'item:stone'];
    outcomes[1].operations[0].target_refs = ['item:stone', 'item:knife'];
    outcomes[1].operations[0].action_production.tool_refs =
      ['item:stone', 'item:knife'];
    outcomes[2].operations[0].action_production = {
      ...outcomes[2].operations[0].action_production,
      identity_mode: 'independent_outputs', origin: 'direct_partition',
      result_class: 'partial_transformation', material_extent: 'minor',
      requested_output_count: 1,
      result_descriptor: {
        ...outcomes[2].operations[0].action_production.result_descriptor,
        display_name: 'отделённая часть', physical_form: 'compact',
        source_fact_delta: { physical_description: null,
          qualitative_facts: [], removed_physical_fact_refs: [],
          physical_form: 'regular' }
      }
    };
    await assert.rejects(() => executeTurnStepActorStep({
      plan, request, workingProjection: {},
      preparedChainContext: chainContext(), preparedOrdinaryPlan: null,
      preparedActionProductionPlans: [], registry: registry(calls),
      ports: exactPorts
    }), { code: 'ITEM_ACTION_PRODUCED_FINITE_PARTIAL_UNSUPPORTED' });
    assert.deepEqual(calls, { activities: 0, rng: 0, preflight: 1 });
  });

test('valid A1 preflight is read once before one generic check', async () => {
  const calls = { activities: 0, rng: 0, preflight: 0 };
  const exactPorts = ports(calls);
  exactPorts.preflightActionProduction = async () => {
    calls.preflight += 1;
  };
  const result = await executeTurnStepActorStep({
    plan: genericPlan(), request, workingProjection: {},
    preparedChainContext: chainContext(), preparedOrdinaryPlan: null,
    preparedActionProductionPlans: [], registry: registry(calls),
    ports: exactPorts
  });
  assert.deepEqual(calls, { activities: 1, rng: 1, preflight: 1 });
  assert.equal(result.checkResult.check_id, 'turn:1:step:1');
});

test('admitted physical infeasibility still spends one semantic activity',
  async () => {
    const calls = { activities: 0, rng: 0, preflight: 0 };
    const exactPorts = ports(calls);
    exactPorts.preflightActionProduction = async () => {
      calls.preflight += 1;
    };
    const exactRegistry = createTurnStepExecutionRegistry({
      domain: { request_item_use: async ({ working_projection: projection }) =>
        ({ working_projection: projection,
          summary: 'action_production:no_useful_result',
          action_production_atomic_write_plan: null }) },
      applySemanticActivity: registry(calls).semanticActivity()
    });
    const result = await executeTurnStepActorStep({ plan: genericPlan(),
      request, workingProjection: {}, preparedChainContext: chainContext(),
      preparedOrdinaryPlan: null, preparedActionProductionPlans: [],
      registry: exactRegistry, ports: exactPorts });
    assert.deepEqual(calls, { activities: 1, rng: 1, preflight: 1 });
    assert.equal(result.action_production_atomic_write_plan, null);
  });

function genericPlan() {
  const genericOperation = { ...structuredClone(operation),
    action_production: { source_refs: ['item:board'], tool_refs: [],
      requested_output_count: null, identity_mode: 'preserve_source', origin: null,
      result_class: 'ordinary_physical_result', material_extent: null,
      result_descriptor: { display_name: null, physical_description: 'cut',
        qualitative_facts: [], removed_physical_fact_refs: [],
        inscription_text: null, physical_form: 'regular',
        source_fact_delta: null }, output_class: 'ordinary_mundane' } };
  const outcome = () => ({ goal_result: 'achieved',
    additional_activity: null, operations: [genericOperation],
    continuation: null });
  return {
    resolution: 'generic_check', activity, operations: [],
    goal_result: 'pending', continuation: null,
    check: { purpose: 'uncertain physical action', attribute_ref: 'actor:1',
      skill_ref: null, difficulty_id: 'risky', outcomes: {
        clean_success: outcome(), success: outcome(),
        success_with_cost: outcome(), failure_with_consequence: outcome(),
        severe_failure: outcome()
      } }
  };
}

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
