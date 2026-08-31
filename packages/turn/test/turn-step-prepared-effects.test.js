import assert from 'node:assert/strict';
import test from 'node:test';
import { runTurnStepLoop } from '../src/turn-step-loop.js';
import {
  at, available, body, clarificationPlan, directOperationPlan, directPlan,
  followup, genericPlan, input, minutes, ports, preparedFollowupOperation,
  preparedRegistry, routePlan, secondDomainPlan, worldProcessPlan
} from './turn-step-prepared-effects-fixture.js';

test('prepared route and direct activity form one ordered t0-t8-t9 ledger',
  async () => {
    const requests = [];
    const counters = { routeHandler: 0, semanticActivityHandler: 0 };
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry: preparedRegistry({ counters }),
      turnStepModel(request) {
        requests.push(request);
        return request.step_index === 1
          ? routePlan(request) : directPlan(request);
      }
    }));

    assert.equal(outcome.working_revision, 2);
    assert.equal(outcome.stop_reason, 'player_response');
    assert.equal(requests[1].player_safe_state.position, 'camp');
    assert.equal(requests[1].player_safe_state.clock.whole_minutes, '8');
    const ledger = outcome.prepared_effect_ledger;
    assert.deepEqual(ledger.slices.map((slice) => ({
      ordinal: slice.ordinal,
      step: slice.step_index,
      kind: slice.effect_kind,
      from: slice.time_update.clock_before.whole_minutes,
      to: slice.time_update.clock_after.whole_minutes
    })), [
      { ordinal: 1, step: 1, kind: 'domain_command', from: '0', to: '8' },
      { ordinal: 2, step: 2, kind: 'semantic_activity', from: '8', to: '9' }
    ]);
    assert.equal(ledger.slices[1].previous_slice_digest,
      ledger.slices[0].slice_digest);
    assert.deepEqual(counters,
      { routeHandler: 1, semanticActivityHandler: 1 });
  });

test('prepared followup executes its current admitted exact operation without planner',
  async () => {
    const operation = preparedFollowupOperation();
    const candidate = { prepared_followup_ref: 'followup',
      precursor_operation: followup(), operation };
    let modelCalls = 0;
    let admitted = null;
    const order = [];
    const outcome = await runTurnStepLoop(input(), ports({
      executionRegistry: preparedRegistry({ extraDomain: {
        request_world_process: async ({ working_projection: projection }) => ({
          working_projection: projection, summary: 'prepared followup',
          write_fragments: []
        })
      } }),
      projectPlayerSafeState: async ({ working_projection: projection,
        completed_steps: completed }) => ({ ...structuredClone(projection),
        ...(completed.length === 0
          ? { prepared_followup_candidates: [candidate] }
          : { available_domain_operations: [operation] })
      }),
      semanticPlanValidator: async ({ plan }) => {
        if (plan.reason_code === 'prepared_followup') order.push('semantic');
      },
      revalidateCommittedState: async ({ plan }) => {
        if (plan.reason_code === 'prepared_followup') order.push('revalidate');
        return { state_version: 7 };
      },
      admitPreparedDomainPlan: async (value) => {
        order.push('admission');
        admitted = value;
        return true;
      },
      turnStepModel(request) {
        modelCalls += 1;
        const plan = routePlan(request);
        return { ...plan, interpretation: {
          ...plan.interpretation, adaptation: 'reality_limited'
        }, continuation: {
          ...plan.continuation,
          prepared_followup_ref: candidate.prepared_followup_ref
        } };
      }
    }));

    assert.equal(modelCalls, 1);
    assert.deepEqual(outcome.step_traces[1].approved_plan.operations,
      [operation]);
    assert.equal(outcome.step_traces[1].approved_plan.interpretation.adaptation,
      'reality_limited');
    assert.equal(outcome.step_traces[1].reason_code, 'prepared_followup');
    assert.deepEqual(admitted.plan.operations, [operation]);
    assert.deepEqual(order, ['semantic', 'revalidate', 'admission']);
  });

test('prepared followup falls back when required gate is absent or admission rejects',
  async (t) => {
    for (const current of [{ name: 'semantic validator missing',
      semantic: null, admission: true, revalidations: 1 }, {
      name: 'admission port missing', semantic: async () => {},
      admission: null, revalidations: 1 }, {
      name: 'admission rejects', semantic: async () => {},
      admission: false, revalidations: 2 }, {
      name: 'admission unsupported', semantic: async () => {},
      admission: 'unsupported', revalidations: 2
    }]) await t.test(current.name, async () => {
      const candidate = { prepared_followup_ref: 'followup',
        precursor_operation: followup(), operation: followup() };
      let modelCalls = 0;
      const revalidations = [];
      const outcome = await runTurnStepLoop(input(), ports({
        executionRegistry: preparedRegistry(),
        projectPlayerSafeState: async ({ working_projection: projection,
          completed_steps: completed }) => ({ ...structuredClone(projection),
          ...(completed.length === 0
            ? { prepared_followup_candidates: [candidate] }
            : { available_domain_operations: [followup()] })
        }),
        ...(current.semantic == null ? {} : {
          semanticPlanValidator: current.semantic
        }),
        ...(current.admission == null ? {} : {
          admitPreparedDomainPlan: async () => {
            if (current.admission === 'unsupported') throw Object.assign(
              new Error('unsupported'), {
                code: 'TURN_STEP_PREPARED_DOMAIN_PLAN_UNSUPPORTED'
              });
            return current.admission;
          }
        }),
        revalidateCommittedState: async ({ plan }) => {
          if (plan.step_index === 2) revalidations.push(plan.reason_code);
          return { state_version: 7 };
        },
        turnStepModel(request) {
          modelCalls += 1;
          if (request.step_index !== 1) return directPlan(request);
          const plan = routePlan(request);
          return { ...plan, continuation: {
            ...plan.continuation,
            prepared_followup_ref: candidate.prepared_followup_ref
          } };
        }
      }));
      assert.equal(modelCalls, 2);
      assert.notEqual(outcome.step_traces[1].reason_code, 'prepared_followup');
      assert.equal(revalidations.length, current.revalidations);
    });
  });

test('prepared followup requires one exact precursor candidate', async (t) => {
  for (const current of [{ name: 'wrong precursor', candidates: [{
    prepared_followup_ref: 'followup',
    precursor_operation: { ...followup(), target_ref: 'other-camp' },
    operation: followup()
  }] }, { name: 'ambiguous precursor', candidates: [{
    prepared_followup_ref: 'followup', precursor_operation: followup(),
    operation: followup()
  }, {
    prepared_followup_ref: 'followup', precursor_operation: followup(),
    operation: preparedFollowupOperation()
  }] }]) await t.test(current.name, async () => {
    let modelCalls = 0;
    let admissions = 0;
    await runTurnStepLoop(input(), ports({
      executionRegistry: preparedRegistry(),
      projectPlayerSafeState: async ({ working_projection: projection,
        completed_steps: completed }) => ({ ...structuredClone(projection),
        ...(completed.length === 0
          ? { prepared_followup_candidates: current.candidates }
          : { available_domain_operations: [followup()] })
      }),
      semanticPlanValidator: async () => {},
      admitPreparedDomainPlan: async () => {
        admissions += 1;
        return true;
      },
      turnStepModel(request) {
        modelCalls += 1;
        if (request.step_index !== 1) return directPlan(request);
        const plan = routePlan(request);
        return { ...plan, continuation: { ...plan.continuation,
          prepared_followup_ref: 'followup' } };
      }
    }));
    assert.equal(modelCalls, 2);
    assert.equal(admissions, 0);
  });
});
test('prepared followup accepts reordered operation keys', async () => {
  const operation = preparedFollowupOperation();
  const candidate = { prepared_followup_ref: 'followup',
    precursor_operation: { target_ref: 'camp', movement_kind: 'local',
      actor_ref: 'actor-1', op: 'request_movement' }, operation };
  const reorderedOperation = { description: operation.description,
    target_refs: operation.target_refs, source_refs: operation.source_refs,
    process_kind: operation.process_kind, process_ref: operation.process_ref,
    process_action: operation.process_action, actor_ref: operation.actor_ref,
    op: operation.op };
  let modelCalls = 0;
  const outcome = await runTurnStepLoop(input(), ports({
    executionRegistry: preparedRegistry({ extraDomain: {
      request_world_process: async ({ working_projection: projection }) => ({
        working_projection: projection, summary: 'prepared', write_fragments: []
      })
    } }),
    projectPlayerSafeState: async ({ working_projection: projection,
      completed_steps: completed }) => ({ ...structuredClone(projection),
      ...(completed.length === 0
        ? { prepared_followup_candidates: [candidate] }
        : { available_domain_operations: [reorderedOperation] })
    }),
    semanticPlanValidator: async () => {},
    admitPreparedDomainPlan: async () => true,
    turnStepModel(request) {
      modelCalls += 1;
      const plan = routePlan(request);
      return { ...plan, continuation: { ...plan.continuation,
        prepared_followup_ref: 'followup' } };
    }
  }));
  assert.equal(modelCalls, 1);
  assert.equal(outcome.step_traces[1].reason_code, 'prepared_followup');
});
