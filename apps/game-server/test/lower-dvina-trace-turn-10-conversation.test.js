import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceTurn10CompanionCommand } from
  '../src/runtime/lower-dvina-trace-turn-10-command.js';
import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import {
  turn10ActionSet
} from './lower-dvina-trace-turn-10-conversation-fixture.js';
import {
  bundle, COMPOUND_TURN_10, fixture, npcPlan, playerPlan, ref, turn10State,
  turn10StepPlan
} from './lower-dvina-trace-turn-10-conversation-fixture.js';
import {
  createTemporalAdvanceOwner,
  npcTemporalEffectRegistrations
} from '@rus/turn/temporal-advance';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';

test('Turn 10 companion action requires active Phase 7 parent temporal',
  async () => {
    const { state, contracts } = turn10State({ completedRest: false });
    state.phase7_fire_rest = { status: 'active' };
    state.phase7_parent_temporal = {
      execution_id: 'phase7-rest', limit_timestamp: structuredClone(state.clock),
      completion_effect: {}
    };
    state.cumulative_elapsed_minutes = 25;
    state.active_npc_actor_steps = [{ status: 'started' }];
    const command = createTraceTurn10CompanionCommand({ contracts,
      inputDigest: '0'.repeat(64) });

    assert.equal((await command.availability({ committed_state: state,
      action_set_evaluation: true })).can_attempt, true);
    assert.deepEqual((await turn10ActionSet(state, command, contracts))
      .options.map(({ option_id: id }) => id), ['request_storehouse_companions',
      'test_fallback']);

    state.phase7_fire_rest = { status: 'completed' };
    delete state.phase7_parent_temporal;
    assert.equal((await command.availability({ committed_state: state,
      action_set_evaluation: true })).status, 'blocked');
    assert.deepEqual((await turn10ActionSet(state, command, contracts))
      .options.map(({ option_id: id }) => id), ['test_fallback']);
  });
test('canonical Turn 10 preserves parent activity for prepared followup marker', async () => {
  const { state, contracts } = turn10State({ completedRest: false });
  let autonomousCalls = 0;
  let playerCalls = 0;
  let npcCalls = 0;
  const fisherAffordances = [];
  const runtimeFixture = fixture({
    scenarioBundle: bundle,
    materializationBundle: bundle,
    committedState: state,
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations: [
        ...npcTemporalEffectRegistrations(),
        ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
        ...lowerDvinaTracePhase7TemporalEffectRegistrations()
      ]
    }),
    turnStepModel: (request) => turn10StepPlan(request, contracts),
    playerConversationModel(request) {
      playerCalls += 1;
      assert.equal(request.raw_text,
        'Попросить Еремея и рыбака пойти со мной к Жданко.');
      assert.equal(request.player_safe_context.current_game_timestamp
        .whole_minutes,
        String(Number(state.clock.whole_minutes) + 25));
      return playerPlan(request, contracts);
    },
    npcSemanticModel(request) {
      npcCalls += 1;
      if ([contracts.actors.participatingFisher.instance_id,
        contracts.actors.otherFisher.instance_id]
        .includes(request.npc_ref.entity_id)) {
        fisherAffordances.push(request.decision_scope.operation_contract
          .commit_route_participation);
      }
      return npcPlan(request, contracts);
    },
    npcAutonomousModel(request) {
      autonomousCalls += 1;
      return phase7AutonomousPlan(request, 'wait');
    }
  });
  const input = {
    request_id: 'canonical-turn-10',
    idempotency_key: 'canonical-turn-10',
    raw_text: COMPOUND_TURN_10
  };
  const first = await runtimeFixture.runtime.submitTurn({
    partyId: runtimeFixture.partyId,
    input
  });

  assert.equal(runtimeFixture.turnStepCount(), 2);
  assert.equal(autonomousCalls, 1);
  assert.equal(playerCalls, 1);
  assert.equal(npcCalls, 4);
  assert.equal(fisherAffordances.length, 2);
  for (const affordance of fisherAffordances) {
    assert.deepEqual(affordance.allowed_bindings.map(
      ({ role }) => role).sort(), ['escort', 'stay_with_onisim']);
  }
  assert.equal(runtimeFixture.commitCount(), 1);
  const factual = runtimeFixture.lastWritePlan().write_targets.find(
    ({ target }) => target === 'party_state').value;
  assert.equal(factual.consequence.duration_minutes, 30);
  assert.equal(factual.consequence.phase7_kind, 'fire_rest');
  assert.equal(factual.consequence.turn10_kind, 'companion_request');
  const conversationWorld = factual.consequence.conversation.semantic_exchange
    .exchange.working_state.world_state;
  const semantic = factual.consequence.conversation.semantic_exchange;
  assert.equal(semantic.exact_elapsed_minutes, 5);
  assert.equal(semantic.time_accounting.mode,
    'parent_activity_final_segment');
  assert.equal(semantic.time_accounting.clock_before.whole_minutes,
    String(Number(state.clock.whole_minutes) + 25));
  assert.equal(semantic.time_accounting.clock_after.whole_minutes,
    String(Number(state.clock.whole_minutes) + 30));
  assert.equal(semantic.statements.some(({ speaker_ref: speaker,
    utterance_text: text }) =>
    speaker.entity_id === contracts.actors.ratsha.instance_id
      && text === 'Возьмите меня с собой к Жданко.'), true);
  assert.equal(conversationWorld.npcs.find(
    ({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller')
    .machine_state.npc_schedule_history.length, 1);
  assert.deepEqual(factual.time_update.prepared_effect_ledger.slices.map(
    ({ owner_ref: owner }) => owner), [
      'lower_dvina_trace.rest_by_fire_and_dry_clothing',
      'lower_dvina_trace.request_eremey_and_fisher_to_zhdanko_storehouse'
    ]);
  assert.equal(runtimeFixture.state.phase7_fire_rest.status, 'completed');
  assert.equal(runtimeFixture.state.body_state.energy, 38);
  assert.equal(runtimeFixture.state.body_effect_history.length, 1);
  assert.equal(runtimeFixture.state.clock.whole_minutes,
    String(Number(state.clock.whole_minutes) + 30));
  assert.equal(runtimeFixture.state.containers.find(
    ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag')
    .state.zone_ref, 'storehouse_interior');
  assert.equal(runtimeFixture.state.npcs.find(
    ({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller')
    .machine_state.spatial_zone_ref, 'storehouse_yard');
  assert.deepEqual(runtimeFixture.state.route_participant_commitments.map(
    ({ role }) => role).sort(), [
      'escort', 'guide', 'stay_with_onisim', 'witness'
    ]);
  assert.equal(runtimeFixture.state.route_activity_admissions.length, 3);
  assert.ok(runtimeFixture.state.route_knowledge.includes(
    contracts.binding.route_ref));
  assert.deepEqual(runtimeFixture.state.knowledge.map(({ fact_id: id }) => id),
    runtimeFixture.state.knowledge.map(({ fact_id: id }) => id).sort());
  const serialized = JSON.stringify(runtimeFixture.state);
  assert.equal(serialized.includes('companions_assigned'), false);
  assert.equal(serialized.includes('known_path_to_klet'), false);

  const committedPlans = [];
  await commitLowerDvinaTracePhase2({
    ...runtimeFixture.lastCommitInput(),
    loadState: async () => structuredClone(state),
    committer: { async commit({ plan }) {
      committedPlans.push(plan);
      return { ok: true, replay: false,
        change_set_id: plan.change_set_id };
    } }
  });
  assert.equal(committedPlans.length, 1);
  const persisted = committedPlans[0].inserts.find(
    ({ target_table: table }) => table === 'party_state_snapshots')
    .record.state_payload;
  const rootTurnId = factual.mode_resolution.turn_id;
  const decisionTraces = committedPlans[0].appends.filter(
    ({ target_table: table }) => table === 'party_npc_decision_traces');
  assert.ok(decisionTraces.length >= 5);
  assert.deepEqual(new Set(decisionTraces.map(
    ({ record }) => record.root_turn_id)), new Set([rootTurnId]));
  assert.equal(factual.consequence.phase7.autonomous.request.root_turn_id,
    rootTurnId);
  assert.equal(persisted.party_state.state_version,
    state.party_state.state_version + 1);
  assert.equal(persisted.party_state.turn_number,
    state.party_state.turn_number + 1);
  assert.equal(persisted.body_effect_history.length, 1);
  assert.equal(persisted.containers.find(
    ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag')
    .state.zone_ref, 'storehouse_interior');
  assert.equal(persisted.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller')
    .machine_state.spatial_zone_ref, 'storehouse_yard');
  assert.deepEqual(persisted.route_participant_commitments.map(
    ({ role }) => role).sort(), [
      'escort', 'guide', 'stay_with_onisim', 'witness'
    ]);
  assert.equal(JSON.stringify(persisted).includes('companions_assigned'),
    false);
  assert.equal(JSON.stringify(persisted).includes('known_path_to_klet'),
    false);

  const stateAfterFirst = structuredClone(runtimeFixture.state);
  const replay = await runtimeFixture.runtime.submitTurn({
    partyId: runtimeFixture.partyId,
    input
  });
  assert.deepEqual(replay, first);
  assert.equal(runtimeFixture.turnStepCount(), 2);
  assert.equal(autonomousCalls, 1);
  assert.equal(playerCalls, 1);
  assert.equal(npcCalls, 4);
  assert.equal(runtimeFixture.commitCount(), 1);
  assert.deepEqual(runtimeFixture.state, stateAfterFirst);
});
