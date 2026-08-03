import { canonicalDigest } from '@rus/materialization';
import {
  validateConversationStatementEvent,
  validateNpcConversationResponseRequest,
  validateNpcDecisionBoundary,
  validateNpcDecisionSignal
} from '@rus/npc-runtime';

const ERROR_CODE = 'NPC_SEMANTIC_CONVERSATION_PERSISTENCE_INVALID';
const CATEGORY_ORDER = Object.freeze([
  'self',
  'others',
  'environment',
  'objective',
  'communication'
]);
const ACTUAL_RESULTS = new Set([
  'perceived_unidentified',
  'perceived_partial',
  'recognized',
  'misinterpreted'
]);
const EVIDENCE_KEYS = Object.freeze([
  'source_statement_ref',
  'listener_ref',
  'perception_result_ref',
  'result_kind',
  'received_at',
  'recognition_policy_ref',
  'visibility_policy_ref',
  'signal_refs',
  'knowledge_update_refs',
  'dependency_pins',
  'policy_versions'
]);

export function fail(message) {
  throw Object.assign(new TypeError(message), { code: ERROR_CODE });
}

export function record(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

export function exactKeys(value, keys) {
  return record(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function stableId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function exactTimestamp(value) {
  if (!exactKeys(value, [
    'whole_minutes',
    'subminute_numerator',
    'subminute_denominator'
  ])) return false;
  try {
    const whole = BigInt(value.whole_minutes);
    const numerator = BigInt(value.subminute_numerator);
    const denominator = BigInt(value.subminute_denominator);
    return whole.toString() === value.whole_minutes
      && numerator.toString() === value.subminute_numerator
      && denominator.toString() === value.subminute_denominator
      && numerator >= 0n
      && denominator > 0n
      && numerator < denominator;
  } catch {
    return false;
  }
}

export function entityRef(value, kind = null) {
  return exactKeys(value, ['entity_kind', 'entity_id'])
    && stableId(value.entity_kind)
    && stableId(value.entity_id)
    && (kind === null || value.entity_kind === kind);
}

export function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

export function refKey(value) {
  return `${value.entity_kind}\u0000${value.entity_id}`;
}

export function jsonRecord(value) {
  if (!record(value)) return false;
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

export function nonEmptyJsonRecord(value) {
  return jsonRecord(value) && Object.keys(value).length > 0;
}

export function policyRef(value) {
  return nonEmptyJsonRecord(value)
    && stableId(value.entity_kind)
    && stableId(value.entity_id);
}

export function refArray(value) {
  return Array.isArray(value) && value.every((reference) => entityRef(reference));
}

export function writeArraysValid(inserts, updates, appends) {
  return [inserts, updates, appends].every(Array.isArray);
}

export function exactBoundaryLink(boundary, request) {
  return boundary.decision_mode === 'conversation'
    && boundary.boundary_id === request.boundary_id
    && sameRef(boundary.npc_ref, request.npc_ref)
    && boundary.state_version === String(request.state_version)
    && boundary.significance === request.decision_reasons.significance
    && canonicalDigest(boundary.categories)
      === canonicalDigest(request.decision_reasons.categories)
    && canonicalDigest(boundary.signal_refs)
      === canonicalDigest(request.decision_reasons.signal_refs);
}

export function orderedSignalRecords(signalRecords, boundary) {
  if (!Array.isArray(signalRecords)
      || signalRecords.length !== boundary.signal_refs.length
      || signalRecords.some((signal) => !validateNpcDecisionSignal(signal))) {
    fail('Semantic trace requires one validated signal snapshot per boundary signal ref');
  }
  const byId = new Map();
  for (const signal of signalRecords) {
    if (byId.has(signal.signal_id)
        || !sameRef(signal.subject_ref, boundary.npc_ref)) {
      fail('Semantic signal snapshots must have unique identity and the boundary NPC subject');
    }
    byId.set(signal.signal_id, signal);
  }
  const ordered = boundary.signal_refs.map(({ entity_id: signalId }) =>
    byId.get(signalId));
  if (ordered.some((signal) => signal === undefined)
      || ordered.some((signal) => canonicalDigest(signal.occurred_at)
        !== canonicalDigest(boundary.scheduled_at))) {
    fail('Semantic signal snapshots must exactly cover the same-time boundary');
  }
  const categories = CATEGORY_ORDER.filter((category) =>
    ordered.some((signal) => signal.category === category));
  const significance = ordered.some(({ significance: value }) =>
    value === 'critical') ? 'critical' : 'material';
  if (canonicalDigest(categories) !== canonicalDigest(boundary.categories)
      || significance !== boundary.significance) {
    fail('Semantic boundary categories and aggregate significance must derive from its signals');
  }
  return ordered;
}

export function statementIndex(statements, conversationId) {
  if (!Array.isArray(statements) || statements.length === 0) {
    fail('Conversation persistence requires at least one immutable statement');
  }
  const byId = new Map();
  for (const statement of statements) {
    if (!validateConversationStatementEvent(statement)
        || statement.conversation_id !== conversationId
        || byId.has(statement.statement_id)) {
      fail('Conversation statements must be unique validated events for the session');
    }
    byId.set(statement.statement_id, statement);
  }
  return byId;
}

export function actualMessages(audiences, statementsById) {
  if (!Array.isArray(audiences) || audiences.length !== statementsById.size) {
    fail('Every persisted conversation statement requires one audience projection');
  }
  const messages = [];
  const audienceStatements = new Set();
  for (const audience of audiences) {
    if (!exactKeys(audience, [
      'schema',
      'statement_ref',
      'actual_listener_refs',
      'received_messages',
      'witness_candidate_refs'
    ])
        || audience.schema !== 'conversation_audience_projection_v1'
        || !entityRef(audience.statement_ref, 'conversation_statement')
        || !refArray(audience.actual_listener_refs)
        || !refArray(audience.witness_candidate_refs)
        || !Array.isArray(audience.received_messages)
        || audienceStatements.has(audience.statement_ref.entity_id)
        || !statementsById.has(audience.statement_ref.entity_id)) {
      fail('Conversation audience projection is not exact or is detached from its statement');
    }
    audienceStatements.add(audience.statement_ref.entity_id);
    const listeners = audience.actual_listener_refs.map(refKey);
    const receivedListeners = audience.received_messages.map(({ listener_ref: ref }) =>
      refKey(ref ?? {}));
    if (new Set(listeners).size !== listeners.length
        || new Set(receivedListeners).size !== receivedListeners.length
        || canonicalDigest(listeners) !== canonicalDigest(receivedListeners)) {
      fail('Only actual listeners may have received-message records');
    }
    for (const message of audience.received_messages) {
      if (!exactKeys(message, [
        'source_statement_ref',
        'listener_ref',
        'perception_result_ref',
        'perception_result',
        'perceived_at',
        'same_time_batch_ref',
        'comprehension',
        'speaker_ref',
        'utterance_text',
        'claims',
        'delivery_cues'
      ])
          || !entityRef(message.source_statement_ref, 'conversation_statement')
          || !sameRef(message.source_statement_ref, audience.statement_ref)
          || !['npc', 'player_character'].includes(
            message.listener_ref?.entity_kind
          )
          || !entityRef(message.listener_ref)
          || !entityRef(message.perception_result_ref, 'perception_result')
          || !entityRef(message.same_time_batch_ref, 'temporal_batch')
          || !record(message.perceived_at)
          || !ACTUAL_RESULTS.has(message.perception_result)
          || !['full', 'partial'].includes(message.comprehension)
          || !(message.speaker_ref === null || entityRef(message.speaker_ref))
          || !(message.utterance_text === null
            || typeof message.utterance_text === 'string')
          || !Array.isArray(message.claims)
          || !Array.isArray(message.delivery_cues)) {
        fail('Actual received message lacks exact statement, listener, or perception identity');
      }
      messages.push(message);
    }
  }
  return messages;
}

export function evidenceIndex(actualMessageEvidence, messages) {
  if (!Array.isArray(actualMessageEvidence)
      || actualMessageEvidence.length !== messages.length) {
    fail('Each actual received message requires exactly one replay evidence record');
  }
  const byPerceptionId = new Map();
  for (const evidence of actualMessageEvidence) {
    if (!exactKeys(evidence, EVIDENCE_KEYS)
        || !entityRef(evidence.source_statement_ref, 'conversation_statement')
        || !['npc', 'player_character'].includes(
          evidence.listener_ref?.entity_kind
        )
        || !entityRef(evidence.listener_ref)
        || !entityRef(evidence.perception_result_ref, 'perception_result')
        || !ACTUAL_RESULTS.has(evidence.result_kind)
        || !exactTimestamp(evidence.received_at)
        || !policyRef(evidence.recognition_policy_ref)
        || !policyRef(evidence.visibility_policy_ref)
        || !refArray(evidence.signal_refs)
        || !refArray(evidence.knowledge_update_refs)
        || !nonEmptyJsonRecord(evidence.dependency_pins)
        || !nonEmptyJsonRecord(evidence.policy_versions)
        || byPerceptionId.has(evidence.perception_result_ref.entity_id)) {
      fail('Actual received-message evidence is incomplete, duplicate, or not formal');
    }
    byPerceptionId.set(evidence.perception_result_ref.entity_id, evidence);
  }
  for (const message of messages) {
    const evidence = byPerceptionId.get(message.perception_result_ref.entity_id);
    if (!evidence
        || !sameRef(evidence.source_statement_ref, message.source_statement_ref)
        || !sameRef(evidence.listener_ref, message.listener_ref)) {
      fail('Actual received-message evidence does not match its audience message');
    }
  }
  return byPerceptionId;
}
