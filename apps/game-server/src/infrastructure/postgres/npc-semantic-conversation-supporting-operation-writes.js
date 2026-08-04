import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';

export function appendSupportingOperationPerceptionWrites({
  inserts,
  appends,
  evidence,
  partyId,
  changeSetId,
  idempotencyRecordId,
  stateVersion,
  conversationStateVersion
}) {
  for (const entry of evidence) {
    const perception = entry.perception;
    const perceptionId = perception.perception_id;
    const eventId = perception.source_event_ref.entity_id;
    const idempotencyKey =
      `${idempotencyRecordId}:supporting-operation:${perceptionId}`;
    const input = {
      schema: 'conversation_supporting_operation_perception_input_v1',
      perception,
      signal_refs: entry.signal_refs
    };
    inserts.push(row('party_temporal_events', eventId, {
      event_id: eventId,
      party_id: partyId,
      event_kind: 'conversation_supporting_operation',
      status: 'resolved',
      scheduled_at_whole_minutes: perception.occurred_at.whole_minutes,
      scheduled_at_subminute_numerator:
        perception.occurred_at.subminute_numerator,
      scheduled_at_subminute_denominator:
        perception.occurred_at.subminute_denominator,
      rule_ref: perception.source_event_ref,
      policy_ref: {
        entity_kind: 'contract_schema',
        entity_id: 'conversation_supporting_operation_perception_v1'
      },
      preconditions_digest: canonicalDigest(input),
      idempotency_key: idempotencyKey,
      change_set_id: changeSetId,
      terminal_change_set_id: changeSetId,
      state_version: 2
    }));
    const payload = { ...perception, signal_refs: entry.signal_refs };
    const perceptionDigest = canonicalDigest(payload);
    appends.push(row('party_perception_records', perceptionId, {
      perception_id: perceptionId,
      party_id: partyId,
      event_id: eventId,
      perceiver_kind: perception.observer_ref.entity_kind,
      perceiver_id: perception.observer_ref.entity_id,
      result_kind: perception.result_kind,
      perceived_at_whole_minutes: perception.occurred_at.whole_minutes,
      perceived_at_subminute_numerator:
        perception.occurred_at.subminute_numerator,
      perceived_at_subminute_denominator:
        perception.occurred_at.subminute_denominator,
      recognition_policy_ref: {
        entity_kind: 'contract_schema',
        entity_id: 'conversation_supporting_operation_perception_v1'
      },
      visibility_policy_ref: {
        entity_kind: 'contract_schema',
        entity_id: 'conversation_supporting_operation_visual_v1'
      },
      canonical_digest: perceptionDigest,
      signal_refs: entry.signal_refs,
      knowledge_update_refs: [],
      change_set_id: changeSetId,
      idempotency_record_id: idempotencyKey
    }));
    if (perception.result_kind !== 'not_perceived') {
      appends.push(row(
        'party_perception_witnesses',
        `${perceptionId}:npc:${perception.observer_ref.entity_id}`,
        {
          perception_id: perceptionId,
          witness_kind: 'npc',
          witness_id: perception.observer_ref.entity_id
        }
      ));
    }
    const replay = {
      perception_id: perceptionId,
      party_id: partyId,
      canonical_input_digest: canonicalDigest(input),
      perception_digest: perceptionDigest,
      expected_state_versions_digest: canonicalDigest({
        party_state_version: stateVersion,
        conversation_state_version: conversationStateVersion
      }),
      dependency_pins_digest: canonicalDigest({
        source_event_ref: perception.source_event_ref,
        subject_ref: perception.subject_ref
      }),
      policy_versions_digest: canonicalDigest({
        perception: 'conversation_supporting_operation_perception_v1',
        visual: 'conversation_supporting_operation_visual_v1'
      }),
      idempotency_key: idempotencyKey,
      change_set_id: changeSetId
    };
    appends.push(row('party_perception_replay_evidence', perceptionId, {
      ...replay,
      canonical_digest: canonicalDigest(replay)
    }));
  }
}
