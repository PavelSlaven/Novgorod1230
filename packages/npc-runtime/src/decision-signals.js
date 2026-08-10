import { compareGameTimestamp } from '@rus/time-events-history';
import {
  digest,
  exactKeys,
  freeze,
  normalizeTimestamp,
  positiveDecimal,
  refKey,
  sameRef,
  stableId
} from './internal.js';

const CATEGORIES = Object.freeze([
  'self',
  'others',
  'environment',
  'objective',
  'communication'
]);
const CATEGORY_SET = new Set(CATEGORIES);
const SIGNIFICANCE = new Set(['material', 'critical']);
const DECISION_MODES = new Set(['autonomous', 'conversation', 'combat']);
const TIMESTAMP_KEYS = Object.freeze([
  'whole_minutes',
  'subminute_numerator',
  'subminute_denominator'
]);
const SIGNAL_KEYS = Object.freeze([
  'schema',
  'signal_id',
  'occurred_at',
  'category',
  'significance',
  'source_event_ref',
  'subject_ref',
  'scope_refs',
  'perception_required',
  'source_perception_ref',
  'causal_parent_refs',
  'idempotency_key'
]);
const BOUNDARY_KEYS = Object.freeze([
  'schema',
  'boundary_id',
  'decision_mode',
  'scheduled_at',
  'npc_ref',
  'same_time_batch_ref',
  'significance',
  'categories',
  'signal_refs',
  'state_version',
  'resolution_class',
  'idempotency_key'
]);
const EVALUATION_KEYS = Object.freeze([
  'npc_ref',
  'active_mode',
  'current_intent',
  'decision_capability',
  'resolved_signals',
  'consumed_signal_ids',
  'same_time_batch_ref',
  'state_version'
]);

function invalid(code, message) {
  throw Object.assign(new TypeError(message), { code });
}

function exactEntityRef(value, expectedKind = null) {
  return exactKeys(value, ['entity_kind', 'entity_id'])
    && stableId(value.entity_kind)
    && stableId(value.entity_id)
    && (expectedKind === null || value.entity_kind === expectedKind);
}

function exactTimestamp(value) {
  if (!exactKeys(value, TIMESTAMP_KEYS)) return false;
  const normalized = normalizeTimestamp(value);
  return normalized !== null
    && TIMESTAMP_KEYS.every((key) => value[key] === normalized[key]);
}

function uniqueRefs(values, expectedKind = null) {
  return Array.isArray(values)
    && values.every((value) => exactEntityRef(value, expectedKind))
    && new Set(values.map(refKey)).size === values.length;
}

function signalIdentity(sourceEventRef, subjectRef, category) {
  return `decision-signal:${sourceEventRef.entity_kind}:${
    sourceEventRef.entity_id}:${subjectRef.entity_id}:${category}`;
}

function boundaryIdentity(decisionMode, batchRef, npcRef,
  decisionContextId = null) {
  const identityMode = decisionMode === 'combat'
    ? decisionContextId : decisionMode;
  return `npc-decision:${identityMode}:${batchRef.entity_id}:${
    npcRef.entity_id}`;
}

function historicalBoundaryIdentity(batchRef, npcRef) {
  return `npc-decision:${batchRef.entity_id}:${
    npcRef.entity_id}`;
}

function currentBoundaryIdentityMatches(value) {
  if (value.decision_mode !== 'combat') {
    return value.boundary_id === boundaryIdentity(
      value.decision_mode,
      value.same_time_batch_ref,
      value.npc_ref
    );
  }
  const suffix = `:${value.same_time_batch_ref.entity_id}:${
    value.npc_ref.entity_id}`;
  const contextId = value.boundary_id.startsWith('npc-decision:')
    && value.boundary_id.endsWith(suffix)
    ? value.boundary_id.slice('npc-decision:'.length, -suffix.length)
    : null;
  return typeof contextId === 'string' && /^combat-[A-Za-z0-9._-]+$/u.test(contextId);
}

function canonicalCategories(categories) {
  const present = new Set(categories);
  return CATEGORIES.filter((category) => present.has(category));
}

function compareRefs(left, right) {
  const leftKey = refKey(left);
  const rightKey = refKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function refsAreCanonical(values) {
  return values.every((value, index) => index === 0
    || compareRefs(values[index - 1], value) < 0);
}

function canonicalRefs(values) {
  return Array.isArray(values)
    && values.every((value) => exactEntityRef(value, 'npc_decision_signal'))
    ? [...values].sort(compareRefs)
    : values;
}

function jsonSafe(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((entry) => jsonSafe(entry, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  if (Reflect.ownKeys(value).length !== Object.keys(value).length) return false;
  return Object.entries(value).every(([key, entry]) => stableId(key) && jsonSafe(entry, seen));
}

function jsonSafeRecord(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && jsonSafe(value);
}

function sameTimestamp(left, right) {
  return TIMESTAMP_KEYS.every((key) => left[key] === right[key]);
}

export function validateNpcDecisionSignal(value) {
  if (!exactKeys(value, SIGNAL_KEYS)
    || value.schema !== 'npc_decision_signal_v1'
    || !stableId(value.signal_id)
    || !exactTimestamp(value.occurred_at)
    || !CATEGORY_SET.has(value.category)
    || !SIGNIFICANCE.has(value.significance)
    || !exactEntityRef(value.source_event_ref)
    || !exactEntityRef(value.subject_ref, 'npc')
    || !uniqueRefs(value.scope_refs)
    || typeof value.perception_required !== 'boolean'
    || !uniqueRefs(value.causal_parent_refs)
    || !stableId(value.idempotency_key)) {
    return false;
  }
  const identity = signalIdentity(
    value.source_event_ref,
    value.subject_ref,
    value.category
  );
  if (value.signal_id !== identity
      || value.idempotency_key !== value.signal_id) return false;
  return value.perception_required
    ? exactEntityRef(value.source_perception_ref, 'perception_result')
    : value.source_perception_ref === null;
}

export function buildNpcDecisionSignal({
  occurred_at,
  category,
  significance,
  source_event_ref,
  subject_ref,
  scope_refs = [],
  perception_required,
  source_perception_ref = null,
  causal_parent_refs = []
} = {}) {
  const identity = source_event_ref && subject_ref
    ? signalIdentity(source_event_ref, subject_ref, category)
    : null;
  const signal = {
    schema: 'npc_decision_signal_v1',
    signal_id: identity,
    occurred_at,
    category,
    significance,
    source_event_ref,
    subject_ref,
    scope_refs,
    perception_required,
    source_perception_ref,
    causal_parent_refs,
    idempotency_key: identity
  };
  if (!validateNpcDecisionSignal(signal)) {
    invalid('NPC_DECISION_SIGNAL_INVALID', 'NPC decision signal input is not formal');
  }
  return freeze(signal);
}

export function validateNpcDecisionBoundary(value) {
  if (!exactKeys(value, BOUNDARY_KEYS)
    || value.schema !== 'npc_decision_boundary_v1'
    || !stableId(value.boundary_id)
    || !DECISION_MODES.has(value.decision_mode)
    || !exactTimestamp(value.scheduled_at)
    || !exactEntityRef(value.npc_ref, 'npc')
    || !exactEntityRef(value.same_time_batch_ref, 'temporal_batch')
    || !SIGNIFICANCE.has(value.significance)
    || !Array.isArray(value.categories)
    || value.categories.length === 0
    || value.categories.some((category) => !CATEGORY_SET.has(category))
    || canonicalCategories(value.categories).join('\u0000') !== value.categories.join('\u0000')
    || !uniqueRefs(value.signal_refs, 'npc_decision_signal')
    || value.signal_refs.length === 0
    || !refsAreCanonical(value.signal_refs)
    || !positiveDecimal(value.state_version)
    || value.resolution_class !== 'reaction_decision'
    || !stableId(value.idempotency_key)) {
    return false;
  }
  const historicalIdentity = historicalBoundaryIdentity(
    value.same_time_batch_ref,
    value.npc_ref
  );
  return (currentBoundaryIdentityMatches(value)
      || value.boundary_id === historicalIdentity)
    && value.idempotency_key === value.boundary_id;
}

function createNpcDecisionBoundary({
  decision_mode,
  scheduled_at,
  npc_ref,
  same_time_batch_ref,
  significance,
  categories,
  signal_refs,
  state_version
}, identity) {
  const boundary = {
    schema: 'npc_decision_boundary_v1',
    boundary_id: identity,
    decision_mode,
    scheduled_at,
    npc_ref,
    same_time_batch_ref,
    significance,
    categories: canonicalCategories(categories),
    signal_refs: canonicalRefs(signal_refs),
    state_version,
    resolution_class: 'reaction_decision',
    idempotency_key: identity
  };
  if (!validateNpcDecisionBoundary(boundary)) {
    invalid('NPC_DECISION_BOUNDARY_INVALID', 'NPC decision boundary input is not formal');
  }
  return freeze(boundary);
}

export function buildNpcDecisionBoundary({
  decision_mode,
  decision_context_id = null,
  scheduled_at,
  npc_ref,
  same_time_batch_ref,
  significance,
  categories,
  signal_refs,
  state_version
} = {}) {
  if (!Array.isArray(categories)
    || categories.some((category) => !CATEGORY_SET.has(category))
    || (decision_mode === 'combat'
      && !(typeof decision_context_id === 'string'
        && /^combat-[A-Za-z0-9._-]+$/u.test(decision_context_id)))) {
    invalid('NPC_DECISION_BOUNDARY_INVALID', 'NPC decision boundary categories are not formal');
  }
  const identity = decision_mode && same_time_batch_ref && npc_ref
    ? boundaryIdentity(
      decision_mode,
      same_time_batch_ref,
      npc_ref,
      decision_context_id
    )
    : null;
  return createNpcDecisionBoundary({
    decision_mode,
    scheduled_at,
    npc_ref,
    same_time_batch_ref,
    significance,
    categories: canonicalCategories(categories),
    signal_refs: canonicalRefs(signal_refs),
    state_version
  }, identity);
}

export function orderNpcDecisionBoundaries(boundaries) {
  if (!Array.isArray(boundaries)
      || boundaries.some((boundary) => !validateNpcDecisionBoundary(boundary))
      || new Set(boundaries.map(({ boundary_id: id }) => id)).size
        !== boundaries.length) {
    throw new TypeError(
      'NPC decision boundaries must be a unique formal boundary array'
    );
  }
  return freeze([...boundaries].sort((left, right) =>
    compareGameTimestamp(left.scheduled_at, right.scheduled_at)
      || refKey(left.npc_ref).localeCompare(refKey(right.npc_ref), 'en')
      || left.boundary_id.localeCompare(right.boundary_id, 'en')));
}

export function evaluateNpcDecisionSignals(input = {}) {
  const hasPersistedBoundary = Object.hasOwn(input, 'persisted_boundary_id');
  if (!exactKeys(input, hasPersistedBoundary
    ? [...EVALUATION_KEYS, 'persisted_boundary_id'] : EVALUATION_KEYS)
    || !exactEntityRef(input.npc_ref, 'npc')
    || !DECISION_MODES.has(input.active_mode)
    || !(input.current_intent === null || jsonSafeRecord(input.current_intent))
    || typeof input.decision_capability !== 'boolean'
    || !Array.isArray(input.resolved_signals)
    || input.resolved_signals.some((signal) => !validateNpcDecisionSignal(signal))
    || !Array.isArray(input.consumed_signal_ids)
    || input.consumed_signal_ids.some((signalId) => !stableId(signalId))
    || (hasPersistedBoundary
      && !(input.persisted_boundary_id === null
        || stableId(input.persisted_boundary_id)))
    || !exactEntityRef(input.same_time_batch_ref, 'temporal_batch')
    || !positiveDecimal(input.state_version)) {
    invalid('NPC_DECISION_EVALUATION_INVALID', 'NPC decision signal evaluation input is not formal');
  }

  const consumed = new Set(input.consumed_signal_ids);
  const byId = new Map();
  for (const signal of input.resolved_signals) {
    if (!sameRef(signal.subject_ref, input.npc_ref)) continue;
    const previous = byId.get(signal.signal_id);
    if (previous && digest(previous) !== digest(signal)) {
      invalid('NPC_DECISION_EVALUATION_INVALID', 'Duplicate signal identity has conflicting content');
    }
    if (!previous) byId.set(signal.signal_id, signal);
  }
  const allSignals = [...byId.values()].sort((left, right) => {
    if (left.signal_id < right.signal_id) return -1;
    if (left.signal_id > right.signal_id) return 1;
    return 0;
  });
  const expectedBoundaryId = boundaryIdentity(
    input.active_mode,
    input.same_time_batch_ref,
    input.npc_ref,
    input.active_mode === 'combat' ? input.current_intent?.combat_id : null
  );
  const historicalBoundaryId = historicalBoundaryIdentity(
    input.same_time_batch_ref,
    input.npc_ref
  );
  const replaying = input.persisted_boundary_id != null;
  if (replaying && (![expectedBoundaryId, historicalBoundaryId]
    .includes(input.persisted_boundary_id)
      || allSignals.some((signal) => !consumed.has(signal.signal_id)))) {
    invalid('NPC_DECISION_EVALUATION_INVALID',
      'Persisted boundary does not match the fully consumed signal batch');
  }
  const signals = replaying
    ? allSignals
    : allSignals.filter((signal) => !consumed.has(signal.signal_id));
  if (!input.decision_capability || signals.length === 0) {
    return freeze({ boundary: null, consumed_signal_ids: [] });
  }

  const scheduledAt = signals[0].occurred_at;
  if (signals.some((signal) => !sameTimestamp(signal.occurred_at, scheduledAt))) {
    invalid('NPC_DECISION_EVALUATION_INVALID', 'Signals for one same-time batch must share one exact occurred_at');
  }
  const boundaryInput = {
    decision_mode: input.active_mode,
    ...(input.active_mode === 'combat' ? {
      decision_context_id: input.current_intent?.combat_id
    } : {}),
    scheduled_at: scheduledAt,
    npc_ref: input.npc_ref,
    same_time_batch_ref: input.same_time_batch_ref,
    significance: signals.some((signal) => signal.significance === 'critical')
      ? 'critical'
      : 'material',
    categories: signals.map((signal) => signal.category),
    signal_refs: signals.map((signal) => ({
      entity_kind: 'npc_decision_signal',
      entity_id: signal.signal_id
    })),
    state_version: input.state_version
  };
  const boundary = replaying
    ? createNpcDecisionBoundary(boundaryInput, input.persisted_boundary_id)
    : buildNpcDecisionBoundary(boundaryInput);
  return freeze({
    boundary,
    consumed_signal_ids: signals.map((signal) => signal.signal_id)
  });
}
