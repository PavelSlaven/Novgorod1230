import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPhase7OwnerResult } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-owner-result.js';
import {
  approvedPhase7Contracts as approvedContracts,
  phase7AutonomousPlan as autonomousPlan,
  phase7DirectPlan as directPlan
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command as commandFor,
  phase7CommittedState as committedState,
  phase7PlayerInput as playerInput
} from './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 admission rejects an operation detached from the NPC plan',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const consequence = await commandFor({ state, contracts,
      model: async (request) => autonomousPlan(request, 'move_bag')
    }).consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'tampered-operation')
    });
    const tampered = structuredClone(consequence);
    const detached = structuredClone(
      tampered.phase7.schedule_execution.semantic_operation
    );
    detached.target_refs = [contracts.roadBag.item_ref];
    tampered.phase7.actor_step.semantic_operation = structuredClone(detached);
    tampered.phase7.schedule_execution.semantic_operation =
      structuredClone(detached);
    tampered.phase7.schedule_temporal.projection.active_npc_actor_steps[0]
      .semantic_operation = structuredClone(detached);
    assertOwnerRejects(tampered, state, contracts);

    const forgedProposal = structuredClone(consequence);
    forgedProposal.phase7.actor_step.movement_proposal.destination_zone_ref =
      'forged-zone';
    forgedProposal.phase7.schedule_execution.movement_proposal
      .destination_zone_ref = 'forged-zone';
    assertOwnerRejects(forgedProposal, state, contracts);

    const forgedBinding = structuredClone(consequence);
    for (const result of [forgedBinding.phase7.actor_step,
      forgedBinding.phase7.schedule_execution]) {
      result.execution_binding_ref =
        contracts.scheduleExecutions.wait.execution_binding_id;
      result.schedule_option_id =
        contracts.scheduleExecutions.wait.schedule_option_id;
      result.activity_profile_ref =
        contracts.scheduleExecutions.wait.activity_profile_ref;
    }
    assertOwnerRejects(forgedBinding, state, contracts);
  });

test('Phase 7 direct admission binds the actor to the NPC request', async () => {
  const state = committedState();
  const contracts = approvedContracts(state);
  const consequence = await commandFor({ state, contracts,
    model: async (request) => directPlan(request)
  }).consequence({
    retrievedState: state,
    playerInput: playerInput(state, 'tampered-direct-actor')
  });
  const tampered = structuredClone(consequence);
  tampered.phase7.actor_step.npc_ref = 'onisim-1';
  tampered.phase7.schedule_execution.npc_ref = 'onisim-1';
  tampered.phase7.schedule_temporal.projection.active_npc_actor_steps[0].npc_ref =
    'onisim-1';
  assertOwnerRejects(tampered, state, contracts);
});

test('Phase 7 commit admission requires the enclosing root turn identity',
  async () => {
    const state = committedState();
    const contracts = approvedContracts(state);
    const consequence = await commandFor({ state, contracts,
      model: async (request) => directPlan(request)
    }).consequence({
      retrievedState: state,
      playerInput: playerInput(state, 'root-turn')
    });
    const factual = ownerFactual(consequence, contracts);
    assert.doesNotThrow(() => assertPhase7OwnerResult({
      factual,
      state,
      phase7Contracts: contracts,
      changeSetId: consequence.phase7.temporal.result
        .combined_change_set.change_set_id
    }));

    factual.mode_resolution.turn_id = 'turn:foreign-party:1';
    assertOwnerRejectsWithFactual(factual, state, contracts);
  });

function assertOwnerRejects(consequence, state, contracts) {
  assertOwnerRejectsWithFactual(
    ownerFactual(consequence, contracts), state, contracts);
}

function assertOwnerRejectsWithFactual(factual, state, contracts) {
  assert.throws(() => assertPhase7OwnerResult({
    factual,
    state,
    phase7Contracts: contracts,
    changeSetId: factual.consequence.phase7.temporal.result
      .combined_change_set.change_set_id
  }), ({ code }) => code === 'TRACE_PHASE_7_OWNER_RESULT_INVALID');
}

function ownerFactual(consequence, contracts) {
  return {
    consequence,
    mode_resolution: {
      turn_id: consequence.phase7.autonomous.request.root_turn_id
    },
    time_update: {
      clock_after: consequence.phase7.schedule_temporal.result.clock_after
    },
    body_update: { applied: true, proposal: {
      profile_ref: contracts.bodyEffect.effect_profile_id
    } }
  };
}
