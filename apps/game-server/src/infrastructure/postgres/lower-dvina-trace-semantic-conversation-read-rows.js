
import { canonicalDigest } from '@rus/materialization';
import {
  buildNpcSemanticDecisionTrace,
  validateConversationContributionPlan,
  validateConversationSession,
  validateConversationStatementEvent,
  validateNpcConversationResponseRequest,
  validateNpcDecisionBoundary,
  validateNpcDecisionSignal,
  validateNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import { projectConversationReceivedClaims } from
  '@rus/visibility-knowledge-memory';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { semanticDecisionTraceReference } from
  './lower-dvina-trace-conversation-state.js';

import {
  fail,
  refKey,
  rowDigestInvalid,
  sorted,
  sortedAudiences,
  sortedMessages,
  statementContract,
  timestampMatches
} from './lower-dvina-trace-semantic-conversation-read-shared.js';

export function assertChangeSetLineage(sessions, statements, decisions) {
  const byExchange = new Map();
  const latestByConversation = new Map();
  for (const decision of decisions) {
    const request = decision.semantic_request;
    const exchangeKey = `${request.conversation_id}\u0000${request.exchange_id}`;
    if (byExchange.has(exchangeKey)) fail();
    byExchange.set(exchangeKey, decision);
    const current = latestByConversation.get(request.conversation_id);
    const currentStateVersion = Number(
      current?.semantic_request.state_version ?? -1
    );
    const decisionStateVersion = Number(request.state_version);
    const currentWorkingRevision = Number(current?.working_revision ?? -1);
    const decisionWorkingRevision = Number(decision.working_revision);
    if (current && currentStateVersion === decisionStateVersion
        && currentWorkingRevision === decisionWorkingRevision) fail();
    if (!current || currentStateVersion < decisionStateVersion
        || (currentStateVersion === decisionStateVersion
          && currentWorkingRevision < decisionWorkingRevision)) {
      latestByConversation.set(request.conversation_id, decision);
    }
  }
  if (statements.some((statement) =>
    byExchange.get(`${statement.conversation_id}\u0000${
      statement.exchange_id}`)?.change_set_id !== statement.change_set_id
  ) || sessions.some((session) =>
    latestByConversation.get(session.conversation_id)?.change_set_id
      !== session.updated_change_set_id
  )) fail();
}

export function assertSessions(payload, rows) {
  const expected = sorted(
    payload.conversation_sessions ?? [],
    'conversation_id'
  );
  const actual = rows.map((row) => ({
    schema: row.session_schema,
    conversation_id: row.conversation_id,
    state_version: Number(row.state_version),
    status: row.status,
    started_at: row.started_at,
    location_ref: row.location_ref,
    initiator_ref: row.initiator_ref,
    active_participant_refs: row.active_participant_refs,
    last_contribution_ref: row.last_contribution_ref,
    topic_refs: row.topic_refs,
    status_reason: row.status_reason
  }));
  if (expected.some((session) => !validateConversationSession(session))
      || actual.some((session, index) =>
        !validateConversationSession(session)
        || rowDigestInvalid(rows[index], session, 'canonical_digest'))
      || canonicalDigest(actual) !== canonicalDigest(expected)) fail();
  return rows;
}

export function assertStatementsAndAudiences(payload, rows) {
  const expectedStatements = sorted(
    payload.conversation_statements ?? [],
    'statement_id'
  );
  const expectedAudiences = sortedAudiences(
    payload.conversation_audiences ?? []
  );
  const expectedMessages = sortedMessages(payload.received_messages ?? []);
  const actualStatements = [];
  const actualAudiences = [];
  for (const row of rows) {
    const statement = {
      schema: row.statement_schema,
      statement_id: row.statement_id,
      conversation_id: row.conversation_id,
      exchange_id: row.exchange_id,
      speaker_ref: row.speaker_ref,
      intended_addressee_refs: row.intended_addressee_refs,
      utterance_text: row.utterance_text,
      dominant_act: row.dominant_act,
      interaction_tags: row.interaction_tags,
      topic_refs: row.topic_refs,
      claims: row.claims,
      message_completeness: row.message_completeness,
      spoken_at: row.spoken_at,
      duration: row.duration,
      social_delivery_result: row.social_delivery_result,
      source_plan_ref: row.source_plan_ref
    };
    const audience = row.audience_projection;
    const audienceListenerKeys = Array.isArray(audience?.actual_listener_refs)
      ? audience.actual_listener_refs.map(refKey).sort()
      : [];
    const messageListenerKeys = Array.isArray(audience?.received_messages)
      ? audience.received_messages.map(({ listener_ref: listener }) =>
        refKey(listener)).sort()
      : [];
    if (!validateConversationStatementEvent(statement)
        || row.idempotency_key !== `conversation-statement:${row.statement_id}`
        || rowDigestInvalid(row, statement, 'canonical_digest')
        || audience?.schema !== 'conversation_audience_projection_v1'
        || audience.statement_ref?.entity_id !== row.statement_id
        || !Array.isArray(audience.actual_listener_refs)
        || !Array.isArray(audience.received_messages)
        || audience.actual_listener_refs.length
          !== audience.received_messages.length
        || new Set(audienceListenerKeys).size !== audienceListenerKeys.length
        || canonicalDigest(audienceListenerKeys)
          !== canonicalDigest(messageListenerKeys)
        || audience.received_messages.some((message) =>
          message.comprehension !== 'full'
          || refKey(message.source_statement_ref)
            !== refKey(audience.statement_ref)
          || canonicalDigest(message.speaker_ref)
            !== canonicalDigest(statement.speaker_ref)
          || message.utterance_text !== statement.utterance_text
          || canonicalDigest(message.claims)
            !== canonicalDigest(
              projectConversationReceivedClaims(statement.claims)
            )
        )
        || row.audience_digest !== canonicalDigest(audience)) fail();
    actualStatements.push(statement);
    actualAudiences.push(audience);
  }
  const actualMessages = sortedMessages(actualAudiences.flatMap(
    ({ received_messages: received }) => received
  ));
  if (canonicalDigest(actualStatements) !== canonicalDigest(expectedStatements)
      || canonicalDigest(sortedAudiences(actualAudiences))
        !== canonicalDigest(expectedAudiences)
      || canonicalDigest(actualMessages) !== canonicalDigest(expectedMessages)) {
    fail();
  }
  return rows;
}

export function assertDecisions(payload, rows) {
  if (Object.hasOwn(payload, 'npc_semantic_decision_traces')) fail();
  const expected = sorted(
    payload.npc_semantic_decision_refs ?? [],
    'request_id'
  );
  const expectedById = new Map(expected.map(
    (trace) => [trace.request_id, trace]
  ));
  const actual = [];
  const consumedSignalIds = [];
  const persistedSignals = new Map();
  const snapshotSignals = new Map((payload.npc_decision_signals ?? []).map(
    (record) => [record?.signal?.signal_id, record]
  ));
  for (const row of rows) {
    const expectedRef = expectedById.get(row.request_id);
    const request = row.semantic_request;
    const boundary = row.boundary_snapshot;
    const plan = row.semantic_plan;
    const signalRecords = row.signal_records;
    if (!validateNpcConversationResponseRequest(request)
        || !validateNpcDecisionBoundary(boundary)
        || !validateConversationContributionPlan(plan, request)
        || !Array.isArray(signalRecords)
        || signalRecords.some((signal) => !validateNpcDecisionSignal(signal))
        || row.request_id !== request.request_id
        || row.npc_id !== request.npc_ref.entity_id
        || Number(row.state_version) !== request.state_version
        || row.status !== 'committed'
        || boundary.boundary_id !== request.boundary_id
        || canonicalDigest(boundary.npc_ref)
          !== canonicalDigest(request.npc_ref)
        || boundary.state_version !== String(request.state_version)
        || row.boundary_id !== boundary.boundary_id
        || row.decision_mode !== boundary.decision_mode
        || row.root_turn_id !== expectedRef?.root_turn_id
        || Number(row.working_revision)
          !== expectedRef?.working_revision
        || row.change_set_id !== expectedRef?.applied_change_set_id
        || row.boundary_id !== expectedRef?.boundary_id
        || expectedRef?.npc_ref?.entity_kind !== 'npc'
        || row.npc_id !== expectedRef?.npc_ref?.entity_id
        || Number(row.state_version)
          !== expectedRef?.committed_state_version
        || row.status !== expectedRef?.status
        || canonicalDigest(row.signal_refs)
          !== canonicalDigest(boundary.signal_refs)
        || canonicalDigest(row.decision_categories)
          !== canonicalDigest(boundary.categories)
        || row.aggregate_significance !== boundary.significance
        || canonicalDigest(row.same_time_batch_ref)
          !== canonicalDigest(boundary.same_time_batch_ref)
        || canonicalDigest(signalRecords.map(({ signal_id: id }) => ({
          entity_kind: 'npc_decision_signal', entity_id: id
        }))) !== canonicalDigest(boundary.signal_refs)) fail();
    const trace = buildNpcSemanticDecisionTrace({
      request,
      plan,
      root_turn_id: row.root_turn_id,
      working_revision: Number(row.working_revision),
      applied_change_set_id: row.change_set_id,
      status: row.status
    });
    const inputDigest = canonicalDigest({
      schema: 'npc_semantic_decision_input_v1',
      request,
      boundary,
      signal_records: signalRecords
    });
    const persistedTrace = {
      trace,
      request_snapshot: request,
      boundary_snapshot: boundary,
      signal_records: signalRecords,
      canonical_input_digest: inputDigest
    };
    if (!validateNpcSemanticDecisionTrace(trace, request)
        || row.semantic_trace_schema !== trace.schema
        || row.canonical_input_digest !== inputDigest
        || row.trace_digest !== canonicalDigest(persistedTrace)) fail();
    actual.push(trace);
    for (const signal of signalRecords) {
      const signalId = signal.signal_id;
      if (persistedSignals.has(signalId)) fail();
      persistedSignals.set(signalId, signal);
      consumedSignalIds.push(signalId);
      const snapshot = snapshotSignals.get(signalId);
      if (!snapshot
          || snapshot.same_time_batch_key
            !== boundary.same_time_batch_ref.entity_id
          || canonicalDigest(snapshot.signal) !== canonicalDigest(signal)) fail();
    }
  }
  const actualRefs = actual.map(semanticDecisionTraceReference);
  if (canonicalDigest(actualRefs) !== canonicalDigest(expected)
      || canonicalDigest([...consumedSignalIds].sort())
        !== canonicalDigest([...(payload.consumed_npc_decision_signal_ids ?? [])]
          .sort())) fail();
  return { rows, traces: actual };
}
