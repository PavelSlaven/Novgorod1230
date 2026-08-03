
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
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

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

export function assertMessages({ partyId, payload, sessions, statements, decisions,
  rows }) {
  const expected = sortedMessages(payload.received_messages ?? []);
  if (rows.length !== expected.length) fail();
  const messageByPerceptionId = new Map(expected.map((message) => [
    message.perception_result_ref.entity_id,
    message
  ]));
  if (messageByPerceptionId.size !== expected.length
      || decisions.some((decision) => {
        const request = decision.semantic_request;
        const perceived = request.perceived_message;
        const actual = messageByPerceptionId.get(
          perceived?.perception_result_ref?.entity_id
        );
        return !actual
          || canonicalDigest(actual.source_statement_ref)
            !== canonicalDigest(perceived?.source_statement_ref)
          || canonicalDigest(actual.perception_result_ref)
            !== canonicalDigest(perceived?.perception_result_ref)
          || canonicalDigest(actual.listener_ref)
            !== canonicalDigest(request.npc_ref);
      })) fail();
  const statementById = new Map(statements.map(
    (row) => [row.statement_id, row]
  ));
  const decisionByExchange = new Map(decisions.map(
    (row) => [
      `${row.semantic_request.conversation_id}\u0000${
        row.semantic_request.exchange_id}`,
      row
    ]
  ));
  const sessionById = new Map(sessions.map(
    (row) => [row.conversation_id, row]
  ));
  const exchangeVersions = conversationExchangeVersions(
    decisions,
    sessionById
  );
  for (let index = 0; index < expected.length; index += 1) {
    const message = expected[index];
    const row = rows[index];
    const perceptionId = message.perception_result_ref?.entity_id;
    const statement = statementById.get(
      message.source_statement_ref?.entity_id
    );
    const decision = statement && decisionByExchange.get(
      `${statement.conversation_id}\u0000${statement.exchange_id}`
    );
    if (!statement || !decision || row.perception_id !== perceptionId
        || row.event_id !== `conversation-message-event:${perceptionId}`
        || row.perceiver_kind !== message.listener_ref?.entity_kind
        || row.perceiver_id !== message.listener_ref?.entity_id
        || row.result_kind !== 'recognized'
        || row.witness_kind !== row.perceiver_kind
        || row.witness_id !== row.perceiver_id
        || row.event_kind !== 'conversation_message_received'
        || row.event_status !== 'resolved'
        || row.event_version !== '2'
        || canonicalDigest(row.rule_ref)
          !== canonicalDigest(message.source_statement_ref)
        || row.change_set_id !== statement.change_set_id
        || row.event_change_set_id !== statement.change_set_id
        || row.terminal_change_set_id !== statement.change_set_id
        || row.replay_change_set_id !== statement.change_set_id
        || row.idempotency_record_id !== row.idempotency_key
        || row.replay_idempotency_key !== row.idempotency_key) fail();
    const boundary = decision.boundary_snapshot;
    const evidence = messageEvidence({ message, statement, decision });
    const messageInput = {
      schema: 'conversation_received_message_persistence_input_v1',
      statement: statementContract(statement),
      received_message: message,
      evidence,
      same_time_batch_ref: boundary.same_time_batch_ref
    };
    const perceptionPayload = {
      schema: 'conversation_message_perception_v1',
      perception_id: perceptionId,
      event_ref: {
        entity_kind: 'temporal_event', entity_id: row.event_id
      },
      source_statement_ref: message.source_statement_ref,
      perceiver_ref: message.listener_ref,
      result_kind: evidence.result_kind,
      received_message: message,
      recognition_policy_ref: evidence.recognition_policy_ref,
      visibility_policy_ref: evidence.visibility_policy_ref,
      signal_refs: evidence.signal_refs,
      knowledge_update_refs: evidence.knowledge_update_refs
    };
    const inputDigest = canonicalDigest(messageInput);
    const perceptionDigest = canonicalDigest(perceptionPayload);
    const replay = {
      perception_id: perceptionId,
      party_id: partyId,
      canonical_input_digest: inputDigest,
      perception_digest: perceptionDigest,
      expected_state_versions_digest: canonicalDigest({
        party_state_version: decision.semantic_request.state_version,
        conversation_state_version: exchangeVersions.get(
          `${statement.conversation_id}\u0000${statement.exchange_id}`
        )
      }),
      dependency_pins_digest: canonicalDigest(evidence.dependency_pins),
      policy_versions_digest: canonicalDigest(evidence.policy_versions),
      idempotency_key: row.idempotency_key,
      change_set_id: statement.change_set_id
    };
    if (!timestampMatches(row, statement.spoken_at)
        || canonicalDigest(row.policy_ref)
          !== canonicalDigest(evidence.visibility_policy_ref)
        || canonicalDigest(row.recognition_policy_ref)
          !== canonicalDigest(evidence.recognition_policy_ref)
        || canonicalDigest(row.visibility_policy_ref)
          !== canonicalDigest(evidence.visibility_policy_ref)
        || canonicalDigest(row.signal_refs)
          !== canonicalDigest(evidence.signal_refs)
        || canonicalDigest(row.knowledge_update_refs) !== canonicalDigest([])
        || row.preconditions_digest !== inputDigest
        || row.canonical_input_digest !== inputDigest
        || row.perception_digest !== perceptionDigest
        || row.replay_digest !== perceptionDigest
        || row.expected_state_versions_digest
          !== replay.expected_state_versions_digest
        || row.dependency_pins_digest !== replay.dependency_pins_digest
        || row.policy_versions_digest !== replay.policy_versions_digest
        || row.replay_canonical_digest !== canonicalDigest(replay)) fail();
  }
}

export function messageEvidence({ message, statement, decision }) {
  const boundary = decision.boundary_snapshot;
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
    signal_refs: decision.signal_records.filter((signal) =>
      canonicalDigest(signal.source_perception_ref)
        === canonicalDigest(message.perception_result_ref)
    ).map(({ signal_id: signalId }) => ({
      entity_kind: 'npc_decision_signal', entity_id: signalId
    })),
    knowledge_update_refs: [],
    dependency_pins: {
      conversation_ref: {
        entity_kind: 'conversation_session',
        entity_id: statement.conversation_id
      },
      statement_ref: message.source_statement_ref,
      same_time_batch_ref: boundary.same_time_batch_ref
    },
    policy_versions: {
      audience_projection: 'conversation_audience_projection_v1',
      statement_event: 'conversation_statement_event_v1'
    }
  };
}

export function conversationExchangeVersions(decisions, sessions) {
  const byConversation = new Map();
  for (const row of decisions) {
    const id = row.semantic_request.conversation_id;
    byConversation.set(id, [...(byConversation.get(id) ?? []), row]);
  }
  const versions = new Map();
  for (const [conversationId, values] of byConversation) {
    values.sort((left, right) =>
      Number(left.semantic_request.state_version)
        - Number(right.semantic_request.state_version)
      || Number(left.working_revision) - Number(right.working_revision));
    const current = Number(sessions.get(conversationId)?.state_version);
    if (!Number.isSafeInteger(current) || current < values.length) fail();
    values.forEach((row, index) => versions.set(
      `${conversationId}\u0000${row.semantic_request.exchange_id}`,
      current - values.length + index + 1
    ));
  }
  return versions;
}
