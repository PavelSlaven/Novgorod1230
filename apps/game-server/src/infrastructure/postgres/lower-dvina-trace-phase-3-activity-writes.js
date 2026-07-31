import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { activityHistoryEntry } from './lower-dvina-trace-phase-3-state.js';

export function appendActivity(input) {
  const {
    inserts, appends, state, next, factual, partyId, turnNumber,
    changeSetId, idemId, inputDigest
  } = input;
  const id = `activity:${partyId}:trace-phase3:${turnNumber}`;
  const duration = factual.consequence.duration_minutes;
  const historyEntry = activityHistoryEntry({
    partyId,
    turnNumber,
    factual,
    inputDigest,
    changeSetId
  });
  inserts.push(row('party_timed_activity_executions', id, {
    id,
    series_ordinal: 0,
    activity_snapshot: historyEntry.activity_snapshot,
    original_total_minutes: duration,
    cumulative_elapsed_numerator: duration,
    cumulative_elapsed_denominator: 1,
    remaining_time_numerator: 0,
    remaining_time_denominator: 1,
    next_attempt_ordinal: 1,
    status: 'completed',
    state_version: 2,
    updated_change_set_id: changeSetId,
    terminal_change_set_id: changeSetId,
    execution_scope: 'standalone',
    activity_series_id: `series:${partyId}:trace-phase3:${turnNumber}`,
    activity_owner_ref: { entity_kind: 'actor', entity_id: state.actor_id },
    origin_location_snapshot: structuredClone(state.position),
    execution_context_snapshot: {
      option_id: factual.mode_resolution.option_id
    },
    originating_command_ref: {
      entity_kind: 'semantic_command',
      entity_id: factual.player_input.request_id
    },
    originating_command_digest: canonicalDigest({
      input_digest: inputDigest,
      option_id: factual.mode_resolution.option_id
    }),
    idempotency_record_id: idemId,
    started_at_whole_minutes:
      factual.time_update.clock_before.whole_minutes,
    started_at_subminute_numerator:
      factual.time_update.clock_before.subminute_numerator,
    started_at_subminute_denominator:
      factual.time_update.clock_before.subminute_denominator,
    last_processed_at_whole_minutes: next.clock.whole_minutes,
    last_processed_at_subminute_numerator: next.clock.subminute_numerator,
    last_processed_at_subminute_denominator: next.clock.subminute_denominator,
    next_boundary_at_whole_minutes: null,
    next_boundary_at_subminute_numerator: null,
    next_boundary_at_subminute_denominator: null,
    progress: {},
    preconditions_digest: canonicalDigest(factual.mode_resolution),
    terminal_reason_code: 'phase_3_activity_completed'
  }));
  appends.push(row('party_timed_activity_attempts', `${id}:0`, {
    activity_execution_id: id,
    attempt_ordinal: 0,
    remaining_before_numerator: duration,
    remaining_before_denominator: 1,
    planned_time_numerator: duration,
    planned_time_denominator: 1,
    actual_time_numerator: duration,
    actual_time_denominator: 1,
    remaining_after_numerator: 0,
    remaining_after_denominator: 1,
    cumulative_time_before_numerator: 0,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: duration,
    cumulative_time_after_denominator: 1,
    crossed_whole_minute_boundaries: duration,
    clock_commit_mode: 'direct_party_clock',
    execution_context_snapshot: {
      option_id: factual.mode_resolution.option_id
    },
    result_kind: 'completed',
    result_code: 'phase_3_activity_completed',
    dynamic_dependency_pins: {},
    result_change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    started_at_whole_minutes:
      factual.time_update.clock_before.whole_minutes,
    started_at_subminute_numerator:
      factual.time_update.clock_before.subminute_numerator,
    started_at_subminute_denominator:
      factual.time_update.clock_before.subminute_denominator,
    ended_at_whole_minutes: next.clock.whole_minutes,
    ended_at_subminute_numerator: next.clock.subminute_numerator,
    ended_at_subminute_denominator: next.clock.subminute_denominator,
    reason_code: 'phase_3_activity_completed',
    progress_before: {},
    progress_after: {},
    resource_reservations: [],
    resource_consumptions: [],
    body_effect_refs: [],
    participant_attendance: [],
    rule_and_policy_pins: {},
    trace: historyEntry.execution_result
  }));
}
