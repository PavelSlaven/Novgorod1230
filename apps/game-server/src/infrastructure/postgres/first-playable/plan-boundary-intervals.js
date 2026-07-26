import { hash } from '../../../runtime/first-playable/shared.js';
import { row } from './plan-shared.js';
import { appendBoundaryCheck } from './plan-boundary-check.js';

export function appendBoundaryIntervals({
  appends,
  intervals,
  partyId,
  executionId,
  stepOrdinal,
  suffix,
  segment,
  command,
  state,
  changeSet,
  idemId,
  turnNumber,
  cumulativeElapsed,
  startingIntervalOrdinal = 0
}) {
  let elapsed = cumulativeElapsed;
  let terminalIntervalId = null;
  intervals.forEach((interval, localOrdinal) => {
    const intervalOrdinal =
      startingIntervalOrdinal + localOrdinal;
    const intervalId =
      `traversal-interval:${partyId}:${suffix}:${stepOrdinal}:${
        intervalOrdinal
      }`;
    const afterElapsed = elapsed + interval.elapsed_minutes;
    appends.push(row('party_traversal_interval_results', intervalId, {
      id: intervalId,
      route_plan_execution_id: executionId,
      plan_step_ordinal: stepOrdinal,
      interval_ordinal: intervalOrdinal,
      progress_before_ppm: interval.progress_before_ppm,
      planned_progress_after_ppm:
        interval.planned_progress_after_ppm,
      actual_progress_after_ppm:
        interval.actual_progress_after_ppm,
      planned_time_numerator: interval.planned_minutes,
      planned_time_denominator: 1,
      actual_time_numerator: interval.elapsed_minutes,
      actual_time_denominator: 1,
      cumulative_time_before_numerator: elapsed,
      cumulative_time_before_denominator: 1,
      cumulative_time_after_numerator: afterElapsed,
      cumulative_time_after_denominator: 1,
      crossed_whole_minute_boundaries: interval.elapsed_minutes,
      clock_commit_mode: 'direct_party_clock',
      dynamic_snapshot: {
        schema: 'lower_dvina_boundary_interval.v1',
        segment_ref: segment.segment_ref,
        availability: interval.condition_snapshot,
        check: interval.check,
        switch_phase: command.verb === 'cross_boundary'
          ? 'outbound_dispatch'
          : null,
        zero_time_context_switch:
          command.verb === 'cross_boundary',
        exact_dependency_pins: state.exact_pins
      },
      result_kind: interval.result_kind,
      result_code: interval.result_code,
      hazard_resolution: interval.consequence,
      outcome_composition_policy_version:
        'consequence.lower_dvina_segment_v1@1',
      outcome_composition_trace_digest: hash(JSON.stringify({
        interval_id: intervalId,
        segment_ref: segment.segment_ref,
        actual_elapsed: interval.elapsed_minutes,
        actual_progress_after_ppm:
          interval.actual_progress_after_ppm
      })),
      result_change_set_id: changeSet,
      idempotency_record_id: idemId,
      occurred_at_turn: turnNumber
    }));
    appendBoundaryCheck({
      appends,
      check: interval.check,
      intervalId,
      partyId,
      changeSet
    });
    elapsed = afterElapsed;
    terminalIntervalId = intervalId;
  });
  return { cumulativeElapsed: elapsed, terminalIntervalId };
}
