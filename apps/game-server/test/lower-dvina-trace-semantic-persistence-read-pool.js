
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  buildConversationSession,
  buildConversationStatementEvent,
  buildNpcConversationResponseRequest,
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal,
  buildNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import {
  assertLowerDvinaTraceSemanticConversationRows
} from '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import {
  assertPhase4NormalizedRows
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-read.js';

const PARTY_ID = 'party-semantic-persistence';
const CHANGE_SET_ID = 'change:' + PARTY_ID + ':semantic';
const ROOT_TURN_ID = 'turn:' + PARTY_ID + ':semantic';
const AT = Object.freeze({
  whole_minutes: '120',
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });


import {
  byId,
  byParent,
  result,
  rows
} from './lower-dvina-trace-semantic-persistence-pool.js';

export function semanticReadPool(writes) {
  const sessions = rows(writes.updates, 'party_conversation_sessions')
    .map(({ record }) => structuredClone(record))
    .sort((left, right) =>
      left.conversation_id.localeCompare(right.conversation_id));
  const statements = rows(writes.appends, 'party_conversation_statements')
    .map(({ record }) => structuredClone(record))
    .sort((left, right) => left.statement_id.localeCompare(right.statement_id));
  const decisions = rows(writes.appends, 'party_npc_decision_traces')
    .map(({ record }) => structuredClone(record))
    .sort((left, right) => left.request_id.localeCompare(right.request_id));
  const events = byId(writes.inserts, 'party_temporal_events');
  const perceptions = byId(writes.appends, 'party_perception_records');
  const witnesses = byParent(
    writes.appends,
    'party_perception_witnesses',
    'perception_id'
  );
  const replay = byId(
    writes.appends,
    'party_perception_replay_evidence'
  );
  const messages = [...perceptions.values()].map(({ record }) => {
    const event = events.get(record.event_id).record;
    const witness = witnesses.get(record.perception_id).record;
    const evidence = replay.get(record.perception_id).record;
    return {
      ...structuredClone(record),
      perceived_at_whole_minutes: String(record.perceived_at_whole_minutes),
      perceived_at_subminute_numerator:
        String(record.perceived_at_subminute_numerator),
      perceived_at_subminute_denominator:
        String(record.perceived_at_subminute_denominator),
      perception_digest: record.canonical_digest,
      event_kind: event.event_kind,
      event_status: event.status,
      scheduled_at_whole_minutes: String(event.scheduled_at_whole_minutes),
      scheduled_at_subminute_numerator:
        String(event.scheduled_at_subminute_numerator),
      scheduled_at_subminute_denominator:
        String(event.scheduled_at_subminute_denominator),
      rule_ref: event.rule_ref,
      policy_ref: event.policy_ref,
      preconditions_digest: event.preconditions_digest,
      idempotency_key: event.idempotency_key,
      event_change_set_id: event.change_set_id,
      terminal_change_set_id: event.terminal_change_set_id,
      event_version: String(event.state_version),
      witness_kind: witness.witness_kind,
      witness_id: witness.witness_id,
      canonical_input_digest: evidence.canonical_input_digest,
      replay_digest: evidence.perception_digest,
      expected_state_versions_digest:
        evidence.expected_state_versions_digest,
      dependency_pins_digest: evidence.dependency_pins_digest,
      policy_versions_digest: evidence.policy_versions_digest,
      replay_idempotency_key: evidence.idempotency_key,
      replay_canonical_digest: evidence.canonical_digest,
      replay_change_set_id: evidence.change_set_id
    };
  }).sort((left, right) =>
    left.perception_id.localeCompare(right.perception_id));
  return {
    async query(sql) {
      if (sql.includes('party_conversation_sessions')) return result(sessions);
      if (sql.includes('party_conversation_statements')) {
        return result(statements);
      }
      if (sql.includes('party_npc_decision_traces')) return result(decisions);
      if (sql.includes("e.event_kind='conversation_message_received'")) {
        return result(messages);
      }
      throw new Error('Unexpected semantic read query: ' + sql);
    }
  };
}
