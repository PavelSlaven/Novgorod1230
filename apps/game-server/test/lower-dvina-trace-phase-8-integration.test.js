import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { validateNpcCombatPlanApplicability } from '@rus/npc-runtime';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';
import { createTracePhase8Runtime } from
  '../src/runtime/lower-dvina-trace-phase-8-runtime.js';

const bundle = await loadScenarioBundle(16);
const ROUTE_TEXT =
  'Идти к Жданко всем вместе. Ратшу держать между нами. Не входить тайком.';

test('revision 16 does not construct Phase 8 before an escort commits', () => {
  assert.equal(createTracePhase8Runtime({
    state: { route_participant_commitments: [] },
    bundle
  }), null);
});

test('Phase 8 reaches the storehouse, opens combat, and commits one exchange',
  async () => {
    const state = phase8CampState();
    const ids = actorIds(state);
    const conversation = createM2ConversationModels({
      ratshaResponseKind: 'combat_handoff'
    });
    const runtime = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState: state,
      rollValue: 0.5,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [
          ...npcTemporalEffectRegistrations(),
          ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
          ...lowerDvinaTraceCombatTemporalEffectRegistrations()
        ]
      }),
      turnStepModel: (request) => phase8Plan(request, ids),
      playerConversationModel: conversation.playerConversationModel,
      npcSemanticModel: conversation.npcSemanticModel,
      npcCombatModel: (request) => combatPlan(request, ids) });

    const startMinute = Number(runtime.state.clock.whole_minutes);
    await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
      request_id: 'phase8-route', idempotency_key: 'phase8-route',
      raw_text: ROUTE_TEXT } });
    assert.equal(runtime.state.position.location_ref,
      'trace_ld_v1_loc_zhdanko_storehouse');
    assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 12);
    for (const id of [ids.eremey, ids.ratsha, ids.fisher]) {
      assert.equal(runtime.state.npcs.find(({ instance_id }) =>
        instance_id === id).anchor_id, runtime.state.position.g5_anchor_id);
    }

    await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
      request_id: 'phase8-accusation', idempotency_key: 'phase8-accusation',
      raw_text: 'Обвинить Жданко и потребовать вернуть дорожную сумку.' } });
    assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 17);
    assert.equal(runtime.state.combat_sessions.length, 1);
    assert.equal(runtime.state.combat_sessions[0].status, 'paused_for_player');
    assert.equal(runtime.state.combat_sessions[0].exchange_ordinal, 0);
    assert.equal(runtime.npcCombatCount(), 4);
    assert.equal(runtime.state.player_response_boundary.kind, 'combat');
    const healthBefore = runtime.state.body_state.health;
    const signalCountBefore = runtime.state.npc_decision_signals?.length ?? 0;

    const response = { request_id: 'phase8-combat-1',
      idempotency_key: 'phase8-combat-1',
      raw_text: 'Помочь Еремею обезоружить Жданко, не убивая его.' };
    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
    assert.equal(runtime.state.combat_sessions.length, 0);
    assert.equal(runtime.state.last_turn.consequence.combat.session_after
      .status, 'ended');
    assert.equal(runtime.state.last_turn.consequence.combat.session_after
      .participant_states.find(({ actor_ref: actor }) =>
        actor.entity_id === ids.zhdanko).combat_status, 'restrained');
    assert.ok(runtime.state.body_state.health < healthBefore);
    const axe = runtime.state.items.find(
      ({ template_id }) => template_id === 'trace_ld_v1_item_zhdanko_axe');
    assert.equal(axe.placement.holder_npc_id, ids.eremey);
    assert.equal(axe.ownership.controller_npc_id, ids.eremey);
    assert.equal(runtime.npcCombatCount(), 4);
    const terminalSignals = runtime.state.last_turn.consequence.combat
      .signal_records;
    const outcomeEvents = runtime.state.last_turn.consequence.combat
      .outcome_events;
    const disarmEvent = outcomeEvents.find(({ event_kind: kind }) =>
      kind === 'combat_item_transition_completed');
    const disarmSignal = terminalSignals.find(({ source_event_ref: source }) =>
      source.entity_kind === 'combat_event'
      && source.entity_id === disarmEvent?.event_id);
    assert.ok(disarmSignal);
    assert.equal(disarmEvent?.event_kind,
      'combat_item_transition_completed');
    assert.equal(disarmEvent?.item_ref.entity_id, axe.item_id);
    assert.equal(runtime.state.npc_decision_signals.length,
      signalCountBefore + terminalSignals.length);
    assert.equal(terminalSignals.every(({ signal_id: id }) =>
      runtime.state.consumed_npc_decision_signal_ids.includes(id)), true);
    assert.equal(runtime.state.last_turn.consequence.combat.session_after
      .participant_states.find(({ actor_ref: actor }) =>
        actor.entity_id === ids.zhdanko).current_intent, null);
    assert.equal(runtime.state.combat_history.at(-1).outcome_event_refs.some(
      (eventId) => eventId.endsWith(':ended')), true);
    assert.equal(runtime.state.player_response_boundary, null);
    const commitCount = runtime.commitCount();
    const rollCount = runtime.rollCount();

    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    assert.equal(runtime.commitCount(), commitCount);
    assert.equal(runtime.rollCount(), rollCount);
    assert.equal(runtime.npcCombatCount(), 4);
    assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
  });

test('Ratsha reaches the factual road bag through the movement owner',
  async () => {
    const state = phase8CampState();
    const ids = actorIds(state);
    const bag = state.containers.find(
      ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag');
    assert.equal(bag.state.zone_ref, 'storehouse_interior');
    const requests = [];
    const conversation = createM2ConversationModels({
      ratshaResponseKind: 'combat_handoff'
    });
    const runtime = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState: state, rollValue: 0.99,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [
          ...npcTemporalEffectRegistrations(),
          ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
          ...lowerDvinaTraceCombatTemporalEffectRegistrations()
        ]
      }),
      turnStepModel: (request) => phase8Plan(request, ids, 'hold'),
      playerConversationModel: conversation.playerConversationModel,
      npcSemanticModel: conversation.npcSemanticModel,
      npcCombatModel: (request) => {
        requests.push(structuredClone(request));
        return combatPlan(request, ids, { ratsha: 'reach',
          companions: 'hold' });
      } });
    const startMinute = Number(runtime.state.clock.whole_minutes);
    await openPhase8Combat(runtime, 'phase8-reach');
    const ratshaRequest = requests.find(({ npc_ref: npc }) =>
      npc.entity_id === ids.ratsha);
    assert.deepEqual(ratshaRequest.operation_contract
      .reachable_destination_refs, [
      { entity_kind: 'container', entity_id: bag.container_id }
    ]);

    const response = { request_id: 'phase8-reach-combat',
      idempotency_key: 'phase8-reach-combat',
      raw_text: 'Помочь Еремею удержать Жданко.' };
    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    const ratsha = runtime.state.npcs.find(
      ({ instance_id: id }) => id === ids.ratsha);
    assert.equal(ratsha.location_profile_ref,
      'trace_ld_v1_loc_zhdanko_storehouse');
    assert.equal(ratsha.zone_ref, 'storehouse_interior');
    assert.equal(ratsha.machine_state.spatial_zone_ref,
      'storehouse_interior');
    assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
    const movementEvent = runtime.state.last_turn.consequence.combat
      .outcome_events.find(({ actor_ref: actor, event_kind: kind }) =>
        kind === 'combat_position_transition_completed'
        && actor?.entity_id === ids.ratsha);
    assert.equal(movementEvent.destination_ref.entity_id, bag.container_id);
    assert.equal(runtime.state.combat_history.at(-1).outcome_event_refs
      .includes(movementEvent.event_id), true);
    const movementSignal = runtime.state.last_turn.consequence.combat
      .signal_records.find(({ source_event_ref: source }) =>
        source.entity_kind === 'combat_event'
        && source.entity_id === movementEvent.event_id);
    assert.equal(movementSignal?.subject_ref.entity_id, ids.ratsha);
    assert.equal(movementSignal?.category, 'objective');
    const ratshaRequests = requests.filter(({ npc_ref: npc }) =>
      npc.entity_id === ids.ratsha);
    assert.equal(ratshaRequests.length, 2);
    assert.equal(ratshaRequests[1].decision_reasons.perceived_changes.some(
      (summary) => summary.includes('достиг выбранного')), true);
    assert.equal(runtime.state.combat_sessions[0].participant_states.find(
      ({ actor_ref: actor }) => actor.entity_id === ids.ratsha)
      .current_intent.intent_kind, 'hold');
    const commitCount = runtime.commitCount();
    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    assert.equal(runtime.commitCount(), commitCount);
    assert.equal(runtime.state.npcs.find(
      ({ instance_id: id }) => id === ids.ratsha).zone_ref,
    'storehouse_interior');
  });

test('Zhdanko break_contact uses the approved local exit before leaving combat',
  async () => {
    const state = phase8CampState();
    const ids = actorIds(state);
    const requests = [];
    const conversation = createM2ConversationModels({
      ratshaResponseKind: 'combat_handoff'
    });
    const runtime = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState: state, rollValue: 0.99,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [
          ...npcTemporalEffectRegistrations(),
          ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
          ...lowerDvinaTraceCombatTemporalEffectRegistrations()
        ]
      }),
      turnStepModel: (request) => phase8Plan(request, ids),
      playerConversationModel: conversation.playerConversationModel,
      npcSemanticModel: conversation.npcSemanticModel,
      npcCombatModel: (request) => {
        requests.push(structuredClone(request));
        return combatPlan(request, ids, { zhdanko: 'break_contact',
          companions: 'hold' });
      } });
    const startMinute = Number(runtime.state.clock.whole_minutes);
    await openPhase8Combat(runtime, 'phase8-flight');
    const zhdankoRequest = requests.find(({ npc_ref: npc }) =>
      npc.entity_id === ids.zhdanko);
    const storehouse = runtime.state.prepared_scenes.find(
      ({ location_profile_ref: id }) =>
        id === 'trace_ld_v1_loc_zhdanko_storehouse');
    assert.deepEqual(zhdankoRequest.operation_contract
      .break_contact_destination_refs, [{ entity_kind: 'location_anchor',
      entity_id: storehouse.anchor.instance_id }]);

    const response = { request_id: 'phase8-flight-combat-1',
      idempotency_key: 'phase8-flight-combat-1',
      raw_text: 'Попытаться удержать Жданко без лишнего вреда.' };
    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    let zhdanko = runtime.state.npcs.find(
      ({ instance_id: id }) => id === ids.zhdanko);
    assert.equal(zhdanko.zone_ref, 'storehouse_yard');
    assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
    assert.equal(runtime.state.active_combat_step_progress.find(
      ({ actor_ref: actor }) => actor.entity_id === ids.zhdanko)
      .elapsed_duration.exact_minutes.numerator, '2');
    assert.equal(runtime.state.last_turn.consequence.combat.outcome_events.some(
      ({ actor_ref: actor, event_kind: kind }) =>
        kind === 'combat_position_transition_completed'
        && actor?.entity_id === ids.zhdanko), false);

    let finalResponse = response;
    for (let ordinal = 2; ordinal <= 3; ordinal += 1) {
      finalResponse = { ...response,
        request_id: `phase8-flight-combat-${ordinal}`,
        idempotency_key: `phase8-flight-combat-${ordinal}` };
      await runtime.runtime.submitTurn({ partyId: runtime.partyId,
        input: finalResponse });
    }
    zhdanko = runtime.state.npcs.find(
      ({ instance_id: id }) => id === ids.zhdanko);
    assert.equal(zhdanko.anchor_id, storehouse.anchor.instance_id);
    assert.equal(zhdanko.location_profile_ref, storehouse.location_profile_ref);
    assert.equal(zhdanko.zone_ref, 'river_access');
    assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 22);
    assert.equal(runtime.state.active_combat_step_progress.some(
      ({ actor_ref: actor }) => actor.entity_id === ids.zhdanko), false);
    assert.equal(runtime.state.active_combat_step_progress.length, 0);
    const combat = runtime.state.last_turn.consequence.combat;
    assert.equal(combat.session_after.participant_states.find(
      ({ actor_ref: actor }) => actor.entity_id === ids.zhdanko)
      .combat_status, 'left');
    const movementEvent = combat.outcome_events.find(
      ({ actor_ref: actor, event_kind: kind }) =>
        kind === 'combat_position_transition_completed'
        && actor?.entity_id === ids.zhdanko);
    assert.equal(movementEvent.movement_ref,
      'trace_ld_v1_local_transition_storehouse_to_river_access');
    assert.equal(combat.session_after.status, 'ended');
    const commitCount = runtime.commitCount();
    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: finalResponse });
    assert.equal(runtime.commitCount(), commitCount);
    assert.equal(runtime.state.npcs.find(
      ({ instance_id: id }) => id === ids.zhdanko).anchor_id,
    storehouse.anchor.instance_id);
  });

test('health zero persists one closed self signal without a combat LLM request',
  async () => {
    const state = phase8CampState();
    const ids = actorIds(state);
    const zhdanko = state.npcs.find(
      ({ instance_id: id }) => id === ids.zhdanko);
    zhdanko.machine_state = { ...zhdanko.machine_state,
      body_condition: { ...zhdanko.machine_state.body_condition, health: 5 } };
    const conversation = createM2ConversationModels({
      ratshaResponseKind: 'combat_handoff'
    });
    const runtime = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState: state, rollValue: 0.99,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [
          ...npcTemporalEffectRegistrations(),
          ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
          ...lowerDvinaTraceCombatTemporalEffectRegistrations()
        ]
      }),
      turnStepModel: (request) => phase8Plan(request, ids, 'engage'),
      playerConversationModel: conversation.playerConversationModel,
      npcSemanticModel: conversation.npcSemanticModel,
      npcCombatModel: (request) => combatPlan(request, ids) });

    await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
      request_id: 'phase8-zero-route', idempotency_key: 'phase8-zero-route',
      raw_text: ROUTE_TEXT } });
    await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
      request_id: 'phase8-zero-accusation',
      idempotency_key: 'phase8-zero-accusation',
      raw_text: 'Обвинить Жданко и потребовать вернуть дорожную сумку.' } });
    const combatCalls = runtime.npcCombatCount();
    const signalIdsBefore = new Set((runtime.state.npc_decision_signals ?? [])
      .map(({ signal }) => signal.signal_id));
    const response = { request_id: 'phase8-zero-combat',
      idempotency_key: 'phase8-zero-combat',
      raw_text: 'Ударить Жданко, чтобы немедленно прекратить сопротивление.' };
    const commitsBefore = runtime.commitCount();
    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });

    assert.equal(runtime.commitCount(), commitsBefore + 1);
    assert.equal(runtime.npcCombatCount(), combatCalls);
    assert.equal(runtime.state.combat_sessions.length, 0);
    assert.equal(runtime.state.last_turn.consequence.combat.session_after
      .participant_states.find(({ actor_ref: actor }) =>
        actor.entity_id === ids.zhdanko).combat_status, 'incapacitated');
    assert.deepEqual(runtime.state.last_turn.consequence.combat
      .decision_records, []);
    const newSignals = runtime.state.npc_decision_signals.filter(
      ({ signal }) => !signalIdsBefore.has(signal.signal_id));
    const thresholdSignals = newSignals.filter(({ signal }) =>
      signal.category === 'self'
      && signal.subject_ref.entity_id === ids.zhdanko
      && signal.source_event_ref.entity_kind === 'body_threshold_crossing');
    assert.equal(thresholdSignals.length, 1);
    assert.equal(runtime.state.consumed_npc_decision_signal_ids.includes(
      thresholdSignals[0].signal.signal_id), true);
    assert.equal(runtime.state.npc_decision_terminal_outcomes.some(
      (outcome) => outcome.npc_ref.entity_id === ids.zhdanko
        && outcome.signal_ids_to_consume.includes(
          thresholdSignals[0].signal.signal_id)), true);
    assert.equal(runtime.state.last_turn.consequence.combat.signal_records.some(
      ({ signal_id: id }) => id === thresholdSignals[0].signal.signal_id), true);

    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    assert.equal(runtime.commitCount(), commitsBefore + 1);
    assert.equal(runtime.npcCombatCount(), combatCalls);
    assert.equal(runtime.state.npc_decision_signals.filter(({ signal }) =>
      signal.signal_id === thresholdSignals[0].signal.signal_id).length, 1);
  });

function phase8CampState() {
  const seed = fixture({ scenarioBundle: bundle, materializationBundle: bundle });
  const state = structuredClone(seed.state);
  const camp = state.prepared_scenes.find(
    ({ location_profile_ref }) =>
      location_profile_ref === 'trace_ld_v1_loc_fishing_camp');
  state.position = { g5_node_id: camp.node.instance_id,
    g5_anchor_id: camp.anchor.instance_id,
    location_ref: camp.location_profile_ref, zone_ref: 'fire_side' };
  const ids = actorIds(state);
  for (const npc of state.npcs) {
    if ([ids.eremey, ids.ratsha, ids.fisher].includes(npc.instance_id)) {
      npc.anchor_id = camp.anchor.instance_id;
      npc.location_profile_ref = camp.location_profile_ref;
      npc.zone_ref = 'fire_side';
      npc.machine_state = { ...npc.machine_state,
        location_ref: camp.location_profile_ref, spatial_zone_ref: 'fire_side' };
    }
  }
  state.route_knowledge = ['trace_ld_v1_route_camp_to_storehouse'];
  state.container_placements = state.containers.map((container) => ({
    party_id: state.party_id, container_id: container.container_id,
    anchor_id: container.anchor_id, holder_npc_id: container.holder_npc_id,
    physical_position: 'external_load'
  }));
  state.route_participant_commitments = [
    { npc_ref: ref(ids.eremey), role: 'guide' },
    { npc_ref: ref(ids.ratsha), role: 'witness' },
    { npc_ref: ref(ids.fisher), role: 'escort' }
  ];
  state.player_response_boundary = null;
  return state;
}

function actorIds(state) {
  const bySlot = Object.fromEntries(state.npcs.map((npc) => [
    npc.participant_slot_ref, npc.instance_id
  ]));
  return { player: state.actor_id,
    zhdanko: bySlot.zhdanko_storehouse_controller,
    eremey: bySlot.eremey_fisher,
    ratsha: bySlot.ratsha_storehouse_helper,
    fisher: bySlot.background_fisher_1 };
}

function phase8Plan(request, ids, combatIntentKind = 'control') {
  const combat = request.player_safe_state.combat_sessions?.length > 0;
  const hold = combatIntentKind === 'hold';
  const operation = combat ? {
    op: 'request_combat', actor_ref: request.actor.actor_id,
    intent_kind: combatIntentKind,
    target_refs: hold ? [] : [ids.zhdanko], protected_refs: [],
    scope_ref: hold ? 'trace_ld_v1_loc_zhdanko_storehouse' : null,
    destination_ref: null,
    force_limit: combatIntentKind === 'engage'
      ? 'ordinary' : hold ? 'avoid_harm' : 'nonlethal_if_possible',
    risk_posture: 'ordinary'
  } : { op: 'emit_interaction', actor_ref: request.actor.actor_id,
    target_actor_refs: [ids.zhdanko], interaction_kind: 'request',
    content: 'предъявить обвинение и потребовать вернуть дорожную сумку',
    instrument_refs: [] };
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], check: null, continuation: null,
    clarification: null, reason_code: combat ? 'combat_response' : 'accusation',
    reason: 'Передать действие утверждённому владельцу домена.' };
}

function combatPlan(request, ids, choices = {}) {
  const postDisarm = request.decision_reasons.perceived_changes.some(
    (summary) => summary.includes('оруж'));
  const postReach = request.decision_reasons.perceived_changes.some(
    (summary) => summary.includes('достиг выбранного'));
  let intentKind = 'hold', targetRefs = [], scopeRef = {
    entity_kind: 'location',
    entity_id: 'trace_ld_v1_loc_zhdanko_storehouse'
  }, forceLimit = 'avoid_harm';
  if (request.npc_ref.entity_id === ids.zhdanko) {
    intentKind = postDisarm ? 'surrender' : choices.zhdanko ?? 'engage';
    targetRefs = postDisarm ? [] : [{ entity_kind: 'player_character',
      entity_id: ids.player }];
    scopeRef = null;
    forceLimit = 'ordinary';
    if (intentKind === 'break_contact') targetRefs = [];
  } else if ([ids.eremey, ids.fisher].includes(request.npc_ref.entity_id)) {
    intentKind = choices.companions ?? 'control';
    if (intentKind === 'control') {
      targetRefs = [{ entity_kind: 'npc', entity_id: ids.zhdanko }];
      scopeRef = null;
      forceLimit = 'nonlethal_if_possible';
    }
  } else if (request.npc_ref.entity_id === ids.ratsha
      && choices.ratsha === 'reach' && !postReach) {
    intentKind = 'reach';
    targetRefs = [];
    scopeRef = null;
    forceLimit = 'avoid_harm';
  }
  const destinationRef = intentKind === 'reach'
    ? request.operation_contract.reachable_destination_refs[0]
    : intentKind === 'break_contact'
      ? request.operation_contract.break_contact_destination_refs[0] : null;
  const plan = { schema: 'npc_combat_intent_plan_v1',
    request_id: request.request_id, boundary_id: request.boundary_id,
    state_version: request.state_version, combat_id: request.combat_id,
    npc_ref: request.npc_ref, decision: {
      intent_summary: 'Resist the immediate attempt to restrain me.',
      grounded_goal: 'Keep control of the weapon and current position.',
      adaptation: 'literal' }, operation: {
      op: 'set_combat_intent', intent_kind: intentKind,
      target_refs: targetRefs, protected_refs: [], scope_ref: scopeRef,
      destination_ref: destinationRef, force_limit: forceLimit,
      risk_posture: 'ordinary' }, combat_statement: null,
    reason: postDisarm ? 'Сопротивление более невозможно.'
      : 'Участник выбирает ближайшее допустимое действие.' };
  assert.deepEqual(validateNpcCombatPlanApplicability(plan, request),
    { pass: true, errors: [] });
  return plan;
}

async function openPhase8Combat(runtime, prefix) {
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
    request_id: `${prefix}-route`, idempotency_key: `${prefix}-route`,
    raw_text: ROUTE_TEXT } });
  await runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
    request_id: `${prefix}-accusation`,
    idempotency_key: `${prefix}-accusation`,
    raw_text: 'Обвинить Жданко и потребовать вернуть дорожную сумку.' } });
}

function ref(entityId) { return { entity_kind: 'npc', entity_id: entityId }; }
