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

test('queued responder who moved away is skipped after reload', async () => {
  const fixture = await interruptedQueuedResponder('a');
  const responder = npcById(fixture.restarted, fixture.responderRef.entity_id);
  responder.anchor_id = 'g5_anchor:moved-away';

  const resumed = await resumeQueuedResponder(fixture, 'b');

  await assertSkippedQueuedResponder(resumed, fixture);
});

test('queued incapacitated responder is skipped after reload', async () => {
  const fixture = await interruptedQueuedResponder('c');
  const responder = npcById(fixture.restarted, fixture.responderRef.entity_id);
  responder.machine_state = { ...responder.machine_state,
    status: 'incapacitated', speech_capability: 'none' };

  const resumed = await resumeQueuedResponder(fixture, 'd');

  await assertSkippedQueuedResponder(resumed, fixture);
});

test('unavailable queued responder is skipped before the next responder',
  async () => {
    const fixture = await interruptedQueuedResponder('f', true);
    npcById(fixture.restarted, fixture.responderRef.entity_id).anchor_id =
      'g5_anchor:moved-away';

    const resumed = await resumeQueuedResponder(fixture, '0');

    assert.equal(resumed.playerCalls, 0);
    assert.equal(resumed.npcCalls, 1);
    assert.deepEqual(resumed.npcRequests.map(({ npc_ref: npc }) => npc),
      [fixture.additionalResponderRef]);
    assert.equal(resumed.result.consumed_signal_ids.includes(
      fixture.responderSignalId), true);
    assert.equal(resumed.result.pending_npc_execution, null);
    assert.equal(resumed.result.statements.filter(
      ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc').length, 2);
    const projected = projectPhase3Conversation({ state: fixture.restarted,
      contracts: resolveContracts(fixture.restarted), result: resumed.result,
      inputDigest: digest('0') });
    await assertTerminalResumeReadback(
      projected, resumed.result, fixture, 1
    );
  });

test('terminal outcome cannot consume a decision boundary signal', async () => {
  const fixture = await interruptedQueuedResponder('1');
  const semanticExchange = structuredClone(fixture.firstResult);
  const decision = semanticExchange.exchange.npc_decisions[0];
  semanticExchange.terminal_npc_outcomes = [{
    npc_ref: structuredClone(decision.boundary.npc_ref),
    same_time_batch_ref: structuredClone(
      decision.boundary.same_time_batch_ref
    ),
    outcome: 'npc_unavailable',
    signal_ids_to_consume: [decision.boundary.signal_refs[0].entity_id]
  }];

  assert.throws(() => projectSemanticConversationSnapshot({
    state: fixture.restarted,
    semanticExchange,
    rootTurnId: 'turn:duplicate-terminal-signal',
    workingRevision: 0,
    appliedChangeSetId: 'change:duplicate-terminal-signal'
  }), { code: 'TRACE_M2_SEMANTIC_SIGNAL_LINEAGE_INVALID' });
});

async function interruptedQueuedResponder(inputCharacter,
  includeAdditionalResponder = false) {
  const state = phase3State();
  const contracts = resolveContracts(state);
  const inputDigest = digest(inputCharacter);
  const eremeyRef = ref('npc', npcBySlot(state, 'eremey_fisher').instance_id);
  const addressedResponderRefs = ['background_fisher_1',
    ...(includeAdditionalResponder ? ['background_fisher_2'] : [])].map(
    (slot) => ref('npc', npcBySlot(state, slot).instance_id)
  );
  state.temporal_boundary_candidates = [boundaryCandidate(
    state, plusMinutes(state.clock, '3'), `queued-${inputCharacter}`
  )];
  const first = await runPhase3({ state, contracts,
    rawText: 'Еремей и рыбак, что вы видели?',
    inputDigest, responseKind: 'speech',
    resolveTemporalBoundary: interruptResolution,
    playerPlanOptions: { primaryAddresseeRef: eremeyRef,
      intendedAddresseeRefs: [eremeyRef, ...addressedResponderRefs] } });
  const [responderRef, additionalResponderRef = null] =
    first.result.pending_npc_execution.remaining_responder_refs;
  const suffix = inputDigest.slice(0, 12);
  const next = projectSemanticConversationSnapshot({ state,
    semanticExchange: first.result, rootTurnId: `turn:${suffix}`,
    workingRevision: 0, appliedChangeSetId: `change:${suffix}` });
  const input = buildNpcSemanticConversationWriteInput({ state, next,
    semanticExchange: first.result });
  const writes = { inserts: [], updates: [], appends: [] };
  appendNpcSemanticConversationWrites({ ...writes, partyId: state.party_id,
    changeSetId: `change:${suffix}`, idempotencyRecordId: `idem:${suffix}`,
    rootTurnId: `turn:${suffix}`, workingRevision: 0, ...input });
  const restarted = projectPhase3Conversation({ state, contracts,
    result: first.result, inputDigest });
  restarted.npc_semantic_decision_traces =
    await assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(writes), next
    );
  restarted.temporal_boundary_candidates = [];
  const responderSignalId = restarted.npc_decision_signals.find(
    ({ signal }) => signal.subject_ref.entity_id === responderRef.entity_id
      && !restarted.consumed_npc_decision_signal_ids.includes(signal.signal_id)
  ).signal.signal_id;
  return { restarted, responderRef, additionalResponderRef,
    responderSignalId, firstResult: first.result,
    firstWrites: structuredClone(writes) };
}

function resumeQueuedResponder(fixture, inputCharacter) {
  return runPhase3({ state: fixture.restarted,
    contracts: resolveContracts(fixture.restarted), rawText: 'Продолжить.',
    inputDigest: digest(inputCharacter), responseKind: 'speech' });
}

async function assertSkippedQueuedResponder(resumed, fixture) {
  assert.equal(resumed.playerCalls, 0);
  assert.equal(resumed.npcCalls, 0);
  assert.equal(resumed.result.exact_elapsed_minutes, 1);
  assert.equal(resumed.result.pending_npc_execution, null);
  assert.equal(resumed.result.exchange.stop_reason, 'player_response');
  assert.equal(resumed.result.statements.filter(
    ({ speaker_ref: speaker }) => speaker.entity_kind === 'npc').length, 1);
  assert.equal(resumed.npcRequests.some(({ npc_ref: npc }) =>
    npc.entity_id === fixture.responderRef.entity_id), false);
  assert.equal(resumed.result.consumed_signal_ids.includes(
    fixture.responderSignalId), true);
  const projected = projectPhase3Conversation({ state: fixture.restarted,
    contracts: resolveContracts(fixture.restarted), result: resumed.result,
    inputDigest: digest('e') });
  assert.equal(projected.consumed_npc_decision_signal_ids.includes(
    fixture.responderSignalId), true);
  assert.equal(projected.pending_npc_conversation_execution, undefined);
  assert.deepEqual(projected.npc_decision_terminal_outcomes,
    resumed.result.terminal_npc_outcomes);
  assert.equal(projected.conversation_sessions.at(-1)
    .active_participant_refs.some(({ entity_id: entityId }) =>
      entityId === fixture.responderRef.entity_id), false);
  await assertTerminalResumeReadback(projected, resumed.result, fixture);
}

async function assertTerminalResumeReadback(projected, result, fixture,
  expectedDecisionWrites = 0) {
  const suffix = result.exchange.exchange_id;
  const priorRequestIds = new Set(
    fixture.restarted.npc_semantic_decision_refs.map(
      ({ request_id: requestId }) => requestId
    )
  );
  const currentTraceRef = projected.npc_semantic_decision_refs.find(
    ({ request_id: requestId }) => !priorRequestIds.has(requestId)
  ) ?? null;
  const input = buildNpcSemanticConversationWriteInput({
    state: fixture.restarted, next: projected, semanticExchange: result
  });
  const resumedWrites = { inserts: [], updates: [], appends: [] };
  appendNpcSemanticConversationWrites({ ...resumedWrites,
    partyId: fixture.restarted.party_id,
    changeSetId: currentTraceRef?.applied_change_set_id ?? `change:${suffix}`,
    idempotencyRecordId: `idem:${suffix}`,
    rootTurnId: currentTraceRef?.root_turn_id ?? `turn:${suffix}`,
    workingRevision: 0, ...input });
  assert.equal(resumedWrites.appends.filter(({ target_table: table }) =>
    table === 'party_npc_decision_traces').length, expectedDecisionWrites);
  await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(combineWrites(fixture.firstWrites, resumedWrites)),
    projected
  );
}

function resolveContracts(state) {
  return resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
}

function npcBySlot(state, slot) {
  return state.npcs.find(({ participant_slot_ref: candidate }) =>
    candidate === slot);
}

function npcById(state, actorId) {
  return state.npcs.find(({ instance_id: instanceId }) =>
    instanceId === actorId);
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
