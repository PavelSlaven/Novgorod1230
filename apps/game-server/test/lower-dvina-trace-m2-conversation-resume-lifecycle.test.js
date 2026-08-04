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
import { assertLowerDvinaTraceSemanticConversationRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { semanticReadPool } from
  './lower-dvina-trace-semantic-persistence-read-pool.js';
import {
  digest,
  phase3State,
  projectPhase3Conversation,
  ref,
  revision14Bundle,
  runPhase3,
  withAccessibleBlueWool
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('NPC response survives two interruptions and resumes one exact plan',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    withAccessibleBlueWool(state, contracts);
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '7'), 'first'
    )];
    const first = await runPhase3({ state, contracts,
      rawText: 'Вот синяя шерсть.', inputDigest: digest('1'),
      responseKind: 'route_disclosure', playerPlanOptions: { evidence: true },
      resolveTemporalBoundary: interruptResolution });
    const firstProjected = projectSemantic(first, state, '111111111111');
    const firstWrites = writeSemantic(state, firstProjected, first.result,
      '111111111111');
    const traces = await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(firstWrites), firstProjected);
    const restarted = projectPhase3Conversation({ state, contracts,
      result: first.result, inputDigest: digest('1') });
    restarted.npc_semantic_decision_traces = traces;
    restarted.temporal_boundary_candidates = [boundaryCandidate(
      restarted, plusMinutes(restarted.clock, '1'), 'second'
    )];

    const second = await runPhase3({ state: restarted,
      contracts: resolveContracts(restarted), rawText: 'Продолжить.',
      inputDigest: digest('2'), responseKind: 'withhold',
      resolveTemporalBoundary: interruptResolution });
    assert.equal(second.playerCalls, 0);
    assert.equal(second.npcCalls, 0);
    assert.equal(second.result.exchange.applied_contribution_count, 0);
    assert.equal(second.result.pending_npc_execution.remaining_minutes, 2);
    const pausedAgain = projectPhase3Conversation({ state: restarted,
      contracts: resolveContracts(restarted), result: second.result,
      inputDigest: digest('2') });
    assert.equal(pausedAgain.pending_npc_conversation_execution
      .decision_trace_ref.entity_id, traces[0].request_id);
    assert.equal(pausedAgain.pending_npc_conversation_execution
      .activity_execution_id,
    restarted.pending_npc_conversation_execution.activity_execution_id);
    assert.equal(pausedAgain.pending_npc_conversation_execution.elapsed_minutes,
      8);
    assert.equal(pausedAgain.pending_npc_conversation_execution
      .next_attempt_ordinal, 2);
    assert.equal(pausedAgain.pending_npc_conversation_execution
      .activity_state_version, 3);

    pausedAgain.npc_semantic_decision_traces = traces;
    pausedAgain.temporal_boundary_candidates = [];
    const third = await runPhase3({ state: pausedAgain,
      contracts: resolveContracts(pausedAgain), rawText: 'Продолжить.',
      inputDigest: digest('3'), responseKind: 'withhold' });
    assert.equal(third.playerCalls, 0);
    assert.equal(third.npcCalls, 0);
    assert.equal(third.result.exact_elapsed_minutes, 2);
    assert.equal(third.result.response_kind, 'route_disclosure');
    assert.equal(third.result.statements.length, 1);
    const completed = projectPhase3Conversation({ state: pausedAgain,
      contracts: resolveContracts(pausedAgain), result: third.result,
      inputDigest: digest('3') });
    assert.equal(completed.pending_npc_conversation_execution, undefined);
    assert.equal(completed.conversation_statements.filter(
      ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc').length, 1);
    assert.equal(completed.knowledge.filter(({ fact_id: factId }) =>
      factId === contracts.disclosureMapping.route_knowledge_disclosure
        .route_ref).length, 1);
  });

test('remaining addressed NPC responds after interrupted first responder reload',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const bystander = npcBySlot(state, 'background_fisher_2');
    const eremeyRef = ref('npc', eremey.instance_id);
    const responderRef = ref('npc', responder.instance_id);
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '3'), 'queue'
    )];
    const first = await runPhase3({ state, contracts,
      rawText: 'Еремей и рыбак, что вы видели?', inputDigest: digest('4'),
      responseKind: 'speech', resolveTemporalBoundary: interruptResolution,
      playerPlanOptions: { primaryAddresseeRef: eremeyRef,
        intendedAddresseeRefs: [eremeyRef, responderRef] } });
    assert.equal(first.npcCalls, 1);
    assert.deepEqual(first.result.pending_npc_execution
      .remaining_responder_refs, [responderRef]);
    const firstProjected = projectSemantic(first, state, '444444444444');
    const firstWrites = writeSemantic(state, firstProjected, first.result,
      '444444444444');
    const firstTraces = await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(firstWrites), firstProjected);
    const restarted = projectPhase3Conversation({ state, contracts,
      result: first.result, inputDigest: digest('4') });
    restarted.npc_semantic_decision_traces = firstTraces;
    restarted.temporal_boundary_candidates = [];

    const resumed = await runPhase3({ state: restarted,
      contracts: resolveContracts(restarted), rawText: 'Продолжить.',
      inputDigest: digest('5'), responseKind: 'speech' });
    assert.equal(resumed.playerCalls, 0);
    assert.equal(resumed.npcCalls, 1);
    assert.deepEqual(resumed.npcRequests.map(({ npc_ref: npc }) => npc),
      [responderRef]);
    assert.equal(resumed.npcRequests.some(({ npc_ref: npc }) =>
      npc.entity_id === bystander.instance_id), false);
    assert.equal(resumed.result.exact_elapsed_minutes, 2);
    assert.equal(resumed.result.pending_npc_execution, null);
    assert.equal(resumed.result.statements.filter(
      ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc').length, 2);
    const completed = projectPhase3Conversation({ state: restarted,
      contracts: resolveContracts(restarted), result: resumed.result,
      inputDigest: digest('5') });
    const resumedWrites = writeSemantic(restarted, completed, resumed.result,
      '555555555555');
    assert.equal(resumedWrites.appends.filter(({ target_table: table }) =>
      table === 'party_npc_decision_traces').length, 1);
    assert.equal(resumedWrites.appends.filter(({ target_table: table }) =>
      table === 'party_conversation_statements').length, 2);
    const currentStatementIds = new Set(resumed.result.statements.map(
      ({ statement_id: statementId }) => statementId));
    assert.equal(resumedWrites.inserts.filter(({ target_table: table }) =>
      table === 'party_temporal_events').every(({ record }) =>
      currentStatementIds.has(record.rule_ref.entity_id)), true);
    const combinedWrites = combineWrites(firstWrites, resumedWrites);
    assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(combinedWrites), completed)).length, 2);
  });

test('persisted NPC reply creates one perceived follow-up after restart',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    withAccessibleBlueWool(state, contracts);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const bystander = npcBySlot(state, 'background_fisher_2');
    const responderRef = ref('npc', responder.instance_id);
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '6'), 'npc-follow-up'
    )];
    const first = await runPhase3({ state, contracts,
      rawText: 'Вот синяя шерсть.', inputDigest: digest('8'),
      responseKind: 'route_disclosure', playerPlanOptions: { evidence: true },
      resolveTemporalBoundary: interruptResolution,
      transformNpcPlan: (plan, { call_index: callIndex }) => {
        if (callIndex !== 1) return plan;
        plan.primary_addressee_ref = responderRef;
        plan.intended_addressee_refs = [responderRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [responderRef]
        };
        return plan;
      } });
    assert.equal(first.npcCalls, 1);
    assert.deepEqual(first.result.pending_npc_execution
      .remaining_responder_refs, []);
    const firstProjected = projectSemantic(first, state, '888888888888');
    const firstWrites = writeSemantic(state, firstProjected, first.result,
      '888888888888');
    const firstTraces = await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(firstWrites), firstProjected);
    const restarted = projectPhase3Conversation({ state, contracts,
      result: first.result, inputDigest: digest('8') });
    restarted.npc_semantic_decision_traces = firstTraces;
    restarted.temporal_boundary_candidates = [];

    const resumed = await runPhase3({ state: restarted,
      contracts: resolveContracts(restarted), rawText: 'Продолжить.',
      inputDigest: digest('9'), responseKind: 'speech' });
    assert.equal(resumed.playerCalls, 0);
    assert.equal(resumed.npcCalls, 1);
    assert.deepEqual(resumed.npcRequests.map(({ npc_ref: npcRef }) => npcRef),
      [responderRef]);
    assert.equal(resumed.npcRequests.some(({ npc_ref: npcRef }) =>
      npcRef.entity_id === bystander.instance_id), false);
    const eremeyStatement = resumed.result.statements.find(
      ({ speaker_ref: speakerRef }) => speakerRef.entity_id === eremey.instance_id
    );
    assert.equal(resumed.npcRequests[0].public_conversation_history.some(
      ({ source_statement_ref: statementRef }) =>
        statementRef?.entity_id === eremeyStatement.statement_id), true);
    assert.equal(resumed.result.exact_elapsed_minutes, 4);
    assert.equal(resumed.result.pending_npc_execution, null);
    const completed = projectPhase3Conversation({ state: restarted,
      contracts: resolveContracts(restarted), result: resumed.result,
      inputDigest: digest('9') });
    const resumedWrites = writeSemantic(restarted, completed, resumed.result,
      '999999999999');
    assert.equal(resumedWrites.appends.filter(({ target_table: table }) =>
      table === 'party_npc_decision_traces').length, 1);
    assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(combineWrites(firstWrites, resumedWrites)), completed)
    ).length, 2);
  });

test('exchange limit preserves a persisted NPC follow-up for the next exchange',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const pendingResponder = npcBySlot(state, 'background_fisher_2');
    const responderRef = ref('npc', responder.instance_id);
    const pendingResponderRef = ref('npc', pendingResponder.instance_id);
    const first = await runPhase3({ state, contracts,
      rawText: 'Еремей, спроси рыбака.', inputDigest: digest('a'),
      responseKind: 'speech',
      transformNpcPlan: (plan, { call_index: callIndex }) => {
        const targetRef = callIndex === 1
          ? responderRef : pendingResponderRef;
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [targetRef]
        };
        return plan;
      } });
    assert.equal(first.npcCalls, 2);
    assert.equal(first.result.exchange.stop_reason, 'exchange_limit');
    const pendingSignal = first.result.new_signal_records.find(({ signal }) =>
      signal.subject_ref.entity_id === pendingResponder.instance_id).signal;
    assert.equal(first.result.consumed_signal_ids.includes(
      pendingSignal.signal_id), false);
    const firstProjected = projectSemantic(first, state, 'aaaaaaaaaaaa');
    const firstWrites = writeSemantic(state, firstProjected, first.result,
      'aaaaaaaaaaaa');
    const firstTraces = await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(firstWrites), firstProjected);
    const restarted = projectPhase3Conversation({ state,
      contracts, result: first.result,
      inputDigest: digest('a') });
    restarted.clock = structuredClone(
      first.result.exchange.working_state.clock
    );
    restarted.npc_semantic_decision_traces = firstTraces;

    const second = await runPhase3({ state: restarted,
      contracts: resolveContracts(restarted), rawText: 'А что дальше?',
      inputDigest: digest('b'), responseKind: 'speech' });
    assert.equal(second.npcCalls, 2);
    assert.deepEqual(second.npcRequests.map(({ npc_ref: npc }) => npc), [
      ref('npc', eremey.instance_id), pendingResponderRef
    ]);
    assert.equal(second.result.consumed_signal_ids.includes(
      pendingSignal.signal_id), true);
  });

test('resumed recurrent NPC chain stops at the exchange contribution limit',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremey = npcBySlot(state, 'eremey_fisher');
    const responder = npcBySlot(state, 'background_fisher_1');
    const eremeyRef = ref('npc', eremey.instance_id);
    const responderRef = ref('npc', responder.instance_id);
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '3'), 'recurrent-cap'
    )];
    const first = await runPhase3({
      state,
      contracts,
      rawText: 'Еремей и рыбак, отвечайте друг другу.',
      inputDigest: digest('c'),
      responseKind: 'speech',
      resolveTemporalBoundary: interruptResolution,
      playerPlanOptions: {
        primaryAddresseeRef: eremeyRef,
        intendedAddresseeRefs: [eremeyRef, responderRef]
      },
      transformNpcPlan(plan) {
        plan.primary_addressee_ref = responderRef;
        plan.intended_addressee_refs = [responderRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [responderRef]
        };
        return plan;
      }
    });
    assert.equal(first.npcCalls, 1);
    const firstProjected = projectSemantic(first, state, 'recurrent-cap');
    const firstWrites = writeSemantic(
      state, firstProjected, first.result, 'recurrent-cap'
    );
    const restarted = projectPhase3Conversation({
      state,
      contracts,
      result: first.result,
      inputDigest: digest('c')
    });
    restarted.npc_semantic_decision_traces =
      await assertLowerDvinaTraceSemanticConversationRows(
        semanticReadPool(firstWrites), firstProjected
      );
    // The persisted plan resumes at slot seven, leaving one responder slot.
    restarted.pending_npc_conversation_execution.contribution_index = 7;
    restarted.temporal_boundary_candidates = [];

    const resumed = await runPhase3({
      state: restarted,
      contracts: resolveContracts(restarted),
      rawText: 'Продолжить.',
      inputDigest: digest('d'),
      responseKind: 'speech',
      transformNpcPlan(plan, { request }) {
        const targetRef = request.npc_ref.entity_id === eremey.instance_id
          ? responderRef : eremeyRef;
        plan.primary_addressee_ref = targetRef;
        plan.intended_addressee_refs = [targetRef];
        plan.speech.response_expectation = {
          kind: 'answer', target_refs: [targetRef]
        };
        return plan;
      }
    });

    assert.deepEqual({
      playerCalls: resumed.playerCalls,
      npcCalls: resumed.npcCalls,
      decisions: resumed.result.exchange.npc_decisions.length,
      stopReason: resumed.result.exchange.stop_reason,
      applied: resumed.result.exchange.applied_contribution_count,
      elapsed: resumed.result.exact_elapsed_minutes
    }, {
      playerCalls: 0,
      npcCalls: 1,
      decisions: 1,
      stopReason: 'exchange_limit',
      applied: 2,
      elapsed: 1
    });
  });

test('terminal resumed responder does not invoke the remaining NPC queue',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const eremeyRef = ref('npc', npcBySlot(state, 'eremey_fisher').instance_id);
    const responderRef = ref('npc',
      npcBySlot(state, 'background_fisher_1').instance_id);
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '3'), 'terminal-queue'
    )];
    const first = await runPhase3({ state, contracts,
      rawText: 'Еремей и рыбак, разговор окончен.', inputDigest: digest('6'),
      responseKind: 'leave_conversation',
      resolveTemporalBoundary: interruptResolution,
      playerPlanOptions: { primaryAddresseeRef: eremeyRef,
        intendedAddresseeRefs: [eremeyRef, responderRef] } });
    const firstProjected = projectSemantic(first, state, '666666666666');
    const firstWrites = writeSemantic(state, firstProjected, first.result,
      '666666666666');
    const restarted = projectPhase3Conversation({ state, contracts,
      result: first.result, inputDigest: digest('6') });
    restarted.npc_semantic_decision_traces =
      await assertLowerDvinaTraceSemanticConversationRows(
        semanticReadPool(firstWrites), firstProjected);
    restarted.temporal_boundary_candidates = [];

    const resumed = await runPhase3({ state: restarted,
      contracts: resolveContracts(restarted), rawText: 'Продолжить.',
      inputDigest: digest('7'), responseKind: 'speech' });
    assert.equal(resumed.playerCalls, 0);
    assert.equal(resumed.npcCalls, 0);
    assert.equal(resumed.result.exchange.npc_decisions.length, 0);
    assert.equal(resumed.result.exchange.session_status, 'ended');
    assert.equal(resumed.result.response_kind, 'leave_conversation');
    assert.equal(resumed.result.exact_elapsed_minutes, 1);
  });

function resolveContracts(state) {
  return resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
}

function projectSemantic(exchange, state, suffix) {
  return projectSemanticConversationSnapshot({ state,
    semanticExchange: exchange.result, rootTurnId: `turn:${suffix}`,
    workingRevision: 0, appliedChangeSetId: `change:${suffix}` });
}

function writeSemantic(state, next, semanticExchange, suffix) {
  const input = buildNpcSemanticConversationWriteInput({ state, next,
    semanticExchange });
  const writes = { inserts: [], updates: [], appends: [] };
  appendNpcSemanticConversationWrites({ ...writes, partyId: state.party_id,
    changeSetId: `change:${suffix}`, idempotencyRecordId: `idem:${suffix}`,
    rootTurnId: `turn:${suffix}`, workingRevision: 0, ...input });
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

function boundaryCandidate(state, scheduledAt, suffix) {
  return {
    boundary_id: `boundary:conversation-interruption:${suffix}`,
    boundary_kind: 'exact_timer', scheduled_at: scheduledAt,
    source_ref: ref('party_route_plan_execution_event',
      `timer:conversation-interruption:${suffix}`),
    primary_subject_ref: ref('actor', state.npcs[0].instance_id),
    subject_refs: [], scope_ref: ref('party', state.party_id),
    rule_ref: { entity_ref: ref('action_contract',
      'rule:conversation-interruption'), authoring_version: '1' },
    policy_ref: { entity_ref: ref('activity_contract',
      'policy:conversation-interruption'), authoring_version: '1' },
    preconditions_digest: digest('a'), resolution_class: 'execution_outcome',
    interrupt_effect: 'hard_interrupt',
    visibility_policy_ref: { entity_ref: ref('visibility_modifier',
      'visible:conversation-interruption'), authoring_version: '1' },
    idempotency_key: `timer:conversation-interruption:${suffix}`,
    causal_parent_refs: []
  };
}

function interruptResolution(_candidate, { projection }) {
  return { disposition: 'execute', proposals: [], state_projection: projection,
    follow_up_candidates: [], stop_after_current_batch: true };
}

function combineWrites(...values) {
  const inserts = values.flatMap(({ inserts: entries }) => entries);
  const updates = values.flatMap(({ updates: entries }) => entries);
  const sessions = [...inserts, ...updates].filter(({ target_table: table }) =>
    table === 'party_conversation_sessions');
  return {
    inserts: inserts.filter(({ target_table: table }) =>
      table !== 'party_conversation_sessions'),
    updates: [
      ...updates.filter(({ target_table: table }) =>
        table !== 'party_conversation_sessions'),
      sessions.at(-1)
    ],
    appends: values.flatMap(({ appends }) => appends)
  };
}
