import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpcStepPlan } from '@rus/npc-runtime';
import {
  approvedPhase7Contracts,
  phase7AutonomousPlan
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command,
  phase7CommittedState,
  phase7PlayerInput
} from './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 LLM request carries Zhdanko subjective policy context',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    let request = null;
    await phase7Command({
      state,
      contracts,
      model: async (captured) => {
        request = captured;
        return phase7AutonomousPlan(captured, 'wait');
      }
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'subjective-request')
    });
    assert.ok(request);
    assert.deepEqual(
      request.npc.goals.map(({ goal_ref: ref }) => ref),
      contracts.npcPolicy.goals
    );
    assert.deepEqual(
      request.npc.fears.map(({ fear_ref: ref }) => ref),
      contracts.npcPolicy.fears
    );
    assert.deepEqual(
      request.npc.obligations.map(({ obligation_ref: ref }) => ref),
      contracts.npcPolicy.relations_and_obligations
    );
    assert.equal(request.npc.available_resources[0].resource_ref, 'road-bag-1');
    assert.equal(request.npc.mood.state, 'сосредоточен');
    assert.equal(request.npc.relationships[0].actor_ref, 'ratsha-1');
    assert.equal(
      request.knowledge.known_facts.some(({ fact_ref: ref }) =>
        ref === 'ratsha_presence_or_return'),
      true
    );
    assert.equal(
      request.perception.known_routes_and_exits.some(({ route_ref: ref }) =>
        ref === contracts.autonomous.known_route_refs[0]),
      true
    );
    assert.equal(
      request.perception.known_routes_and_exits.some(({ resource_ref: ref }) =>
        ref === 'trace_ld_v1_item_second_small_boat'),
      true
    );
    assert.equal(request.decision_reasons.perceived_changes.length, 1);
    assert.match(request.decision_reasons.perceived_changes[0],
      /waiting→decision_required/);
    assert.match(request.decision_reasons.perceived_changes[0],
      /ratsha_presence_or_return/);
    assert.equal(
      request.decision_reasons.perceived_changes[0]
        .includes('npc_activity_factual_transition:'),
      false
    );
    assert.equal(request.decision_reasons.signal_refs.length, 1);
    assert.equal(validateNpcStepPlan(
      phase7AutonomousPlan(request, 'wait'), request
    ), true);
    assert.equal(validateNpcStepPlan(
      phase7AutonomousPlan(request, 'move_bag'), request
    ), true);
  });
