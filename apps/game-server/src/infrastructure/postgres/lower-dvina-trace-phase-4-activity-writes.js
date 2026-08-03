import { canonicalDigest } from '@rus/materialization';
import { addElapsedTime } from '@rus/time-events-history';
import { row } from './first-playable/plan-shared.js';

export function appendPhase4ActivityExecution({
  inserts, appends, partyId, state, factual, next, root, id, seriesOrdinal,
  activitySeriesId, attemptOrdinal, turnNumber, changeSetId, idemId
}) {
  const duration = root.duration_minutes;
  const budget = factual.consequence.negotiation?.semantic_exchange
    ?.exchange?.time_budget ?? null;
  const actual = budget?.elapsed_minutes ?? duration;
  const remaining = budget?.remaining_minutes ?? 0;
  const completed = budget?.status !== 'paused';
  const reachesPlayerBoundary = root.status === 'player_response_required';
  const started = seriesOrdinal === 0 ? factual.time_update.clock_before : {
    whole_minutes: String(
      Number(factual.time_update.clock_before.whole_minutes) + 10
    ),
    subminute_numerator: factual.time_update.clock_before.subminute_numerator,
    subminute_denominator: factual.time_update.clock_before.subminute_denominator
  };
  const ended = addElapsedTime(started, {
    exact_minutes: { numerator: String(actual), denominator: '1' }
  });
  if (seriesOrdinal === 1
      && canonicalDigest(ended) !== canonicalDigest(next.clock)) {
    throw new Error('TRACE_PHASE_4_ACTIVITY_INTERVAL_INVALID');
  }
  inserts.push(row('party_timed_activity_executions', id, {
    id, series_ordinal: seriesOrdinal,
    activity_snapshot: {
      activity_ref: root.activity_ref, phase4_kind: 'negotiation'
    },
    original_total_minutes: duration,
    cumulative_elapsed_numerator: actual,
    cumulative_elapsed_denominator: 1,
    remaining_time_numerator: remaining,
    remaining_time_denominator: 1,
    next_attempt_ordinal: attemptOrdinal + 1,
    status: completed ? 'completed' : 'paused',
    state_version: 1,
    updated_change_set_id: changeSetId,
    terminal_change_set_id: completed ? changeSetId : null,
    execution_scope: 'standalone',
    activity_series_id: activitySeriesId,
    activity_owner_ref: { entity_kind: 'actor', entity_id: state.actor_id },
    origin_location_snapshot: structuredClone(state.position),
    execution_context_snapshot: {
      option_id: factual.mode_resolution.option_id,
      activity_root: root.activity_ref
    },
    originating_command_ref: {
      entity_kind: 'semantic_command',
      entity_id: factual.player_input.request_id
    },
    originating_command_digest: canonicalDigest({
      request_id: factual.player_input.request_id,
      option_id: factual.mode_resolution.option_id
    }),
    idempotency_record_id: idemId,
    started_at_whole_minutes: started.whole_minutes,
    started_at_subminute_numerator: started.subminute_numerator,
    started_at_subminute_denominator: started.subminute_denominator,
    last_processed_at_whole_minutes: ended.whole_minutes,
    last_processed_at_subminute_numerator: ended.subminute_numerator,
    last_processed_at_subminute_denominator: ended.subminute_denominator,
    next_boundary_at_whole_minutes: null,
    next_boundary_at_subminute_numerator: null,
    next_boundary_at_subminute_denominator: null,
    progress: {},
    preconditions_digest: canonicalDigest(factual.mode_resolution),
    terminal_reason_code: completed
      ? reachesPlayerBoundary
        ? 'player_response_boundary_reached'
        : 'phase_4_activity_completed'
      : null
  }));
  appends.push(row('party_timed_activity_attempts', `${id}:${attemptOrdinal}`, {
    activity_execution_id: id,
    attempt_ordinal: attemptOrdinal,
    remaining_before_numerator: duration,
    remaining_before_denominator: 1,
    planned_time_numerator: duration,
    planned_time_denominator: 1,
    actual_time_numerator: actual,
    actual_time_denominator: 1,
    remaining_after_numerator: remaining,
    remaining_after_denominator: 1,
    cumulative_time_before_numerator: 0,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: actual,
    cumulative_time_after_denominator: 1,
    crossed_whole_minute_boundaries: actual,
    clock_commit_mode: 'direct_party_clock',
    execution_context_snapshot: {
      option_id: factual.mode_resolution.option_id
    },
    result_kind: completed ? 'completed' : 'paused',
    result_code: root.activity_ref,
    dynamic_dependency_pins: {},
    result_change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    started_at_whole_minutes: started.whole_minutes,
    started_at_subminute_numerator: started.subminute_numerator,
    started_at_subminute_denominator: started.subminute_denominator,
    ended_at_whole_minutes: ended.whole_minutes,
    ended_at_subminute_numerator: ended.subminute_numerator,
    ended_at_subminute_denominator: ended.subminute_denominator,
    reason_code: completed
      ? reachesPlayerBoundary
        ? 'player_response_boundary_reached'
        : 'phase_4_activity_completed'
      : 'temporal_boundary_interruption',
    progress_before: {},
    progress_after: {},
    resource_reservations: [],
    resource_consumptions: [],
    body_effect_refs: [],
    participant_attendance: [],
    rule_and_policy_pins: {},
    trace: {}
  }));
}
