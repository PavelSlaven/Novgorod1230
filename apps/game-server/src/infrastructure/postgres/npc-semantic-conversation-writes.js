
import {
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
import { hasNonverbalDecisionEvidence } from
  './npc-semantic-conversation-nonverbal-validation.js';
import {
  appendContributionWrites,
  appendMessageWrites,
  appendStatementWrites,
  sessionRecord
} from './npc-semantic-conversation-write-rows.js';
import { appendSupportingOperationPerceptionWrites } from
  './npc-semantic-conversation-supporting-operation-writes.js';
import { appendNpcDecisionTraceWrites } from
  './npc-semantic-conversation-decision-writes.js';

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
  persistedMessageStatements = [],
  persistedMessageAudiences = [],
  supportingOperationEvidence = [],
  partyStateVersion,
  sameTimeBatchRef,
  contributions
} = {}) {
  const decisions = semanticExchange?.exchange?.npc_decisions?.length > 0
    ? semanticExchange.exchange.npc_decisions
    : semanticExchange?.decision_request == null ? [] : [{
        boundary: semanticExchange.decision_boundary,
        request: semanticExchange.decision_request,
        proposal: { plan: semanticExchange.decision_plan }
      }];
  const hasDecision = decisions.length > 0;
  const primaryDecision = decisions[0] ?? null;
  const unavailableResume = semanticExchange?.exchange?.stop_reason
    === 'npc_unavailable'
    && contributions?.length === 0
    && semanticExchange?.resumed_npc_execution?.plan != null;
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
      || (contributions.length < 1 && !unavailableResume)
      || !Array.isArray(persistedMessageStatements)
      || !Array.isArray(persistedMessageAudiences)
      || !validSupportingOperationEvidence(supportingOperationEvidence)
      || (hasDecision && (decisions.some((decision) =>
        !validateNpcDecisionBoundary(decision?.boundary)
        || !validateNpcConversationResponseRequest(decision?.request)
        || !validateConversationContributionPlan(
          decision?.proposal?.plan,
          decision.request
        )
        || !exactBoundaryLink(decision.boundary, decision.request))
        || primaryDecision.boundary.boundary_id
          !== semanticExchange.decision_boundary?.boundary_id
        || primaryDecision.request.request_id
          !== semanticExchange.decision_request?.request_id
        || primaryDecision.proposal.plan.request_id
          !== semanticExchange.decision_plan?.request_id))
      || (!hasDecision && (semanticExchange.decision_boundary !== null
        || semanticExchange.decision_plan !== null))
      || semanticExchange.exchange?.schema
        !== 'conversation_exchange_result_v1') {
    fail('Semantic conversation writes require exact validated input contracts');
  }
  const session = sessionWrite.session;
  const request = semanticExchange.decision_request;
  if ((request?.conversation_id
        ?? contributions[0]?.conversation_id
        ?? semanticExchange.resumed_npc_execution?.plan?.conversation_id)
        !== session.conversation_id
      || decisions.some((decision) =>
        decision.request.conversation_id !== session.conversation_id
        || decision.request.exchange_id
          !== primaryDecision.request.exchange_id
        || decision.request.npc_ref.entity_id
          !== decision.proposal.plan.speaker_ref.entity_id)
      || session.status !== semanticExchange.exchange.session_status) {
    fail('Conversation session, semantic request, and plan identities do not match');
  }
  const decisionRecords = decisions.map((decision) => ({
    ...decision,
    orderedSignals: orderedSignalRecords(signalRecords.filter((signal) =>
      decision.boundary.signal_refs.some(
        ({ entity_id: signalId }) => signal.signal_id === signalId
      )), decision.boundary)
  }));
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
  const persistedStatementsById = persistedMessageStatements.length === 0
    ? new Map()
    : statementIndex(persistedMessageStatements, session.conversation_id);
  const persistedMessages = persistedStatementsById.size === 0
    ? []
    : actualMessages(persistedMessageAudiences, persistedStatementsById);
  const decisionMessagesByPerceptionId = new Map();
  for (const message of [...messages, ...persistedMessages]) {
    const perceptionId = message.perception_result_ref.entity_id;
    if (decisionMessagesByPerceptionId.has(perceptionId)) {
      fail('Decision received-message proofs must have unique perception identity');
    }
    decisionMessagesByPerceptionId.set(perceptionId, message);
  }
  for (const decision of decisionRecords) {
    const { request: decisionRequest, boundary } = decision;
    const perceivedMessage = decisionRequest.perceived_message;
    if (perceivedMessage !== null) {
      const persistedMessage = decisionMessagesByPerceptionId.get(
        perceivedMessage.perception_result_ref.entity_id
      );
      if (!persistedMessage
          || !sameRef(persistedMessage.source_statement_ref,
            perceivedMessage.source_statement_ref)
          || !sameRef(persistedMessage.listener_ref, decisionRequest.npc_ref)) {
        fail('Semantic decision request must be based on an actual persisted received message');
      }
    }
    if (boundary.categories.includes('environment')
        && !hasSupportingOperationDecisionEvidence({
          request: decisionRequest,
          signalRecords: decision.orderedSignals,
          supportingOperationEvidence
        })) {
      fail('Environment decision request must be based on actual persisted perception');
    }
    if (!hasNonverbalDecisionEvidence({
      signalRecords: decision.orderedSignals,
      contributions
    })) {
      fail('Nonverbal decision request must be based on actual persisted perception');
    }
  }

  const sessionTarget = sessionWrite.mode === 'insert' ? inserts : updates;
  sessionTarget.push(row(
    'party_conversation_sessions',
    session.conversation_id,
    sessionRecord(session, partyId, changeSetId)
  ));
  appendNpcDecisionTraceWrites({ appends, decisionRecords, partyId,
    changeSetId, rootTurnId, workingRevision });
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

function hasSupportingOperationDecisionEvidence({
  request,
  signalRecords,
  supportingOperationEvidence
}) {
  const environmentSignals = signalRecords.filter(
    ({ category }) => category === 'environment'
  );
  return environmentSignals.length > 0
    && environmentSignals.every((signal) =>
      supportingOperationEvidence.some(({ perception, signal_refs: refs }) =>
        perception.result_kind !== 'not_perceived'
          && sameRef(perception.observer_ref, request.npc_ref)
          && sameRef(perception.source_event_ref, signal.source_event_ref)
          && sameRef(
            {
              entity_kind: 'perception_result',
              entity_id: perception.perception_id
            },
            signal.source_perception_ref
          )
          && refs.some(({ entity_id: signalId }) =>
            signalId === signal.signal_id))
    );
}
