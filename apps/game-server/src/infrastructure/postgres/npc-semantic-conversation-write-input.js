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
  const conversationId = request?.conversation_id;
  const exchangeId = request?.exchange_id;
  const session = (next.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === conversationId
  );
  const existingSession = (state.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === conversationId
  ) ?? null;
  const statements = (next.conversation_statements ?? []).filter(
    ({ conversation_id: id, exchange_id: candidateExchangeId }) =>
      id === conversationId && candidateExchangeId === exchangeId
  );
  const statementIds = new Set(statements.map(
    ({ statement_id: id }) => id
  ));
  const audiences = (next.conversation_audiences ?? []).filter(
    ({ statement_ref: statementRef }) =>
      statementRef?.entity_kind === 'conversation_statement'
      && statementIds.has(statementRef.entity_id)
  );
  if (!validateConversationSession(session)
      || !Array.isArray(next.npc_decision_signals)
      || statements.length === 0
      || audiences.length !== statements.length) {
    fail('Conversation-state projection lacks exact session or exchange records');
  }
  const signalRecordsById = new Map(next.npc_decision_signals.map(
    (entry) => [entry?.signal?.signal_id, entry?.signal]
  ));
  const signalRecords = boundary.signal_refs.map(
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
          || message.comprehension !== 'full'
          || !sameRef(message.speaker_ref, statement.speaker_ref)
          || message.utterance_text !== statement.utterance_text
          || canonicalDigest(message.claims)
            !== canonicalDigest(
              projectConversationReceivedClaims(statement.claims)
            )) {
        fail('Audience projection does not prove a full recognized received message');
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
        result_kind: 'recognized',
        received_at: statement.spoken_at,
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
          same_time_batch_ref: boundary.same_time_batch_ref
        },
        policy_versions: {
          audience_projection: 'conversation_audience_projection_v1',
          statement_event: 'conversation_statement_event_v1'
        }
      };
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
    expectedSessionStateVersion: existingSession?.state_version ?? null
  };
}
