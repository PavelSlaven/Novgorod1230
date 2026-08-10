import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurnCommandRegistry,
  runTurnWorkflow
} from '@rus/turn';
import {
  approvedPhase7Contracts,
  phase7AutonomousPlan
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command,
  phase7CommittedState,
  phase7PlayerInput
} from './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 applicability rejection stops the production workflow',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    state.policy_pins = [structuredClone(contracts.activityPin)];
    const stateBefore = structuredClone(state);
    const persistedProjection = structuredClone(state);
    const calls = {
      model: 0,
      time: 0,
      body: 0,
      hidden: 0,
      persistence: 0,
      commit: 0
    };
    const productionCommand = phase7Command({
      state,
      contracts,
      model: async (request) => {
        calls.model += 1;
        const plan = phase7AutonomousPlan(request, 'move_bag');
        plan.operations[0].target_refs = [contracts.roadBag.item_ref];
        return plan;
      }
    });
    const instrumentedCommand = Object.freeze({
      ...productionCommand,
      hiddenUpdate() {
        calls.hidden += 1;
        throw new Error('hidden update must not run');
      },
      writeTargets(input) {
        calls.persistence += 1;
        return productionCommand.writeTargets(input);
      }
    });
    const services = {
      commandRegistry: createTurnCommandRegistry([instrumentedCommand]),
      stateReader: {
        async read() {
          return structuredClone(persistedProjection);
        }
      },
      semanticResolver: async () => {
        throw new Error('exact Phase 7 command must win');
      },
      decisionSecret: 'phase-7-workflow-test',
      decisionExpiresAt: '2026-08-07T01:00:00.000Z',
      temporalAdvance: async () => {
        calls.time += 1;
        throw new Error('time update must not run');
      },
      bodyEffect: {
        apply() {
          calls.body += 1;
          throw new Error('body update must not run');
        }
      },
      visibleProjector: {
        async project() {
          throw new Error('visible projection must not run');
        }
      },
      persistedVisibleReader: {
        async read() {
          throw new Error('persisted projection must not run');
        }
      },
      narrator: {
        async run() {
          throw new Error('narration must not run');
        }
      },
      partyStore: {
        async commit() {
          calls.commit += 1;
          throw new Error('commit must not run');
        }
      }
    };
    const input = {
      ...phase7PlayerInput(state, 'workflow-invalid'),
      turn_number: state.party_state.turn_number + 1,
      received_at: '2026-08-07T00:00:00.000Z',
      routing_context: {
        actor_id: state.actor_id,
        state_version: state.party_state.state_version,
        policy_pins: structuredClone(state.policy_pins)
      }
    };

    await assert.rejects(
      () => runTurnWorkflow(input, services),
      (error) => error?.code === 'TURN_NPC_PLAN_INVALID'
    );
    assert.deepEqual(calls, {
      model: 2,
      time: 0,
      body: 0,
      hidden: 0,
      persistence: 0,
      commit: 0
    });
    assert.deepEqual(state, stateBefore);
    assert.deepEqual(persistedProjection, stateBefore);
  });

test('Phase 7 defers completion from contract continuation dependencies',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    const consequence = await phase7Command({
      state,
      contracts,
      continuationTargetRefs: ['eremey', 'fisher-1', 'fisher-2'],
      model: async (request) => phase7AutonomousPlan(request, 'wait')
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'unrelated-continuation'),
      semanticPlan: {
        continuation: {
          remaining_intent: 'Осмотреть берег.',
          depends_on_refs: ['eremey', 'fisher-1', 'fisher-2']
        }
      }
    });
    assert.equal(consequence.duration_minutes, 25);
    assert.equal(consequence.phase7.schedule_temporal.rest_completed, false);
  });
