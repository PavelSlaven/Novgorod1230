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
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';

const bundle = await loadScenarioBundle(15);
const COMPOUND_TURN_10 =
  'Отдохнуть у огня полчаса и подсушить одежду. '
  + 'Попросить Еремея и рыбака пойти со мной к Жданко.';

test('canonical Turn 10 runs real rest and companion conversation in one semantic turn', async () => {
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
      return phase7AutonomousPlan(request, 'move_bag');
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
    .state.zone_ref, 'river_access');
  assert.equal(runtimeFixture.state.npcs.find(
    ({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller')
    .machine_state.spatial_zone_ref, 'river_access');
  assert.deepEqual(runtimeFixture.state.route_participant_commitments.map(
    ({ role }) => role).sort(), [
      'escort', 'guide', 'stay_with_onisim', 'witness'
    ]);
  assert.equal(runtimeFixture.state.route_activity_admissions.length, 3);
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
    .state.zone_ref, 'river_access');
  assert.equal(persisted.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller')
    .machine_state.spatial_zone_ref, 'river_access');
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

test('either fisher may choose either approved participation binding',
  async () => {
    const { state, contracts } = turn10State({ completedRest: false });
    const preferredFisherRoles = new Map([
      [contracts.actors.participatingFisher.instance_id, 'escort'],
      [contracts.actors.otherFisher.instance_id, 'stay_with_onisim']
    ]);
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
      playerConversationModel: (request) => playerPlan(request, contracts),
      npcSemanticModel: (request) => npcPlan(
        request, contracts, preferredFisherRoles),
      npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
    });
    await runtimeFixture.runtime.submitTurn({
      partyId: runtimeFixture.partyId,
      input: {
        request_id: 'turn10-swapped-fisher-roles',
        idempotency_key: 'turn10-swapped-fisher-roles',
        raw_text: COMPOUND_TURN_10
      }
    });
    const commitments = new Map(runtimeFixture.state
      .route_participant_commitments.map(({ npc_ref: npc, role }) =>
        [npc.entity_id, role]));

    assert.equal(commitments.get(
      contracts.actors.participatingFisher.instance_id), 'escort');
    assert.equal(commitments.get(
      contracts.actors.otherFisher.instance_id), 'stay_with_onisim');
  });

test('Turn 10 rejects an unsupported second plan chosen from current state',
  async () => {
    const { state, contracts } = turn10State({ completedRest: false });
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
      turnStepModel(request) {
        const semantic = turn10StepPlan(request, contracts);
        if (request.step_index === 2) {
          semantic.operations = [{
            op: 'request_activity',
            actor_ref: request.actor.actor_id,
            activity_kind: 'recover',
            target_refs: [request.player_safe_state.position.location_ref],
            description: 'снова отдыхать'
          }];
        }
        return semantic;
      },
      npcAutonomousModel: (request) => phase7AutonomousPlan(request, 'wait')
    });
    await assert.rejects(() => runtimeFixture.runtime.submitTurn({
      partyId: runtimeFixture.partyId,
      input: {
        request_id: 'turn10-reservation-mismatch',
        idempotency_key: 'turn10-reservation-mismatch',
        raw_text: COMPOUND_TURN_10
      }
    }), ({ code }) => code === 'TURN_STEP_PREPARED_DOMAIN_PLAN_UNSUPPORTED');
    assert.equal(runtimeFixture.commitCount(), 0);
  });

test('a stale Phase 7 response restarts the whole root turn on current state',
  async () => {
    const { state } = turn10State({ completedRest: false });
    const initialVersion = state.party_state.state_version;
    const requestedVersions = [];
    let runtimeFixture;
    runtimeFixture = fixture({
      scenarioBundle: bundle,
      materializationBundle: bundle,
      committedState: state,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [
          ...npcTemporalEffectRegistrations(),
          ...lowerDvinaTracePhase7TemporalEffectRegistrations()
        ]
      }),
      npcAutonomousModel(request) {
        requestedVersions.push(request.committed_state_version);
        if (requestedVersions.length === 1) {
          runtimeFixture.state.party_state.state_version += 1;
        }
        return phase7AutonomousPlan(request, 'wait');
      }
    });

    await runtimeFixture.runtime.submitTurn({
      partyId: runtimeFixture.partyId,
      input: {
        request_id: 'phase7-stale-root-retry',
        idempotency_key: 'phase7-stale-root-retry',
        raw_text: 'Отдохнуть у огня полчаса и подсушить одежду.'
      }
    });

    assert.deepEqual(requestedVersions, [initialVersion, initialVersion + 1]);
    assert.equal(runtimeFixture.commitCount(), 1);
    const factual = runtimeFixture.lastWritePlan().write_targets.find(
      ({ target }) => target === 'party_state').value;
    assert.equal(factual.mode_resolution.decision_trace.state_version,
      initialVersion + 1);
    assert.equal(factual.consequence.phase7.autonomous.request
      .committed_state_version, initialVersion + 1);
    assert.equal(factual.consequence.duration_minutes, 30);
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
  state.body_state.energy = 35;
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
  const companionOperation = {
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
  const operation = first ? {
    op: 'request_activity',
    actor_ref: request.actor.actor_id,
    activity_kind: 'recover',
    target_refs: [request.player_safe_state.position.location_ref],
    description: 'отдохнуть у огня полчаса и подсушить одежду'
  } : companionOperation;
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
      depends_on_refs: [
        request.player_safe_state.position.location_ref,
        contracts.actors.eremey.instance_id,
        contracts.actors.participatingFisher.instance_id,
        contracts.actors.otherFisher.instance_id
      ]
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

function npcPlan(request, contracts, preferredFisherRoles = null) {
  const contract = request.decision_scope.operation_contract
    .commit_route_participation;
  const preferredRole = preferredFisherRoles?.get(request.npc_ref.entity_id)
    ?? (request.npc_ref.entity_id
      === contracts.actors.participatingFisher.instance_id
      ? 'stay_with_onisim'
      : request.npc_ref.entity_id === contracts.actors.otherFisher.instance_id
        ? 'escort' : null);
  const bound = contract.allowed_bindings.find(({ role }) =>
    preferredRole === null || role === preferredRole);
  const operation = { op: 'commit_route_participation', ...bound };
  const playerRef = request.public_conversation_history.at(-1).speaker_ref;
  const asksRatsha = request.npc_ref.entity_id
    === contracts.actors.eremey.instance_id;
  const isRatsha = request.npc_ref.entity_id
    === contracts.actors.ratsha.instance_id;
  const ratshaRef = ref('npc', contracts.actors.ratsha.instance_id);
  const addressee = asksRatsha ? ratshaRef : playerRef;
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: addressee,
    intended_addressee_refs: [addressee],
    affected_actor_refs: [],
    speech: {
      ...speech(asksRatsha ? 'Ратша, повтори свой рассказ.'
        : isRatsha ? 'Возьмите меня с собой к Жданко.' : 'Согласен.',
      asksRatsha ? 'question' : isRatsha ? 'request' : 'accept'),
      response_expectation: asksRatsha ? {
        kind: 'answer_requested', target_refs: [ratshaRef]
      } : { kind: 'none', target_refs: [] }
    },
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
