import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnStepDomainOwnerPreflight } from
  '../src/turn-step-admission.js';
import { createTurnStepExecutionRegistry, runTurnStepLoop } from
  '../src/turn-step-loop.js';

const bands = [
  'clean_success', 'success', 'success_with_cost',
  'failure_with_consequence', 'severe_failure'
];

function input() {
  return {
    requestId: 'request-1', rootTurnId: 'turn-1', committedStateVersion: 7,
    rootPlayerAction: 'пробую незнакомое действие', actor: { actor_ref: 'actor-1' },
    initialWorkingProjection: { actor_ref: 'actor-1' }
  };
}

function plan(request, extra = {}) {
  return {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    operations: [], check: null, continuation: null, clarification: null,
    reason_code: 'direct_step', reason: 'видимая реальная попытка', ...extra
  };
}

function unavailableGenericPlan(request) {
  return plan(request, {
    resolution: 'generic_check', goal_result: 'pending', operations: [],
    check: { purpose: 'проверить попытку', attribute_ref: 'actor-1',
      skill_ref: null, difficulty_id: 'risky',
      outcomes: Object.fromEntries(bands.map((band) => [band, {
        goal_result: 'not_achieved', additional_activity: null,
        operations: [{ op: 'request_activity', actor_ref: 'actor-1',
          activity_kind: 'wait', target_refs: [], description: 'ждать' }],
        continuation: null
      }]))
    }, reason_code: 'generic_check', reason: 'нужна проверка'
  });
}

function preflight() {
  return createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [], availableOptions: new Set(), actor: { actor_ref: 'actor-1' },
    committedState: {}, services: {} });
}

function ports(turnStepModel, semanticPlanValidator, randomSource) {
  return {
    turnStepModel, semanticPlanValidator, randomSource,
    projectPlayerSafeState: async ({ working_projection }) => working_projection,
    revalidateCommittedState: async () => ({ state_version: 7 }),
    executionRegistry: createTurnStepExecutionRegistry({
      applySemanticActivity: async ({ working_projection }) => ({
        working_projection, write_fragments: []
      })
    })
  };
}

test('unavailable generic owner repairs to direct plan before RNG or effects',
  async () => {
    let calls = 0;
    let rolls = 0;
    let repair = null;
    const result = await runTurnStepLoop(input(), ports(
      async (request, context) => {
        calls += 1;
        repair = context;
        return context == null ? unavailableGenericPlan(request) : plan(request);
      }, preflight(), { next: () => { rolls += 1; return 0; } }
    ));
    assert.equal(calls, 2);
    assert.equal(repair.structural_errors[0].rule, 'domain_owner_unavailable');
    assert.equal(rolls, 0);
    assert.deepEqual(result.check_results, []);
    assert.deepEqual(result.write_fragments, []);
  });

test('structural then unavailable owner consumes no third repair', async () => {
  let calls = 0;
  await assert.rejects(() => runTurnStepLoop(input(), ports(
    async (request) => {
      calls += 1;
      return calls === 1
        ? { ...plan(request), request_id: 'forged' }
        : unavailableGenericPlan(request);
    }, preflight(), null
  )), (error) => {
    assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(error.details.repair_attempted, true);
    assert.equal(error.details.errors[0].rule, 'domain_owner_unavailable');
    return true;
  });
  assert.equal(calls, 2);
});

test('repair with same operation recomputes owner for changed plan context', () => {
  const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings: [{ command: { option_id: 'choice' }, binding: {
      operation: 'request_activity', matches: ({ plan: value }) =>
        value.reason_code === 'bound'
    } }], availableOptions: new Set(['choice']), actor: { actor_ref: 'actor-1' },
    committedState: {}, services: {} });
  const request = { remaining_intent: 'ждать', player_safe_state: {} };
  const operation = { op: 'request_activity' };
  assert.throws(() => validate({ plan: { reason_code: 'unbound',
    operations: [operation], check: null }, request,
  prepared_chain_context: null }), { code: 'TURN_STEP_PLAN_INVALID' });
  assert.doesNotThrow(() => validate({ plan: { reason_code: 'bound',
    operations: [operation], check: null }, request,
  prepared_chain_context: null }));
});
