import {
  buildConversationStatementEvent,
  validateNpcDecisionSignal
} from '@rus/npc-runtime';
import { validNonverbalAudience } from
  './npc-semantic-conversation-nonverbal-validation.js';

export function validateStatements(values, request) {
  if (!Array.isArray(values)) {
    fail('TRACE_M2_CONVERSATION_STATEMENTS_INVALID');
  }
  let statements;
  try {
    statements = values.map((value) =>
      buildConversationStatementEvent(structuredClone(value)));
  } catch (error) {
    fail(
      'TRACE_M2_CONVERSATION_STATEMENTS_INVALID',
      'Every semantic statement must be an exact formal event.',
      error
    );
  }
  if (new Set(statements.map(({ statement_id: id }) => id)).size
        !== statements.length
      || statements.some(({ conversation_id: conversationId,
        exchange_id: exchangeId }) =>
        conversationId !== request?.conversation_id
        || exchangeId !== request?.exchange_id)) {
    fail(
      'TRACE_M2_CONVERSATION_STATEMENTS_INVALID',
      'Semantic statements must belong to one exact exchange.'
    );
  }
  return statements;
}

export function validateAudiences(values, statements) {
  if (!Array.isArray(values) || values.length !== statements.length) {
    fail('TRACE_M2_CONVERSATION_AUDIENCES_INVALID');
  }
  const statementIds = new Set(statements.map(({ statement_id: id }) => id));
  const audienceIds = new Set();
  const audiences = structuredClone(values);
  for (const audience of audiences) {
    const statementId = audience?.statement_ref?.entity_id;
    const listeners = audience?.actual_listener_refs;
    const messages = audience?.received_messages;
    if (audience?.schema !== 'conversation_audience_projection_v1'
        || audience.statement_ref?.entity_kind !== 'conversation_statement'
        || !statementIds.has(statementId)
        || audienceIds.has(statementId)
        || !Array.isArray(listeners)
        || !Array.isArray(messages)
        || messages.length !== listeners.length
        || !Array.isArray(audience.witness_candidate_refs)) {
      fail('TRACE_M2_CONVERSATION_AUDIENCES_INVALID');
    }
    audienceIds.add(statementId);
    const listenerKeys = new Set(listeners.map(refKey));
    if (listenerKeys.size !== listeners.length
        || messages.some((message) =>
          refKey(message?.source_statement_ref)
            !== refKey(audience.statement_ref)
          || !listenerKeys.has(refKey(message?.listener_ref)))
        || new Set(messages.map(({ listener_ref: listenerRef }) =>
          refKey(listenerRef))).size !== messages.length
        || audience.witness_candidate_refs.some((candidate) =>
          !listenerKeys.has(refKey(candidate)))) {
      fail('TRACE_M2_CONVERSATION_AUDIENCES_INVALID');
    }
  }
  return audiences.sort((left, right) =>
    compareText(refKey(left.statement_ref), refKey(right.statement_ref)));
}

export function validateContributions(values, statements, request) {
  if (!Array.isArray(values) || values.length < 1) {
    fail('TRACE_M2_CONVERSATION_CONTRIBUTIONS_INVALID');
  }
  const statementsById = new Map(statements.map(
    (statement) => [statement.statement_id, statement]
  ));
  const identities = new Set();
  const contributions = structuredClone(values);
  for (const contribution of contributions) {
    const statement = contribution?.schema === 'conversation_statement_event_v1'
      ? statementsById.get(contribution.statement_id) : null;
    const nonStatement = contribution?.schema
      === 'conversation_non_statement_contribution_v1';
    const identity = statement?.statement_id ?? contribution?.contribution_id;
    if (!text(identity) || identities.has(identity)
        || contribution.conversation_id !== request?.conversation_id
        || contribution.exchange_id !== request?.exchange_id
        || (statement && canonicalJson(statement) !== canonicalJson(contribution))
        || (!statement && (!nonStatement
          || !['silence', 'leave_conversation', 'action_handoff',
            'combat_handoff'].includes(contribution.contribution_kind)
          || !text(contribution.speaker_ref?.entity_kind)
          || !text(contribution.speaker_ref?.entity_id)
          || !(contribution.handoff === null || record(contribution.handoff))
          || (contribution.contribution_kind === 'silence'
            ? !validNonverbalAudience(contribution)
            : contribution.nonverbal_audience !== null)))) {
      fail('TRACE_M2_CONVERSATION_CONTRIBUTIONS_INVALID');
    }
    identities.add(identity);
  }
  if (statements.some(({ statement_id: statementId }) =>
    !identities.has(statementId))) {
    fail('TRACE_M2_CONVERSATION_CONTRIBUTIONS_INVALID');
  }
  return contributions;
}

export function validateSignalRecords(values) {
  if (!Array.isArray(values)) fail('TRACE_M2_NPC_SIGNALS_INVALID');
  const records = structuredClone(values);
  if (records.some((record) => !record
      || Object.keys(record).length !== 2
      || !validateNpcDecisionSignal(record.signal)
      || !text(record.same_time_batch_key))) {
    fail('TRACE_M2_NPC_SIGNALS_INVALID');
  }
  return records;
}

export function validateConsumedSignalIds(values) {
  if (!Array.isArray(values)
      || values.some((value) => !text(value))
      || new Set(values).size !== values.length) {
    fail('TRACE_M2_CONSUMED_SIGNALS_INVALID');
  }
  return [...values];
}

export function validateTerminalNpcOutcomes(values) {
  if (!Array.isArray(values)) {
    fail('TRACE_M2_NPC_TERMINAL_OUTCOMES_INVALID');
  }
  const outcomes = structuredClone(values);
  const outcomeKeys = new Set();
  const signalIds = new Set();
  for (const outcome of outcomes) {
    const keys = Object.keys(outcome ?? {}).sort();
    if (keys.join('\u0000') !== [
      'npc_ref', 'outcome', 'same_time_batch_ref', 'signal_ids_to_consume'
    ].sort().join('\u0000')
        || outcome.npc_ref?.entity_kind !== 'npc'
        || !text(outcome.npc_ref?.entity_id)
        || outcome.same_time_batch_ref?.entity_kind !== 'temporal_batch'
        || !text(outcome.same_time_batch_ref?.entity_id)
        || outcome.outcome !== 'npc_unavailable'
        || !Array.isArray(outcome.signal_ids_to_consume)
        || outcome.signal_ids_to_consume.length === 0
        || outcome.signal_ids_to_consume.some((id) => !text(id))) {
      fail('TRACE_M2_NPC_TERMINAL_OUTCOMES_INVALID');
    }
    const outcomeKey = `${refKey(outcome.npc_ref)}\u0000${
      refKey(outcome.same_time_batch_ref)}`;
    if (outcomeKeys.has(outcomeKey)) {
      fail('TRACE_M2_NPC_TERMINAL_OUTCOMES_INVALID');
    }
    outcomeKeys.add(outcomeKey);
    for (const signalId of outcome.signal_ids_to_consume) {
      if (signalIds.has(signalId)) {
        fail('TRACE_M2_NPC_TERMINAL_OUTCOMES_INVALID');
      }
      signalIds.add(signalId);
    }
  }
  return outcomes;
}

export function requireBoundarySignalLineage(input) {
  const { boundary } = input;
  requireSignalLineage({ ...input, npcRef: boundary.npc_ref,
    batchRef: boundary.same_time_batch_ref,
    signalIds: boundary.signal_refs.map(({ entity_id: signalId }) => signalId) });
}

export function requireSignalLineage({ state, npcRef, batchRef, signalIds,
  signalRecords, consumedSignalIds }) {
  const available = new Map([
    ...(state.npc_decision_signals ?? []),
    ...signalRecords
  ].map((record) => [record?.signal?.signal_id, record]));
  const consumed = new Set([
    ...(state.consumed_npc_decision_signal_ids ?? []),
    ...consumedSignalIds
  ]);
  if (signalIds.some((signalId) => {
    const record = available.get(signalId);
    return !record || !consumed.has(signalId)
      || record.same_time_batch_key !== batchRef.entity_id
      || record.signal.subject_ref.entity_id !== npcRef.entity_id;
  })) {
    fail('TRACE_M2_SEMANTIC_SIGNAL_LINEAGE_INVALID',
      'The NPC outcome must consume exact persisted same-time signals.');
  }
}

export function mergeMutableById(current = [], added, idKey) {
  if (!Array.isArray(current)) fail('TRACE_M2_CONVERSATION_SNAPSHOT_INVALID');
  const byId = new Map(current.map((entry) => [entry?.[idKey], entry]));
  byId.set(added[idKey], added);
  return [...byId.values()].sort((left, right) =>
    compareText(left[idKey], right[idKey]));
}

export function mergeAppendOnly(current = [], added, identity, conflictCode) {
  if (!Array.isArray(current)) fail('TRACE_M2_CONVERSATION_SNAPSHOT_INVALID');
  const byId = new Map();
  for (const entry of [...current, ...added]) {
    const id = identity(entry);
    if (!text(id)) fail('TRACE_M2_CONVERSATION_SNAPSHOT_INVALID');
    const prior = byId.get(id);
    if (prior && canonicalJson(prior) !== canonicalJson(entry)) {
      fail(conflictCode, 'Append-only semantic conversation identity conflicts.');
    }
    if (!prior) byId.set(id, structuredClone(entry));
  }
  return [...byId.values()];
}

export function uniqueRefs(values) {
  const byKey = new Map();
  for (const value of values) {
    const key = refKey(value);
    if (!text(value?.entity_kind) || !text(value?.entity_id)) {
      fail('TRACE_M2_CONVERSATION_SESSION_INVALID');
    }
    byKey.set(key, structuredClone(value));
  }
  return [...byKey.entries()].sort(([left], [right]) =>
    compareText(left, right)).map(([, value]) => value);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

export function refKey(reference) {
  return `${reference?.entity_kind}\u0000${reference?.entity_id}`;
}

export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function requireRecord(value, code) {
  if (!record(value)) fail(code);
}

export function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}

export function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function fail(code, message = 'Semantic conversation snapshot is invalid.',
  cause = null) {
  throw Object.assign(new Error(message), {
    code,
    ...(cause === null ? {} : { cause })
  });
}
