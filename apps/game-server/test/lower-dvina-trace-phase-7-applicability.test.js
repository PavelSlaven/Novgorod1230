import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNpcStepPlan } from '@rus/npc-runtime';
import {
  approvedPhase7Contracts,
  phase7AutonomousPlan,
  phase7DirectPlan
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command,
  phase7CommittedState,
  phase7PlayerInput
} from './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 preserves the boundary causality chain', async () => {
  const state = phase7CommittedState();
  const contracts = approvedPhase7Contracts(state);
  const consequence = await phase7Command({
    state,
    contracts,
    model: async (request) => {
      const contract = request.decision_scope.operation_contract;
      assert.deepEqual(Object.keys(contract).sort(), [
        'request_activity', 'request_item_use', 'request_movement'
      ]);
      assert.deepEqual(contract.request_activity.allowed, [
        { activity_kind: 'wait', target_refs: [] },
        {
          activity_kind: 'carry',
          target_refs: [
            'trace_ld_v1_container_road_bag', 'river_access'
          ]
        }
      ]);
      assert.equal(request.npc.available_resources.some(({ template_ref: ref }) =>
        ref === 'trace_ld_v1_container_road_bag'), true);
      return phase7AutonomousPlan(request, 'move_bag');
    }
  }).consequence({
    retrievedState: state,
    playerInput: phase7PlayerInput(state)
  });

  assert.equal(consequence.phase7.temporal.elapsed_before_decision, 25);
  assert.deepEqual(
    consequence.phase7.temporal.result.trace.processed_boundary_ids,
    ['npc-waiting:phase7-party:zhdanko:terminal']
  );
  assert.equal(consequence.phase7.autonomous.boundary.decision_mode,
    'autonomous');
  assert.deepEqual(consequence.phase7.autonomous.consumed_signal_ids,
    [consequence.phase7.autonomous.signal.signal_id]);
  assert.equal(consequence.phase7.schedule_execution.schedule_option_id,
    'move_bag');
  assert.deepEqual(
    consequence.phase7.schedule_execution.exact_elapsed.exact_minutes,
    { numerator: '5', denominator: '1' }
  );
  assert.equal(consequence.phase7.schedule_temporal.elapsed_after_decision, 5);
  assert.deepEqual(
    consequence.phase7.schedule_temporal.result.trace.processed_boundary_ids,
    [consequence.phase7.schedule_temporal.completion_candidate.boundary_id]
  );
  assert.equal(consequence.phase7.schedule_temporal.completion_candidate
    .boundary_id.includes(
      consequence.phase7.autonomous.request.request_id), true);
  const candidateRef = {
    entity_kind: 'temporal_boundary_candidate',
    entity_id: consequence.phase7.temporal.terminal_candidate.boundary_id
  };
  assert.deepEqual(consequence.phase7.temporal.waiting_transition
    .source_candidate_ref, candidateRef);
  assert.deepEqual(consequence.phase7.autonomous.signal.source_event_ref, {
    entity_kind: 'npc_activity_factual_transition',
    entity_id: consequence.phase7.temporal.waiting_transition
      .transition_id
  });
  assert.deepEqual(consequence.phase7.autonomous.signal.causal_parent_refs,
    [candidateRef]);
  assert.deepEqual(consequence.phase7.autonomous.boundary.signal_refs, [{
    entity_kind: 'npc_decision_signal',
    entity_id: consequence.phase7.autonomous.signal.signal_id
  }]);
  assert.deepEqual(consequence.phase7.schedule_temporal.completion_candidate
    .causal_parent_refs, [consequence.phase7.schedule_temporal.projection
    .active_npc_actor_steps[0].decision_trace_ref]);
});

test('Phase 7 omits domain item operations absent from NPC-safe resources',
  async () => {
    const state = phase7CommittedState();
    const zhdanko = state.npcs.find(({ instance_id: id }) => id === 'zhdanko-1');
    zhdanko.machine_state.spatial_zone_ref = 'yard';
    zhdanko.zone_ref = 'yard';
    const contracts = approvedPhase7Contracts(state);
    contracts.localTransition.source_zone_candidates.push('yard');
    await phase7Command({
      state,
      contracts,
      model: async (request) => {
        const contract = request.decision_scope.operation_contract;
        assert.deepEqual(contract.request_activity.allowed,
          [{ activity_kind: 'wait', target_refs: [] }]);
        assert.equal(Object.hasOwn(contract, 'request_item_use'), false);
        assert.equal(Object.hasOwn(contract, 'request_movement'), true);
        assert.equal(request.npc.available_resources.some(({ template_ref: ref }) =>
          ref === contracts.roadBag.item_ref), false);
        return phase7AutonomousPlan(request, 'wait');
      }
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'npc-safe-domain-contract')
    });
  });

test('Phase 7 discards a stale response so the root turn can retry',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    const requestedVersions = [];
    const command = phase7Command({
      state,
      contracts,
      model: async (request) => {
        requestedVersions.push(request.committed_state_version);
        return phase7DirectPlan(request);
      },
      revalidateStateVersion: async () =>
        state.party_state.state_version + 1
    });
    await assert.rejects(command.consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'stale-rebuild')
    }), ({ code }) => code ===
      'TRACE_PHASE_7_AUTONOMOUS_RETRY_REQUIRED');

    assert.deepEqual(requestedVersions, [7]);
  });

test('Phase 7 rejects combinations outside executable operation contract',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    const stateBefore = structuredClone(state);
    let modelCalls = 0;
    const command = phase7Command({ state, contracts,
      model: async (request) => {
        const plan = phase7AutonomousPlan(request, 'move_bag');
        modelCalls += 1;
        plan.operations[0].target_refs = [contracts.roadBag.item_ref];
        return plan;
      }
    });
    await assert.rejects(
      () => command.consequence({
        retrievedState: state,
        playerInput: phase7PlayerInput(state, 'carry-without-destination')
      }),
      (error) => error?.code === 'TURN_NPC_PLAN_INVALID'
    );
    assert.equal(modelCalls, 2);
    assert.deepEqual(state, stateBefore);
  });

test('Phase 7 operation contract publishes exact executable combinations',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    const captured = [];
    await phase7Command({
      state,
      contracts,
      model: async (request) => {
        captured.push(request);
        return phase7AutonomousPlan(request, 'wait');
      }
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'exact-wait')
    });
    const contract = captured[0].decision_scope.operation_contract;
    assert.deepEqual(contract.request_activity.allowed, [
      { activity_kind: 'wait', target_refs: [] },
      {
        activity_kind: 'carry',
        target_refs: ['trace_ld_v1_container_road_bag', 'river_access']
      }
    ]);
    assert.equal(Object.hasOwn(contract, 'request_movement'), true);
    assert.equal(Object.hasOwn(contract.request_activity, 'activity_kinds'),
      false);
    const validWait = phase7AutonomousPlan(captured[0], 'wait');
    const validCarry = phase7AutonomousPlan(captured[0], 'move_bag');
    const invalidCarry = phase7AutonomousPlan(captured[0], 'move_bag');
    invalidCarry.operations[0].target_refs = [contracts.roadBag.item_ref];
    assert.equal(validateNpcStepPlan(validWait, captured[0]), true);
    assert.equal(validateNpcStepPlan(validCarry, captured[0]), true);
    assert.equal(validateNpcStepPlan(invalidCarry, captured[0]), false);
  });
