import assert from 'node:assert/strict';
import test from 'node:test';
import { plan } from '../../apps/game-server/test/lower-dvina-trace-turn-step-runtime-ports-fixture.js';
import { buildArmyPersistRuntime, createArmyPersistFixture } from
  '../fixtures/army-persist-runtime-postgres.js';

test('Ожидаемо красный, issue #397: conversation receipt survives production submitTurn, reload and replay', async (t) => {
  const fixture = await createArmyPersistFixture(t, { worldVersion: 6 });
  if (!fixture) return;
  const { pool, release, runtimeCatalogPin, worldVersion } = fixture;
  const setup = buildArmyPersistRuntime({ pool, release, runtimeCatalogPin, worldVersion });
  const opened = await setup.runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'army-persist-conversation-party'
  });
  await setup.runtime.acknowledgeOpening(opened.party_id, {
    client_ack_id: 'army-persist-conversation-ack'
  });
  await setup.runtime.submitTurn(opened.party_id, {
    request_id: 'army-persist-conversation-inspection',
    idempotency_key: 'army-persist-conversation-inspection',
    raw_text: 'Осмотреть место крушения подробно.'
  });

  const capturedNpcRequests = [];
  const capturedTurnRequests = [];
  const { runtime, counters } = buildArmyPersistRuntime({
    pool,
    release,
    runtimeCatalogPin,
    worldVersion,
    onNpcSemanticRequest(request) { capturedNpcRequests.push(request); },
    onTurnStepRequest(request) { capturedTurnRequests.push(request); },
    turnStepModel: routeThenTalkModel
  });

  const input = {
    request_id: 'army-persist-route-and-talk',
    idempotency_key: 'army-persist-route-and-talk',
    raw_text: 'Дойти до рыбацкого стана, поздороваться с рыбаками и спросить о лодочнике Онисиме.'
  };
  const committed = await runtime.submitTurn(opened.party_id, input);
  assert.equal(capturedTurnRequests.length, 2,
    'route and conversation must execute as steps of one submitTurn');
  assert.equal(capturedNpcRequests.length > 0, true,
    'production conversation must call an NPC semantic model');
  const npcRequest = capturedNpcRequests.find(({ perceived_message: message }) =>
    message?.source_statement_ref?.entity_kind === 'conversation_statement'
    && typeof message.perception_result_ref?.entity_id === 'string');
  assert.ok(npcRequest, 'captured NPC request must carry a received-message receipt');
  const requestedMessage = npcRequest.perceived_message;
  const countsAfterCommit = { ...counters };
  const beforeReplay = await conversationSnapshot(pool, opened.party_id,
    [input.request_id]);

  const restarted = buildArmyPersistRuntime({ pool, release, runtimeCatalogPin, worldVersion });
  let loaded;
  await assert.doesNotReject(async () => {
    loaded = await restarted.repository.loadPhase2State(opened.party_id, {
      includeCurrentVisibleContext: false
    });
  }, 'committed conversation receipt must pass exact production readback');
  const savedMessage = loaded.received_messages.find(({ perception_result_ref: ref }) =>
    sameRef(ref, requestedMessage.perception_result_ref));
  assert.ok(savedMessage,
    'saved received message must match the perception ref from captured NPC input');
  assert.deepEqual(savedMessage.source_statement_ref,
    requestedMessage.source_statement_ref,
    'saved message must retain the input statement ref');
  assert.deepEqual(savedMessage.listener_ref, npcRequest.npc_ref,
    'saved listener must be the NPC addressed by the captured request');
  assert.deepEqual(savedMessage.perception_result_ref,
    requestedMessage.perception_result_ref,
    'saved perception ref must match the captured request');
  assert.deepEqual(savedMessage.perceived_at,
    structuredClone(npcRequest.requested_at),
    'saved receipt time must match an independent captured input value');

  const savedStatement = loaded.conversation_statements.find(
    ({ statement_id: id }) =>
      id === requestedMessage.source_statement_ref.entity_id);
  assert.ok(savedStatement, 'the exact source statement must survive reload');
  const statementRow = await readStatement(pool, opened.party_id,
    savedStatement.statement_id);
  assert.ok(statementRow, 'the exact source statement row must survive reload');
  assert.deepEqual(savedStatement.spoken_at, structuredClone(statementRow.spoken_at),
    'statement spoken time must match its persisted independent column');
  const perceptionRow = await readPerception(pool, opened.party_id,
    requestedMessage.perception_result_ref.entity_id);
  assert.ok(perceptionRow, 'the exact receipt perception row must survive reload');
  assert.deepEqual(perceptionTime(perceptionRow),
    structuredClone(npcRequest.requested_at),
    'persisted perception time must match the captured NPC input');
  assert.deepEqual(eventTime(perceptionRow),
    structuredClone(npcRequest.requested_at),
    'received-message event time must match the exact receipt');

  assert.equal(savedStatement.statement_id,
    savedMessage.source_statement_ref.entity_id);
  assert.equal(perceptionRow.perception_id,
    savedMessage.perception_result_ref.entity_id);
  assert.deepEqual({ kind: perceptionRow.perceiver_kind,
    id: perceptionRow.perceiver_id }, {
    kind: savedMessage.listener_ref.entity_kind,
    id: savedMessage.listener_ref.entity_id
  });
  const readbackSnapshot = receiptSnapshot(loaded, savedMessage, savedStatement,
    perceptionRow);
  const savedDecision = await readDecision(pool, opened.party_id,
    npcRequest.request_id);
  assert.ok(savedDecision,
    'the captured NPC request must match its persisted decision trace');
  assert.equal(savedDecision.npc_id, npcRequest.npc_ref.entity_id,
    'persisted decision trace must target the NPC who received this message');
  assert.deepEqual(savedDecision.semantic_request.perceived_message
    .source_statement_ref, requestedMessage.source_statement_ref);
  assert.deepEqual(savedDecision.semantic_request.perceived_message
    .perception_result_ref, requestedMessage.perception_result_ref);
  assert.deepEqual(savedDecision.semantic_request.npc_ref, npcRequest.npc_ref);

  const replay = await restarted.runtime.submitTurn(opened.party_id, input);
  assert.deepEqual(replay, committed,
    'same input must return the committed result after runtime recreation');
  assert.deepEqual(counters, countsAfterCommit,
    'original provider call counts must remain unchanged by restart replay');
  assert.deepEqual(restarted.counters, {
    turnStepModel: 0, playerConversationModel: 0,
    npcSemanticModel: 0, semanticResolver: 0, narration: 0
  }, 'replay must call no provider in the new runtime');
  assert.deepEqual(await conversationSnapshot(pool, opened.party_id,
    [input.request_id]), beforeReplay,
    'replay must not append statements, receipts, or decisions');
  const afterReplay = await restarted.repository.loadPhase2State(opened.party_id, {
    includeCurrentVisibleContext: false
  });
  const replayMessage = afterReplay.received_messages.find(({ perception_result_ref: ref }) =>
    sameRef(ref, requestedMessage.perception_result_ref));
  assert.ok(replayMessage);
  const replayStatement = afterReplay.conversation_statements.find(
    ({ statement_id: id }) =>
      id === requestedMessage.source_statement_ref.entity_id);
  const replayPerception = await readPerception(pool, opened.party_id,
    requestedMessage.perception_result_ref.entity_id);
  assert.deepEqual(receiptSnapshot(afterReplay, replayMessage, replayStatement,
    replayPerception), readbackSnapshot,
    'independent receipt readback must remain unchanged after replay');

  await assert.rejects(() => restarted.runtime.submitTurn(opened.party_id, {
    ...input,
    raw_text: 'Дойти до стана и спросить о другом.'
  }), { code: 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT' });
  assert.deepEqual(await conversationSnapshot(pool, opened.party_id,
    [input.request_id]), beforeReplay,
    'conflicting input must not add a second receipt');

  const rollbackSetup = buildArmyPersistRuntime({
    pool, release, runtimeCatalogPin, worldVersion
  });
  const rollbackParty = await rollbackSetup.runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'army-persist-conversation-rollback-party'
  });
  await rollbackSetup.runtime.acknowledgeOpening(rollbackParty.party_id, {
    client_ack_id: 'army-persist-conversation-rollback-ack'
  });
  await rollbackSetup.runtime.submitTurn(rollbackParty.party_id, {
    request_id: 'army-persist-conversation-rollback-inspection',
    idempotency_key: 'army-persist-conversation-rollback-inspection',
    raw_text: 'Осмотреть место крушения подробно.'
  });
  const rollbackNpcRequests = [];
  const rollbackTurnRequests = [];
  const rollbackRuntime = buildArmyPersistRuntime({
    pool, release, runtimeCatalogPin, worldVersion,
    onNpcSemanticRequest(request) { rollbackNpcRequests.push(request); },
    onTurnStepRequest(request) { rollbackTurnRequests.push(request); },
    turnStepModel: routeThenTalkModel
  });
  const rollbackInput = {
    ...input,
    request_id: 'army-persist-route-and-talk-rollback',
    idempotency_key: 'army-persist-route-and-talk-rollback'
  };
  const rollbackBefore = await conversationSnapshot(pool, rollbackParty.party_id,
    [rollbackInput.request_id]);
  await pool.query(`ALTER TABLE party_runtime.party_conversation_statements
    ADD CONSTRAINT army_persist_receipt_rollback CHECK (false) NOT VALID`);
  try {
    await assert.rejects(() => rollbackRuntime.runtime.submitTurn(
      rollbackParty.party_id, rollbackInput), (error) => {
      assert.equal(error.code,
        'TRACE_PHASE_3_COMMIT_GENERATED_SCHEMA_MISMATCH');
      assert.match(error.details?.commit_error?.diagnostics?.reason ?? '',
        /army_persist_receipt_rollback/u,
        'failure must come from the injected PostgreSQL CHECK constraint');
      assert.equal(error.details?.commit_error?.diagnostics?.turn_commit_status,
        'not_started', 'transaction must report a confirmed rollback');
      return true;
    });
  } finally {
    await pool.query(`ALTER TABLE party_runtime.party_conversation_statements
      DROP CONSTRAINT army_persist_receipt_rollback`);
  }
  assert.equal(rollbackTurnRequests.length, 2,
    'rollback attempt must reach route and conversation provider steps');
  assert.ok(rollbackNpcRequests.some(({ perceived_message: message }) =>
    message?.source_statement_ref?.entity_kind === 'conversation_statement'),
  'rollback attempt must prepare a real conversation before SQL failure');
  assert.deepEqual(await conversationSnapshot(pool, rollbackParty.party_id,
    [rollbackInput.request_id]),
    rollbackBefore,
    'failed SQL insert must roll back turn head, conversation, receipts and idempotency');
});

function routeThenTalkModel(request) {
  if (request.step_index === 1) {
    const movement = request.available_domain_operations.find(({ op,
      target_ref: target }) => op === 'request_movement'
      && target === 'trace_ld_v1_loc_fishing_camp');
    assert.ok(movement, 'test route must be offered by production operation menu');
    return domainPlan(request, movement, {
      continuation: {
        remaining_intent: 'поздороваться и спросить о лодочнике Онисиме',
        depends_on_refs: ['trace_ld_v1_loc_fishing_camp']
      }
    });
  }
  const speech = request.available_domain_operations.find(({ op,
    interaction_kind: kind }) => op === 'emit_interaction' && kind === 'speech');
  assert.ok(speech, 'test conversation must be offered by production operation menu');
  return domainPlan(request, speech);
}

function domainPlan(request, operation, overrides = {}) {
  return plan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation],
    reason_code: 'delegate_existing_owner',
    ...overrides
  });
}

async function conversationSnapshot(pool, partyId, requestIds = []) {
  return {
    parties: await rows(pool, 'parties', 'party_id', partyId),
    sessions: await rows(pool, 'party_server_sessions', 'party_id', partyId),
    snapshots: await rows(pool, 'party_state_snapshots', 'state_version', partyId),
    changes: await rows(pool, 'party_v3_change_sets', 'id', partyId),
    writePlans: (await pool.query(`SELECT to_jsonb(w) AS row
      FROM party_runtime.party_change_set_write_plans w
      JOIN party_runtime.party_v3_change_sets c ON c.id=w.change_set_id
      WHERE c.party_id=$1 ORDER BY w.change_set_id`, [partyId]))
      .rows.map(({ row }) => row),
    commitIdempotency: (await pool.query(`SELECT to_jsonb(c) AS row
      FROM party_runtime.commit_idempotency c
      WHERE c.request_id=ANY($1::text[]) ORDER BY c.idempotency_key`,
    [requestIds])).rows.map(({ row }) => row),
    commandIdempotency: await rows(pool, 'party_command_idempotency', 'id', partyId),
    conversationSessions: await rows(pool, 'party_conversation_sessions',
      'conversation_id', partyId),
    statements: await rows(pool, 'party_conversation_statements',
      'statement_id', partyId),
    contributions: await rows(pool, 'party_conversation_contributions',
      'contribution_id', partyId),
    decisions: await rows(pool, 'party_npc_decision_traces', 'request_id', partyId),
    events: await rows(pool, 'party_temporal_events', 'event_id', partyId,
      "event_kind='conversation_message_received'"),
    perceptions: await rows(pool, 'party_perception_records', 'perception_id',
      partyId, "event_id IN (SELECT event_id FROM party_runtime.party_temporal_events WHERE party_id=$1 AND event_kind='conversation_message_received')"),
    witnesses: (await pool.query(`SELECT to_jsonb(w) AS row
      FROM party_runtime.party_perception_witnesses w
      JOIN party_runtime.party_perception_records p
        ON p.perception_id=w.perception_id
      JOIN party_runtime.party_temporal_events e ON e.event_id=p.event_id
      WHERE p.party_id=$1 AND e.event_kind='conversation_message_received'
      ORDER BY w.perception_id,w.witness_kind,w.witness_id`, [partyId]))
      .rows.map(({ row }) => row),
    replayEvidence: await rows(pool, 'party_perception_replay_evidence',
      'perception_id', partyId)
  };
}

async function rows(pool, table, orderBy, partyId, predicate = 'true') {
  return (await pool.query(`SELECT to_jsonb(t) AS row
    FROM party_runtime.${table} t
    WHERE t.party_id=$1 AND (${predicate})
    ORDER BY t.${orderBy}`, [partyId])).rows.map(({ row }) => row);
}

async function readDecision(pool, partyId, requestId) {
  return (await pool.query(`SELECT request_id,npc_id,semantic_request
    FROM party_runtime.party_npc_decision_traces
    WHERE party_id=$1 AND request_id=$2`, [partyId, requestId])).rows[0] ?? null;
}

async function readPerception(pool, partyId, perceptionId) {
  return (await pool.query(`SELECT p.perception_id,p.event_id,
      p.perceiver_kind,p.perceiver_id,p.perceived_at_whole_minutes::text,
      p.perceived_at_subminute_numerator::text,
      p.perceived_at_subminute_denominator::text,
      e.scheduled_at_whole_minutes::text,
      e.scheduled_at_subminute_numerator::text,
      e.scheduled_at_subminute_denominator::text
    FROM party_runtime.party_perception_records p
    JOIN party_runtime.party_temporal_events e ON e.event_id=p.event_id
    WHERE p.party_id=$1 AND p.perception_id=$2
      AND e.event_kind='conversation_message_received'`,
  [partyId, perceptionId])).rows[0] ?? null;
}

async function readStatement(pool, partyId, statementId) {
  return (await pool.query(`SELECT statement_id,spoken_at
    FROM party_runtime.party_conversation_statements
    WHERE party_id=$1 AND statement_id=$2`,
  [partyId, statementId])).rows[0] ?? null;
}

function perceptionTime(row) {
  return { whole_minutes: row.perceived_at_whole_minutes,
    subminute_numerator: row.perceived_at_subminute_numerator,
    subminute_denominator: row.perceived_at_subminute_denominator };
}

function eventTime(row) {
  return { whole_minutes: row.scheduled_at_whole_minutes,
    subminute_numerator: row.scheduled_at_subminute_numerator,
    subminute_denominator: row.scheduled_at_subminute_denominator };
}

function receiptSnapshot(state, message, statement, perception) {
  return {
    stateVersion: state.party_state.state_version,
    message: structuredClone(message),
    statement: structuredClone(statement),
    perception: structuredClone(perception)
  };
}

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}
