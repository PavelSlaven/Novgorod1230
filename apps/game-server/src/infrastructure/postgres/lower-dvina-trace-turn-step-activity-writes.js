import { canonicalDigest } from '@rus/materialization';
import {
  resolveTurnStepExactTimeWindow,
  resolveTurnStepSemanticActivityTime
} from '@rus/turn';
import { serverError } from '../../errors.js';
import { row } from './first-playable/plan-shared.js';

export function requireTurnStepSemanticActivityTimeline({
  factual, batch, expectedClockBefore
}) {
  if (expectedClockBefore == null) {
    timeReconciliationFail('persisted state clock is unavailable');
  }
  try {
    resolveTurnStepExactTimeWindow({
      clockBefore: factual.time_update?.clock_before,
      clockAfter: factual.time_update?.clock_after,
      exactElapsed: factual.time_update?.exact_elapsed,
      expectedClockBefore
    });
  } catch (cause) {
    timeReconciliationFail('committed exact time window is invalid', {
      cause: cause?.code ?? cause?.message
    });
  }
  let expected;
  try {
    expected = resolveTurnStepSemanticActivityTime({
      batch,
      consequence: factual.consequence,
      clockBefore: factual.time_update?.clock_before,
      clockAfter: factual.time_update?.clock_after,
      exactElapsed: factual.time_update?.exact_elapsed,
      expectedClockBefore,
      preparedEffectLedger:
        factual.time_update?.prepared_effect_ledger ?? null
    });
  } catch (cause) {
    reconciliationFail('temporal owner rejected the activity chain', {
      cause: cause?.code ?? cause?.message
    });
  }
  const actual = {
    semantic_activity_elapsed:
      factual.time_update?.semantic_activity_elapsed,
    semantic_activity_resolutions:
      factual.time_update?.semantic_activity_resolutions
  };
  if (canonicalDigest(actual) !== canonicalDigest(expected)) {
    reconciliationFail('committed activity timeline differs from its owner');
  }
  const duration = Number(
    expected.semantic_activity_elapsed.exact_minutes.numerator);
  if (!Number.isSafeInteger(duration) || duration < 0) {
    reconciliationFail('owner activity duration is invalid');
  }
  return {
    semanticDuration: duration,
    resolutions: new Map(expected.semantic_activity_resolutions.map(
      (resolution) => [resolution.activity_id, resolution]))
  };
}

function timeReconciliationFail(reason, details = {}) {
  throw serverError(
    'TRACE_TURN_STEP_TIME_RECONCILIATION_FAILED',
    'Turn step exact time differs from the persisted clock owner.',
    { status: 409, details: { reason, ...details } }
  );
}

export function appendTurnStepSemanticActivityWrites({
  writes,
  activities,
  partyId,
  state,
  snapshot,
  factual,
  changeSetId,
  idemId
}) {
  if (activities.length === 0) return;
  const turnNumber = snapshot.party_state?.turn_number;
  if (!Number.isSafeInteger(turnNumber) || turnNumber < 1) {
    fail('committed turn number is unavailable');
  }
  for (const activity of activities) {
    const resolution = activity.owner_resolution;
    const duration = positiveIntegralMinutes(
      resolution?.execution?.original_duration);
    // The existing normalized owner has positive integral legacy columns.
    // A semantic `moment` resolved to zero cannot be represented truthfully;
    // it is rejected instead of inventing elapsed time or another store.
    if (duration == null) {
      fail('zero-duration semantic activity is not representable', {
        activity_id: activity.activity_id
      });
    }
    const order = resolution.fragment_order;
    const execution = executionRecord({
      activity, partyId, state, factual, changeSetId, idemId,
      resolution, duration, order
    });
    writes.inserts.push(row(
      'party_timed_activity_executions', activity.activity_id, execution
    ));
    writes.appends.push(row(
      'party_timed_activity_attempts', `${activity.activity_id}:0`,
      attemptRecord({
        activity, factual, changeSetId, idemId, turnNumber,
        resolution, duration, order
      })
    ));
  }
}

function executionRecord({
  activity, partyId, state, factual, changeSetId, idemId,
  resolution, duration, order
}) {
  const execution = resolution.execution;
  const startedAt = execution.started_at;
  const endedAt = execution.ended_at;
  return {
    id: activity.activity_id,
    series_ordinal: 0,
    activity_snapshot: activitySnapshot(activity, order),
    original_total_minutes: duration,
    cumulative_elapsed_numerator: duration,
    cumulative_elapsed_denominator: 1,
    remaining_time_numerator: 0,
    remaining_time_denominator: 1,
    next_attempt_ordinal: resolution.attempt.attempt_ordinal + 1,
    status: execution.status,
    state_version: 2,
    updated_change_set_id: changeSetId,
    terminal_change_set_id: changeSetId,
    execution_scope: execution.execution_scope,
    activity_series_id: `series:${activity.activity_id}`,
    activity_owner_ref: {
      entity_kind: 'actor', entity_id: state.actor_id
    },
    origin_location_snapshot: structuredClone(state.position),
    execution_context_snapshot: activityContext(activity, order),
    originating_command_ref: {
      entity_kind: 'semantic_command',
      entity_id: factual.player_input.request_id
    },
    originating_command_digest: canonicalDigest({
      root_turn_id: activity.root_turn_id,
      request_id: factual.player_input.request_id
    }),
    idempotency_record_id: idemId,
    started_at_whole_minutes: startedAt.whole_minutes,
    started_at_subminute_numerator: startedAt.subminute_numerator,
    started_at_subminute_denominator: startedAt.subminute_denominator,
    last_processed_at_whole_minutes: endedAt.whole_minutes,
    last_processed_at_subminute_numerator: endedAt.subminute_numerator,
    last_processed_at_subminute_denominator: endedAt.subminute_denominator,
    next_boundary_at_whole_minutes: null,
    next_boundary_at_subminute_numerator: null,
    next_boundary_at_subminute_denominator: null,
    progress: {},
    preconditions_digest: canonicalDigest({
      party_id: partyId,
      committed_state_version: state.party_state.state_version,
      activity: activitySnapshot(activity, order)
    }),
    terminal_reason_code: 'turn_step_semantic_activity_completed'
  };
}

function attemptRecord({
  activity, factual, changeSetId, idemId, turnNumber,
  resolution, duration, order
}) {
  const attempt = resolution.attempt;
  const planned = exactIntegralMinutes(attempt.planned_time);
  const actual = exactIntegralMinutes(attempt.actual_time);
  if (planned == null || actual == null) {
    fail('semantic activity attempt time is not representable', {
      activity_id: activity.activity_id
    });
  }
  const startedAt = attempt.started_at;
  const endedAt = attempt.ended_at;
  return {
    activity_execution_id: activity.activity_id,
    attempt_ordinal: attempt.attempt_ordinal,
    remaining_before_numerator: duration,
    remaining_before_denominator: 1,
    planned_time_numerator: planned,
    planned_time_denominator: 1,
    actual_time_numerator: actual,
    actual_time_denominator: 1,
    remaining_after_numerator: 0,
    remaining_after_denominator: 1,
    cumulative_time_before_numerator: 0,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: actual,
    cumulative_time_after_denominator: 1,
    crossed_whole_minute_boundaries: actual,
    clock_commit_mode: 'direct_party_clock',
    execution_context_snapshot: activityContext(activity, order),
    result_kind: attempt.result_kind,
    result_code: 'turn_step_semantic_activity_completed',
    dynamic_dependency_pins: {},
    result_change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    started_at_whole_minutes: startedAt.whole_minutes,
    started_at_subminute_numerator: startedAt.subminute_numerator,
    started_at_subminute_denominator: startedAt.subminute_denominator,
    ended_at_whole_minutes: endedAt.whole_minutes,
    ended_at_subminute_numerator: endedAt.subminute_numerator,
    ended_at_subminute_denominator: endedAt.subminute_denominator,
    reason_code: 'turn_step_semantic_activity_completed',
    progress_before: {},
    progress_after: {},
    resource_reservations: [],
    resource_consumptions: [],
    body_effect_refs: [{
      entity_kind: 'body_effect_profile',
      entity_id: activity.body_effect_profile_ref
    }],
    participant_attendance: [],
    rule_and_policy_pins: {
      activity_profile: structuredClone(activity.profile_pin)
    },
    trace: {
      root_turn_id: activity.root_turn_id,
      step_index: activity.step_index,
      fragment_order: order,
      owner_profile_ref: activity.profile_ref,
      request_id: factual.player_input.request_id
    }
  };
}

function activitySnapshot(activity, order) {
  const duration = activity.owner_resolution.execution.original_duration;
  return {
    schema: 'rus.turn_step.semantic_activity_execution.v1',
    activity_id: activity.activity_id,
    root_turn_id: activity.root_turn_id,
    step_index: activity.step_index,
    fragment_order: order,
    activity_profile_ref: activity.profile_ref,
    activity_profile_pin: structuredClone(activity.profile_pin),
    completion_model_snapshot: {
      kind: 'fixed_exact',
      fixed_duration: structuredClone(duration.exact_minutes)
    },
    duration_class: activity.duration_class,
    effort: activity.effort,
    body_effect_profile_ref: activity.body_effect_profile_ref
  };
}

function positiveIntegralMinutes(value) {
  const number = exactIntegralMinutes(value);
  return number != null && number > 0 ? number : null;
}

function exactIntegralMinutes(value) {
  const exact = value?.exact_minutes;
  if (exact?.denominator !== '1'
      || typeof exact.numerator !== 'string'
      || !/^(?:0|[1-9]\d*)$/u.test(exact.numerator)) return null;
  const number = Number(exact.numerator);
  return Number.isSafeInteger(number) ? number : null;
}

function activityContext(activity, order) {
  return {
    root_turn_id: activity.root_turn_id,
    step_index: activity.step_index,
    fragment_order: order,
    duration_class: activity.duration_class,
    effort: activity.effort
  };
}

function fail(reason, details = {}) {
  throw serverError(
    'TRACE_TURN_STEP_SEMANTIC_ACTIVITY_PERSISTENCE_GAP',
    'Semantic activity cannot use the existing normalized activity owner.',
    { status: 409, details: { reason, ...details } }
  );
}

function reconciliationFail(reason, details = {}) {
  throw serverError(
    'TRACE_TURN_STEP_SEMANTIC_ACTIVITY_RECONCILIATION_FAILED',
    'Semantic activity differs from the temporal owner output.',
    { status: 409, details: { reason, ...details } }
  );
}
