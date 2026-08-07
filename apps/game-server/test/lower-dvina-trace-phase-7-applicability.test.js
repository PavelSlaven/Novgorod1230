import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateNpcStepPlan } from '@rus/npc-runtime';
import {
  approvedPhase7Contracts,
  phase7AutonomousPlan,
  phase7DirectPlan,
  phase7GenericCheckPlan
} from './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  phase7Command,
  phase7CommittedState,
  phase7PlayerInput,
  persistPhase7Consequence
} from './lower-dvina-trace-phase-7-runtime-fixture.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';

const ownerProfilesUrl = new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json',
  import.meta.url
);

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
    ['npc-actor-step:phase7-party:zhdanko-1:complete']
  );
  const candidateRef = {
    entity_kind: 'temporal_boundary_candidate',
    entity_id: consequence.phase7.temporal.terminal_candidate.boundary_id
  };
  assert.deepEqual(consequence.phase7.temporal.projection.waiting_transition
    .source_candidate_ref, candidateRef);
  assert.deepEqual(consequence.phase7.autonomous.signal.source_event_ref, {
    entity_kind: 'npc_activity_factual_transition',
    entity_id: consequence.phase7.temporal.projection.waiting_transition
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
    .active_npc_actor_step.decision_trace_ref]);
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

test('Phase 7 keeps overlong NPC activity active after Mikula rest ends',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    let modelCalls = 0;
    const consequence = await phase7Command({ state, contracts,
      model: async (request) => {
        const plan = phase7DirectPlan(request);
        modelCalls += 1;
        plan.activity.duration_class = 'short';
        return plan;
      }
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'overlong-direct-activity')
    });

    assert.equal(modelCalls, 1);
    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(consequence.phase7.schedule_temporal.elapsed_after_decision, 5);
    assert.equal(
      consequence.phase7.schedule_temporal.projection.active_npc_actor_step
        .status,
      'started'
    );
    assert.deepEqual(
      consequence.phase7.schedule_temporal.projection.active_npc_actor_step
        .planned_exact_elapsed.exact_minutes,
      { numerator: '15', denominator: '1' }
    );
    assert.equal(consequence.phase7.schedule_execution.status, 'started');
    assert.deepEqual(
      consequence.phase7.schedule_temporal.result.trace.processed_boundary_ids,
      []
    );

    const { snapshot } = await persistPhase7Consequence({
      state, contracts, consequence
    });
    const zhdanko = snapshot.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller');
    assert.equal(snapshot.clock.whole_minutes, '130');
    assert.equal(snapshot.phase7_fire_rest.status, 'completed');
    assert.equal(snapshot.phase7_fire_rest.schedule_result.status, 'started');
    assert.equal(zhdanko.machine_state.status, 'active');
    assert.equal(zhdanko.machine_state.active_npc_actor_step.status, 'started');
    assert.equal(zhdanko.machine_state.spatial_zone_ref, 'storehouse_inside');
    assert.equal(zhdanko.machine_state.last_schedule_execution.status,
      'started');
  });

test('Phase 7 executes a valid autonomous generic check without blocking rest',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    const rawProfiles = await readFile(ownerProfilesUrl);
    const owners = createLowerDvinaTraceTurnStepGenericOwners({
      profiles: JSON.parse(rawProfiles),
      artifactPin: {
        digest: createHash('sha256').update(rawProfiles).digest('hex')
      }
    });
    let rolls = 0;
    const consequence = await phase7Command({
      state,
      contracts,
      genericCheckContextOwner: owners.genericCheckContextOwner,
      randomSource: { next() { rolls += 1; return 0.95; } },
      model: async (request) => phase7GenericCheckPlan(request)
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'generic-check')
    });

    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(rolls, 1);
    assert.equal(consequence.phase7.actor_step_check.result.outcome.band,
      'clean_success');
    assert.equal(consequence.phase7.actor_step_check.result.modifiers
      .equipment, -1);
    assert.equal(consequence.phase7.schedule_temporal.result.clock_after
      .whole_minutes, '130');
    const persisted = await persistPhase7Consequence({
      state, contracts, consequence
    });
    assert.equal(persisted.snapshot.clock.whole_minutes, '130');
    const attempt = [
      ...persisted.plan.inserts,
      ...persisted.plan.updates,
      ...persisted.plan.appends
    ].find(({ target_table: table }) =>
      table === 'party_timed_activity_attempts').record;
    assert.equal(attempt.trace.npc_actor_step_check.result.outcome.band,
      'clean_success');
  });

test('Phase 7 generic check uses live NPC body and load, not binding snapshot',
  async () => {
    const state = phase7CommittedState();
    const zhdanko = state.npcs.find(
      ({ instance_id: id }) => id === 'zhdanko-1'
    );
    zhdanko.check_body_state = {
      health: 10, satiety: 100, energy: 10, active_conditions: []
    };
    zhdanko.machine_state.load_category = 'heavy';
    const contracts = approvedPhase7Contracts(state);
    assert.equal(Object.hasOwn(contracts.genericCheckContext, 'body'), false);
    assert.equal(Object.hasOwn(contracts.genericCheckContext, 'inventory'),
      false);
    const rawProfiles = await readFile(ownerProfilesUrl);
    const owners = createLowerDvinaTraceTurnStepGenericOwners({
      profiles: JSON.parse(rawProfiles),
      artifactPin: {
        digest: createHash('sha256').update(rawProfiles).digest('hex')
      }
    });
    const consequence = await phase7Command({
      state,
      contracts,
      genericCheckContextOwner: owners.genericCheckContextOwner,
      randomSource: { next() { return 0.95; } },
      model: async (request) => phase7GenericCheckPlan(request)
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'generic-check-live')
    });
    const modifiers = consequence.phase7.actor_step_check.result.modifiers;
    assert.equal(modifiers.state, -2);
    assert.equal(modifiers.equipment, -2);
  });

test('Phase 7 composes an approved generic-check additional activity',
  async () => {
    const state = phase7CommittedState();
    const contracts = approvedPhase7Contracts(state);
    const rawProfiles = await readFile(ownerProfilesUrl);
    const owners = createLowerDvinaTraceTurnStepGenericOwners({
      profiles: JSON.parse(rawProfiles),
      artifactPin: {
        digest: createHash('sha256').update(rawProfiles).digest('hex')
      }
    });
    const consequence = await phase7Command({
      state,
      contracts,
      genericCheckContextOwner: owners.genericCheckContextOwner,
      randomSource: { next() { return 0.2; } },
      model: async (request) => phase7GenericCheckPlan(request, {
        successWithCostActivity: {
          duration_class: 'short', effort: 'none'
        }
      })
    }).consequence({
      retrievedState: state,
      playerInput: phase7PlayerInput(state, 'generic-check-additional')
    });

    assert.equal(consequence.status, 'resolved');
    assert.equal(consequence.duration_minutes, 30);
    assert.equal(consequence.phase7.actor_step_check.result.outcome.band,
      'success_with_cost');
    assert.deepEqual(
      consequence.phase7.schedule_execution.exact_elapsed.exact_minutes,
      { numerator: '16', denominator: '1' }
    );
    assert.deepEqual(
      consequence.phase7.schedule_execution.additional_semantic_operations,
      [{ op: 'apply_semantic_activity', activity: {
        owner: 'semantic', duration_class: 'short', effort: 'none'
      } }]
    );
    assert.equal(consequence.phase7.schedule_execution.status, 'started');
    assert.equal(consequence.phase7.schedule_temporal.result.clock_after
      .whole_minutes, '130');
    const persisted = await persistPhase7Consequence({
      state, contracts, consequence
    });
    const attempt = [
      ...persisted.plan.inserts,
      ...persisted.plan.updates,
      ...persisted.plan.appends
    ].find(({ target_table: table }) =>
      table === 'party_timed_activity_attempts').record;
    assert.deepEqual(
      attempt.trace.npc_schedule_result.additional_semantic_operations,
      consequence.phase7.schedule_execution.additional_semantic_operations
    );
    const forgedCheck = structuredClone(consequence);
    forgedCheck.phase7.actor_step_check.result.total += 1;
    await assert.rejects(() => persistPhase7Consequence({
      state, contracts, consequence: forgedCheck
    }), { code: 'TRACE_PHASE_7_OWNER_RESULT_INVALID' });

    const omittedCost = structuredClone(consequence);
    const phase7 = omittedCost.phase7;
    delete phase7.actor_step.additional_semantic_operations;
    delete phase7.schedule_execution.additional_semantic_operations;
    delete phase7.schedule_temporal.projection.active_npc_actor_step
      .additional_semantic_operations;
    phase7.actor_step.exact_elapsed.exact_minutes.numerator = '1';
    phase7.schedule_execution.exact_elapsed.exact_minutes.numerator = '1';
    const active = phase7.schedule_temporal.projection.active_npc_actor_step;
    active.planned_exact_elapsed.exact_minutes.numerator = '1';
    active.status = 'completed';
    active.completed_at = { whole_minutes: '126',
      subminute_numerator: '0', subminute_denominator: '1' };
    phase7.schedule_execution.status = 'executed';
    phase7.schedule_execution.clock_after = structuredClone(
      active.completed_at);
    phase7.schedule_temporal.completion_candidate.scheduled_at =
      structuredClone(active.completed_at);
    await assert.rejects(() => persistPhase7Consequence({
      state, contracts, consequence: omittedCost
    }), { code: 'TRACE_PHASE_7_OWNER_RESULT_INVALID' });
  });
