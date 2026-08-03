import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTracePhase4Contracts
} from '../src/runtime/lower-dvina-trace-phase-4-contracts.js';
import {
  phase2PublicResult
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import {
  assertPersistedStatePayloadSafe,
  checkResult,
  digest,
  phase4ArrivalState,
  projectPhase4Negotiation,
  ref,
  revision14Bundle,
  runPhase4
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('the same code-owned social check exposes delivery cues but does not choose Ratsha branch', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const common = {
    state,
    contracts,
    rawText: 'Ратша, сдавайся. Без суда тебя не убьют.',
    checkResult: checkResult(contracts.check.check_id, 'success_with_cost'),
    offerStage,
    checkRequest
  };
  const lied = await runPhase4({
    ...common,
    inputDigest: digest('3'),
    responseKind: 'lie'
  });
  const bargained = await runPhase4({
    ...common,
    inputDigest: digest('4'),
    responseKind: 'bargain'
  });

  assert.equal(lied.result.response_kind, 'lie');
  assert.equal(bargained.result.response_kind, 'bargain');
  assert.deepEqual(
    lied.npcRequest.social_context.delivery_cues,
    ['delivery_credible_with_visible_cost']
  );
  assert.deepEqual(
    bargained.npcRequest.social_context.delivery_cues,
    lied.npcRequest.social_context.delivery_cues
  );
  assert.deepEqual(lied.result.social_delivery_result,
    bargained.result.social_delivery_result);
});

test('arrival, invalidated objective and surrender demand share one Ratsha boundary and model call', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const eremey = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
  );
  eremey.knowledge_profile_snapshot.private_test_marker =
    'eremey-private-knowledge-must-not-reach-ratsha';
  const currentContracts = resolveTracePhase4Contracts({
    state,
    bundle: revision14Bundle
  });
  const exchange = await runPhase4({
    state,
    contracts: currentContracts,
    rawText: 'Сдавайся и отдай нож.',
    inputDigest: digest('5'),
    responseKind: 'surrender',
    checkResult: checkResult(currentContracts.check.check_id, 'clean_success'),
    offerStage,
    checkRequest: {
      ...checkRequest,
      check_id: currentContracts.check.check_id
    }
  });

  assert.deepEqual(
    exchange.result.decision_boundary.categories,
    ['others', 'objective', 'communication']
  );
  assert.equal(exchange.result.exchange.npc_decisions.length, 1);
  assert.equal(exchange.npcCalls, 1);
  assert.equal(
    JSON.stringify(exchange.npcRequest).includes(
      'eremey-private-knowledge-must-not-reach-ratsha'
    ),
    false
  );
  assert.deepEqual(
    exchange.npcRequest.knowledge,
    currentContracts.actors.ratsha_storehouse_helper
      .knowledge_profile_snapshot
  );
});

test('Ratsha semantic boundary accepts surrender, lie, bargain, silence and combat handoff only', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const responseKinds = [
    'surrender',
    'lie',
    'bargain',
    'silence',
    'combat_handoff'
  ];
  const digestCharacters = ['6', '7', '8', '9', 'e'];
  const results = new Map();

  for (const [index, responseKind] of responseKinds.entries()) {
    const exchange = await runPhase4({
      state,
      contracts,
      rawText: 'Что ты ответишь?',
      inputDigest: digest(digestCharacters[index]),
      responseKind,
      checkResult: checkResult(contracts.check.check_id, 'success'),
      offerStage,
      checkRequest
    });
    results.set(responseKind, exchange.result);
    assert.equal(exchange.result.response_kind, responseKind);
    assert.equal(exchange.npcCalls, 1);
    if (responseKind === 'silence') {
      assert.equal(exchange.result.silence, true);
    } else {
      assert.ok(exchange.result[responseKind]);
    }
  }

  for (const responseKind of ['lie', 'bargain', 'silence', 'combat_handoff']) {
    assert.equal(results.get(responseKind).commitment, null);
    assert.equal(results.get(responseKind).knife_transition_eligibility, null);
  }
  const combat = results.get('combat_handoff');
  assert.deepEqual(combat.combat_handoff, {
    kind: 'combat',
    intent: 'transfer control to the combat owner',
    target_actor_refs: [ref('player_character', state.actor_id)]
  });
  assert.equal(combat.exchange.session_status, 'suspended');
  assert.equal(combat.statements.length, 1);
  assert.deepEqual(combat.objective_truth_writes, []);
  assert.equal(Object.hasOwn(combat, 'attack'), false);
  assert.equal(Object.hasOwn(combat, 'harm'), false);
  assert.equal(Object.hasOwn(combat, 'escape'), false);
});

test('silence and combat handoff have closed player-safe post-commit and replay projections', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  for (const [responseKind, digestCharacter] of [
    ['silence', 'b'],
    ['combat_handoff', 'c']
  ]) {
    const exchange = await runPhase4({
      state,
      contracts,
      rawText: 'Что ты ответишь?',
      inputDigest: digest(digestCharacter),
      responseKind,
      checkResult: checkResult(contracts.check.check_id, 'success'),
      offerStage,
      checkRequest
    });
    assert.equal(
      exchange.result.statements.filter(
        ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc'
      ).length,
      0
    );
    const payload = projectPhase4Negotiation({
      state,
      contracts,
      result: exchange.result,
      inputDigest: digest(digestCharacter)
    });
    assert.equal(payload.last_turn.consequence.conversation, undefined);
    assert.ok(
      payload.last_turn.consequence.negotiation.semantic_exchange_projection
    );
    const screen = { schema: 'test-screen' };
    const postCommit = phase2PublicResult({ payload, screen });
    const replay = phase2PublicResult({
      payload: structuredClone(payload),
      screen: structuredClone(screen)
    });
    const expected = {
      response_kind: responseKind,
      npc_utterance: null,
      disclosed_route_ref: null
    };
    assert.deepEqual(postCommit.conversation.semantic_exchange, expected);
    assert.deepEqual(replay, postCommit);
    assert.deepEqual(
      Object.keys(postCommit.conversation.semantic_exchange).sort(),
      ['disclosed_route_ref', 'npc_utterance', 'response_kind']
    );
    if (responseKind === 'silence') {
      const legacyNegotiation = structuredClone(payload);
      delete legacyNegotiation.last_turn.consequence.negotiation
        .semantic_exchange_projection;
      assert.equal(
        phase2PublicResult({
          payload: legacyNegotiation,
          screen: structuredClone(screen)
        }).conversation,
        null
      );
      const privateNegotiation = structuredClone(legacyNegotiation);
      privateNegotiation.last_turn.consequence.negotiation.semantic_exchange =
        structuredClone(exchange.result);
      assert.throws(
        () => phase2PublicResult({
          payload: privateNegotiation,
          screen: structuredClone(screen)
        }),
        /Private semantic exchange/u
      );
    }
  }
});

test('only surrender activates the party-local commitment and projects the knife transition signals', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const ratsha = contracts.actors.ratsha_storehouse_helper;
  const persistenceMarker =
    'ratsha-private-request-knowledge-must-not-reach-state-payload';
  ratsha.knowledge_profile_snapshot.private_persistence_marker =
    persistenceMarker;
  const surrender = await runPhase4({
    state,
    contracts,
    rawText: 'Обещаю защиту, если сдашься и отдашь нож.',
    inputDigest: digest('a'),
    responseKind: 'surrender',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    offerStage,
    checkRequest
  });
  assert.equal(
    surrender.npcRequest.knowledge.private_persistence_marker,
    persistenceMarker
  );
  delete ratsha.knowledge_profile_snapshot.private_persistence_marker;
  const surrenderedState = projectPhase4Negotiation({
    state,
    contracts,
    result: surrender.result,
    inputDigest: digest('a')
  });
  assertPersistedStatePayloadSafe({
    payload: surrenderedState,
    persistenceMarker,
    historyBranch: surrenderedState.phase4_history.at(-1)
      .consequence.negotiation
  });

  assert.equal(surrender.result.commitment.status, 'active');
  assert.equal(surrender.result.knife_transition_eligibility.eligible, true);
  assert.equal(surrenderedState.promise_instances[0].current_state, 'active');
  assert.equal(surrenderedState.ratsha_surrendered, true);
  const knife = surrenderedState.items.find(
    ({ template_id: templateId }) =>
      templateId === 'trace_ld_v1_item_ratsha_knife'
  );
  assert.equal(
    knife.placement.holder_npc_id,
    contracts.actors.participating_fisher.instance_id
  );
  const transitionSignalCategories = surrenderedState.npc_decision_signals
    .filter(({ signal }) => signal.source_event_ref.entity_kind
      === 'item_property_transition')
    .map(({ signal }) => signal.category)
    .sort();
  assert.deepEqual(transitionSignalCategories, ['others', 'others', 'self']);

  const lie = await runPhase4({
    state,
    contracts,
    rawText: 'Сдавайся.',
    inputDigest: digest('b'),
    responseKind: 'lie',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    offerStage,
    checkRequest
  });
  const liedState = projectPhase4Negotiation({
    state,
    contracts,
    result: lie.result,
    inputDigest: digest('b')
  });
  assert.equal(liedState.promise_instances[0].current_state, 'offered');
  assert.equal(liedState.ratsha_surrendered, undefined);
  assert.equal(liedState.npc_decision_signals.some(({ signal }) =>
    signal.source_event_ref.entity_kind === 'item_property_transition'), false);
});
