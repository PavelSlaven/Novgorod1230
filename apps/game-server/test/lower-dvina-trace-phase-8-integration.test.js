import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { validateNpcCombatPlanApplicability } from '@rus/npc-runtime';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';

const bundle = await loadScenarioBundle(16);
const ROUTE_TEXT =
  'Идти к Жданко всем вместе. Ратшу держать между нами. Не входить тайком.';

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
          ...lowerDvinaTraceConversationTemporalEffectRegistrations()
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
    assert.equal(runtime.state.combat_sessions[0].exchange_ordinal, 1);
    assert.equal(runtime.state.combat_sessions[0].participant_states.find(
      ({ actor_ref: actor }) => actor.entity_id === ids.zhdanko)
      .combat_status, 'restrained');
    assert.ok(runtime.state.body_state.health < healthBefore);
    const axe = runtime.state.items.find(
      ({ template_id }) => template_id === 'trace_ld_v1_item_zhdanko_axe');
    assert.equal(axe.placement.holder_npc_id, ids.eremey);
    assert.equal(axe.ownership.controller_npc_id, ids.eremey);
    assert.equal(runtime.npcCombatCount(), 5);
    assert.equal(runtime.state.npc_decision_signals.length,
      signalCountBefore + 1);
    assert.equal(runtime.state.combat_sessions[0].participant_states.find(
      ({ actor_ref: actor }) => actor.entity_id === ids.zhdanko)
      .current_intent.intent_kind, 'surrender');
    const commitCount = runtime.commitCount();
    const rollCount = runtime.rollCount();

    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    assert.equal(runtime.commitCount(), commitCount);
    assert.equal(runtime.rollCount(), rollCount);
    assert.equal(runtime.npcCombatCount(), 5);
    assert.equal(Number(runtime.state.clock.whole_minutes), startMinute + 19);
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

function phase8Plan(request, ids) {
  const combat = request.player_safe_state.combat_sessions?.length > 0;
  const operation = combat ? {
    op: 'request_combat', actor_ref: request.actor.actor_id,
    intent_kind: 'control', target_refs: [ids.zhdanko], protected_refs: [],
    scope_ref: null, destination_ref: null,
    force_limit: 'nonlethal_if_possible', risk_posture: 'ordinary'
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

function combatPlan(request, ids) {
  const postDisarm = request.decision_reasons.perceived_changes.some(
    (summary) => summary.includes('оруж'));
  let intentKind = 'hold', targetRefs = [], scopeRef = {
    entity_kind: 'location',
    entity_id: 'trace_ld_v1_loc_zhdanko_storehouse'
  }, forceLimit = 'avoid_harm';
  if (request.npc_ref.entity_id === ids.zhdanko) {
    intentKind = postDisarm ? 'surrender' : 'engage';
    targetRefs = postDisarm ? [] : [{ entity_kind: 'player_character',
      entity_id: ids.player }];
    scopeRef = null;
    forceLimit = 'ordinary';
  } else if ([ids.eremey, ids.fisher].includes(request.npc_ref.entity_id)) {
    intentKind = 'control';
    targetRefs = [{ entity_kind: 'npc', entity_id: ids.zhdanko }];
    scopeRef = null;
    forceLimit = 'nonlethal_if_possible';
  }
  const plan = { schema: 'npc_combat_intent_plan_v1',
    request_id: request.request_id, boundary_id: request.boundary_id,
    state_version: request.state_version, combat_id: request.combat_id,
    npc_ref: request.npc_ref, decision: {}, operation: {
      op: 'set_combat_intent', intent_kind: intentKind,
      target_refs: targetRefs, protected_refs: [], scope_ref: scopeRef,
      destination_ref: null, force_limit: forceLimit,
      risk_posture: 'ordinary' }, combat_statement: null,
    reason: postDisarm ? 'Сопротивление более невозможно.'
      : 'Участник выбирает ближайшее допустимое действие.' };
  assert.deepEqual(validateNpcCombatPlanApplicability(plan, request),
    { pass: true, errors: [] });
  return plan;
}

function ref(entityId) { return { entity_kind: 'npc', entity_id: entityId }; }
