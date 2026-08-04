import { deepFreeze } from '@rus/kernel';
import {
  addElapsedTime,
  compareGameTimestamp,
  compareRationalMinutes,
  normalizeElapsedTime,
  normalizeGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { turnFailure } from './errors.js';
import {
  requireTurnStepPreparedEffectLedger
} from './turn-step-prepared-effects.js';

const ACTIVITY_SCHEMA =
  'rus.lower_dvina_trace_turn_step_semantic_activity.v1';
const ACTIVITY_KEYS = new Set([
  'version', 'schema', 'activity_id', 'root_turn_id', 'step_index',
  'profile_ref', 'duration_class', 'duration_minutes', 'effort'
]);
const DURATION_CLASSES = new Set(['moment', 'brief', 'short', 'extended']);
const EFFORTS = new Set([
  'none', 'light', 'moderate', 'heavy', 'extreme'
]);

export function resolveTurnStepSemanticActivityTime({
  batch, consequence, clockBefore, clockAfter, exactElapsed = null,
  expectedClockBefore = null, preparedEffectLedger = null
}) {
  if (batch == null) return null;
  const activities = batch.operations
    .map((fragment, fragmentOrder) => ({ fragment, fragmentOrder }))
    .filter(({ fragment }) => fragment.target === 'party_events'
      && fragment.value?.schema === ACTIVITY_SCHEMA);
  const bindings = (consequence?.state_changes ?? []).filter(
    ({ kind }) => kind === 'semantic_activity');
  if (activities.length !== bindings.length) invalid('activity count');
  const ledger = preparedEffectLedger == null ? null
    : requireTurnStepPreparedEffectLedger(preparedEffectLedger);
  const preparedActivities = ledger?.slices.filter(
    ({ effect_kind: kind }) => kind === 'semantic_activity') ?? [];
  if (ledger != null && preparedActivities.length !== activities.length) {
    invalid('prepared semantic activity count');
  }
  const requiresExactWindow = activities.length > 0
    || exactElapsed != null || expectedClockBefore != null;
  const timeWindow = requiresExactWindow
    ? resolveTurnStepExactTimeWindow({
      clockBefore, clockAfter, exactElapsed, expectedClockBefore
    })
    : null;
  if (activities.length === 0) {
    return deepFreeze({
      semantic_activity_elapsed: exactMinutes(0),
      semantic_activity_resolutions: []
    });
  }
  let cursor = structuredClone(timeWindow.clock_before);
  const committedClockAfter = timeWindow.clock_after;
  let totalMinutes = 0;
  let previousPreparedOrdinal = 0;
  const resolutions = activities.map(({ fragment, fragmentOrder }) => {
    const activity = fragment.value;
    if (!semanticActivity(activity, batch.root_turn_id)) {
      invalid('activity fragment', { fragment_order: fragmentOrder });
    }
    const matches = bindings.filter((binding) =>
      binding.activity_id === activity.activity_id);
    const binding = matches[0];
    if (matches.length !== 1
        || binding.profile_ref !== activity.profile_ref
        || binding.duration_class !== activity.duration_class
        || binding.effort !== activity.effort
        || !profilePin(binding.profile_pin)
        || !text(binding.body_effect_profile_ref)
        || !Number.isSafeInteger(activity.duration_minutes)
        || activity.duration_minutes < 0) invalid('activity binding', {
      activity_id: activity.activity_id
    });
    const duration = exactMinutes(activity.duration_minutes);
    const preparedMatches = ledger == null ? [] : preparedActivities.filter(
      (slice) => slice.operation_ref === activity.activity_id);
    const prepared = preparedMatches[0] ?? null;
    if (ledger != null && (preparedMatches.length !== 1
        || prepared.step_index !== activity.step_index
        || prepared.owner_ref !== activity.profile_ref
        || prepared.ordinal <= previousPreparedOrdinal
        || Number(prepared.consequence.duration_minutes)
          !== activity.duration_minutes)) {
      invalid('prepared semantic activity binding', {
        activity_id: activity.activity_id
      });
    }
    const startedAt = structuredClone(prepared?.time_update.clock_before
      ?? cursor);
    const endedAt = structuredClone(prepared?.time_update.clock_after
      ?? addElapsedTime(startedAt, duration));
    if (compareGameTimestamp(startedAt, timeWindow.clock_before) < 0
        || compareGameTimestamp(endedAt, committedClockAfter) > 0
        || compareGameTimestamp(
          addElapsedTime(startedAt, duration), endedAt) !== 0) {
      invalid('prepared semantic activity window', {
        activity_id: activity.activity_id
      });
    }
    if (prepared != null) previousPreparedOrdinal = prepared.ordinal;
    cursor = structuredClone(endedAt);
    totalMinutes += activity.duration_minutes;
    if (!Number.isSafeInteger(totalMinutes)) {
      invalid('activity duration total');
    }
    const execution = {
      status: 'completed',
      execution_scope: 'standalone',
      original_duration: duration,
      started_at: startedAt,
      ended_at: structuredClone(endedAt)
    };
    const attempt = {
      attempt_ordinal: 0,
      planned_time: duration,
      actual_time: duration,
      result_kind: 'completed',
      started_at: structuredClone(startedAt),
      ended_at: structuredClone(endedAt)
    };
    return {
      version: 1,
      schema: 'turn_semantic_activity_resolution_v1',
      activity_id: activity.activity_id,
      root_turn_id: activity.root_turn_id,
      step_index: activity.step_index,
      fragment_order: fragmentOrder,
      profile_ref: activity.profile_ref,
      profile_pin: structuredClone(binding.profile_pin),
      duration_class: activity.duration_class,
      effort: activity.effort,
      body_effect_profile_ref: binding.body_effect_profile_ref,
      execution,
      attempt
    };
  });
  const semanticElapsed = exactMinutes(totalMinutes);
  if (compareRationalMinutes(
    semanticElapsed.exact_minutes,
    timeWindow.exact_elapsed.exact_minutes
  ) > 0) {
    invalid('activity elapsed exceeds committed exact elapsed');
  }
  if (compareGameTimestamp(cursor, committedClockAfter) > 0) {
    invalid('activity time exceeds committed clock');
  }
  return deepFreeze({
    semantic_activity_elapsed: semanticElapsed,
    semantic_activity_resolutions: resolutions
  });
}

export function resolveTurnStepExactTimeWindow({
  clockBefore, clockAfter, exactElapsed, expectedClockBefore = null
}) {
  let before;
  let after;
  let elapsed;
  let expectedBefore = null;
  try {
    before = normalizeGameTimestamp(clockBefore);
    after = normalizeGameTimestamp(clockAfter);
    elapsed = normalizeElapsedTime(exactElapsed);
    if (expectedClockBefore != null) {
      expectedBefore = normalizeGameTimestamp(expectedClockBefore);
    }
  } catch (cause) {
    invalidTime('exact time shape', { cause: cause?.message });
  }
  if (expectedBefore != null
      && compareGameTimestamp(before, expectedBefore) !== 0) {
    invalidTime('clock_before differs from persisted state clock');
  }
  let difference;
  try {
    difference = subtractGameTimestamp(after, before);
  } catch (cause) {
    invalidTime('clock window is negative', { cause: cause?.message });
  }
  if (compareRationalMinutes(
    difference, elapsed.exact_minutes
  ) !== 0) {
    invalidTime('exact_elapsed differs from the committed clock window');
  }
  return deepFreeze({
    clock_before: structuredClone(before),
    clock_after: structuredClone(after),
    exact_elapsed: structuredClone(elapsed)
  });
}

function semanticActivity(value, rootTurnId) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === ACTIVITY_KEYS.size
    && Object.keys(value).every((key) => ACTIVITY_KEYS.has(key))
    && value.version === 1
    && value.schema === ACTIVITY_SCHEMA
    && text(value.activity_id)
    && text(value.root_turn_id)
    && value.root_turn_id === rootTurnId
    && Number.isSafeInteger(value.step_index)
    && value.step_index >= 1 && value.step_index <= 8
    && text(value.profile_ref)
    && DURATION_CLASSES.has(value.duration_class)
    && Number.isSafeInteger(value.duration_minutes)
    && value.duration_minutes >= 0
    && EFFORTS.has(value.effort);
}

function exactMinutes(value) {
  return { exact_minutes: { numerator: String(value), denominator: '1' } };
}

function profilePin(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 3
    && text(value.artifact_id)
    && Number.isSafeInteger(value.revision) && value.revision >= 1
    && typeof value.digest === 'string' && /^[a-f0-9]{64}$/u.test(value.digest);
}

function text(value) {
  return typeof value === 'string' && value.length > 0
    && value === value.trim();
}

function invalid(reason, details = {}) {
  throw turnFailure(
    'TURN_SEMANTIC_ACTIVITY_TEMPORAL_INVALID',
    'Temporal owner cannot resolve semantic activity execution.',
    { reason, ...details }
  );
}

function invalidTime(reason, details = {}) {
  throw turnFailure(
    'TURN_STEP_TIME_WINDOW_INVALID',
    'Turn step exact time window is invalid.',
    { reason, ...details }
  );
}
