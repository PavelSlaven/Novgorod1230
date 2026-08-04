
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
  appendContributionWrites,
  appendMessageWrites,
  appendStatementWrites,
  sessionRecord
} from './npc-semantic-conversation-write-rows.js';
import { appendSupportingOperationPerceptionWrites } from
  './npc-semantic-conversation-supporting-operation-writes.js';

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
  actualMessageEvidence,
  supportingOperationEvidence = [],
  partyStateVersion,
  sameTimeBatchRef,
  contributions
} = {}) {
  const hasDecision = semanticExchange?.decision_request !== null;
  if (!writeArraysValid(inserts, updates, appends)
      || ![partyId, changeSetId, idempotencyRecordId, rootTurnId].every(stableId)
      || !Number.isSafeInteger(workingRevision)
      || workingRevision < 0
      || !exactKeys(sessionWrite, ['mode', 'session'])
      || !['insert', 'update'].includes(sessionWrite.mode)
      || !validateConversationSession(sessionWrite.session)
      || (sessionWrite.mode === 'insert' && sessionWrite.session.state_version !== 1)
      || !record(semanticExchange)
      || !Number.isSafeInteger(partyStateVersion)
      || partyStateVersion < 1
      || !record(sameTimeBatchRef)
      || sameTimeBatchRef.entity_kind !== 'temporal_batch'
      || !Array.isArray(contributions)
      || contributions.length < 1
      || !validSupportingOperationEvidence(supportingOperationEvidence)
      || (hasDecision && (!validateNpcDecisionBoundary(semanticExchange.decision_boundary)
        || !validateNpcConversationResponseRequest(semanticExchange.decision_request)
        || !validateConversationContributionPlan(
          semanticExchange.decision_plan,
          semanticExchange.decision_request
        )
        || !exactBoundaryLink(
          semanticExchange.decision_boundary,
          semanticExchange.decision_request
        )))
      || (!hasDecision && (semanticExchange.decision_boundary !== null
        || semanticExchange.decision_plan !== null))
      || semanticExchange.exchange?.schema
        !== 'conversation_exchange_result_v1') {
    fail('Semantic conversation writes require exact validated input contracts');
  }
  const session = sessionWrite.session;
  const request = semanticExchange.decision_request;
  const boundary = semanticExchange.decision_boundary;
  if ((request?.conversation_id
        ?? contributions[0]?.conversation_id) !== session.conversation_id
      || (hasDecision && request.npc_ref.entity_id
        !== semanticExchange.decision_plan.speaker_ref.entity_id)
      || session.status !== semanticExchange.exchange.session_status) {
    fail('Conversation session, semantic request, and plan identities do not match');
  }
  const orderedSignals = hasDecision
    ? orderedSignalRecords(signalRecords, boundary)
    : [];
  if (!hasDecision && (!Array.isArray(signalRecords)
      || signalRecords.length !== 0)) {
    fail('A no-response exchange cannot persist NPC decision signals');
  }
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
  if (hasDecision) {
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
  }

  const trace = hasDecision ? buildNpcSemanticDecisionTrace({
      request,
      plan: semanticExchange.decision_plan,
      root_turn_id: rootTurnId,
      working_revision: workingRevision,
      applied_change_set_id: changeSetId,
      status: 'committed'
    }) : null;
  const canonicalInputDigest = hasDecision ? canonicalDigest({
      schema: 'npc_semantic_decision_input_v1',
      request,
      boundary,
      signal_records: orderedSignals
    }) : null;
  const persistedTrace = hasDecision ? {
      trace,
      request_snapshot: request,
      boundary_snapshot: boundary,
      signal_records: orderedSignals,
      canonical_input_digest: canonicalInputDigest
    } : null;

  const sessionTarget = sessionWrite.mode === 'insert' ? inserts : updates;
  sessionTarget.push(row(
    'party_conversation_sessions',
    session.conversation_id,
    sessionRecord(session, partyId, changeSetId)
  ));
  if (hasDecision) appends.push(row('party_npc_decision_traces', request.request_id, {
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
  appendContributionWrites(
    appends,
    contributions,
    session,
    partyStateVersion,
    partyId,
    changeSetId
  );
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
    stateVersion: partyStateVersion,
    conversationStateVersion: session.state_version
  });
  appendSupportingOperationPerceptionWrites({
    inserts,
    appends,
    evidence: supportingOperationEvidence,
    partyId,
    changeSetId,
    idempotencyRecordId,
    stateVersion: partyStateVersion,
    conversationStateVersion: session.state_version
  });
}

function validSupportingOperationEvidence(values) {
  return Array.isArray(values) && values.every((entry) => {
    const perception = entry?.perception;
    return exactKeys(entry, ['perception', 'signal_refs'])
      && record(perception)
      && perception.schema
        === 'conversation_supporting_operation_perception_v1'
      && stableId(perception.perception_id)
      && stableId(perception.conversation_id)
      && stableId(perception.exchange_id)
      && perception.observer_ref?.entity_kind === 'npc'
      && stableId(perception.observer_ref?.entity_id)
      && perception.source_event_ref?.entity_kind === 'evidence_presentation'
      && stableId(perception.source_event_ref?.entity_id)
      && perception.subject_ref?.entity_kind === 'item'
      && stableId(perception.subject_ref?.entity_id)
      && ['not_perceived', 'perceived_partial', 'recognized']
        .includes(perception.result_kind)
      && record(perception.occurred_at)
      && Array.isArray(entry.signal_refs)
      && entry.signal_refs.every((reference) =>
        reference?.entity_kind === 'npc_decision_signal'
          && stableId(reference.entity_id))
      && (perception.result_kind === 'not_perceived'
        ? entry.signal_refs.length === 0
        : entry.signal_refs.length <= 1);
  });
}
