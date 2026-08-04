import {
  buildConversationSession,
  buildNpcSemanticDecisionTrace,
  validateNpcDecisionBoundary
} from '@rus/npc-runtime';
import {
  compareText,
  fail,
  mergeAppendOnly,
  mergeMutableById,
  record,
  ref,
  refKey,
  requireRecord,
  text,
  uniqueRefs,
  validateAudiences,
  validateContributions,
  validateConsumedSignalIds,
  validateSignalRecords,
  validateStatements
} from './lower-dvina-trace-conversation-state-validation.js';
import {
  assertSharedSemanticSnapshotSafe,
  projectSharedSemanticConsequence,
  projectSharedSemanticExchange,
  semanticDecisionTraceReference
} from './lower-dvina-trace-conversation-shared-projection.js';
import { validateSupportingOperationPerceptions } from './lower-dvina-trace-supporting-operation-perception-state.js';

export { assertSharedSemanticSnapshotSafe,
  projectSharedSemanticConsequence,
  projectSharedSemanticExchange,
  semanticDecisionTraceReference
};
export function projectSemanticConversationSnapshot({
  state,
  semanticExchange,
  rootTurnId,
  workingRevision,
  appliedChangeSetId
}) {
  requireRecord(state, 'TRACE_M2_CONVERSATION_SNAPSHOT_INVALID');
  requireRecord(semanticExchange, 'TRACE_M2_SEMANTIC_EXCHANGE_INVALID');
  const exchange = semanticExchange.exchange;
  const boundary = semanticExchange.decision_boundary;
  const request = semanticExchange.decision_request;
  const plan = semanticExchange.decision_plan;
  const hasDecision = exchange?.npc_decisions?.length === 1;
  const firstContribution = exchange?.contributions?.[0];
  const exchangeIdentity = hasDecision ? request : {
    conversation_id: firstContribution?.conversation_id,
    exchange_id: firstContribution?.exchange_id
  };
  if (!record(exchange)
      || exchange.schema !== 'conversation_exchange_result_v1'
      || !Array.isArray(exchange.contributions)
      || exchange.contributions.length < 1
      || !Array.isArray(exchange.npc_decisions)
      || exchange.npc_decisions.length > 1
      || !Array.isArray(semanticExchange.objective_truth_writes)
      || semanticExchange.objective_truth_writes.length !== 0
      || (hasDecision && (!validateNpcDecisionBoundary(boundary)
        || boundary.boundary_id !== request?.boundary_id
        || boundary.npc_ref.entity_id !== request?.npc_ref?.entity_id
        || boundary.state_version !== String(request?.state_version)
        || exchange.npc_decisions[0]?.boundary?.boundary_id
          !== boundary.boundary_id
        || exchange.npc_decisions[0]?.request?.request_id
          !== request?.request_id
        || exchange.npc_decisions[0]?.proposal?.plan?.request_id
          !== plan?.request_id))
      || (!hasDecision && (boundary !== null || request !== null || plan !== null))) {
    fail(
      'TRACE_M2_SEMANTIC_EXCHANGE_INVALID',
      'The committed semantic exchange has an invalid NPC decision cardinality.'
    );
  }

  let trace = null;
  if (hasDecision) {
    try {
      trace = buildNpcSemanticDecisionTrace({
        request,
        plan,
        root_turn_id: rootTurnId,
        working_revision: workingRevision,
        applied_change_set_id: appliedChangeSetId
      });
    } catch (error) {
      fail(
        'TRACE_M2_SEMANTIC_TRACE_INVALID',
        'The semantic decision trace lineage is incomplete.',
        error
      );
    }
  }
  const statements = validateStatements(
    semanticExchange.statements,
    exchangeIdentity
  );
  const audiences = validateAudiences(
    semanticExchange.audiences,
    statements
  );
  const contributions = validateContributions(
    exchange.contributions,
    statements,
    exchangeIdentity
  );
  const signalRecords = validateSignalRecords(
    semanticExchange.new_signal_records
  );
  const supportingOperationPerceptions =
    validateSupportingOperationPerceptions(
      semanticExchange.supporting_operation_perceptions ?? [],
      { fail, record, text }
    );
  const consumedSignalIds = validateConsumedSignalIds(
    semanticExchange.consumed_signal_ids
  );
  if (hasDecision) {
    requireBoundarySignalLineage({
      state,
      boundary,
      signalRecords,
      consumedSignalIds
    });
  } else if (consumedSignalIds.length !== 0) {
    fail('TRACE_M2_SEMANTIC_SIGNAL_LINEAGE_INVALID');
  }
  const session = conversationSession({ state, exchange, statements,
    audiences, request: exchangeIdentity });
  const next = structuredClone(state);
  next.conversation_sessions = mergeMutableById(
    next.conversation_sessions,
    session,
    'conversation_id'
  );
  next.conversation_statements = mergeAppendOnly(
    next.conversation_statements,
    statements,
    ({ statement_id: id }) => id,
    'TRACE_M2_CONVERSATION_STATEMENT_CONFLICT'
  );
  next.conversation_contributions = mergeAppendOnly(
    next.conversation_contributions,
    contributions,
    contributionIdentity,
    'TRACE_M2_CONVERSATION_CONTRIBUTION_CONFLICT'
  );
  next.conversation_audiences = mergeAppendOnly(
    next.conversation_audiences,
    audiences,
    ({ statement_ref: statementRef }) => refKey(statementRef),
    'TRACE_M2_CONVERSATION_AUDIENCE_CONFLICT'
  );
  next.received_messages = mergeAppendOnly(
    next.received_messages,
    audiences.flatMap(({ received_messages: messages }) => messages),
    (message) => `${refKey(message.source_statement_ref)}\u0000${
      refKey(message.listener_ref)}`,
    'TRACE_M2_RECEIVED_MESSAGE_CONFLICT'
  );
  next.supporting_operation_perceptions = mergeAppendOnly(
    next.supporting_operation_perceptions,
    supportingOperationPerceptions,
    ({ perception_id: id }) => id,
    'TRACE_M2_SUPPORTING_OPERATION_PERCEPTION_CONFLICT'
  );
  next.npc_decision_signals = mergeAppendOnly(
    next.npc_decision_signals,
    signalRecords,
    ({ signal }) => signal.signal_id,
    'TRACE_M2_NPC_SIGNAL_CONFLICT'
  );
  next.consumed_npc_decision_signal_ids = [...new Set([
    ...(next.consumed_npc_decision_signal_ids ?? []),
    ...consumedSignalIds
  ])].sort(compareText);
  delete next.npc_semantic_decision_traces;
  if (trace !== null) {
    next.npc_semantic_decision_refs = mergeAppendOnly(
      next.npc_semantic_decision_refs,
      [semanticDecisionTraceReference(trace)],
      ({ request_id: id }) => id,
      'TRACE_M2_SEMANTIC_TRACE_CONFLICT'
    );
  }
  return next;
}

function contributionIdentity(contribution) {
  return contribution?.schema === 'conversation_statement_event_v1'
    ? contribution.statement_id
    : contribution?.schema === 'conversation_non_statement_contribution_v1'
      ? contribution.contribution_id
      : null;
}

function requireBoundarySignalLineage({
  state, boundary, signalRecords, consumedSignalIds
}) {
  const available = new Map([
    ...(state.npc_decision_signals ?? []),
    ...signalRecords
  ].map((record) => [record?.signal?.signal_id, record]));
  const consumed = new Set([
    ...(state.consumed_npc_decision_signal_ids ?? []),
    ...consumedSignalIds
  ]);
  if (boundary.signal_refs.some(({ entity_id: signalId }) => {
    const record = available.get(signalId);
    return !record
      || !consumed.has(signalId)
      || record.same_time_batch_key
        !== boundary.same_time_batch_ref.entity_id
      || record.signal.subject_ref.entity_id !== boundary.npc_ref.entity_id;
  })) {
    fail(
      'TRACE_M2_SEMANTIC_SIGNAL_LINEAGE_INVALID',
      'The decision boundary must consume exact persisted same-time signals.'
    );
  }
}

export function appendPendingNpcDecisionSignalRecords({ state, records }) {
  requireRecord(state, 'TRACE_M2_CONVERSATION_SNAPSHOT_INVALID');
  const next = structuredClone(state);
  next.npc_decision_signals = mergeAppendOnly(
    next.npc_decision_signals,
    validateSignalRecords(records),
    ({ signal }) => signal.signal_id,
    'TRACE_M2_NPC_SIGNAL_CONFLICT'
  );
  return next;
}

function conversationSession({ state, exchange, statements, audiences,
  request }) {
  const existing = (state.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === request.conversation_id
  );
  const first = statements[0];
  const last = exchange.contributions.at(-1);
  const activeParticipantRefs = uniqueRefs([
    ...(existing?.active_participant_refs ?? []),
    ...statements.map(({ speaker_ref: speakerRef }) => speakerRef),
    ...statements.flatMap(
      ({ intended_addressee_refs: intendedRefs }) => intendedRefs
    ),
    ...audiences.flatMap(
      ({ actual_listener_refs: listenerRefs }) => listenerRefs
    )
  ]);
  const lastContributionRef = last?.schema
    === 'conversation_statement_event_v1'
    ? ref('conversation_statement', last.statement_id)
    : last?.schema === 'conversation_non_statement_contribution_v1'
      && text(last.contribution_id)
      ? ref('conversation_contribution', last.contribution_id)
      : null;
  if (!lastContributionRef
      || !text(state.position?.location_ref)
      || !text(exchange.session_status)
      || !text(exchange.stop_reason)) {
    fail(
      'TRACE_M2_CONVERSATION_SESSION_INVALID',
      'The semantic exchange cannot produce a formal conversation session.'
    );
  }
  const candidate = {
    schema: 'conversation_session_v1',
    conversation_id: request.conversation_id,
    state_version: existing ? existing.state_version + 1 : 1,
    status: exchange.session_status,
    started_at: existing?.started_at ?? first.spoken_at,
    location_ref: existing?.location_ref
      ?? ref('location', state.position.location_ref),
    initiator_ref: existing?.initiator_ref ?? first.speaker_ref,
    active_participant_refs: activeParticipantRefs,
    last_contribution_ref: lastContributionRef,
    topic_refs: [...new Set([
      ...(existing?.topic_refs ?? []),
      ...statements.flatMap(({ topic_refs: topicRefs }) => topicRefs)
    ])].sort(compareText),
    status_reason: exchange.stop_reason
  };
  try {
    return buildConversationSession(candidate);
  } catch (error) {
    fail(
      'TRACE_M2_CONVERSATION_SESSION_INVALID',
      'The semantic exchange cannot produce a formal conversation session.',
      error
    );
  }
}
