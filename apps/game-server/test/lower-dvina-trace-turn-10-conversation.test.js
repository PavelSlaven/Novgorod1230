import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTemporalAdvanceOwner,
  npcTemporalEffectRegistrations
} from '@rus/turn/temporal-advance';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { resolveTracePhase5Contracts } from
  '../src/runtime/lower-dvina-trace-phase-5-contracts.js';
import { resolveTraceTurn10Contracts } from
  '../src/runtime/lower-dvina-trace-turn-10-contracts.js';
import { commitLowerDvinaTracePhase2 } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import {
  prepareTraceTurn10PlayerPlan,
  resolveTraceTurn10ConversationExchange
} from '../src/runtime/lower-dvina-trace-turn-10-conversation.js';

const bundle = await loadScenarioBundle(15);
const COMPOUND_TURN_10 =
  'Отдохнуть у огня полчаса и подсушить одежду. '
  + 'Попросить Еремея и рыбака пойти со мной к Жданко.';

test('Turn 10 conversation resolves three code-admitted NPC commitments at the post-rest timestamp', async () => {
  const { state, contracts } = turn10State();
  let playerCalls = 0;
  let npcCalls = 0;
  const playerConversationModel = (request) => {
    playerCalls += 1;
    return playerPlan(request, contracts);
  };
  const npcSemanticModel = (request) => {
    npcCalls += 1;
    return npcPlan(request);
  };
  const input = {
    state,
    contracts,
    playerInput: {
      raw_text: 'Попросить Еремея и рыбаков пойти со мной к Жданко.'
    },
    inputDigest: 'e'.repeat(64),
    playerConversationModel,
    npcSemanticModel,
    revalidateStateVersion: async () => state.party_state.state_version
  };
  const playerPlanValue = await prepareTraceTurn10PlayerPlan(input);
  const result = await resolveTraceTurn10ConversationExchange({
    ...input,
    playerPlan: playerPlanValue
  });

  assert.equal(playerCalls, 1);
  assert.equal(npcCalls, 3);
  assert.equal(result.exact_elapsed_minutes, 0);
  assert.deepEqual(result.clock_after, state.clock);
  assert.deepEqual(result.npc_outcomes.filter(({ applied }) => applied)
    .map(({ outcome }) => outcome.role).sort(), [
      'escort', 'guide', 'stay_with_onisim'
    ]);
  assert.equal(result.pending_npc_execution, null);
  assert.equal(result.pending_player_execution, null);
});

test('canonical Turn 10 runs real rest and companion conversation in one semantic turn', async () => {
  const { state, contracts } = turn10State({ completedRest: false });
  let autonomousCalls = 0;
  let playerCalls = 0;
  let npcCalls = 0;
  const runtimeFixture = fixture({
    scenarioBundle: bundle,
    materializationBundle: bundle,
    committedState: state,
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations: [
        ...npcTemporalEffectRegistrations(),
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
        String(Number(state.clock.whole_minutes) + 30));
      return playerPlan(request, contracts);
    },
    npcSemanticModel(request) {
      npcCalls += 1;
      return npcPlan(request);
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
  assert.equal(npcCalls, 3);
  assert.equal(runtimeFixture.commitCount(), 1);
  const factual = runtimeFixture.lastWritePlan().write_targets.find(
    ({ target }) => target === 'party_state').value;
  assert.equal(factual.consequence.duration_minutes, 30);
  assert.equal(factual.consequence.phase7_kind, 'fire_rest');
  assert.equal(factual.consequence.turn10_kind, 'companion_request');
  const conversationWorld = factual.consequence.conversation.semantic_exchange
    .exchange.working_state.world_state;
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
  assert.equal(runtimeFixture.state.clock.whole_minutes,
    String(Number(state.clock.whole_minutes) + 30));
  assert.deepEqual(runtimeFixture.state.route_participant_commitments.map(
    ({ role }) => role).sort(), ['escort', 'guide', 'stay_with_onisim']);
  assert.equal(runtimeFixture.state.route_activity_admissions.length, 2);
  assert.ok(runtimeFixture.state.route_knowledge.includes(
    contracts.binding.route_ref));
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
  assert.equal(persisted.party_state.state_version,
    state.party_state.state_version + 1);
  assert.equal(persisted.party_state.turn_number,
    state.party_state.turn_number + 1);
  assert.deepEqual(persisted.route_participant_commitments.map(
    ({ role }) => role).sort(), ['escort', 'guide', 'stay_with_onisim']);
  assert.equal(JSON.stringify(persisted).includes('companions_assigned'),
    false);
  assert.equal(JSON.stringify(persisted).includes('known_path_to_klet'),
    false);

  const replay = await runtimeFixture.runtime.submitTurn({
    partyId: runtimeFixture.partyId,
    input
  });
  assert.deepEqual(replay, first);
  assert.equal(runtimeFixture.turnStepCount(), 2);
  assert.equal(autonomousCalls, 1);
  assert.equal(playerCalls, 1);
  assert.equal(npcCalls, 3);
  assert.equal(runtimeFixture.commitCount(), 1);
});

function turn10State({ completedRest = true } = {}) {
  const state = structuredClone(fixture({ scenarioBundle: bundle }).state);
  const phase3 = resolveTracePhase3Contracts({ state, bundle });
  const camp = state.prepared_scenes.find(
    ({ location_profile_ref: ref }) => ref === phase3.ids.campLocation);
  state.position = {
    ...state.position,
    location_ref: phase3.ids.campLocation,
    g5_anchor_id: phase3.campAnchor,
    g5_node_id: camp.node.instance_id
  };
  for (const npc of state.npcs) {
    if (![
      'eremey_fisher', 'ratsha_storehouse_helper', 'onisim_boatman',
      'background_fisher_1', 'background_fisher_2'
    ].includes(npc.participant_slot_ref)) continue;
    npc.anchor_id = phase3.campAnchor;
    npc.machine_state = {
      ...(npc.machine_state ?? {}),
      status: npc.participant_slot_ref === 'onisim_boatman'
        ? 'incapacitated' : 'active',
      ...(npc.participant_slot_ref === 'onisim_boatman'
        ? { spatial_zone_ref: 'fire_rest_area' } : {})
    };
  }
  const zhdanko = state.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller');
  zhdanko.check_body_state = {
    health: 100,
    satiety: 100,
    energy: 50,
    active_conditions: []
  };
  zhdanko.machine_state = {
    ...(zhdanko.machine_state ?? {}),
    load_category: 'moderate'
  };
  state.phase6_carry_execution = { status: 'completed' };
  const bodyConditions = [
    ['trace_ld_v1_condition_wet_clothing', 'wet'],
    ['trace_ld_v1_condition_cold_shivering', 'strong_shivering'],
    ['trace_ld_v1_condition_headache', 'headache'],
    ['trace_ld_v1_condition_shoulder_bruise', 'shoulder_bruise']
  ];
  state.body_state.active_conditions = bodyConditions.map(
    ([profile, condition], index) => ({
      id: condition,
      storage_condition_id: `turn10-condition-${index}`,
      condition_profile_ref: profile,
      status: 'active',
      state_version: 1
    }));
  if (completedRest) state.phase7_fire_rest = { status: 'completed' };
  const committed = JSON.parse(JSON.stringify(state));
  const phase5 = resolveTracePhase5Contracts({ state: committed, bundle });
  return {
    state: committed,
    contracts: resolveTraceTurn10Contracts({
      state: committed, bundle, phase3Contracts: phase3,
      phase5Contracts: phase5
    })
  };
}

function turn10StepPlan(request, contracts) {
  const first = request.step_index === 1;
  const operation = first ? {
    op: 'request_activity',
    actor_ref: request.actor.actor_id,
    activity_kind: 'recover',
    target_refs: [request.player_safe_state.position.location_ref],
    description: 'отдохнуть у огня полчаса и подсушить одежду'
  } : {
    op: 'emit_interaction',
    actor_ref: request.actor.actor_id,
    interaction_kind: 'request',
    target_actor_refs: [
      contracts.actors.eremey.instance_id,
      contracts.actors.participatingFisher.instance_id,
      contracts.actors.otherFisher.instance_id
    ],
    instrument_refs: [],
    content: 'попросить Еремея и рыбака пойти к Жданко'
  };
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: {
      player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation],
    check: null,
    continuation: first ? {
      remaining_intent:
        'Попросить Еремея и рыбака пойти со мной к Жданко.',
      depends_on_refs: [request.player_safe_state.position.location_ref]
    } : null,
    clarification: null,
    reason_code: first ? 'rest_then_request_companions' : 'request_companions',
    reason: 'Каждая часть составной заявки передаётся её владельцу.'
  };
}

function playerPlan(request, contracts) {
  const addressees = [
    contracts.actors.eremey,
    contracts.actors.participatingFisher,
    contracts.actors.otherFisher
  ].map(({ instance_id: id }) => ref('npc', id));
  return {
    schema: 'player_conversation_contribution_plan_v1',
    request_id: request.request_id,
    conversation_id: request.conversation_id,
    state_version: request.state_version,
    speaker_ref: request.speaker_ref,
    input_mode: 'verbatim',
    contribution_kind: 'speech',
    primary_addressee_ref: addressees[0],
    intended_addressee_refs: addressees,
    affected_actor_refs: [],
    speech: speech(request.raw_text, 'request'),
    interpretation: interpretation(),
    resolution: 'automatic',
    activity: activity(),
    supporting_operations: [],
    check: null,
    handoff: null
  };
}

function npcPlan(request) {
  const contract = request.decision_scope.operation_contract
    .commit_route_participation;
  const { owner: _owner, ...bound } = contract;
  const operation = { op: 'commit_route_participation', ...bound };
  const playerRef = request.public_conversation_history.at(-1).speaker_ref;
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: playerRef,
    intended_addressee_refs: [playerRef],
    affected_actor_refs: [],
    speech: speech('Согласен.', 'accept'),
    interpretation: interpretation(),
    resolution: 'automatic',
    activity: activity(),
    supporting_operations: [operation],
    check: null,
    handoff: null,
    reason: 'Персонаж самостоятельно принимает просьбу.'
  };
}

function speech(text, dominantAct) {
  return {
    utterance_text: text,
    dominant_act: dominantAct,
    interaction_tags: [],
    topic_refs: [],
    claims: [],
    response_expectation: { kind: 'none', target_refs: [] }
  };
}

function interpretation() {
  return {
    intent: 'обсудить состав группы',
    grounded_contribution: 'обсудить состав группы',
    adaptation: 'literal'
  };
}

function activity() {
  return { duration_class: 'domain_owned', effort: 'none' };
}

function ref(entity_kind, entity_id) {
  return { entity_kind, entity_id };
}
