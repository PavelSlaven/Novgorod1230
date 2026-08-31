import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveTracePhase3Contracts
} from '../src/runtime/lower-dvina-trace-phase-3-contracts.js';
import {
  projectSemanticConversationSnapshot
} from '../src/infrastructure/postgres/lower-dvina-trace-conversation-state.js';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import { assertLowerDvinaTraceSemanticConversationRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import { semanticReadPool } from
  './lower-dvina-trace-semantic-persistence-read-pool.js';
import {
  checkResult,
  digest,
  phase3State,
  projectPhase3Conversation,
  revision14Bundle,
  runPhase3,
  withAccessibleBlueWool
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('a social check does not present evidence without the supporting operation', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, ты обязан сказать правду.',
    inputDigest: digest('3'),
    responseKind: 'speech',
    checkResult: checkResult(contracts.check.check_id, 'success')
  });

  assert.deepEqual(exchange.result.decision_boundary.categories, [
    'communication'
  ]);
  assert.equal(
    JSON.stringify(exchange.npcRequest).includes('presented_evidence_ref'),
    false
  );
  assert.equal(exchange.result.new_signal_records.some(
    ({ signal }) => signal.source_event_ref.entity_kind
      === 'evidence_presentation'
  ), false);
  assert.equal(exchange.result.evidence_presentation, null);
});

test('evidence presentation requires and executes its supporting operation', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  withAccessibleBlueWool(state, contracts);
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Вот синяя шерсть с берега. Что ты знаешь?',
    inputDigest: digest('4'),
    responseKind: 'route_disclosure',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    playerPlanOptions: { evidence: true }
  });

  assert.deepEqual(exchange.result.decision_boundary.categories, [
    'environment',
    'communication'
  ]);
  assert.equal(Object.hasOwn(
    exchange.npcRequest.social_context, 'presented_evidence_ref'
  ), true);
  assert.equal(exchange.result.new_signal_records.some(
    ({ signal }) => signal.source_event_ref.entity_kind
      === 'evidence_presentation'
  ), true);
  assert.equal(
    exchange.result.evidence_presentation.interaction_kind,
    'present_item_as_evidence'
  );
  const tampered = structuredClone(exchange.result);
  tampered.evidence_presentation.entity_ref.entity_id = 'item:not-held';
  assert.throws(() => projectPhase3Conversation({
    state,
    contracts,
    result: tampered,
    inputDigest: digest('4')
  }), { code: 'TRACE_M2_PHASE_3_EVIDENCE_EVENT_INVALID' });
});

test('recognized successful evidence requires Eremey to disclose exact route', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  withAccessibleBlueWool(state, contracts);
  const successfulCheck = {
    ...checkResult(contracts.check.check_id, 'success'),
    outcome: { band: 'success', success: true }
  };
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Вот синяя шерсть с берега. Покажи дорогу к старой сушильне.',
    inputDigest: digest('b'),
    responseKind: 'route_disclosure',
    checkResult: successfulCheck,
    playerPlanOptions: { evidence: true },
    transformNpcPlan: (plan, { call_index: callIndex }) => callIndex === 1
      ? { ...plan, supporting_operations: [] }
      : plan
  });

  const requiredOperation = {
    op: 'disclose_known_route',
    route_ref: 'trace_ld_v1_route_camp_to_shed',
    source_knowledge_scope_ref: contracts.eremeyKnowledge.knowledge_scope_ref
  };
  assert.deepEqual(
    exchange.npcRequests[0].decision_scope.required_supporting_operation,
    requiredOperation
  );
  assert.equal(exchange.npcCalls, 2);
  assert.equal(exchange.result.response_kind, 'route_disclosure');
  assert.equal(exchange.result.route_disclosure.route_ref, requiredOperation.route_ref);
});

test('hearing evidence words without seeing the item creates only communication signal', async () => {
  const state = phase3State();
  const eremey = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
  );
  eremey.machine_state = {
    ...eremey.machine_state,
    visual_capability: 'none'
  };
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  withAccessibleBlueWool(state, contracts);

  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Вот синяя шерсть с берега. Что ты знаешь?',
    inputDigest: digest('e'),
    responseKind: 'withhold',
    checkResult: {
      ...checkResult(contracts.check.check_id, 'success'),
      outcome: { band: 'success', success: true }
    },
    playerPlanOptions: { evidence: true }
  });

  assert.deepEqual(
    exchange.result.new_signal_records.map(({ signal }) => signal.category),
    ['communication']
  );
  assert.equal(
    Object.hasOwn(
      exchange.npcRequest.social_context,
      'presented_evidence_ref'
    ),
    false
  );
  assert.equal(
    Object.hasOwn(
      exchange.npcRequest.decision_scope,
      'required_supporting_operation'
    ),
    false
  );
  const restarted = projectPhase3Conversation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('e')
  });
  assert.equal(
    restarted.supporting_operation_perceptions.at(-1).result_kind,
    'not_perceived'
  );
  const writes = conversationWrites(
    state, restarted, exchange.result, 'evidence-not-seen'
  );
  const perceptionId =
    restarted.supporting_operation_perceptions.at(-1).perception_id;
  assert.equal(writes.appends.some(({ target_table: table, record }) =>
    table === 'party_perception_witnesses'
      && record.perception_id === perceptionId), false);
  assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(writes), restarted)).length, 1);
});

test('seeing evidence without hearing the words creates and consumes an environment decision', async () => {
  const state = phase3State();
  const eremey = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'eremey_fisher'
  );
  eremey.machine_state = {
    ...eremey.machine_state,
    hearing_capability: 'none',
    visual_capability: 'full'
  };
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  withAccessibleBlueWool(state, contracts);

  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Вот синяя шерсть с берега. Что ты знаешь?',
    inputDigest: digest('d'),
    responseKind: 'withhold',
    checkResult: checkResult(contracts.check.check_id, 'success'),
    playerPlanOptions: { evidence: true }
  });

  assert.equal(exchange.npcCalls, 1);
  assert.deepEqual(exchange.result.decision_boundary.categories, ['environment']);
  assert.equal(exchange.npcRequest.perceived_message, null);
  assert.equal(exchange.npcRequest.public_conversation_history.length, 0);
  assert.doesNotMatch(JSON.stringify(exchange.npcRequest), /Вот синяя шерсть/);
  assert.equal(
    Object.hasOwn(
      exchange.npcRequest.social_context,
      'presented_evidence_ref'
    ),
    true
  );
  assert.deepEqual(
    exchange.result.new_signal_records.map(({ signal }) => signal.category),
    ['environment']
  );
  const environmentSignal = exchange.result.new_signal_records[0].signal;
  assert.deepEqual(exchange.result.consumed_signal_ids,
    [environmentSignal.signal_id]);
  assert.equal(environmentSignal.source_event_ref.entity_kind,
    'evidence_presentation');
  assert.equal(environmentSignal.source_perception_ref.entity_id
    .includes('evidence-presentation'), true);
  const restarted = projectPhase3Conversation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('d')
  });
  assert.equal(
    restarted.supporting_operation_perceptions.at(-1).result_kind,
    'recognized'
  );
  assert.equal(
    restarted.npc_decision_signals.some(
      ({ signal }) => signal.signal_id === environmentSignal.signal_id
    ),
    true
  );
  const writes = conversationWrites(
    state, restarted, exchange.result, 'evidence-visual-perception'
  );
  const persistedPerception = writes.appends.find(
    ({ target_table: table, record }) =>
      table === 'party_perception_records'
        && record.perception_id ===
          restarted.supporting_operation_perceptions.at(-1).perception_id
  );
  assert.equal(persistedPerception.record.result_kind, 'recognized');
  assert.deepEqual(persistedPerception.record.signal_refs, [{
    entity_kind: 'npc_decision_signal',
    entity_id: environmentSignal.signal_id
  }]);
  assert.equal((await assertLowerDvinaTraceSemanticConversationRows(
    semanticReadPool(writes), restarted)).length, 1);
  const tampered = structuredClone(writes);
  tampered.appends.find(({ target_table: table, record }) =>
    table === 'party_perception_records'
      && record.perception_id === persistedPerception.record.perception_id
  ).record.signal_refs = [];
  await assert.rejects(
    () => assertLowerDvinaTraceSemanticConversationRows(
      semanticReadPool(tampered), restarted
    ),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }
  );
});

test('ordinary NPC response keeps one session active across player boundaries', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const first = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, что ты видел?',
    inputDigest: digest('5'),
    responseKind: 'speech'
  });
  assert.equal(first.result.exchange.session_status, 'active');
  assert.equal(first.result.exchange.stop_reason, 'player_response');
  const continuedState = projectSemanticConversationSnapshot({
    state,
    semanticExchange: first.result,
    rootTurnId: 'turn:conversation:first',
    workingRevision: 0,
    appliedChangeSetId: 'change:conversation:first'
  });
  const secondContracts = resolveTracePhase3Contracts({
    state: continuedState,
    bundle: revision14Bundle
  });
  const second = await runPhase3({
    state: continuedState,
    contracts: secondContracts,
    rawText: 'А что было потом?',
    inputDigest: digest('6'),
    responseKind: 'speech'
  });

  assert.equal(
    second.result.decision_request.conversation_id,
    first.result.decision_request.conversation_id
  );
  assert.ok(second.npcRequest.public_conversation_history.length >= 3);
  assert.equal(second.result.exchange.session_status, 'active');
});

test('Eremey may leave a conversation through the common contribution contract', async () => {
  const state = phase3State();
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, задержись.',
    inputDigest: digest('7'),
    responseKind: 'leave_conversation'
  });
  assert.equal(exchange.result.response_kind, 'leave_conversation');
  assert.equal(exchange.result.exchange.session_status, 'ended');
  const projected = projectPhase3Conversation({
    state,
    contracts,
    result: exchange.result,
    inputDigest: digest('7')
  });
  assert.equal(projected.conversation_sessions.at(-1).status, 'ended');
});

test('conversation audience uses listener hearing state instead of fixed recognition', async () => {
  const state = phase3State();
  const fisher = state.npcs.find(
    ({ participant_slot_ref: slot }) => slot === 'background_fisher_1'
  );
  fisher.machine_state = { ...fisher.machine_state, hearing_capability: 'none' };
  const contracts = resolveTracePhase3Contracts({ state, bundle: revision14Bundle });
  const exchange = await runPhase3({
    state,
    contracts,
    rawText: 'Еремей, что ты видел?',
    inputDigest: digest('0'),
    responseKind: 'speech'
  });
  const audience = exchange.result.audiences[0];
  assert.equal(audience.actual_listener_refs.some(
    ({ entity_id: id }) => id === fisher.instance_id
  ), false);
  assert.equal(audience.witness_candidate_refs.some(
    ({ entity_id: id }) => id === fisher.instance_id
  ), false);
});

function conversationWrites(state, next, semanticExchange, suffix) {
  const writeInput = buildNpcSemanticConversationWriteInput({
    state,
    next,
    semanticExchange
  });
  const writes = { inserts: [], updates: [], appends: [] };
  const traceRef = (next.npc_semantic_decision_refs ?? []).find(
    ({ request_id: requestId }) =>
      requestId === semanticExchange.decision_request?.request_id
  ) ?? null;
  appendNpcSemanticConversationWrites({
    ...writes,
    partyId: state.party_id,
    changeSetId: traceRef?.applied_change_set_id ?? `change:${suffix}`,
    idempotencyRecordId: `idem:${suffix}`,
    rootTurnId: traceRef?.root_turn_id ?? `turn:${suffix}`,
    workingRevision: traceRef?.working_revision ?? 0,
    ...writeInput
  });
  return writes;
}
