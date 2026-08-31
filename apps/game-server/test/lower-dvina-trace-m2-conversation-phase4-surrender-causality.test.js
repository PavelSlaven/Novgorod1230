import assert from 'node:assert/strict';
import test from 'node:test';
import { appendSemanticNegotiation } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection-semantic.js';
import { promiseOfferStage } from
  '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import { buildSurrenderProjection } from
  '../src/runtime/lower-dvina-trace-m2-conversation-surrender.js';
import {
  checkResult,
  digest,
  phase4ArrivalState,
  phase4Factual,
  projectPhase4Negotiation,
  ref,
  runPhase4
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('Ratsha surrender remains factual without a protection promise', async () => {
  const { state, contracts } = phase4ArrivalState();
  const exchange = await runPhase4({ state, contracts,
    rawText: 'Ратша, сдавайся и брось нож.', inputDigest: digest('0'),
    responseKind: 'surrender', checkResult: null, offerStage: null,
    checkRequest: null });

  assert.equal(exchange.result.response_kind, 'surrender');
  assert.equal(exchange.result.commitment, null);
  assert.notEqual(exchange.result.surrender, null);
  assert.notEqual(exchange.result.knife_transition_eligibility, null);

  const next = projectPhase4Negotiation({ state, contracts,
    result: exchange.result, inputDigest: digest('0') });
  assert.equal(next.promise_instances[0].current_state, 'not_offered');
  assert.equal(next.ratsha_surrendered, true);
  const knife = next.items.find(({ template_id: templateId }) =>
    templateId === 'trace_ld_v1_item_ratsha_knife');
  assert.equal(knife.placement.holder_npc_id,
    contracts.actors.participating_fisher.instance_id);
  const factual = phase4Factual({ state, contracts, result: exchange.result,
    inputDigest: digest('0') });
  const writes = { inserts: [], updates: [], appends: [] };
  appendSemanticNegotiation({ ...writes, partyId: state.party_id,
    state, next, factual,
    turnNumber: state.party_state.turn_number + 1,
    changeSetId: 'change:surrender-without-promise',
    idemId: 'idem:surrender-without-promise', contracts,
    rootTurnId: 'turn:surrender-without-promise', workingRevision: 0 });
  assert.equal(writes.updates.some(({ target_table: table }) =>
    table === 'party_items'), true);
  assert.equal(writes.updates.some(({ target_table: table }) =>
    table === 'party_npcs'), true);
  assert.equal(writes.appends.some(({ target_table: table }) =>
    table === 'party_obligation_transitions'), false);
});

test('surrender keeps an unspecified knife carry position', async () => {
  const fixture = phase4ArrivalState();
  const state = structuredClone(fixture.state);
  const contracts = structuredClone(fixture.contracts);
  state.items.push({
    item_id: 'retired-water-portion',
    template_id: 'trace_ld_v1_item_player_water_portion',
    condition_state: 'retired',
    placement: { anchor_id: state.position.g5_anchor_id },
    ownership: {}
  });
  delete contracts.knifeTransition.requires.physical_position;
  delete contracts.knifeTransition.requires.accessibility;
  delete contracts.knifeTransition.writes.physical_position;
  const exchange = await runPhase4({ state, contracts,
    rawText: 'Ратша, сдавайся и брось нож.', inputDigest: digest('f'),
    responseKind: 'surrender', checkResult: null, offerStage: null,
    checkRequest: null });
  const next = projectPhase4Negotiation({ state, contracts,
    result: exchange.result, inputDigest: digest('f') });
  const knife = state.items.find(({ template_id: id }) =>
    id === 'trace_ld_v1_item_ratsha_knife');
  assert.equal(next.items.find(({ item_id: id }) => id === knife.item_id)
    .placement.physical_position, knife.placement.physical_position);
  const factual = phase4Factual({ state, contracts, result: exchange.result,
    inputDigest: digest('f') });
  assert.doesNotThrow(() => appendSemanticNegotiation({
    inserts: [], updates: [], appends: [], partyId: state.party_id, state,
    next, factual, turnNumber: state.party_state.turn_number + 1,
    changeSetId: 'change:surrender-unspecified-position',
    idemId: 'idem:surrender-unspecified-position', contracts,
    rootTurnId: 'turn:surrender-unspecified-position', workingRevision: 0
  }));
});

test('unperceived acceptance preserves surrender but not promise activation',
  async () => {
    const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
    state.promise_instances[0].created_change_set_id = 'change:phase4-arrival';
    const exchange = await runPhase4({ state, contracts,
      rawText: 'Обещаю защиту, если сдашься и отдашь нож.',
      inputDigest: digest('e'), responseKind: 'surrender',
      checkResult: checkResult(contracts.check.check_id, 'success'),
      offerStage, checkRequest });
    const result = structuredClone(exchange.result);
    removePlayerFromAcceptanceAudience(result, state.actor_id);
    const projection = buildSurrenderProjection(result, {
      state, contracts,
      conversationId: result.decision_request.conversation_id,
      exchangeId: result.decision_request.exchange_id,
      targetRef: result.decision_request.npc_ref
    });

    assert.equal(projection.commitment.status, 'offered');
    assert.notEqual(projection.surrender, null);
    result.commitment = projection.commitment;
    result.surrender = projection.surrender;
    result.knife_transition_eligibility = projection.knifeTransitionEligibility;
    const next = projectPhase4Negotiation({ state, contracts, result,
      inputDigest: digest('e') });
    assert.equal(next.promise_instances[0].current_state, 'offered');
    assert.equal(next.ratsha_surrendered, true);
    const knife = next.items.find(({ template_id: templateId }) =>
      templateId === 'trace_ld_v1_item_ratsha_knife');
    assert.equal(knife.placement.holder_npc_id,
      contracts.actors.participating_fisher.instance_id);

    const factual = phase4Factual({ state, contracts, result,
      inputDigest: digest('e') });
    factual.consequence.negotiation.offer_stage = promiseOfferStage(
      state, contracts
    );
    const writes = { inserts: [], updates: [], appends: [] };
    appendSemanticNegotiation({ ...writes, partyId: state.party_id, state,
      next, factual, turnNumber: state.party_state.turn_number + 1,
      changeSetId: `change:${digest('e').slice(0, 12)}`,
      idemId: 'idem:unperceived-acceptance', contracts,
      rootTurnId: `turn:${digest('e').slice(0, 12)}`, workingRevision: 0 });
    assert.equal(writes.updates.some(({ target_table: table }) =>
      table === 'party_items'), true);
    assert.equal(writes.updates.some(({ target_table: table }) =>
      table === 'party_npcs'), true);
    assert.equal(writes.appends.some(({ target_table: table }) =>
      table === 'party_npc_runtime_transitions'), true);
  });

function removePlayerFromAcceptanceAudience(result, actorId) {
  const playerRef = ref('player_character', actorId);
  const statement = result.statements.find(({ speaker_ref: speaker }) =>
    speaker.entity_kind === 'npc');
  const audience = result.audiences.find(({ statement_ref: reference }) =>
    reference.entity_id === statement.statement_id);
  const isPlayer = (reference) => reference.entity_kind === playerRef.entity_kind
    && reference.entity_id === playerRef.entity_id;
  for (const key of ['actual_listener_refs', 'witness_candidate_refs']) {
    audience[key] = audience[key].filter((reference) => !isPlayer(reference));
  }
  audience.received_messages = audience.received_messages.filter(
    ({ listener_ref: listener }) => !isPlayer(listener)
  );
}
