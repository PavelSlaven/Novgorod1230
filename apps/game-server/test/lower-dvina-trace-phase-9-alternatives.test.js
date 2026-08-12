import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';
import { recoveryPlan } from
  '../src/runtime/lower-dvina-trace-phase-9-command-plans.js';
import { resolveTracePhase9Contracts } from
  '../src/runtime/lower-dvina-trace-phase-9-contracts.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { npcSpeechPlan, playerPlan } from
  './lower-dvina-trace-m2-conversation-fixture.js';

const bundle = await loadScenarioBundle(17);

test('Zhdanko fleeing with the bag still admits unresolved disposition',
  async () => {
    const state = phase8CampState(bundle);
    const ids = refs(state);
    const storehouse = scene(state, 'trace_ld_v1_loc_zhdanko_storehouse');
    state.position = { location_ref: storehouse.location_profile_ref,
      g5_anchor_id: storehouse.anchor.instance_id,
      g5_node_id: storehouse.node.instance_id,
      zone_ref: 'storehouse_interior' };
    moveGroupToStorehouse(state, ids, storehouse);
    state.phase9 = { status: 'active', checkpoints: [], committed_facts: [
      'ratsha_surrender_without_further_harm_committed', 'zhdanko_fled'] };
    state.knowledge = [...(state.knowledge ?? []),
      knowledge('ratsha_surrender_without_further_harm_committed'),
      knowledge('zhdanko_fled')];
    Object.assign(state.promise_instances[0], { current_state: 'active',
      current_state_fact: 'promise_current_active', state_version: 3 });
    assert.equal(recoveryPlan(state, contracts(state)).pass, false);

    const create = (committedState) => runtime(committedState, ids, {
      npcSemanticModel: (request) => npcSpeechPlan(request, {
        utteranceText: bundle.phase_9_bindings.onisim_testimony
          .authored_claim_contract.utterance_text,
        dominantAct: 'inform', claims: [testimonyClaim()],
        supportingOperations: [{ op: 'assert_authored_claim',
          claim_id: 'trace_ld_v1_assertion_onisim_testimony' }] }) });
    let game = create(state);
    await submit(game, 'fled-return', 'Вернуться всей группой к Онисиму.');
    assert.equal(game.state.position.location_ref,
      'trace_ld_v1_loc_fishing_camp');
    assert.notEqual(item(game.state, ids.packet).placement.holder_character_id,
      game.state.actor_id);
    game = create(structuredClone(game.state));
    await submit(game, 'fled-testimony',
      'Попросить Онисима рассказать, что он знает о Жданко и свёртке.');
    await submit(game, 'fled-evidence',
      'Сопоставить все подтверждённые доказательства.');
    await submit(game, 'fled-disposition',
      'Зафиксировать временное решение по людям, имуществу и обещанию.');
    assert.equal(game.state.phase9.property_handover_plan.option_id,
      'leave_unresolved_property_state_unchanged');
    assert.equal(game.state.phase9.custody_state.option_id,
      'hold_ratsha_zhdanko_absent');
    assert.equal(game.state.promise_instances[0].current_state, 'fulfilled');
    game = create(structuredClone(game.state));
    assert.equal(game.state.phase9.property_handover_plan.committed_fact_id,
      'temporary_property_state_unresolved');
    assert.equal(game.state.promise_instances[0].current_state_fact,
      'promise_current_fulfilled');
  });

for (const terminalState of ['fulfilled', 'broken']) {
  test(`temporary disposition recognizes existing ${terminalState} promise`,
    async () => {
      const state = phase8CampState(bundle);
      const ids = refs(state);
      state.phase9 = { status: 'active', checkpoints: [], committed_facts: [
        'ratsha_surrender_without_further_harm_committed',
        'zhdanko_submission_committed', 'sealed_packet_returned'],
      onisim_testimony: { response_kind: 'silence',
        testimony_committed: false },
      case_evidence_ref: 'trace_ld_v1_clue_evidence_graph_set' };
      Object.assign(state.promise_instances[0], {
        current_state: terminalState,
        current_state_fact: `promise_current_${terminalState}`,
        state_version: 4 });
      const create = (committedState) => runtime(committedState, ids);
      let game = create(state);
      await submit(game, `${terminalState}-evidence`,
        'Сопоставить все подтверждённые доказательства.');
      const text = 'Зафиксировать временное решение без изменения обещания.';
      await submit(game, `${terminalState}-disposition`, text);
      assert.equal(game.state.promise_instances[0].current_state,
        terminalState);
      assert.equal(game.state.promise_instances[0].state_version, 5);
      assert.equal(game.state.phase9.promise_outcome.kind,
        'terminal_state_recognized');
      assert.equal(game.state.phase9.promise_memory.option_id,
        `recognize_${terminalState}_promise`);
      const commits = game.commitCount();
      await submit(game, `${terminalState}-disposition`, text);
      assert.equal(game.commitCount(), commits);
      game = create(structuredClone(game.state));
      assert.equal(game.state.promise_instances[0].current_state_fact,
        `promise_current_${terminalState}`);
    });
}

function runtime(committedState, ids, overrides = {}) {
  return fixture({ scenarioBundle: bundle, materializationBundle: bundle,
    committedState, temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations: [...npcTemporalEffectRegistrations(),
        ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
        ...lowerDvinaTraceCombatTemporalEffectRegistrations()] }),
    turnStepModel: (request) => plan(request, ids),
    playerConversationModel: (request) => playerPlan(request, {}),
    npcSemanticModel: () => { throw new Error('NPC boundary not expected'); },
    npcCombatModel: () => { throw new Error('combat must not restart'); },
    ...overrides });
}

function plan(request, ids) {
  const actor = request.actor.actor_id;
  const text = request.remaining_intent;
  let operation;
  if (text.includes('Вернуться')) operation = { op: 'request_movement',
    actor_ref: actor, movement_kind: 'route',
    target_ref: 'trace_ld_v1_loc_fishing_camp' };
  else if (text.includes('Попросить')) operation = { op: 'emit_interaction',
    actor_ref: actor, interaction_kind: 'request',
    target_actor_refs: [ids.onisim], content: text, instrument_refs: [] };
  else if (text.includes('Сопоставить')) operation = activity(actor,
    ['trace_ld_v1_clue_evidence_graph_set']);
  else operation = activity(actor, dispositionSelection(request));
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: text, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], check: null, continuation: null,
    clarification: null, reason_code: 'phase9_alternative',
    reason: 'approved owner' };
}

function dispositionSelection(request) {
  const value = request.player_safe_state.temporary_disposition_options;
  const options = { custody: value?.custody_option_refs,
    property: value?.property_option_refs, promise: value?.promise_option_refs };
  const preferred = {
    custody: ['hold_ratsha_and_zhdanko_for_authorized_handover',
      'hold_ratsha_zhdanko_absent', 'preserve_open_case_without_custody'],
    property: ['preserve_recovered_property_for_savva_handover',
      'leave_unresolved_property_state_unchanged'],
    promise: ['preserve_active_no_summary_killing_promise',
      'recognize_fulfilled_promise', 'recognize_broken_promise'] };
  return ['custody', 'property', 'promise'].map((dimension) =>
    preferred[dimension].find((id) => options[dimension]?.includes(id)));
}

const activity = (actor, targetRefs) => ({ op: 'request_activity',
  actor_ref: actor, activity_kind: 'other', target_refs: targetRefs,
  description: 'Выполнить утверждённый шаг расследования.' });
const submit = (game, id, rawText) => game.runtime.submitTurn({
  partyId: game.partyId, input: { request_id: id, idempotency_key: id,
    raw_text: rawText } });
const contracts = (state) => resolveTracePhase9Contracts({ state, bundle,
  conversationBindings: bundle.conversation_semantic_bindings });
const scene = (state, id) => state.prepared_scenes.find(
  ({ location_profile_ref: ref }) => ref === id);
const item = (state, id) => state.items.find(({ item_id }) => item_id === id);
const knowledge = (factId) => ({ fact_id: factId,
  knowledge_state: 'known_from_committed_scenario_event',
  evidence_refs: [`event:${factId}`] });
function refs(state) {
  const actors = actorIds(state);
  return { ...actors, packet: state.items.find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_sealed_packet').item_id };
}
function moveGroupToStorehouse(state, ids, storehouse) {
  for (const npc of state.npcs) {
    if ([ids.eremey, ids.ratsha, ids.fisher].includes(npc.instance_id)) {
      Object.assign(npc, { location_profile_ref: storehouse.location_profile_ref,
        anchor_id: storehouse.anchor.instance_id,
        zone_ref: 'storehouse_interior' });
    } else if (npc.instance_id === ids.zhdanko) {
      Object.assign(npc, { location_profile_ref: 'trace_ld_v1_loc_river_exit',
        anchor_id: null, zone_ref: null });
    }
  }
}
function testimonyClaim() {
  return structuredClone(bundle.phase_9_bindings.onisim_testimony
    .authored_claim_contract.claim);
}
function phase8CampState(scenarioBundle) {
  const seed = fixture({ scenarioBundle,
    materializationBundle: scenarioBundle });
  const state = structuredClone(seed.state);
  const camp = scene(state, 'trace_ld_v1_loc_fishing_camp');
  state.position = { g5_node_id: camp.node.instance_id,
    g5_anchor_id: camp.anchor.instance_id,
    location_ref: camp.location_profile_ref, zone_ref: 'fire_side' };
  const ids = actorIds(state);
  for (const npc of state.npcs) {
    if ([ids.eremey, ids.ratsha, ids.fisher, ids.onisim]
      .includes(npc.instance_id)) {
      Object.assign(npc, { anchor_id: camp.anchor.instance_id,
        location_profile_ref: camp.location_profile_ref,
        zone_ref: 'fire_side', machine_state: { ...npc.machine_state,
          location_ref: camp.location_profile_ref,
          spatial_zone_ref: 'fire_side' } });
    }
  }
  state.route_knowledge = ['trace_ld_v1_route_camp_to_storehouse'];
  state.container_placements = state.containers.map((container) => ({
    party_id: state.party_id, container_id: container.container_id,
    anchor_id: container.anchor_id, holder_npc_id: container.holder_npc_id,
    physical_position: 'external_load' }));
  state.route_participant_commitments = [
    { npc_ref: actorRef(ids.eremey), role: 'guide' },
    { npc_ref: actorRef(ids.ratsha), role: 'witness' },
    { npc_ref: actorRef(ids.fisher), role: 'escort' }];
  state.player_response_boundary = null;
  return state;
}
function actorIds(state) {
  const bySlot = Object.fromEntries(state.npcs.map((npc) => [
    npc.participant_slot_ref, npc.instance_id]));
  return { player: state.actor_id,
    zhdanko: bySlot.zhdanko_storehouse_controller,
    eremey: bySlot.eremey_fisher, ratsha: bySlot.ratsha_storehouse_helper,
    onisim: bySlot.onisim_boatman, fisher: bySlot.background_fisher_1 };
}
const actorRef = (id) => ({ entity_kind: 'npc', entity_id: id });
