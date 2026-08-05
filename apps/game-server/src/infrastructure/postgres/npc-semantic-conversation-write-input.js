import { canonicalDigest } from '@rus/materialization';
import {
  validateConversationSession,
  validateConversationStatementEvent
} from '@rus/npc-runtime';
import { projectConversationReceivedClaims } from
  '@rus/visibility-knowledge-memory';
import { fail, record, sameRef } from
  './npc-semantic-conversation-write-validation.js';

export function buildNpcSemanticConversationWriteInput({
  state,
  next,
  semanticExchange
} = {}) {
  if (!record(state) || !record(next) || !record(semanticExchange)) {
    fail('Semantic conversation persistence projection requires before and after snapshots');
  }
  const request = semanticExchange.decision_request;
  const boundary = semanticExchange.decision_boundary;
  const decisions = semanticExchange.exchange?.npc_decisions?.length > 0
    ? semanticExchange.exchange.npc_decisions
    : semanticExchange.decision_request == null ? [] : [{
        boundary: semanticExchange.decision_boundary,
        request: semanticExchange.decision_request,
        proposal: { plan: semanticExchange.decision_plan }
      }];
  const firstContribution = semanticExchange.exchange?.contributions?.[0];
  const resumedPlan = semanticExchange.resumed_npc_execution?.plan;
  const conversationId = request?.conversation_id
    ?? firstContribution?.conversation_id ?? resumedPlan?.conversation_id;
  const exchangeId = request?.exchange_id ?? firstContribution?.exchange_id
    ?? resumedPlan?.exchange_id;
  const sameTimeBatchRef = boundary?.same_time_batch_ref
    ?? semanticExchange.same_time_batch_ref;
  const session = (next.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === conversationId
  );
  const existingSession = (state.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === conversationId
  ) ?? null;
  const currentStatementIds = new Set(
    (semanticExchange.statements ?? []).map(({ statement_id: id }) => id)
  );
  const statements = (next.conversation_statements ?? []).filter(
    ({ statement_id: id, conversation_id: candidateConversationId,
      exchange_id: candidateExchangeId }) =>
      currentStatementIds.has(id)
      && candidateConversationId === conversationId
      && candidateExchangeId === exchangeId
  );
  const statementIds = new Set(statements.map(
    ({ statement_id: id }) => id
  ));
  const audiences = (next.conversation_audiences ?? []).filter(
    ({ statement_ref: statementRef }) =>
      statementRef?.entity_kind === 'conversation_statement'
      && statementIds.has(statementRef.entity_id)
  );
  const unavailableResume = semanticExchange.exchange?.stop_reason
    === 'npc_unavailable'
    && semanticExchange.exchange.contributions.length === 0
    && resumedPlan != null;
  if (!validateConversationSession(session)
      || !Array.isArray(next.npc_decision_signals)
      || !Array.isArray(semanticExchange.exchange?.contributions)
      || (semanticExchange.exchange.contributions.length === 0
        && !unavailableResume)
      || audiences.length !== statements.length) {
    fail('Conversation-state projection lacks exact session or exchange records');
  }
  const signalRecordsById = new Map(next.npc_decision_signals.map(
    (entry) => [entry?.signal?.signal_id, entry?.signal]
  ));
  const decisionSignalRefs = decisions.flatMap(
    (decision) => decision.boundary?.signal_refs ?? []
  );
  const uniqueSignalRefs = [...new Map(decisionSignalRefs.map(
    (reference) => [reference.entity_id, reference]
  )).values()];
  const signalRecords = uniqueSignalRefs.map(
    ({ entity_id: signalId }) => signalRecordsById.get(signalId)
  );
  if (signalRecords.some((signal) => signal === undefined)) {
    fail('Conversation-state projection lacks a boundary signal snapshot');
  }
  const statementsById = new Map(statements.map(
    (statement) => [statement.statement_id, statement]
  ));
  const actualMessageEvidence = audiences.flatMap((audience) =>
    audience.received_messages.map((message) => {
      const statement = statementsById.get(
        message.source_statement_ref?.entity_id
      );
      if (!validateConversationStatementEvent(statement)
          || !matchesPerceptionProjection(message, statement)) {
        fail('Audience projection does not prove the actual received message');
      }
      const messageSignalRefs = signalRecords
        .filter((signal) => sameRef(
          signal.source_perception_ref,
          message.perception_result_ref
        ))
        .map(({ signal_id: signalId }) => ({
          entity_kind: 'npc_decision_signal',
          entity_id: signalId
        }));
      return {
        source_statement_ref: message.source_statement_ref,
        listener_ref: message.listener_ref,
        perception_result_ref: message.perception_result_ref,
        result_kind: message.perception_result,
        received_at: message.perceived_at,
        recognition_policy_ref: {
          entity_kind: 'contract_schema',
          entity_id: 'conversation_audience_projection_v1'
        },
        visibility_policy_ref: {
          entity_kind: 'contract_schema',
          entity_id: 'conversation_statement_event_v1'
        },
        signal_refs: messageSignalRefs,
        knowledge_update_refs: [],
        dependency_pins: {
          conversation_ref: {
            entity_kind: 'conversation_session',
            entity_id: conversationId
          },
          statement_ref: message.source_statement_ref,
          same_time_batch_ref: message.same_time_batch_ref
        },
        policy_versions: {
          audience_projection: 'conversation_audience_projection_v1',
          statement_event: 'conversation_statement_event_v1'
        }
      };
    }));
  const currentPerceptionIds = new Set(actualMessageEvidence.map(
    ({ perception_result_ref: reference }) => reference.entity_id
  ));
  const persistedPerceptionIds = new Set(decisions.flatMap(({ request: entry }) => {
    const message = entry.perceived_message;
    return message !== null
      && !currentPerceptionIds.has(message.perception_result_ref.entity_id)
      ? [message.perception_result_ref.entity_id] : [];
  }));
  const persistedMessages = (state.received_messages ?? []).filter(
    ({ perception_result_ref: reference }) =>
      persistedPerceptionIds.has(reference?.entity_id)
  );
  const persistedStatementIds = new Set(persistedMessages.map(
    ({ source_statement_ref: reference }) => reference.entity_id
  ));
  const persistedMessageStatements = (state.conversation_statements ?? [])
    .filter(({ statement_id: statementId }) =>
      persistedStatementIds.has(statementId));
  const persistedMessageAudiences = (state.conversation_audiences ?? [])
    .filter(({ statement_ref: reference }) =>
      persistedStatementIds.has(reference?.entity_id));
  const supportingOperationEvidence = (
    semanticExchange.supporting_operation_perceptions ?? []
  ).map((perception) => ({
    perception: structuredClone(perception),
    signal_refs: (next.npc_decision_signals ?? [])
      .map(({ signal }) => signal)
      .filter((signal) => sameRef(
        signal?.source_perception_ref,
        {
          entity_kind: 'perception_result',
          entity_id: perception.perception_id
        }
      ))
      .map(({ signal_id: signalId }) => ({
        entity_kind: 'npc_decision_signal',
        entity_id: signalId
      }))
  }));
  return {
    sessionWrite: {
      mode: existingSession === null ? 'insert' : 'update',
      session
    },
    semanticExchange: {
      ...semanticExchange,
      statements,
      audiences
    },
    signalRecords,
    actualMessageEvidence,
    persistedMessageStatements,
    persistedMessageAudiences,
    supportingOperationEvidence,
    expectedSessionStateVersion: existingSession?.state_version ?? null,
    partyStateVersion: state.party_state?.state_version,
    sameTimeBatchRef,
    contributions: structuredClone(
      semanticExchange.exchange?.contributions ?? []
    )
  };
}

function matchesPerceptionProjection(message, statement) {
  if (!['recognized', 'perceived_partial', 'perceived_unidentified',
    'misinterpreted'].includes(message?.perception_result)) return false;
  const full = message.comprehension === 'full';
  const partial = message.comprehension === 'partial';
  if (!full && !partial) return false;
  if (message.utterance_text !== (full ? statement.utterance_text : null)) {
    return false;
  }
  const speakerRecognized = sameRef(message.speaker_ref, statement.speaker_ref);
  if (message.perception_result === 'recognized'
      && (!full || !speakerRecognized)) return false;
  if (message.perception_result === 'perceived_partial' && !partial) return false;
  if (['perceived_unidentified', 'misinterpreted']
    .includes(message.perception_result)
      && (message.speaker_ref !== null || !full)) return false;
  const expectedClaims = full && message.perception_result !== 'misinterpreted'
    ? projectConversationReceivedClaims(statement.claims)
    : [];
  return canonicalDigest(message.claims) === canonicalDigest(expectedClaims);
}
