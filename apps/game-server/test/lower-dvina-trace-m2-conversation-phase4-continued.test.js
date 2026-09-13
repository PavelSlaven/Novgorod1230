import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTracePhase4Contracts
} from '../src/runtime/lower-dvina-trace-phase-4-contracts.js';
import { prepareTracePhase4PlayerConversationPlan } from
  '../src/runtime/lower-dvina-trace-m2-conversation-player.js';
import {
  phase2PublicResult
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import {
  phase4SemanticCommitContext
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-commit.js';
import { appendSemanticNegotiation } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection-semantic.js';
import { semanticNegotiationCommand } from
  '../src/runtime/lower-dvina-trace-phase-4-semantic-command.js';
import { promiseOfferStage } from
  '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import {
  assertPersistedStatePayloadSafe,
  checkResult,
  createM2ConversationModels,
  digest,
  phase4ArrivalState,
  phase4Factual,
  projectPhase4Negotiation,
  ref,
  revision14Bundle,
  runPhase4
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('Ratsha responds once to the post-elapsed surrender demand boundary', async () => {
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
    ['communication']
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

test('incapacitated Ratsha does not receive a conversation LLM request',
  async () => {
    const { state, contracts } = phase4ArrivalState();
    const ratsha = state.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'ratsha_storehouse_helper');
    ratsha.machine_state = {
      ...ratsha.machine_state,
      status: 'incapacitated',
      speech_capability: 'none'
    };
    const exchange = await runPhase4({ state, contracts,
      rawText: 'Ратша, отвечай.', inputDigest: digest('c'),
      responseKind: 'speech', checkResult: null, offerStage: null,
      checkRequest: null });

    assert.equal(exchange.npcCalls, 0);
    assert.equal(exchange.result.decision_request, null);
    assert.equal(exchange.result.response_kind, null);
  });

test('Ratsha check admission maps success to surrender and failure to hostile follow-ups', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  for (const [responseKind, band, character] of [
    ['surrender', 'success', '6'],
    ['bargain', 'failure_with_consequence', '7'],
    ['combat_handoff', 'severe_failure', '8']
  ]) {
    const exchange = await runPhase4({
      state,
      contracts,
      rawText: 'Что ты ответишь?',
      inputDigest: digest(character),
      responseKind,
      checkResult: checkResult(contracts.check.check_id, band),
      offerStage,
      checkRequest
    });
    assert.equal(exchange.result.response_kind, responseKind);
    assert.equal(exchange.npcCalls, 1);
    if (band === 'failure_with_consequence') {
      assert.deepEqual(
        exchange.npcRequest.decision_scope.required_supporting_operation,
        { op: 'state_bargain' }
      );
      assert.equal(
        exchange.npcRequest.decision_scope.required_resolution,
        undefined
      );
      assert.deepEqual(exchange.npcRequest.decision_scope.operation_contract
        .state_bargain.required_check, {
        attribute_ref: contracts.npcSocialCheckProfile.attribute_ref,
        skill_ref: contracts.npcSocialCheckProfile.skill_ref,
        difficulty_band: contracts.npcSocialCheckProfile.profile_id
      });
    }
    if (band === 'severe_failure') {
      assert.deepEqual(
        exchange.npcRequest.decision_scope.allowed_contribution_kinds,
        ['combat_handoff']
      );
    }
  }
  for (const [index, [responseKind, band, code]] of [
    ['lie', 'success', 'TURN_NPC_PLAN_INVALID'],
    ['bargain', 'success', 'TURN_NPC_PLAN_INVALID'],
    ['speech', 'success', 'TURN_NPC_PLAN_INVALID'],
    ['silence', 'success', 'TURN_NPC_PLAN_INVALID'],
    ['leave_conversation', 'success', 'TURN_NPC_PLAN_INVALID'],
    ['combat_handoff', 'success', 'TURN_NPC_PLAN_INVALID'],
    ['surrender', 'severe_failure', 'TURN_NPC_PLAN_INVALID'],
    ['lie', 'severe_failure', 'TURN_NPC_PLAN_INVALID'],
    ['speech', 'severe_failure', 'TURN_NPC_PLAN_INVALID'],
    ['silence', 'severe_failure', 'TURN_NPC_PLAN_INVALID'],
    ['leave_conversation', 'severe_failure', 'TURN_NPC_PLAN_INVALID']
  ].entries()) {
    await assert.rejects(runPhase4({ state, contracts,
      rawText: 'Что ты ответишь?', inputDigest: digest('0123456789a'[index]),
      responseKind, checkResult: checkResult(contracts.check.check_id, band),
      offerStage, checkRequest
    }), { code });
  }
});

test('Ratsha combat handoff rejects a target outside the request safe context',
  async () => {
    const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
    await assert.rejects(runPhase4({
      state,
      contracts,
      rawText: 'Что ты сделаешь?',
      inputDigest: digest('a'),
      responseKind: 'combat_handoff',
      checkResult: checkResult(contracts.check.check_id, 'failure_with_consequence'),
      offerStage,
      checkRequest,
      transformNpcPlan: (plan) => {
        plan.handoff.target_actor_refs = [ref('npc', 'unknown-target')];
        return plan;
      }
    }), ({ code }) => code === 'TURN_NPC_PLAN_INVALID');
  });

test('player combat handoff reaches the persisted combat boundary', async () => {
  const { state, contracts } = phase4ArrivalState();
  const targetRef = ref(
    'npc', contracts.actors.ratsha_storehouse_helper.instance_id
  );
  const handoff = {
    kind: 'combat',
    intent: 'attack Ratsha',
    target_actor_refs: [targetRef]
  };
  const exchange = await runPhase4({ state, contracts,
    rawText: 'Бросаюсь на Ратшу.', inputDigest: digest('4'),
    responseKind: 'speech', checkResult: null, offerStage: null,
    checkRequest: null,
    transformPlayerPlan(plan) {
      plan.contribution_kind = 'combat_handoff';
      plan.primary_addressee_ref = null;
      plan.intended_addressee_refs = [];
      plan.speech = null;
      plan.interpretation = {
        intent: 'start combat with Ratsha',
        grounded_contribution: handoff.intent,
        adaptation: 'literal'
      };
      plan.resolution = 'automatic';
      plan.check = null;
      plan.supporting_operations = [];
      plan.handoff = handoff;
      return plan;
    }
  });
  assert.deepEqual(exchange.result.combat_handoff, handoff);

  const next = projectPhase4Negotiation({
    state, contracts, result: exchange.result, inputDigest: digest('4')
  });
  assert.deepEqual(next.player_response_boundary, handoff);
});

test('late Ratsha surrender applies after another NPC contribution', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const ratshaRef = ref('npc',
    contracts.actors.ratsha_storehouse_helper.instance_id);
  const fisherRef = ref('npc',
    contracts.actors.participating_fisher.instance_id);
  const exchange = await runPhase4({
    state,
    contracts,
    rawText: 'Ратша, сдавайся и отдай нож.',
    inputDigest: digest('1'),
    responseKind: (_request, callIndex) =>
      callIndex === 1 ? 'bargain'
        : callIndex === 2 ? 'speech' : 'surrender',
    checkResult: null,
    offerStage,
    checkRequest: null,
    transformNpcPlan(plan, { call_index: callIndex }) {
      const targetRef = callIndex === 1 ? fisherRef
        : callIndex === 2 ? ratshaRef : null;
      if (targetRef !== null) {
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [targetRef]
        };
      }
      return plan;
    }
  });

  assert.equal(exchange.npcCalls, 3);
  assert.equal(exchange.result.response_kind, 'surrender');
  assert.equal(exchange.result.commitment.status, 'active');
  const ratshaStatements = exchange.result.statements.filter(
    ({ speaker_ref: speaker }) => speaker.entity_id === ratshaRef.entity_id);
  assert.equal(ratshaStatements.length, 2);
  assert.equal(exchange.result.surrender.source_statement_ref.entity_id,
    ratshaStatements.at(-1).statement_id);
  const next = projectPhase4Negotiation({ state, contracts,
    result: exchange.result, inputDigest: digest('1') });
  assert.equal(next.ratsha_surrendered, true);
});

test('late Ratsha combat handoff terminates the causal exchange', async () => {
  const { state, contracts, offerStage, checkRequest } = phase4ArrivalState();
  const ratshaRef = ref('npc',
    contracts.actors.ratsha_storehouse_helper.instance_id);
  const fisherRef = ref('npc',
    contracts.actors.participating_fisher.instance_id);
  const exchange = await runPhase4({
    state,
    contracts,
    rawText: 'Ратша, решай.',
    inputDigest: digest('2'),
    responseKind: (_request, callIndex) =>
      callIndex === 1 ? 'bargain'
        : callIndex === 2 ? 'speech' : 'combat_handoff',
    checkResult: checkResult(contracts.check.check_id, 'failure_with_consequence'),
    offerStage,
    checkRequest,
    transformNpcPlan(plan, { call_index: callIndex }) {
      const targetRef = callIndex === 1 ? fisherRef
        : callIndex === 2 ? ratshaRef : null;
      if (targetRef !== null) {
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [targetRef]
        };
      }
      return plan;
    }
  });

  assert.equal(exchange.npcCalls, 3);
  assert.equal(exchange.result.response_kind, 'combat_handoff');
  assert.equal(exchange.result.exchange.stop_reason, 'handoff');
  assert.deepEqual(exchange.result.combat_handoff.target_actor_refs,
    [ref('player_character', state.actor_id)]);
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
      checkResult: null,
      offerStage,
      checkRequest: null
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
