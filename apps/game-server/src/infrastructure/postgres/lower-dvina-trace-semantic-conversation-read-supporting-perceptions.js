import { canonicalDigest } from '@rus/materialization';
import {
  fail,
  timestampMatches
} from './lower-dvina-trace-semantic-conversation-read-shared.js';

export function assertSupportingOperationPerceptions({
  payload,
  rows,
  contributions
}) {
  const expected = payload.supporting_operation_perceptions ?? [];
  const expectedById = new Map(expected.map((perception) => [
    perception.perception_id,
    perception
  ]));
  if (rows.length !== expected.length
      || expectedById.size !== expected.length) fail();
  for (const row of rows) {
    const perception = expectedById.get(row.perception_id);
    const contribution = contributions.find((candidate) =>
      candidate.conversation_id === perception?.conversation_id
        && candidate.exchange_id === perception?.exchange_id);
    const signalRefs = (payload.npc_decision_signals ?? [])
      .map(({ signal }) => signal)
      .filter(({ source_perception_ref: source }) =>
        source?.entity_kind === 'perception_result'
          && source.entity_id === row.perception_id)
      .map(({ signal_id: signalId }) => ({
        entity_kind: 'npc_decision_signal',
        entity_id: signalId
      }));
    const input = {
      schema: 'conversation_supporting_operation_perception_input_v1',
      perception,
      signal_refs: signalRefs
    };
    const perceptionPayload = { ...perception, signal_refs: signalRefs };
    const perceptionDigest = canonicalDigest(perceptionPayload);
    const expectedWitness = perception?.result_kind === 'not_perceived'
      ? null : perception?.observer_ref;
    if (!perception || !contribution
        || row.event_id !== perception.source_event_ref.entity_id
        || row.event_kind !== 'conversation_supporting_operation'
        || row.event_status !== 'resolved'
        || row.event_version !== '2'
        || row.perceiver_kind !== perception.observer_ref.entity_kind
        || row.perceiver_id !== perception.observer_ref.entity_id
        || row.result_kind !== perception.result_kind
        || !timestampMatches(row, perception.occurred_at)
        || canonicalDigest(row.rule_ref)
          !== canonicalDigest(perception.source_event_ref)
        || canonicalDigest(row.policy_ref) !== canonicalDigest({
          entity_kind: 'contract_schema',
          entity_id: 'conversation_supporting_operation_perception_v1'
        })
        || row.preconditions_digest !== canonicalDigest(input)
        || row.event_change_set_id !== row.change_set_id
        || row.terminal_change_set_id !== row.change_set_id
        || row.idempotency_key !== row.idempotency_record_id
        || row.perception_digest !== perceptionDigest
        || canonicalDigest(row.signal_refs) !== canonicalDigest(signalRefs)
        || canonicalDigest(row.knowledge_update_refs)
          !== canonicalDigest([])
        || row.witness_kind !== (expectedWitness?.entity_kind ?? null)
        || row.witness_id !== (expectedWitness?.entity_id ?? null)
        || row.canonical_input_digest !== canonicalDigest(input)
        || row.replay_digest !== perceptionDigest
        || row.expected_state_versions_digest !== canonicalDigest({
          party_state_version: Number(contribution.party_state_version),
          conversation_state_version:
            Number(contribution.session_state_version)
        })
        || row.dependency_pins_digest !== canonicalDigest({
          source_event_ref: perception.source_event_ref,
          subject_ref: perception.subject_ref
        })
        || row.policy_versions_digest !== canonicalDigest({
          perception: 'conversation_supporting_operation_perception_v1',
          visual: 'conversation_supporting_operation_visual_v1'
        })
        || row.replay_idempotency_key !== row.idempotency_key
        || row.replay_change_set_id !== row.change_set_id) fail();
    const replay = {
      perception_id: perception.perception_id,
      party_id: payload.party_id,
      canonical_input_digest: canonicalDigest(input),
      perception_digest: perceptionDigest,
      expected_state_versions_digest: row.expected_state_versions_digest,
      dependency_pins_digest: row.dependency_pins_digest,
      policy_versions_digest: row.policy_versions_digest,
      idempotency_key: row.idempotency_key,
      change_set_id: row.change_set_id
    };
    if (row.replay_canonical_digest !== canonicalDigest(replay)) fail();
  }
}
