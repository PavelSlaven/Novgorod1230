import {
  buildConversationSession,
  buildNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import {
  compareText,
  fail,
  mergeAppendOnly,
  mergeMutableById,
  record,
  ref,
  refKey,
  requireBoundarySignalLineage,
  requireRecord,
  requireSignalLineage,
  text,
  uniqueRefs,
  validateAudiences,
  validateContributions,
  validateConsumedSignalIds,
  validateSignalRecords,
  validateStatements,
  validateTerminalNpcOutcomes
} from './lower-dvina-trace-conversation-state-validation.js';
import {
  assertSharedSemanticSnapshotSafe,
  projectSharedSemanticConsequence,
  projectSharedSemanticExchange,
  semanticDecisionTraceReference
} from './lower-dvina-trace-conversation-shared-projection.js';
import { validateSupportingOperationPerceptions } from './lower-dvina-trace-supporting-operation-perception-state.js';
import { projectPendingNpcConversationExecution } from
  './lower-dvina-trace-pending-npc-state.js';
import { assertSemanticExchangeShape } from
  './lower-dvina-trace-semantic-exchange-shape.js';

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
  const decisions = exchange?.npc_decisions ?? [];
  const hasDecision = decisions.length > 0;
  const primaryDecision = decisions[0] ?? null;
  const firstContribution = exchange?.contributions?.[0];
  const resumedPlan = semanticExchange.resumed_npc_execution?.plan;
  const exchangeIdentity = hasDecision ? primaryDecision.request
    : firstContribution ? {
        conversation_id: firstContribution.conversation_id,
        exchange_id: firstContribution.exchange_id
      } : {
        conversation_id: resumedPlan?.conversation_id,
        exchange_id: resumedPlan?.exchange_id
      };
  assertSemanticExchangeShape({ semanticExchange, exchange, decisions,
    primaryDecision, record, fail });

  let traces = [];
  if (hasDecision) {
    try {
      traces = decisions.map((decision) => buildNpcSemanticDecisionTrace({
        request: decision.request,
        plan: decision.proposal.plan,
        root_turn_id: rootTurnId,
        working_revision: workingRevision,
        applied_change_set_id: appliedChangeSetId
      }));
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
  const contributions = exchange.contributions.length === 0
    ? [] : validateContributions(
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
  const terminalOutcomes = validateTerminalNpcOutcomes(
    semanticExchange.terminal_npc_outcomes ?? []
  );
  const explainedSignalIds = new Set();
  for (const decision of decisions) {
    requireBoundarySignalLineage({ state, boundary: decision.boundary,
      signalRecords, consumedSignalIds });
    for (const { entity_id: signalId } of decision.boundary.signal_refs) {
      if (explainedSignalIds.has(signalId)) {
        fail('TRACE_M2_SEMANTIC_SIGNAL_LINEAGE_INVALID');
      }
      explainedSignalIds.add(signalId);
    }
  }
  for (const outcome of terminalOutcomes) {
    requireSignalLineage({ state, npcRef: outcome.npc_ref,
      batchRef: outcome.same_time_batch_ref,
      signalIds: outcome.signal_ids_to_consume,
      signalRecords, consumedSignalIds });
    for (const signalId of outcome.signal_ids_to_consume) {
      if (explainedSignalIds.has(signalId)) {
        fail('TRACE_M2_SEMANTIC_SIGNAL_LINEAGE_INVALID');
      }
      explainedSignalIds.add(signalId);
    }
  }
  if (consumedSignalIds.some((signalId) =>
    !explainedSignalIds.has(signalId))) {
    fail('TRACE_M2_SEMANTIC_SIGNAL_LINEAGE_INVALID');
  }
  const session = conversationSession({ state, exchange, statements,
    contributions, request: exchangeIdentity });
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
  next.npc_decision_terminal_outcomes = mergeAppendOnly(
    next.npc_decision_terminal_outcomes,
    terminalOutcomes,
    terminalOutcomeIdentity,
    'TRACE_M2_NPC_TERMINAL_OUTCOME_CONFLICT'
  );
  delete next.npc_semantic_decision_traces;
  if (traces.length > 0) {
    next.npc_semantic_decision_refs = mergeAppendOnly(
      next.npc_semantic_decision_refs,
      traces.map(semanticDecisionTraceReference),
      ({ request_id: id }) => id,
      'TRACE_M2_SEMANTIC_TRACE_CONFLICT'
    );
  }
  return projectPendingNpcConversationExecution({
    next, semanticExchange, exchange, traces, decisions, fail
  });
}

function contributionIdentity(contribution) {
  return contribution?.schema === 'conversation_statement_event_v1'
    ? contribution.statement_id
    : contribution?.schema === 'conversation_non_statement_contribution_v1'
      ? contribution.contribution_id
      : null;
}

function terminalOutcomeIdentity(outcome) {
  return `${refKey(outcome.npc_ref)}\u0000${
    refKey(outcome.same_time_batch_ref)}`;
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

function conversationSession({ state, exchange, statements, contributions,
  request }) {
  const existing = (state.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === request.conversation_id
  );
  const firstContribution = contributions[0];
  const last = contributions.at(-1);
  const activeParticipantRefs = uniqueRefs([
    ...(existing?.active_participant_refs ?? []),
    ...contributions.map(({ speaker_ref: speakerRef }) => speakerRef),
    ...statements.flatMap(
      ({ intended_addressee_refs: intendedRefs }) => intendedRefs
    )
  ]);
  const lastContributionRef = last?.schema
    === 'conversation_statement_event_v1'
    ? ref('conversation_statement', last.statement_id)
    : last?.schema === 'conversation_non_statement_contribution_v1'
      && text(last.contribution_id)
      ? ref('conversation_contribution', last.contribution_id)
      : existing?.last_contribution_ref ?? null;
  if (!lastContributionRef
      || !text(state.position?.location_ref)
      || !text(exchange.session_status)
      || !text(exchange.stop_reason)
      || (firstContribution == null && existing == null)) {
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
    started_at: existing?.started_at
      ?? (firstContribution?.schema === 'conversation_statement_event_v1'
        ? firstContribution.spoken_at : structuredClone(state.clock)),
    location_ref: existing?.location_ref
      ?? ref('location', state.position.location_ref),
    initiator_ref: existing?.initiator_ref ?? firstContribution?.speaker_ref,
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
