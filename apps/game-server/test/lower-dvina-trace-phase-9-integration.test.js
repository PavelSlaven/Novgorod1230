import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { actorIds, combatPlan, phase8CampState, phase8Plan } from
  './lower-dvina-trace-phase-8-integration.test.js';
import { createM2ConversationModels, npcSpeechPlan, playerPlan } from
  './lower-dvina-trace-m2-conversation-fixture.js';
import { resolveTracePhase9Contracts } from
  '../src/runtime/lower-dvina-trace-phase-9-contracts.js';
import { packetPlan, recoveryPlan } from
  '../src/runtime/lower-dvina-trace-phase-9-command-plans.js';

const bundle = await loadScenarioBundle(17);
const ROUTE_TEXT =
  'Идти к Жданко всем вместе. Ратшу держать между нами. Не входить тайком.';

test('Phase 9 recovers property, commits testimony and stops at temporary disposition',
  async () => {
    const state = phase8CampState(bundle);
    const ids = { ...actorIds(state), bag: state.containers.find(
      ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag'
    ).container_id, packet: state.items.find(
      ({ template_id: id }) => id === 'trace_ld_v1_item_sealed_packet'
    ).item_id };
    const conversation = createM2ConversationModels({
      ratshaResponseKind: 'combat_handoff'
    });
    let testimonyCalls = 0;
    const turnRequests = [];
    const testimonyRequests = [];
    const createRuntime = (committedState) => fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState, rollValue: 0.5,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [...npcTemporalEffectRegistrations(),
          ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
          ...lowerDvinaTraceCombatTemporalEffectRegistrations()]
      }),
      turnStepModel: (request) => {
        turnRequests.push(structuredClone(request));
        return plan(request, ids);
      },
      playerConversationModel: (request) => request.player_input?.raw_text
        ?.includes('Онисим')
        ? playerPlan(request, {})
        : conversation.playerConversationModel(request),
      npcSemanticModel: (request) => {
        if (request.npc_ref?.entity_id !== ids.onisim) {
          return conversation.npcSemanticModel(request);
        }
        testimonyCalls += 1;
        testimonyRequests.push(structuredClone(request));
        return npcSpeechPlan(request, {
          utteranceText: 'Жданко нанимал мою лодку и вёз этот свёрток.',
          dominantAct: 'inform', claims: [], supportingOperations: []
        });
      },
      npcCombatModel: (request) => combatPlan(request, ids) });
    let runtime = createRuntime(state);

    await submit(runtime, 'p9-route', ROUTE_TEXT);
    await submit(runtime, 'p9-accuse',
      'Обвинить Жданко и потребовать вернуть дорожную сумку.');
    await submit(runtime, 'p9-combat',
      'Помочь Еремею обезоружить Жданко, не убивая его.');
    assert.equal(runtime.state.last_turn.consequence.combat.session_after.status,
      'ended');

    await submit(runtime, 'p9-bag', 'Забрать дорожную сумку у Жданко.');
    const bag = runtime.state.containers.find(
      ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag');
    assert.equal(bag.state.controller_character_id, runtime.state.actor_id);
    assert.equal(bag.state.owner_external_ref,
      'trace_ld_v1_external_owner_savva_tverdich');
    await assertReplay(runtime, 'p9-bag',
      'Забрать дорожную сумку у Жданко.');
    runtime = createRuntime(runtime.state);
    await submit(runtime, 'p9-open', 'Открыть возвращённую дорожную сумку.');
    assert.equal(bagState(runtime).closure_state, 'open');
    const openRequest = turnRequests.find(({ root_player_action: text }) =>
      text === 'Открыть возвращённую дорожную сумку.');
    assert.equal(JSON.stringify(openRequest).includes(ids.packet), false);
    await assertReplay(runtime, 'p9-open',
      'Открыть возвращённую дорожную сумку.');
    runtime = createRuntime(runtime.state);
    await submit(runtime, 'p9-packet',
      'Извлечь свёрток и осмотреть печать, не вскрывая документ.');
    const packet = runtime.state.items.find(
      ({ template_id: id }) => id === 'trace_ld_v1_item_sealed_packet');
    assert.equal(packet.placement.holder_character_id, runtime.state.actor_id);
    assert.equal(packet.state.document_contents_state, 'sealed');
    assert.equal(packet.state.document_contents_access, 'forbidden');
    assert.equal(packet.ownership.owner_external_ref,
      'trace_ld_v1_external_owner_savva_tverdich');
    const packetRequest = turnRequests.find(({ root_player_action: text }) =>
      text.startsWith('Извлечь свёрток'));
    assert.equal(JSON.stringify(packetRequest).includes(ids.packet), true);
    await assertReplay(runtime, 'p9-packet',
      'Извлечь свёрток и осмотреть печать, не вскрывая документ.');
    runtime = createRuntime(runtime.state);

    await submit(runtime, 'p9-return', 'Вернуться всей группой к Онисиму.');
    assert.equal(runtime.state.position.location_ref,
      'trace_ld_v1_loc_fishing_camp');
    assert.equal(runtime.state.position.g5_node_id,
      runtime.state.prepared_scenes.find(({ location_profile_ref: id }) =>
        id === 'trace_ld_v1_loc_fishing_camp').node.instance_id);
    await assertReplay(runtime, 'p9-return',
      'Вернуться всей группой к Онисиму.');
    runtime = createRuntime(runtime.state);
    await submit(runtime, 'p9-testimony',
      'Попросить Онисима рассказать, что он знает о Жданко и свёртке.');
    assert.equal(testimonyCalls, 1);
    assert.equal(JSON.stringify(testimonyRequests[0])
      .includes('document_contents'), false);
    assert.equal(runtime.state.phase9.onisim_testimony.objective_truth_write,
      'forbidden');
    await assertReplay(runtime, 'p9-testimony',
      'Попросить Онисима рассказать, что он знает о Жданко и свёртке.');
    assert.equal(testimonyCalls, 1);
    runtime = createRuntime(runtime.state);
    await submit(runtime, 'p9-evidence',
      'Сопоставить все подтверждённые доказательства.');
    assert.equal(runtime.state.phase9.evidence_resolution.ok, true);
    const firstEvidence = structuredClone(
      runtime.state.phase9.evidence_resolution);
    await assertReplay(runtime, 'p9-evidence',
      'Сопоставить все подтверждённые доказательства.');
    assert.deepEqual(runtime.state.phase9.evidence_resolution, firstEvidence);
    runtime = createRuntime(runtime.state);
    const promiseBefore = structuredClone(runtime.state.promise_instances);
    await submit(runtime, 'p9-disposition',
      'Принять временное решение о людях и возвращённом имуществе.');
    assert.equal(runtime.state.phase9.status,
      'temporary_disposition_committed');
    assert.equal(runtime.state.phase9.temporary_disposition.legal_effect,
      'temporary_disposition_only');
    assert.equal(Object.hasOwn(runtime.state, 'completion_state'), false);
    assert.deepEqual(runtime.state.promise_instances, promiseBefore);
    assert.deepEqual(runtime.state.phase9.checkpoints.map(({ kind }) => kind),
      ['bag_recovery', 'bag_opened', 'packet_recovered', 'return_to_camp',
        'onisim_testimony', 'evidence_resolved', 'temporary_disposition']);

    await assertReplay(runtime, 'p9-disposition',
      'Принять временное решение о людях и возвращённом имуществе.');
    assert.equal(testimonyCalls, 1);
  });

test('Phase 9 does not recover a road bag carried away by Zhdanko', () => {
  const state = phase8CampState(bundle);
  const contracts = phase9Contracts(state);
  const zhdanko = state.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller');
  state.last_turn = { consequence: { combat: { session_after: {
    participant_states: [{ actor_ref: { entity_kind: 'npc',
      entity_id: zhdanko.instance_id }, combat_status: 'left' }] } } } };
  state.knowledge.push({ fact_id: 'zhdanko_fled' });
  const result = recoveryPlan(state, contracts);
  assert.equal(result.pass, false);
  assert.equal(result.errors[0].code,
    'APPROVED_PROPERTY_TRANSITION_FACT_MISSING');
});

test('Phase 9 preserves an authored destroyed packet branch without intact seal',
  () => {
    const state = phase8CampState(bundle);
    const contracts = phase9Contracts(state);
    const bag = state.containers.find(({ template_id: id }) =>
      id === 'trace_ld_v1_container_road_bag');
    bag.closure_state = 'open';
    delete bag.holder_npc_id;
    bag.holder_character_id = state.actor_id;
    bag.controller_character_id = state.actor_id;
    bag.state.controller_character_id = state.actor_id;
    delete bag.state.controller_npc_id;
    const packet = state.items.find(({ template_id: id }) =>
      id === 'trace_ld_v1_item_sealed_packet');
    Object.assign(packet.state, { seal_state: 'destroyed',
      document_condition: 'destroyed_unreadable',
      evidence_availability: 'destroyed' });
    const result = packetPlan(state, contracts);
    assert.equal(result.pass, true, JSON.stringify(result));
    assert.equal(result.proposal.next.state.seal_state, 'destroyed');
    assert.equal(result.proposal.next.state.document_condition,
      'destroyed_unreadable');
    assert.notEqual(result.proposal.next.state.seal_state, 'intact');
  });

function bagState(runtime) {
  return runtime.state.containers.find(
    ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag');
}
function phase9Contracts(state) {
  return resolveTracePhase9Contracts({ state, bundle,
    conversationBindings: bundle.conversation_semantic_bindings });
}
async function submit(runtime, id, rawText) {
  return runtime.runtime.submitTurn({ partyId: runtime.partyId, input: {
    request_id: id, idempotency_key: id, raw_text: rawText } });
}
async function assertReplay(runtime, id, rawText) {
  const commits = runtime.commitCount();
  await submit(runtime, id, rawText);
  assert.equal(runtime.commitCount(), commits);
}
function plan(request, ids) {
  if (request.player_safe_state.combat_sessions?.length > 0
      || request.root_player_action === ROUTE_TEXT
      || request.root_player_action.includes('Обвинить Жданко')) {
    return phase8Plan(request, ids);
  }
  const actor = request.actor.actor_id;
  const text = request.remaining_intent;
  let operation;
  if (text.includes('Забрать дорожную')) operation = {
    op: 'request_item_use', actor_ref: actor, use_kind: 'operate',
    item_ref: ids.bag, target_refs: [] };
  else if (text.includes('Открыть возвращённую')) operation = {
    op: 'request_container_access', actor_ref: actor, access_kind: 'open',
    container_ref: ids.bag };
  else if (text.includes('Извлечь свёрток')) operation = {
    op: 'request_item_use', actor_ref: actor, use_kind: 'operate',
    item_ref: ids.packet, target_refs: [] };
  else if (text.includes('Вернуться всей')) operation = {
    op: 'request_movement', actor_ref: actor, movement_kind: 'route',
    target_ref: 'trace_ld_v1_loc_fishing_camp' };
  else if (text.includes('Попросить Онисима')) operation = {
    op: 'emit_interaction', actor_ref: actor, interaction_kind: 'request',
    target_actor_refs: [ids.onisim], content: text, instrument_refs: [] };
  else if (text.includes('Сопоставить')) operation = activity(actor,
    ['trace_ld_v1_clue_evidence_graph_set']);
  else operation = activity(actor, [ids.ratsha, ids.zhdanko,
    ids.packet]);
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: text, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], check: null, continuation: null,
    clarification: null, reason_code: 'phase9_step', reason: 'approved owner' };
}
function activity(actor, targetRefs) { return { op: 'request_activity',
  actor_ref: actor, activity_kind: 'other', target_refs: targetRefs,
  description: 'Выполнить утверждённый шаг расследования.' }; }
