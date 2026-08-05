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
  runPhase3
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('remaining responder continues when persisted responder becomes unavailable',
  async () => {
    const state = phase3State();
    const contracts = resolveContracts(state);
    const firstResponder = npcBySlot(state, 'eremey_fisher');
    const remainingResponder = npcBySlot(state, 'background_fisher_1');
    const firstResponderRef = ref('npc', firstResponder.instance_id);
    const remainingResponderRef = ref('npc', remainingResponder.instance_id);
    state.temporal_boundary_candidates = [boundaryCandidate(
      state, plusMinutes(state.clock, '3')
    )];

    const interrupted = await runPhase3({ state, contracts,
      rawText: 'Еремей и рыбак, что вы видели?', inputDigest: digest('a'),
      responseKind: 'speech', resolveTemporalBoundary: interruptResolution,
      playerPlanOptions: { primaryAddresseeRef: firstResponderRef,
        intendedAddresseeRefs: [firstResponderRef, remainingResponderRef] } });
    assert.equal(interrupted.npcCalls, 1);
    assert.deepEqual(interrupted.result.pending_npc_execution
      .remaining_responder_refs, [remainingResponderRef]);

    const interruptedProjection = projectSemantic(
      interrupted, state, 'aaaaaaaaaaaa'
    );
    const interruptedWrites = writeSemantic(
      state, interruptedProjection, interrupted.result, 'aaaaaaaaaaaa'
    );
    const persistedTraces = await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(interruptedWrites), interruptedProjection
    );
    const restarted = projectPhase3Conversation({ state, contracts,
      result: interrupted.result, inputDigest: digest('a') });
    restarted.npc_semantic_decision_traces = persistedTraces;
    restarted.temporal_boundary_candidates = [];
    const unavailable = npcBySlot(restarted, 'eremey_fisher');
    unavailable.machine_state = {
      ...unavailable.machine_state,
      status: 'incapacitated',
      speech_capability: 'none'
    };

    const resumed = await runPhase3({ state: restarted,
      contracts: resolveContracts(restarted), rawText: 'Продолжить.',
      inputDigest: digest('b'), responseKind: 'speech' });

    assert.equal(resumed.playerCalls, 0);
    assert.equal(resumed.npcCalls, 1);
    assert.deepEqual(resumed.npcRequests.map(({ npc_ref: npcRef }) => npcRef),
      [remainingResponderRef]);
    assert.equal(resumed.result.exact_elapsed_minutes, 1);
    assert.equal(resumed.result.pending_npc_execution, null);
    assert.equal(resumed.result.exchange.session_status, 'active');
    assert.equal(resumed.result.statements.filter(
      ({ speaker_ref: speakerRef }) => speakerRef.entity_kind === 'npc'
    ).length, 1);

    const completed = projectPhase3Conversation({ state: restarted,
      contracts: resolveContracts(restarted), result: resumed.result,
      inputDigest: digest('b') });
    const session = completed.conversation_sessions.at(-1);
    assert.equal(session.active_participant_refs.some(
      ({ entity_id: entityId }) => entityId === firstResponder.instance_id
    ), false);
    assert.equal(session.active_participant_refs.some(
      ({ entity_id: entityId }) => entityId === remainingResponder.instance_id
    ), true);
    const resumedWrites = writeSemantic(
      restarted, completed, resumed.result, 'bbbbbbbbbbbb'
    );
    assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(combineWrites(interruptedWrites, resumedWrites)),
      completed
    )).length, 2);
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

function boundaryCandidate(state, scheduledAt) {
  return {
    boundary_id: 'boundary:conversation-interruption:pending-unavailable',
    boundary_kind: 'exact_timer', scheduled_at: scheduledAt,
    source_ref: ref('party_route_plan_execution_event',
      'timer:conversation-interruption:pending-unavailable'),
    primary_subject_ref: ref('actor', state.npcs[0].instance_id),
    subject_refs: [], scope_ref: ref('party', state.party_id),
    rule_ref: { entity_ref: ref('action_contract',
      'rule:conversation-interruption'), authoring_version: '1' },
    policy_ref: { entity_ref: ref('activity_contract',
      'policy:conversation-interruption'), authoring_version: '1' },
    preconditions_digest: digest('c'), resolution_class: 'execution_outcome',
    interrupt_effect: 'hard_interrupt',
    visibility_policy_ref: { entity_ref: ref('visibility_modifier',
      'visible:conversation-interruption'), authoring_version: '1' },
    idempotency_key: 'timer:conversation-interruption:pending-unavailable',
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
