
import { canonicalDigest } from '@rus/materialization';
import {
  buildNpcSemanticDecisionTrace,
  validateConversationContributionPlan,
  validateConversationSession,
  validateNpcConversationResponseRequest,
  validateNpcDecisionBoundary
} from '@rus/npc-runtime';
import { row } from './first-playable/plan-shared.js';
import {
  actualMessages,
  evidenceIndex,
  exactKeys,
  exactBoundaryLink,
  fail,
  orderedSignalRecords,
  record,
  sameRef,
  stableId,
  statementIndex,
  writeArraysValid
} from './npc-semantic-conversation-write-validation.js';
import {
  appendMessageWrites,
  appendStatementWrites,
  sessionRecord
} from './npc-semantic-conversation-write-rows.js';

export { buildNpcSemanticConversationWriteInput } from
  './npc-semantic-conversation-write-input.js';

/**
 * Pure write projection for an already-resolved semantic conversation.
 * It performs no reads, scheduling, state application, or model calls.
 */
export function appendNpcSemanticConversationWrites({
  inserts,
  updates,
  appends,
  partyId,
  changeSetId,
  idempotencyRecordId,
  rootTurnId,
  workingRevision,
  sessionWrite,
  semanticExchange,
  signalRecords,
  actualMessageEvidence
} = {}) {
  if (!writeArraysValid(inserts, updates, appends)
      || ![partyId, changeSetId, idempotencyRecordId, rootTurnId].every(stableId)
      || !Number.isSafeInteger(workingRevision)
      || workingRevision < 0
      || !exactKeys(sessionWrite, ['mode', 'session'])
      || !['insert', 'update'].includes(sessionWrite.mode)
      || !validateConversationSession(sessionWrite.session)
      || (sessionWrite.mode === 'insert' && sessionWrite.session.state_version !== 1)
      || !record(semanticExchange)
      || !validateNpcDecisionBoundary(semanticExchange.decision_boundary)
      || !validateNpcConversationResponseRequest(semanticExchange.decision_request)
      || !validateConversationContributionPlan(
        semanticExchange.decision_plan,
        semanticExchange.decision_request
      )
      || !exactBoundaryLink(
        semanticExchange.decision_boundary,
        semanticExchange.decision_request
      )
      || semanticExchange.exchange?.schema
        !== 'conversation_exchange_result_v1') {
    fail('Semantic conversation writes require exact validated input contracts');
  }
  const session = sessionWrite.session;
  const request = semanticExchange.decision_request;
  const boundary = semanticExchange.decision_boundary;
  if (request.conversation_id !== session.conversation_id
      || request.npc_ref.entity_id !== semanticExchange.decision_plan.speaker_ref.entity_id
      || session.status !== semanticExchange.exchange.session_status) {
    fail('Conversation session, semantic request, and plan identities do not match');
  }
  const orderedSignals = orderedSignalRecords(signalRecords, boundary);
  const statementsById = statementIndex(
    semanticExchange.statements,
    session.conversation_id
  );
  const messages = actualMessages(
    semanticExchange.audiences,
    statementsById
  );
  const evidenceByPerceptionId = evidenceIndex(
    actualMessageEvidence,
    messages
  );
  const perceivedMessage = request.perceived_message;
  const targetEvidence = evidenceByPerceptionId.get(
    perceivedMessage.perception_result_ref.entity_id
  );
  if (!targetEvidence
      || !sameRef(targetEvidence.source_statement_ref,
        perceivedMessage.source_statement_ref)
      || !sameRef(targetEvidence.listener_ref, request.npc_ref)) {
    fail('Semantic decision request must be based on an actual persisted received message');
  }

  const trace = buildNpcSemanticDecisionTrace({
    request,
    plan: semanticExchange.decision_plan,
    root_turn_id: rootTurnId,
    working_revision: workingRevision,
    applied_change_set_id: changeSetId,
    status: 'committed'
  });
  const canonicalInputDigest = canonicalDigest({
    schema: 'npc_semantic_decision_input_v1',
    request,
    boundary,
    signal_records: orderedSignals
  });
  const persistedTrace = {
    trace,
    request_snapshot: request,
    boundary_snapshot: boundary,
    signal_records: orderedSignals,
    canonical_input_digest: canonicalInputDigest
  };

  const sessionTarget = sessionWrite.mode === 'insert' ? inserts : updates;
  sessionTarget.push(row(
    'party_conversation_sessions',
    session.conversation_id,
    sessionRecord(session, partyId, changeSetId)
  ));
  appends.push(row('party_npc_decision_traces', request.request_id, {
    request_id: request.request_id,
    party_id: partyId,
    npc_id: request.npc_ref.entity_id,
    state_version: request.state_version,
    option_id: null,
    command_token: null,
    options_digest: null,
    status: 'committed',
    validated_at_whole_minutes: boundary.scheduled_at.whole_minutes,
    validated_at_subminute_numerator: boundary.scheduled_at.subminute_numerator,
    validated_at_subminute_denominator: boundary.scheduled_at.subminute_denominator,
    idempotency_key: boundary.idempotency_key,
    change_set_id: changeSetId,
    trace_digest: canonicalDigest(persistedTrace),
    boundary_id: boundary.boundary_id,
    decision_mode: boundary.decision_mode,
    root_turn_id: rootTurnId,
    working_revision: workingRevision,
    signal_refs: boundary.signal_refs,
    decision_categories: boundary.categories,
    aggregate_significance: boundary.significance,
    same_time_batch_ref: boundary.same_time_batch_ref,
    semantic_request: request,
    boundary_snapshot: boundary,
    signal_records: orderedSignals,
    semantic_plan: semanticExchange.decision_plan,
    canonical_input_digest: canonicalInputDigest,
    semantic_trace_schema: trace.schema
  }));
  appendStatementWrites(
    appends,
    semanticExchange.statements,
    semanticExchange.audiences,
    partyId,
    changeSetId
  );
  appendMessageWrites({
    inserts,
    appends,
    messages,
    evidenceByPerceptionId,
    statementsById,
    partyId,
    changeSetId,
    idempotencyRecordId,
    stateVersion: request.state_version,
    conversationStateVersion: session.state_version,
    sameTimeBatchRef: boundary.same_time_batch_ref
  });
}
