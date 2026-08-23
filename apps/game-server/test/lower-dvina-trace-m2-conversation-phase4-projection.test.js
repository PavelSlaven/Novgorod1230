import assert from 'node:assert/strict';
import test from 'node:test';
import { phase2PublicResult } from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { assertPersistedStatePayloadSafe, checkResult, digest, phase4ArrivalState, projectPhase4Negotiation, runPhase4 } from './lower-dvina-trace-m2-conversation-fixture.js';
test('silence and combat handoff have closed player-safe post-commit and replay projections', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  for (const [responseKind, digestCharacter] of [
    ['silence', 'b'],
    ['combat_handoff', 'c'],
  ]) {
    const exchange = await runPhase4({
      state,
      contracts,
      rawText: '\u0427\u0442\u043E \u0442\u044B \u043E\u0442\u0432\u0435\u0442\u0438\u0448\u044C?',
      inputDigest: digest(digestCharacter),
      responseKind,
      checkResult: checkResult(contracts.check.check_id, 'success'),
      offerStage,
      checkRequest,
    });
    assert.equal(exchange.result.statements.filter(({ speaker_ref: speaker }) => speaker.entity_kind === 'npc').length, 0);
    const payload = projectPhase4Negotiation({
      state,
      contracts,
      result: exchange.result,
      inputDigest: digest(digestCharacter),
    });
    assert.equal(payload.last_turn.consequence.conversation, void 0);
    assert.ok(payload.last_turn.consequence.negotiation.semantic_exchange_projection);
    const screen = { schema: 'test-screen' };
    const postCommit = phase2PublicResult({ payload, screen });
    const replay = phase2PublicResult({
      payload: structuredClone(payload),
      screen: structuredClone(screen),
    });
    const expected = {
      response_kind: responseKind,
      npc_utterance: null,
      disclosed_route_ref: null,
    };
    assert.deepEqual(postCommit.conversation.semantic_exchange, expected);
    assert.deepEqual(replay, postCommit);
    assert.deepEqual(Object.keys(postCommit.conversation.semantic_exchange).sort(), ['disclosed_route_ref', 'npc_utterance', 'response_kind']);
    if (responseKind === 'silence') {
      const legacyNegotiation = structuredClone(payload);
      delete legacyNegotiation.last_turn.consequence.negotiation.semantic_exchange_projection;
      assert.equal(
        phase2PublicResult({
          payload: legacyNegotiation,
          screen: structuredClone(screen),
        }).conversation,
        null,
      );
      const privateNegotiation = structuredClone(legacyNegotiation);
      privateNegotiation.last_turn.consequence.negotiation.semantic_exchange = structuredClone(exchange.result);
      assert.throws(
        () =>
          phase2PublicResult({
            payload: privateNegotiation,
            screen: structuredClone(screen),
          }),
        /Private semantic exchange/u,
      );
    }
  }
});
test('only surrender activates the party-local commitment and projects the knife transition signals', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const ratsha = contracts.actors.ratsha_storehouse_helper;
  const persistenceMarker = 'ratsha-private-request-knowledge-must-not-reach-state-payload';
  ratsha.knowledge_profile_snapshot.private_persistence_marker = persistenceMarker;
  const surrender = await runPhase4({
    state,
    contracts,
    rawText:
      '\u041E\u0431\u0435\u0449\u0430\u044E \u0437\u0430\u0449\u0438\u0442\u0443, \u0435\u0441\u043B\u0438 \u0441\u0434\u0430\u0448\u044C\u0441\u044F \u0438 \u043E\u0442\u0434\u0430\u0448\u044C \u043D\u043E\u0436.',
    inputDigest: digest('a'),
    responseKind: 'surrender',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    offerStage,
    checkRequest,
  });
  assert.equal(surrender.npcRequest.knowledge.private_persistence_marker, persistenceMarker);
  delete ratsha.knowledge_profile_snapshot.private_persistence_marker;
  const surrenderedState = projectPhase4Negotiation({
    state,
    contracts,
    result: surrender.result,
    inputDigest: digest('a'),
  });
  assertPersistedStatePayloadSafe({
    payload: surrenderedState,
    persistenceMarker,
    historyBranch: surrenderedState.phase4_history.at(-1).consequence.negotiation,
  });
  assert.equal(surrender.result.commitment.status, 'active');
  assert.equal(surrender.result.knife_transition_eligibility.eligible, true);
  assert.equal(surrenderedState.promise_instances[0].current_state, 'active');
  assert.equal(surrenderedState.ratsha_surrendered, true);
  const knife = surrenderedState.items.find(({ template_id: templateId }) => templateId === 'trace_ld_v1_item_ratsha_knife');
  assert.equal(knife.placement.holder_npc_id, contracts.actors.participating_fisher.instance_id);
  const transitionSignalCategories = surrenderedState.npc_decision_signals
    .filter(({ signal }) => signal.source_event_ref.entity_kind === 'item_property_transition')
    .map(({ signal }) => signal.category)
    .sort();
  assert.deepEqual(transitionSignalCategories, ['others', 'others', 'self']);
  const lie = await runPhase4({
    state,
    contracts,
    rawText: '\u0421\u0434\u0430\u0432\u0430\u0439\u0441\u044F.',
    inputDigest: digest('b'),
    responseKind: 'lie',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    offerStage,
    checkRequest,
  });
  const liedState = projectPhase4Negotiation({
    state,
    contracts,
    result: lie.result,
    inputDigest: digest('b'),
  });
  assert.equal(liedState.promise_instances[0].current_state, 'offered');
  assert.equal(liedState.ratsha_surrendered, void 0);
  assert.equal(
    liedState.npc_decision_signals.some(({ signal }) => signal.source_event_ref.entity_kind === 'item_property_transition'),
    false,
  );
});
