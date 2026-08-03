import {
  buildConversationStatementEvent,
  validateNpcDecisionSignal
} from '@rus/npc-runtime';

export function validateStatements(values, request) {
  if (!Array.isArray(values) || values.length === 0) {
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
          || !(contribution.handoff === null || record(contribution.handoff))))) {
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
