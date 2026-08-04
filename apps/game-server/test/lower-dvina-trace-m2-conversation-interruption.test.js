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
import { appendActivity } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-3-activity-writes.js';
import { nextPhase4State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-state.js';
import { phase2PublicResult } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { promiseOfferStage } from
  '../src/runtime/lower-dvina-trace-phase-4-command-shared.js';
import { assertLowerDvinaTraceSemanticConversationRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { semanticReadPool } from
  './lower-dvina-trace-semantic-persistence-read-pool.js';
import {
  digest,
  phase4ArrivalState,
  phase3State,
  projectPhase3Conversation,
  ref,
  revision14Bundle,
  runPhase3,
  runPhase4,
  withAccessibleBlueWool
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('revision 14 repairs non-domain player and NPC duration classes', async () => {
  const playerState = phase3State();
  const repairedPlayer = await runPhase3({ state: playerState,
    contracts: resolveContracts(playerState), rawText: 'Что ты видел?',
    inputDigest: digest('c'), responseKind: 'speech',
    playerDurationClasses: ['moment', 'domain_owned'] });
  assert.equal(repairedPlayer.playerCalls, 2);
  assert.equal(repairedPlayer.result.exact_elapsed_minutes, 5);

  const npcState = phase3State();
  const repairedNpc = await runPhase3({ state: npcState,
    contracts: resolveContracts(npcState), rawText: 'Что ты видел?',
    inputDigest: digest('d'), responseKind: 'speech',
    npcDurationClasses: ['short', 'domain_owned'] });
  assert.equal(repairedNpc.npcCalls, 2);
  assert.equal(repairedNpc.result.exact_elapsed_minutes, 5);
});

test('background source batch continues into the NPC response boundary', async () => {
  const state = phase3State();
  state.temporal_boundary_candidates = [boundaryCandidate(
    state, plusMinutes(state.clock, '2')
  )];
  const exchange = await runPhase3({ state,
    contracts: resolveContracts(state), rawText: 'Что ты видел?',
    inputDigest: digest('b'), responseKind: 'speech',
    resolveTemporalBoundary(_candidate, { projection }) {
      return { disposition: 'execute', proposals: [],
        state_projection: projection, follow_up_candidates: [] };
    } });

  assert.equal(exchange.npcCalls, 1);
  assert.equal(exchange.result.exchange.applied_contribution_count, 2);
  assert.equal(exchange.result.exchange.session_status, 'active');
  assert.equal(exchange.result.response_kind, 'speech');
});

test('interrupted NPC route disclosure has no mechanical consequence', async () => {
  const state = phase3State();
  const contracts = resolveContracts(state);
  withAccessibleBlueWool(state, contracts);
  state.temporal_boundary_candidates = [boundaryCandidate(
    state, plusMinutes(state.clock, '7'), 'hard_interrupt'
  )];
  const exchange = await runPhase3({ state, contracts,
    rawText: 'Вот синяя шерсть.', inputDigest: digest('e'),
    responseKind: 'route_disclosure', playerPlanOptions: { evidence: true },
    resolveTemporalBoundary: interruptResolution });

  assert.equal(exchange.result.exchange.applied_contribution_count, 1);
  assert.equal(exchange.result.exchange.time_budget.status, 'paused');
  assert.equal(exchange.result.route_disclosure, null);
  assert.equal(exchange.result.response_kind, null);
  assert.equal(exchange.result.statements.length, 1);
  assert.equal(exchange.result.statements[0].speaker_ref.entity_kind,
    'player_character');
  assert.equal(exchange.result.audiences.length, 1);
  assert.equal(exchange.result.audiences[0].statement_ref.entity_id,
    exchange.result.statements[0].statement_id);
  assert.equal(exchange.result.new_signal_records.length > 0, true);
  assert.deepEqual(
    [...exchange.result.consumed_signal_ids].sort(),
    exchange.result.new_signal_records
      .map(({ signal }) => signal.signal_id)
      .sort()
  );
  assert.equal(exchange.result.pending_npc_execution.plan.speech.utterance_text,
    'От лагеря иди к старой сушильне по тропе.');
  assert.equal(exchange.result.pending_npc_execution.remaining_minutes, 3);
  const restarted = projectPhase3Conversation({ state, contracts,
    result: exchange.result, inputDigest: digest('e') });
  assert.equal((restarted.knowledge ?? []).some(({ fact_id: id }) =>
    id === contracts.disclosureMapping.route_knowledge_disclosure.route_ref),
  false);
  assert.doesNotThrow(() => phase2PublicResult({ payload: restarted,
    screen: { schema: 'test-screen' } }));
  assert.equal(restarted.last_turn.consequence.conversation
    .semantic_exchange_projection.npc_ref, null);
  assert.deepEqual(restarted.last_turn.consequence.conversation
    .semantic_exchange_projection.time_budget, {
    total_minutes: 10, elapsed_minutes: 7, remaining_minutes: 3,
    status: 'paused'
  });
  assert.equal(restarted.pending_npc_conversation_execution
    .decision_trace_ref.entity_id,
  exchange.result.decision_request.request_id);
  const pausedActivityWrites = { inserts: [], updates: [], appends: [] };
  appendActivity({ ...pausedActivityWrites, state, next: restarted,
    factual: phase3Factual(state, contracts, exchange.result, 'paused-route'),
    partyId: state.party_id,
    turnNumber: state.party_state.turn_number + 1,
    changeSetId: 'change:paused-route', idemId: 'idem:paused-route',
    inputDigest: digest('e') });
  const pausedExecution = pausedActivityWrites.inserts.find(
    ({ target_table: table }) =>
      table === 'party_timed_activity_executions'
  ).record;
  assert.equal(pausedExecution.execution_context_snapshot
    .pending_npc_execution.decision_trace_ref.entity_id,
  exchange.result.decision_request.request_id);
  assert.equal(pausedExecution.execution_context_snapshot
    .pending_npc_execution.remaining_minutes, 3);
  const semanticProjection = project(exchange, state, 'interrupted-route');
  const writeInput = buildNpcSemanticConversationWriteInput({ state,
    next: semanticProjection, semanticExchange: exchange.result });
  const writes = writeSemantic(state, writeInput, 'interrupted-route');
  assert.equal(writes.appends.some(({ target_table: table }) =>
    table === 'party_actor_npc_interactions'), false);
  assert.equal(writes.appends.some(({ target_table: table, record }) =>
    table === 'party_character_knowledge'
      && record.fact_id
        === contracts.disclosureMapping.route_knowledge_disclosure.route_ref),
  false);
  const decisionTraces = await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(writes), semanticProjection);
  assert.equal(decisionTraces.length, 1);

  restarted.npc_semantic_decision_traces = decisionTraces;
  restarted.temporal_boundary_candidates = [];
  const resumed = await runPhase3({ state: restarted,
    contracts: resolveContracts(restarted), rawText: 'Продолжить.',
    inputDigest: digest('9'), responseKind: 'withhold' });
  assert.equal(resumed.playerCalls, 0);
  assert.equal(resumed.npcCalls, 0);
  assert.equal(resumed.result.exact_elapsed_minutes, 3);
  assert.equal(resumed.result.exchange.applied_contribution_count, 1);
  assert.equal(resumed.result.response_kind, 'route_disclosure');
  assert.equal(resumed.result.pending_npc_execution, null);
  assert.equal(resumed.result.statements.length, 1);
  assert.equal(resumed.result.statements[0].speaker_ref.entity_id,
    exchange.result.decision_request.npc_ref.entity_id);
  const completed = projectPhase3Conversation({ state: restarted,
    contracts: resolveContracts(restarted), result: resumed.result,
    inputDigest: digest('9') });
  assert.equal(completed.pending_npc_conversation_execution, undefined);
  assert.equal(completed.conversation_statements.filter(
    ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc'
  ).length, 1);
  assert.equal(completed.knowledge.filter(({ fact_id: id }) =>
    id === contracts.disclosureMapping.route_knowledge_disclosure.route_ref
  ).length, 1);
  const completedActivityWrites = { inserts: [], updates: [], appends: [] };
  appendActivity({ ...completedActivityWrites, state: restarted,
    next: completed,
    factual: phase3Factual(
      restarted, resolveContracts(restarted), resumed.result, 'resumed-route'
    ),
    partyId: state.party_id,
    turnNumber: state.party_state.turn_number + 2,
    changeSetId: 'change:resumed-route', idemId: 'idem:resumed-route',
    inputDigest: digest('9') });
  assert.equal(completedActivityWrites.inserts.length, 0);
  assert.equal(completedActivityWrites.updates[0].id,
    restarted.pending_npc_conversation_execution.activity_execution_id);
  assert.equal(completedActivityWrites.updates[0].record.status, 'completed');
  assert.equal(completedActivityWrites.updates[0].record
    .cumulative_elapsed_numerator, 10);
  assert.equal(completedActivityWrites.appends[0].record.attempt_ordinal, 1);
  assert.equal(completedActivityWrites.appends[0].record
    .actual_time_numerator, 3);
  const resumedWriteInput = buildNpcSemanticConversationWriteInput({
    state: restarted, next: completed, semanticExchange: resumed.result
  });
  const resumedWrites = writeSemantic(
    restarted, resumedWriteInput, 'resumed-route'
  );
  assert.equal(resumedWrites.appends.filter(({ target_table: table }) =>
    table === 'party_npc_decision_traces').length, 0);
  assert.equal(resumedWrites.appends.filter(({ target_table: table }) =>
    table === 'party_conversation_statements').length, 1);
  assert.equal(resumedWrites.inserts.filter(({ target_table: table }) =>
    table === 'party_character_knowledge').length, 0);
});

test('interrupted player contribution persists paused exact progress only', async () => {
  const state = phase3State();
  const contracts = resolveContracts(state);
  withAccessibleBlueWool(state, contracts);
  const scheduledAt = plusMinutes(state.clock, '2');
  state.temporal_boundary_candidates = [boundaryCandidate(state, scheduledAt)];
  const exchange = await runPhase3({ state, contracts,
    rawText: 'Вот синяя шерсть.', inputDigest: digest('7'),
    responseKind: 'speech', playerPlanOptions: { evidence: true },
    resolveTemporalBoundary: interruptResolution });
  assert.equal(exchange.result.evidence_presentation, null);
  assert.equal(exchange.result.exchange.time_budget.status, 'paused');
  assert.deepEqual(exchange.result.statements, []);
  assert.deepEqual(exchange.result.audiences, []);
  assert.deepEqual(exchange.result.new_signal_records, []);
  assert.deepEqual(exchange.result.consumed_signal_ids, []);
  assert.deepEqual(exchange.result.exchange.time_budget, {
    total_minutes: 10, elapsed_minutes: 2, remaining_minutes: 8,
    status: 'paused'
  });
  const restarted = projectPhase3Conversation({ state, contracts,
    result: exchange.result, inputDigest: digest('7') });
  assert.deepEqual(restarted.conversation_statements ?? [], []);
  assert.deepEqual(restarted.conversation_contributions ?? [], []);
  assert.deepEqual(restarted.conversation_audiences ?? [], []);
  assert.deepEqual(restarted.received_messages ?? [], []);
  assert.equal(phase2PublicResult({ payload: restarted,
    screen: { schema: 'test-screen' } }).conversation, null);

  const inserts = [];
  const appends = [];
  const factual = phase3Factual(state, contracts, exchange.result, 'paused');
  appendActivity({ inserts, appends, state,
    next: { clock: exchange.result.clock_after }, factual,
    partyId: state.party_id,
    turnNumber: state.party_state.turn_number + 1,
    changeSetId: 'change:paused', idemId: 'idem:paused',
    inputDigest: digest('7') });
  const execution = inserts.find(
    ({ target_table: table }) => table === 'party_timed_activity_executions'
  ).record;
  const attempt = appends.find(
    ({ target_table: table }) => table === 'party_timed_activity_attempts'
  ).record;
  assert.equal(execution.status, 'paused');
  assert.equal(execution.original_total_minutes, 10);
  assert.equal(execution.cumulative_elapsed_numerator, 2);
  assert.equal(execution.remaining_time_numerator, 8);
  assert.equal(execution.terminal_change_set_id, null);
  assert.equal(attempt.result_kind, 'paused');
  assert.equal(attempt.planned_time_numerator, 10);
  assert.equal(attempt.actual_time_numerator, 2);
  assert.equal(attempt.remaining_after_numerator, 8);
});

test('interrupted player offer does not change the promise or transcript',
  async () => {
    const { state, contracts } = phase4ArrivalState();
    state.promise_instances[0].created_change_set_id = 'change:phase4-arrival';
    const beforePromise = structuredClone(state.promise_instances[0]);
    const offerStage = promiseOfferStage(state, contracts);
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '2'), 'hard_interrupt'
    )];
    const exchange = await runPhase4({ state, contracts,
      rawText: 'Ратша, я обещаю тебе защиту.', inputDigest: digest('8'),
      responseKind: 'surrender', checkResult: null, checkRequest: null,
      offerStage, playerPlanOptions: { offer: true },
      resolveTemporalBoundary: interruptResolution });

    assert.equal(exchange.npcCalls, 0);
    assert.equal(exchange.result.exchange.applied_contribution_count, 0);
    assert.deepEqual(exchange.result.statements, []);
    assert.deepEqual(exchange.result.audiences, []);
    assert.deepEqual(exchange.result.new_signal_records, []);
    assert.deepEqual(exchange.result.consumed_signal_ids, []);
    const factual = phase4Factual(state, contracts, exchange.result,
      offerStage, 'interrupted-player-offer');
    const restarted = nextPhase4State({ state, factual,
      nextVersion: state.party_state.state_version + 1,
      turnNumber: state.party_state.turn_number + 1,
      inputDigest: digest('8'), changeSetId: 'change:interrupted-player-offer',
      contracts, rootTurnId: 'turn:interrupted-player-offer',
      workingRevision: 0 });
    assert.deepEqual(restarted.promise_instances[0], beforePromise);
    assert.deepEqual(restarted.conversation_statements ?? [], []);
    assert.deepEqual(restarted.conversation_contributions ?? [], []);
    assert.deepEqual(restarted.conversation_audiences ?? [], []);
    assert.deepEqual(restarted.received_messages ?? [], []);
    assert.equal(phase2PublicResult({ payload: restarted,
      screen: { schema: 'test-screen' } }).conversation, null);

    const writes = { inserts: [], updates: [], appends: [] };
    appendSemanticNegotiation({
      ...writes, partyId: state.party_id, state, next: restarted, factual,
      turnNumber: state.party_state.turn_number + 1,
      changeSetId: 'change:interrupted-player-offer',
      idemId: 'idem:interrupted-player-offer', contracts,
      rootTurnId: 'turn:interrupted-player-offer', workingRevision: 0
    });
    assert.equal(writes.inserts.some(({ target_table: table }) =>
      table === 'party_timed_activity_executions'), true);
    assert.equal(writes.appends.some(({ target_table: table }) =>
      table !== 'party_timed_activity_attempts'), false);
  });

test('same-time boundary at contribution end blocks supporting consequences', async () => {
  const state = phase3State();
  const contracts = resolveContracts(state);
  withAccessibleBlueWool(state, contracts);
  state.temporal_boundary_candidates = [boundaryCandidate(
    state, plusMinutes(state.clock, '5')
  )];
  const evidence = await runPhase3({ state, contracts,
    rawText: 'Вот синяя шерсть.', inputDigest: digest('6'),
    responseKind: 'speech', playerPlanOptions: { evidence: true },
    resolveTemporalBoundary: interruptResolution });
  assert.equal(evidence.result.exchange.completed_contribution_count, 1);
  assert.equal(evidence.result.exchange.applied_contribution_count, 0);
  assert.equal(evidence.result.evidence_presentation, null);

  const phase4 = phase4ArrivalState();
  const promise = promiseOfferStage(phase4.state, phase4.contracts);
  phase4.state.temporal_boundary_candidates = [boundaryCandidate(
    phase4.state, plusMinutes(phase4.state.clock, '5')
  )];
  const negotiation = await runPhase4({ ...phase4,
    rawText: 'Сдавайся, и я обещаю защиту.', inputDigest: digest('a'),
    responseKind: 'speech', checkResult: null, checkRequest: null,
    offerStage: promise, playerPlanOptions: { offer: true },
    resolveTemporalBoundary: interruptResolution });
  const factual = phase4Factual(phase4.state, phase4.contracts,
    negotiation.result, promise, 'boundary-promise');
  const next = nextPhase4State({ state: phase4.state, factual,
    nextVersion: phase4.state.party_state.state_version + 1,
    turnNumber: phase4.state.party_state.turn_number + 1,
    inputDigest: digest('a'), changeSetId: 'change:boundary-promise',
    contracts: phase4.contracts, rootTurnId: 'turn:boundary-promise',
    workingRevision: 0 });
  assert.equal(negotiation.result.exchange.applied_contribution_count, 0);
  assert.equal(next.promise_instances[0].current_state, 'not_offered');
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

function interruptResolution(_candidate, { projection }) {
  return { disposition: 'execute', proposals: [],
    state_projection: projection, follow_up_candidates: [],
    stop_after_current_batch: true };
}

function phase4Factual(state, contracts, semanticExchange, offerStage, suffix) {
  const duration = semanticExchange.exact_elapsed_minutes;
  return {
    player_input: {
      request_id: `request:${suffix}`,
      idempotency_key: `idempotency:${suffix}`,
      raw_text: semanticExchange.statements[0]?.utterance_text
        ?? 'interrupted conversation contribution'
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

function phase3Factual(state, contracts, semanticExchange, suffix) {
  return {
    player_input: { request_id: `request:${suffix}` },
    mode_resolution: {
      option_id: contracts.ids.evidenceOption,
      decision_trace: { action_set_digest: `action-set:${suffix}` }
    },
    time_update: {
      clock_before: structuredClone(state.clock),
      clock_after: structuredClone(semanticExchange.clock_after)
    },
    consequence: {
      phase3_kind: 'conversation',
      duration_minutes: semanticExchange.exact_elapsed_minutes,
      conversation: {
        activity_ref: contracts.evidenceTalk.profile_id,
        semantic_exchange: semanticExchange
      }
    }
  };
}
