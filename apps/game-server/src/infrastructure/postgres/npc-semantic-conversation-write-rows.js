import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import {
  actualMessages,
  evidenceIndex,
  fail,
  refKey
} from './npc-semantic-conversation-write-validation.js';

export function sessionRecord(session, partyId, changeSetId) {
  return {
    conversation_id: session.conversation_id,
    party_id: partyId,
    state_version: session.state_version,
    status: session.status,
    started_at: session.started_at,
    location_ref: session.location_ref,
    initiator_ref: session.initiator_ref,
    active_participant_refs: session.active_participant_refs,
    last_contribution_ref: session.last_contribution_ref,
    topic_refs: session.topic_refs,
    status_reason: session.status_reason,
    updated_change_set_id: changeSetId,
    canonical_digest: canonicalDigest(session),
    session_schema: session.schema
  };
}

export function appendStatementWrites(
  appends,
  statements,
  audiences,
  partyId,
  changeSetId
) {
  const audienceByStatementId = new Map(audiences.map((audience) => [
    audience.statement_ref.entity_id,
    audience
  ]));
  for (const statement of statements) {
    const audience = audienceByStatementId.get(statement.statement_id);
    if (audience === undefined) {
      fail('Every persisted statement requires its exact audience projection');
    }
    appends.push(row('party_conversation_statements', statement.statement_id, {
      statement_id: statement.statement_id,
      party_id: partyId,
      conversation_id: statement.conversation_id,
      exchange_id: statement.exchange_id,
      speaker_ref: statement.speaker_ref,
      intended_addressee_refs: statement.intended_addressee_refs,
      utterance_text: statement.utterance_text,
      dominant_act: statement.dominant_act,
      interaction_tags: statement.interaction_tags,
      topic_refs: statement.topic_refs,
      claims: statement.claims,
      message_completeness: statement.message_completeness,
      spoken_at: statement.spoken_at,
      duration: statement.duration,
      social_delivery_result: statement.social_delivery_result,
      source_plan_ref: statement.source_plan_ref,
      audience_projection: audience,
      audience_digest: canonicalDigest(audience),
      change_set_id: changeSetId,
      statement_schema: statement.schema,
      idempotency_key: `conversation-statement:${statement.statement_id}`,
      canonical_digest: canonicalDigest(statement)
    }));
  }
}
export function appendMessageWrites({
  inserts,
  appends,
  messages,
  evidenceByPerceptionId,
  statementsById,
  partyId,
  changeSetId,
  idempotencyRecordId,
  stateVersion,
  conversationStateVersion,
  sameTimeBatchRef
}) {
  for (const message of messages) {
    const perceptionId = message.perception_result_ref.entity_id;
    const evidence = evidenceByPerceptionId.get(perceptionId);
    const statement = statementsById.get(message.source_statement_ref.entity_id);
    const eventId = `conversation-message-event:${perceptionId}`;
    const idempotencyKey = `${idempotencyRecordId}:conversation-message:${perceptionId}`;
    const messageInput = {
      schema: 'conversation_received_message_persistence_input_v1',
      statement,
      received_message: message,
      evidence,
      same_time_batch_ref: sameTimeBatchRef
    };
    inserts.push(row('party_temporal_events', eventId, {
      event_id: eventId,
      party_id: partyId,
      event_kind: 'conversation_message_received',
      status: 'resolved',
      scheduled_at_whole_minutes: evidence.received_at.whole_minutes,
      scheduled_at_subminute_numerator: evidence.received_at.subminute_numerator,
      scheduled_at_subminute_denominator: evidence.received_at.subminute_denominator,
      rule_ref: message.source_statement_ref,
      policy_ref: evidence.visibility_policy_ref,
      preconditions_digest: canonicalDigest(messageInput),
      idempotency_key: idempotencyKey,
      change_set_id: changeSetId,
      terminal_change_set_id: changeSetId,
      state_version: 2
    }));
    const perceptionPayload = {
      schema: 'conversation_message_perception_v1',
      perception_id: perceptionId,
      event_ref: { entity_kind: 'temporal_event', entity_id: eventId },
      source_statement_ref: message.source_statement_ref,
      perceiver_ref: message.listener_ref,
      result_kind: evidence.result_kind,
      received_message: message,
      recognition_policy_ref: evidence.recognition_policy_ref,
      visibility_policy_ref: evidence.visibility_policy_ref,
      signal_refs: evidence.signal_refs,
      knowledge_update_refs: evidence.knowledge_update_refs
    };
    const perceptionDigest = canonicalDigest(perceptionPayload);
    appends.push(row('party_perception_records', perceptionId, {
      perception_id: perceptionId,
      party_id: partyId,
      event_id: eventId,
      perceiver_kind: message.listener_ref.entity_kind,
      perceiver_id: message.listener_ref.entity_id,
      result_kind: evidence.result_kind,
      perceived_at_whole_minutes: evidence.received_at.whole_minutes,
      perceived_at_subminute_numerator: evidence.received_at.subminute_numerator,
      perceived_at_subminute_denominator: evidence.received_at.subminute_denominator,
      recognition_policy_ref: evidence.recognition_policy_ref,
      visibility_policy_ref: evidence.visibility_policy_ref,
      canonical_digest: perceptionDigest,
      signal_refs: evidence.signal_refs,
      knowledge_update_refs: evidence.knowledge_update_refs,
      change_set_id: changeSetId,
      idempotency_record_id: idempotencyKey
    }));
    appends.push(row(
      'party_perception_witnesses',
      `${perceptionId}:${message.listener_ref.entity_kind}:${message.listener_ref.entity_id}`,
      {
        perception_id: perceptionId,
        witness_kind: message.listener_ref.entity_kind,
        witness_id: message.listener_ref.entity_id
      }
    ));
    const replay = {
      perception_id: perceptionId,
      party_id: partyId,
      canonical_input_digest: canonicalDigest(messageInput),
      perception_digest: perceptionDigest,
      expected_state_versions_digest: canonicalDigest({
        party_state_version: stateVersion,
        conversation_state_version: conversationStateVersion
      }),
      dependency_pins_digest: canonicalDigest(evidence.dependency_pins),
      policy_versions_digest: canonicalDigest(evidence.policy_versions),
      idempotency_key: idempotencyKey,
      change_set_id: changeSetId
    };
    appends.push(row('party_perception_replay_evidence', perceptionId, {
      ...replay,
      canonical_digest: canonicalDigest(replay)
    }));
  }
}
