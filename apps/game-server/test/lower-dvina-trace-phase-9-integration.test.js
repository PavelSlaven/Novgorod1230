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
import { addCanonicalPhase10Evidence, assertCanonicalPhase10 } from
  './lower-dvina-trace-phase-10-integration-assertions.js';

const bundle = await loadScenarioBundle(18);
const ROUTE_TEXT =
  'Идти к Жданко всем вместе. Ратшу держать между нами. Не входить тайком.';

test('Phase 9 commits first, then Phase 10 completes and presents a safe epilogue',
  async () => {
    const state = phase8CampState(bundle);
    Object.assign(state.promise_instances[0], { current_state: 'active',
      current_state_fact: 'promise_current_active', state_version: 3 });
    state.knowledge = [...(state.knowledge ?? []),
      committedKnowledge('ratsha_surrender_without_further_harm_committed'),
      committedKnowledge('promise_current_active')];
    addCanonicalPhase10Evidence(state);
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
          utteranceText: 'Голос Жданко я узнал ещё до столкновения. Потом '
            + 'был удар шестом, кто-то рванул сумку, а Ратша уже после '
            + 'крушения вытащил меня, связал и унёс к сушильне.',
          dominantAct: 'inform', claims: [testimonyClaim()],
          supportingOperations: []
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
    assert.deepEqual(testimonyRequests[0].decision_scope.operation_contract,
      {});
    assert.equal(runtime.state.phase9.onisim_testimony.objective_truth_write,
      'forbidden');
    assert.equal(runtime.state.phase9.onisim_testimony.testimony_committed,
      true);
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
    const versionBefore = runtime.state.party_state.state_version;
    const turnBefore = runtime.state.party_state.turn_number;
    const clockBefore = structuredClone(runtime.state.clock);
    const commitsBefore = runtime.commitCount();
    const turnStepsBefore = runtime.turnStepCount();
    const dispositionText = 'Временно удержать Ратшу и Жданко до передачи '
      + 'властям, сохранить свёрток для Саввы и соблюсти обещание Ратше.';
    runtime.setNarrationFails(true);
    const {screen}=await submit(runtime,'p9-disposition',dispositionText);
    assert.deepEqual([screen,runtime.state.completion.status,runtime.commitCount()-commitsBefore,
      runtime.events.filter(event=>event==='commit_phase10').length,runtime.events.includes('persist_screen')],[{schema:'lower_dvina_trace_turn_screen',screen_status:'committed_presentation_pending',turn_id:`turn:${runtime.partyId}:${turnBefore+1}`},'committed',2,1,false]);
    runtime.setNarrationFails(false);
    const dispositionResult = await submit(runtime, 'p9-disposition',
      dispositionText);
    assert.equal(runtime.state.phase9.status,
      'temporary_disposition_committed');
    assert.equal(runtime.state.phase9.temporary_disposition.legal_effect,
      'temporary_disposition_only');
    assert.deepEqual(runtime.state.phase9.custody_state, {
      schema: 'temporary_custody_state_v1',
      option_id: 'hold_ratsha_and_zhdanko_for_authorized_handover',
      status: 'temporary',
      party_slots: ['ratsha_storehouse_helper',
        'zhdanko_storehouse_controller'],
      committed_fact_id:
        'temporary_custody_both_for_authorized_handover' });
    for (const slot of runtime.state.phase9.custody_state.party_slots) {
      assert.equal(runtime.state.npcs.find(({ participant_slot_ref: ref }) =>
        ref === slot).machine_state.temporary_custody, true);
    }
    assert.equal(runtime.state.phase9.property_handover_plan.status,
      'temporary');
    assert.equal(runtime.state.items.find(({ item_id: id }) =>
      id === ids.packet).state.property_state.temporary_handover_plan
      .option_id, 'preserve_recovered_property_for_savva_handover');
    assert.equal(runtime.state.phase9.promise_memory.status, 'recorded');
    assert.equal(runtime.state.promise_instances[0]
      .temporary_disposition_memory.option_id,
    'preserve_active_no_summary_killing_promise');
    assertCanonicalPhase10({ runtime, result: dispositionResult,
      versionBefore, turnBefore, clockBefore, commitsBefore, turnStepsBefore });
    assert.equal(promiseBefore[0].current_state, 'active');
    assert.equal(runtime.state.promise_instances[0].current_state,
      'fulfilled');
    assert.equal(runtime.state.promise_instances[0].current_state_fact,
      'promise_current_fulfilled');
    assert.equal(runtime.state.promise_instances[0].state_version,
      Number(promiseBefore[0].state_version) + 2);
    assert.equal(runtime.state.phase9.committed_facts.includes(
      'promise_fulfillment_basis_committed'), true);
    assert.deepEqual(runtime.state.phase9.checkpoints.map(({ kind }) => kind),
      ['bag_recovery', 'bag_opened', 'packet_recovered', 'return_to_camp',
        'onisim_testimony', 'evidence_resolved', 'temporary_disposition']);

    await assertReplay(runtime, 'p9-disposition', dispositionText);
    runtime = createRuntime(structuredClone(runtime.state));
    assert.equal(runtime.state.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller').machine_state
      .temporary_custody, true);
    assert.equal(runtime.state.promise_instances[0]
      .temporary_disposition_memory.status, 'recorded');
    assert.equal(runtime.state.promise_instances[0].current_state,
      'fulfilled');
    assert.equal(runtime.state.completion.status, 'committed');
  });

test('Onisim silence remains an unknown evidence branch through restart',
  async () => {
    const state = phase8CampState(bundle);
    Object.assign(state.promise_instances[0], { current_state: 'active',
      current_state_fact: 'promise_current_active', state_version: 3 });
    state.phase9 = { status: 'active', checkpoints: [], committed_facts: [
      'ratsha_surrender_without_further_harm_committed',
      'zhdanko_submission_committed', 'sealed_packet_returned',
      'promise_current_active'] };
    const ids = { ...actorIds(state), packet: state.items.find(
      ({ template_id: id }) => id === 'trace_ld_v1_item_sealed_packet'
    ).item_id };
    const createRuntime = (committedState) => fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [...npcTemporalEffectRegistrations(),
          ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
          ...lowerDvinaTraceCombatTemporalEffectRegistrations()] }),
      turnStepModel: (request) => plan(request, ids),
      playerConversationModel: (request) => playerPlan(request, {}),
      npcSemanticModel: (request) => onisimNonSpeechPlan(request, 'silence'),
      npcCombatModel: () => { throw new Error('combat must not start'); } });
    let runtime = createRuntime(state);
    await submit(runtime, 'silence-testimony',
      'Попросить Онисима рассказать, что он знает о Жданко и свёртке.');
    assert.equal(runtime.state.phase9.onisim_testimony.response_kind,
      'silence');
    assert.equal(runtime.state.phase9.onisim_testimony.testimony_committed,
      false);
    assert.equal(runtime.state.phase9.committed_facts.includes(
      'trace_ld_v1_evidence_onisim_testimony'), false);

    runtime = createRuntime(structuredClone(runtime.state));
    await submit(runtime, 'silence-evidence',
      'Сопоставить все подтверждённые доказательства.');
    assert.equal(runtime.state.phase9.evidence_resolution.ok, true);
    assert.equal(runtime.state.phase9.evidence_resolution
      .admitted_evidence_refs?.includes(
        'trace_ld_v1_evidence_onisim_testimony') ?? false, false);

    runtime = createRuntime(structuredClone(runtime.state));
    await submit(runtime, 'silence-disposition',
      'Временно удержать Ратшу и Жданко до передачи властям, сохранить '
        + 'свёрток для Саввы и соблюсти обещание Ратше.');
    assert.equal(runtime.state.phase9.status,
      'temporary_disposition_committed');
    assert.equal(runtime.state.completion.status, 'committed');
    assert.notEqual(runtime.state.completion.outcome.primary_completion_state,
      'trace_ld_v1_completion_full');
    runtime = createRuntime(structuredClone(runtime.state));
    assert.equal(runtime.state.phase9.onisim_testimony.testimony_committed,
      false);
    assert.equal(runtime.state.phase9.temporary_disposition.legal_effect,
      'temporary_disposition_only');
    assert.equal(runtime.state.completion.status, 'committed');
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

test('peaceful Zhdanko surrender admits Phase 9 recovery after restart',
  async () => {
    const state = phase8CampState(bundle);
    const ids = { ...actorIds(state), bag: state.containers.find(
      ({ template_id: id }) => id === 'trace_ld_v1_container_road_bag'
    ).container_id };
    const conversation = createM2ConversationModels({
      ratshaResponseKind: 'surrender' });
    const createRuntime = (committedState) => fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [...npcTemporalEffectRegistrations(),
          ...lowerDvinaTraceConversationTemporalEffectRegistrations(),
          ...lowerDvinaTraceCombatTemporalEffectRegistrations()] }),
      turnStepModel: (request) => request.root_player_action === ROUTE_TEXT
          || request.root_player_action.includes('Обвинить Жданко')
        ? phase8Plan(request, ids) : plan(request, ids),
      playerConversationModel: conversation.playerConversationModel,
      npcSemanticModel: conversation.npcSemanticModel,
      npcCombatModel: () => { throw new Error('combat must not start'); } });
    let runtime = createRuntime(state);
    await submit(runtime, 'peaceful-route', ROUTE_TEXT);
    await submit(runtime, 'peaceful-surrender',
      'Обвинить Жданко и потребовать вернуть дорожную сумку.');
    assert.equal((runtime.state.combat_sessions ?? []).length, 0);
    assert.equal(runtime.state.npcs.find(({ instance_id: id }) =>
      id === ids.zhdanko).machine_state.surrender_state,
    'surrendered_without_further_attack');

    runtime = createRuntime(structuredClone(runtime.state));
    await submit(runtime, 'peaceful-bag',
      'Забрать дорожную сумку у Жданко.');
    assert.equal(runtime.state.last_turn.consequence.phase9_kind,
      'bag_recovery');
    assert.equal(runtime.state.phase9.committed_facts.includes(
      'road_bag_recovery_after_zhdanko_submission_admitted'), true);
    const restarted = createRuntime(structuredClone(runtime.state));
    assert.equal(restarted.state.containers.find(({ container_id: id }) =>
      id === ids.bag).state.controller_character_id,
    restarted.state.actor_id);
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
  else operation = activity(actor, dispositionSelection(request));
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
function dispositionSelection(request) {
  const projected = request.player_safe_state.temporary_disposition_options;
  const eligible = { custody: projected?.custody_option_refs,
    property: projected?.property_option_refs,
    promise: projected?.promise_option_refs };
  const choose = (dimension, preferred) => preferred.find((id) =>
    eligible[dimension]?.includes(id));
  const selected = [choose('custody', [
    'hold_ratsha_and_zhdanko_for_authorized_handover',
    'hold_ratsha_zhdanko_absent', 'hold_zhdanko_ratsha_absent',
    'hold_zhdanko_ratsha_present_not_held',
    'preserve_open_case_without_custody']), choose('property', [
    'preserve_recovered_property_for_savva_handover',
    'record_property_unavailable_without_invention',
    'leave_unresolved_property_state_unchanged']), choose('promise', [
    'preserve_active_no_summary_killing_promise',
    'recognize_fulfilled_promise', 'recognize_broken_promise',
    'record_no_active_promise', 'commit_scope_breach_for_active_promise'])]
    .filter(Boolean);
  return selected;
}
function testimonyClaim() { return {
  claim_id: 'trace_ld_v1_assertion_onisim_testimony',
  content_summary: 'Онисим сообщает, что перед столкновением слышал голос '
    + 'Жданко, помнит удар шеста и рывок за сумку, а после крушения Ратша '
    + 'вытащил его из воды, связал и отнёс к сушильне.',
  form: 'assertion', speaker_posture: 'believed_true',
  source_knowledge_refs: [{ entity_kind: 'knowledge_scope',
    entity_id: 'trace_ld_v1_knowledge_scope_hired_boatman_v1' }],
  mentioned_entity_refs: [] }; }
function committedKnowledge(factId) { return { fact_id: factId,
  knowledge_state: 'known_from_committed_scenario_event',
  evidence_refs: [`event:${factId}`] }; }
function onisimNonSpeechPlan(request, responseKind) {
  return { schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id, boundary_id: request.boundary_id,
    conversation_id: request.conversation_id, exchange_id: request.exchange_id,
    state_version: request.state_version, speaker_ref: request.npc_ref,
    contribution_kind: responseKind, primary_addressee_ref: null,
    intended_addressee_refs: [], affected_actor_refs: [], speech: null,
    interpretation: { intent: 'Не давать показаний.',
      grounded_contribution: 'Промолчать.', adaptation: 'literal' },
    resolution: 'automatic', activity: {
      duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null,
    reason: 'Онисим вправе не отвечать.' };
}
