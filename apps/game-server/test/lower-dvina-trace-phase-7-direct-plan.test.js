import assert from 'node:assert/strict';
import test from 'node:test';
import {
  approvedPhase7Contracts,
  phase7DirectPlan
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command,
  phase7CommittedState,
  phase7PlayerInput
} from './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 executes a schema-valid brief direct plan without blocking rest',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    let modelCalls = 0;
    const consequence = await phase7Command({
      state,
      contracts,
      model: async (request) => {
        modelCalls += 1;
        const plan = phase7DirectPlan(request);
        plan.activity.duration_class = 'brief';
        return plan;
      }
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'domain-rejected-once')
    });

    assert.equal(modelCalls, 1);
    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(consequence.phase7.actor_step.status, 'started');
    assert.equal(consequence.phase7.schedule_execution.exact_elapsed
      .exact_minutes.numerator, '5');
  });
