import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime } from '@rus/time-events-history';
import { resolveTracePhase3Contracts } from
  '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import { projectSemanticConversationSnapshot } from
  '../src/infrastructure/postgres/lower-dvina-trace-conversation-state.js';
import { buildNpcSemanticConversationWriteInput } from
  '../src/infrastructure/postgres/npc-semantic-conversation-write-input.js';
import { appendNpcSemanticConversationWrites } from
  '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import { appendSemanticNegotiation } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection-semantic.js';
import { integrateConversationTemporalWrites } from
  '../src/infrastructure/postgres/lower-dvina-trace-conversation-temporal.js';
import { nextPhase4State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-state.js';
import { promiseOfferStage } from
  '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import { createTracePhase3TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-3-effects.js';
import { phase2PublicResult } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { assertLowerDvinaTraceSemanticConversationRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { semanticReadPool } from
  './lower-dvina-trace-semantic-persistence-read-pool.js';
import {
  digest,
  phase2ConversationPayload,
  phase4ArrivalState,
  phase3State,
  projectPhase3Conversation,
  ref,
  revision14Bundle,
  runPhase3,
  runPhase4,
  withAccessibleBlueWool
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('continued history preserves append order instead of digest order', async () => {
  const state = phase3State();
  const contracts = resolveContracts(state);
  const first = await runPhase3({ state, contracts, rawText: 'Первый вопрос.',
    inputDigest: digest('f'), responseKind: 'speech' });
  const afterFirst = project(first, state, 'order:first');
  const second = await runPhase3({ state: afterFirst,
    contracts: resolveContracts(afterFirst), rawText: 'Второй вопрос.',
    inputDigest: digest('0'), responseKind: 'speech' });
  const afterSecond = project(second, afterFirst, 'order:second');
  const third = await runPhase3({ state: afterSecond,
    contracts: resolveContracts(afterSecond), rawText: 'Третий вопрос.',
    inputDigest: digest('a'), responseKind: 'speech' });

  assert.deepEqual(third.npcRequest.public_conversation_history.map(
    ({ utterance_text: text }) => text), [
    'Первый вопрос.', 'Я отвечу лишь на то, что сам видел.',
    'Второй вопрос.', 'Я отвечу лишь на то, что сам видел.',
    'Третий вопрос.'
  ]);
});

test('continued history includes a prior NPC silence contribution', async () => {
  const state = phase3State();
  const first = await runPhase3({ state, contracts: resolveContracts(state),
    rawText: 'Ты ответишь?', inputDigest: digest('8'), responseKind: 'silence' });
  const continued = project(first, state, 'silence');
  const second = await runPhase3({ state: continued,
    contracts: resolveContracts(continued), rawText: 'Я повторяю вопрос.',
    inputDigest: digest('9'), responseKind: 'speech' });

  assert.equal(second.npcRequest.public_conversation_history.some((entry) =>
    entry.schema === 'conversation_non_statement_contribution_v1'
      && entry.exchange_id === first.result.decision_request.exchange_id
      && entry.contribution_kind === 'silence'), true);
});

test('unheard target keeps player fact and skips NPC model', async () => {
  const state = phase3State();
  const eremey = npcBySlot(state, 'eremey_fisher');
  eremey.machine_state = { ...eremey.machine_state, hearing_capability: 'none' };
  const contracts = resolveContracts(state);
  const exchange = await runPhase3({ state, contracts,
    rawText: 'Еремей, ты меня слышишь?', inputDigest: digest('b'),
    responseKind: 'speech' });

  assert.equal(exchange.playerCalls, 1);
  assert.equal(exchange.npcCalls, 0);
  assert.equal(exchange.result.statements.length, 1);
  assert.equal(exchange.result.exchange.npc_decisions.length, 0);
  assert.equal(exchange.result.exchange.stop_reason, 'player_response');
  assert.equal(exchange.result.decision_boundary, null);
  assert.equal(exchange.result.decision_request, null);
  assert.equal(exchange.result.decision_plan, null);
  assert.equal(exchange.result.response_kind, null);
  const next = project(exchange, state, 'unheard-target');
  const writeInput = buildNpcSemanticConversationWriteInput({
    state, next, semanticExchange: exchange.result
  });
  assert.equal(writeInput.signalRecords.length, 0);
  const writes = writeSemantic(state, writeInput, 'unheard-target');
  assert.equal(writes.appends.some(({ target_table: table }) =>
    table === 'party_npc_decision_traces'), false);
  assert.equal(writes.appends.filter(({ target_table: table }) =>
    table === 'party_conversation_statements').length, 1);
  assert.deepEqual(await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(writes), next), []);
  const publicResult = phase2PublicResult({
    payload: phase2ConversationPayload({
      state,
      optionId: contracts.ids.talkOption,
      check: null,
      activityRef: contracts.talk.profile_id,
      result: exchange.result
    }),
    screen: { schema: 'test-screen' }
  });
  assert.deepEqual(publicResult.conversation.semantic_exchange, {
    response_kind: null,
    npc_utterance: null,
    disclosed_route_ref: null
  });
  assert.doesNotThrow(() => projectPhase3Conversation({ state, contracts,
    result: exchange.result, inputDigest: digest('b') }));
});

test('target partial and unidentified perception persist unchanged', async () => {
  const variants = [
    { label: 'partial', machine: { hearing_capability: 'partial' },
      semantic: {}, result: 'perceived_partial', comprehension: 'partial',
      speaker: 'player_character', text: null },
    { label: 'unidentified', machine: {},
      semantic: { speaker_recognition: 'unidentified' },
      result: 'perceived_unidentified', comprehension: 'full', speaker: null,
      text: 'Еремей, кто был у лодки?' }
  ];
  for (const variant of variants) {
    const state = phase3State();
    const eremey = npcBySlot(state, 'eremey_fisher');
    eremey.machine_state = { ...eremey.machine_state, ...variant.machine };
    eremey.semantic_state = { ...eremey.semantic_state, ...variant.semantic };
    const exchange = await runPhase3({ state, contracts: resolveContracts(state),
      rawText: 'Еремей, кто был у лодки?',
      inputDigest: digest(variant.label === 'partial' ? 'c' : 'd'),
      responseKind: 'speech' });
    const message = exchange.result.audiences[0].received_messages.find(
      ({ listener_ref: listener }) => listener.entity_id === eremey.instance_id);
    assert.equal(message.perception_result, variant.result);
    assert.equal(message.comprehension, variant.comprehension);
    assert.equal(message.speaker_ref?.entity_kind ?? null, variant.speaker);
    assert.equal(message.utterance_text, variant.text);
    const next = project(exchange, state, variant.label);
    const input = buildNpcSemanticConversationWriteInput({
      state, next, semanticExchange: exchange.result
    });
    assert.equal(input.actualMessageEvidence.find(({ listener_ref: listener }) =>
      listener.entity_id === eremey.instance_id).result_kind, variant.result);
    const writes = writeSemantic(state, input, variant.label);
    assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(writes), next)).length, 1);
  }
});

test('partial bystander perception persists unchanged', async () => {
  const state = phase3State();
  const fisher = npcBySlot(state, 'background_fisher_1');
  fisher.machine_state = { ...fisher.machine_state, hearing_capability: 'partial' };
  const exchange = await runPhase3({ state, contracts: resolveContracts(state),
    rawText: 'Еремей, что ты видел?', inputDigest: digest('e'),
    responseKind: 'speech' });
  const next = project(exchange, state, 'partial-bystander');
  const input = buildNpcSemanticConversationWriteInput({
    state, next, semanticExchange: exchange.result
  });
  assert.equal(input.actualMessageEvidence.find(({ listener_ref: listener }) =>
    listener.entity_id === fisher.instance_id).result_kind, 'perceived_partial');
  const writes = writeSemantic(state, input, 'partial-bystander');
  assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(writes), next)).length, 1);
});

test('background boundary updates perception without pausing conversation', async () => {
  const state = phase3State();
  const scheduledAt = addElapsedTime(state.clock, {
    exact_minutes: { numerator: '2', denominator: '1' }
  });
  state.temporal_boundary_candidates = [boundaryCandidate(state, scheduledAt)];
  const contracts = resolveContracts(state);
  const exchange = await runPhase3({ state, contracts,
    rawText: 'Еремей, что ты видел?', inputDigest: digest('f'),
    responseKind: 'speech',
    resolveTemporalBoundary(_candidate, { projection }) {
      const next = structuredClone(projection);
      const target = next.conversation_state.world_state.npcs.find(
        ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
      );
      target.machine_state = {
        ...target.machine_state, hearing_capability: 'none'
      };
      return {
        disposition: 'execute', proposals: [{
          proposal_id: 'conversation-boundary:disable-hearing',
          write_target: `party_npcs:${target.instance_id}`,
          write_set: {
            inserts: [], appends: [], deletes: [],
            updates: [{
              target_table: 'party_npcs', id: target.instance_id,
              record: { party_id: state.party_id,
                npc_id: target.instance_id,
                machine_state: structuredClone(target.machine_state) }
            }]
          },
          expected_state_versions: [],
          physical_keys: [
            `party_runtime.party_npcs:${target.instance_id}`
          ]
        }], state_projection: next,
        follow_up_candidates: []
      };
    } });

  assert.equal(exchange.npcCalls, 0);
  assert.equal(exchange.result.exchange.stop_reason, 'player_response');
  assert.equal(exchange.result.exchange.session_status, 'active');
  assert.equal(exchange.result.exchange.time_budget.status, 'completed');
  assert.equal(exchange.result.exact_elapsed_minutes, 5);
  assert.deepEqual(exchange.result.clock_after, plusMinutes(state.clock, '5'));
  assert.deepEqual(exchange.result.temporal_boundary_refs, [
    ref('temporal_boundary_candidate', 'boundary:conversation-interruption')
  ]);
  assert.equal(exchange.result.audiences[0].received_messages.some(
    ({ listener_ref: listener }) =>
      listener.entity_id === npcBySlot(state, 'eremey_fisher').instance_id
  ), false);
  const restarted = projectPhase3Conversation({ state, contracts,
    result: exchange.result, inputDigest: digest('f') });
  assert.equal(npcBySlot(restarted, 'eremey_fisher')
    .machine_state.hearing_capability, 'none');
  const integrated = integrateConversationTemporalWrites({
    input: {
      party_id: state.party_id,
      canonical_input_digest: digest('f'),
      approved_write_sets: [{
        inserts: [], updates: [], appends: [], deletes: []
      }],
      expected_state_versions: [],
      lock_context: { physical_keys: [] }
    },
    semanticExchange: exchange.result,
    fail(error) { throw error; }
  });
  assert.equal(integrated.approved_write_sets.flatMap(
    ({ updates }) => updates).some(({ target_table: table }) =>
    table === 'party_npcs'), true);
  const temporal = await createTracePhase3TemporalAdvance({
    phase2Advance: async () => null
  })({
    clock_before: state.clock,
    exact_elapsed: {
      exact_minutes: { numerator: '5', denominator: '1' }
    },
    relevant_state: state,
    consequence: {
      phase3_kind: 'conversation',
      conversation: {
        activity_ref: contracts.talk.profile_id,
        semantic_exchange: exchange.result
      }
    }
  });
  assert.deepEqual(temporal.nearest_boundary, {
    scheduled_at: scheduledAt,
    boundary_ids: ['boundary:conversation-interruption']
  });
  assert.deepEqual(temporal.boundary_trace.processed_boundary_ids,
    ['boundary:conversation-interruption']);
  assert.deepEqual(temporal.boundary_trace.deferred_to_source_owner_ids,
    []);
});

test('each contribution advances before perception and next request', async () => {
  const state = phase3State();
  const exchange = await runPhase3({ state, contracts: resolveContracts(state),
    rawText: 'Еремей, что ты видел?', inputDigest: digest('1'),
    responseKind: 'speech' });
  const afterNpc = plusMinutes(state.clock, '5');
  const [playerStatement, npcStatement] = exchange.result.statements;
  assert.deepEqual(playerStatement.spoken_at, state.clock);
  const afterPlayer = exchange.result.audiences[0]
    .received_messages[0].perceived_at;
  assert.equal(Number(afterPlayer.whole_minutes)
    > Number(state.clock.whole_minutes), true);
  assert.equal(Number(afterPlayer.whole_minutes)
    < Number(afterNpc.whole_minutes), true);
  assert.deepEqual(exchange.result.decision_request.requested_at, afterPlayer);
  assert.deepEqual(npcStatement.spoken_at, afterPlayer);
  assert.deepEqual(exchange.result.audiences[1]
    .received_messages[0].perceived_at, afterNpc);
  assert.equal(exchange.result.exact_elapsed_minutes, 5);
  assert.deepEqual(exchange.result.clock_after, afterNpc);
});

test('approved conversation profiles are charged once per whole exchange', async () => {
  const phase3 = phase3State();
  const ordinary = await runPhase3({ state: phase3,
    contracts: resolveContracts(phase3), rawText: 'Что ты видел?',
    inputDigest: digest('3'), responseKind: 'speech' });
  const evidenceState = phase3State();
  const evidenceContracts = resolveContracts(evidenceState);
  withAccessibleBlueWool(evidenceState, evidenceContracts);
  const evidence = await runPhase3({ state: evidenceState,
    contracts: evidenceContracts, rawText: 'Посмотри на шерсть.',
    inputDigest: digest('4'), responseKind: 'speech',
    playerPlanOptions: { evidence: true } });
  const phase4 = phase4ArrivalState();
  const negotiation = await runPhase4({ ...phase4,
    rawText: 'Ратша, поговорим.', inputDigest: digest('5'),
    responseKind: 'speech', checkResult: null, checkRequest: null,
    offerStage: null });

  assert.equal(ordinary.result.exact_elapsed_minutes, 5);
  assert.equal(evidence.result.exact_elapsed_minutes, 10);
  assert.equal(negotiation.result.exact_elapsed_minutes, 10);
});

test('Phase 4 persists an offered promise when the target hears nothing', async () => {
  const { state, contracts } = phase4ArrivalState();
  state.promise_instances[0].created_change_set_id = 'change:phase4-arrival';
  const ratsha = npcBySlot(state, 'ratsha_storehouse_helper');
  ratsha.machine_state = { ...ratsha.machine_state, hearing_capability: 'none' };
  const offerStage = promiseOfferStage(state, contracts);
  const exchange = await runPhase4({
    state, contracts, rawText: 'Ратша, сдавайся — я обещаю тебе защиту.',
    inputDigest: digest('2'), responseKind: 'speech',
    checkResult: null, checkRequest: null, offerStage,
    playerPlanOptions: { offer: true }
  });
  assert.equal(exchange.npcCalls, 0);
  const suffix = 'phase4-unheard';
  const factual = phase4Factual(state, contracts, exchange.result, offerStage,
    suffix);
  const next = nextPhase4State({
    state, factual, nextVersion: state.party_state.state_version + 1,
    turnNumber: state.party_state.turn_number + 1,
    inputDigest: digest('2'), changeSetId: `change:${suffix}`, contracts,
    rootTurnId: `turn:${suffix}`, workingRevision: 0
  });
  const writes = { inserts: [], updates: [], appends: [] };
  assert.doesNotThrow(() => appendSemanticNegotiation({
    ...writes, partyId: state.party_id, state, next, factual,
    turnNumber: state.party_state.turn_number + 1,
    changeSetId: `change:${suffix}`, idemId: `idem:${suffix}`, contracts,
    rootTurnId: `turn:${suffix}`, workingRevision: 0
  }));
  assert.equal(writes.appends.some(({ target_table: table }) =>
    table === 'party_npc_decision_traces'), false);
  assert.equal(writes.appends.some(({ target_table: table }) =>
    table === 'party_obligation_transitions'), true);
});

function resolveContracts(state) {
  return resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
}

function project(exchange, state, suffix) {
  return projectSemanticConversationSnapshot({ state,
    semanticExchange: exchange.result, rootTurnId: `turn:causal:${suffix}`,
    workingRevision: 0, appliedChangeSetId: `change:causal:${suffix}` });
}

function writeSemantic(state, input, suffix) {
  const writes = { inserts: [], updates: [], appends: [] };
  appendNpcSemanticConversationWrites({ ...writes, partyId: state.party_id,
    changeSetId: `change:causal:${suffix}`,
    idempotencyRecordId: `idem:causal:${suffix}`,
    rootTurnId: `turn:causal:${suffix}`, workingRevision: 0, ...input });
  return writes;
}

function npcBySlot(state, slot) {
  return state.npcs.find(({ participant_slot_ref: candidate }) =>
    candidate === slot);
}

function plusMinutes(timestamp, numerator) {
  return addElapsedTime(timestamp, {
    exact_minutes: { numerator, denominator: '1' }
  });
}

function boundaryCandidate(state, scheduledAt, interruptEffect = 'background') {
  return {
    boundary_id: 'boundary:conversation-interruption',
    boundary_kind: 'exact_timer', scheduled_at: scheduledAt,
    source_ref: ref(
      'party_route_plan_execution_event',
      'timer:conversation-interruption'
    ),
    primary_subject_ref: ref('actor', state.npcs[0].instance_id),
    subject_refs: [], scope_ref: ref('party', state.party_id),
    rule_ref: { entity_ref: ref('action_contract', 'rule:conversation-interruption'),
      authoring_version: '1' },
    policy_ref: {
      entity_ref: ref('activity_contract', 'policy:conversation-interruption'),
      authoring_version: '1'
    },
    preconditions_digest: digest('a'), resolution_class: 'execution_outcome',
    interrupt_effect: interruptEffect,
    visibility_policy_ref: {
      entity_ref: ref('visibility_modifier', 'visible:conversation-interruption'),
      authoring_version: '1'
    },
    idempotency_key: 'timer:conversation-interruption:2', causal_parent_refs: []
  };
}

function phase4Factual(state, contracts, semanticExchange, offerStage, suffix) {
  const duration = semanticExchange.exact_elapsed_minutes;
  return {
    player_input: {
      request_id: `request:${suffix}`,
      idempotency_key: `idempotency:${suffix}`,
      raw_text: semanticExchange.statements[0].utterance_text
    },
    mode_resolution: {
      turn_id: `turn:${suffix}`,
      option_id: contracts.ids.negotiationOption,
      decision_trace: { action_set_digest: `action-set:${suffix}` }
    },
    time_update: {
      clock_before: structuredClone(state.clock),
      clock_after: structuredClone(semanticExchange.clock_after),
      exact_elapsed: {
        exact_minutes: { numerator: String(duration), denominator: '1' }
      }
    },
    consequence: {
      phase4_kind: 'negotiation',
      negotiation: {
        activity_ref: contracts.negotiation.profile_id,
        offer_committed_before_check: true,
        offer_stage: structuredClone(offerStage),
        check_request: null,
        check_result: null,
        outcome_ref: null,
        semantic_exchange: semanticExchange,
        response_kind: null,
        participating_fisher_id: contracts.actors.participating_fisher.instance_id,
        promise_state: 'offer_only',
        objective_fact_outputs: [],
        player_response_boundary: null,
        activity_roots: [{
          activity_ref: contracts.negotiation.profile_id,
          duration_minutes:
            semanticExchange.exchange.time_budget.total_minutes
        }]
      }
    }
  };
}
