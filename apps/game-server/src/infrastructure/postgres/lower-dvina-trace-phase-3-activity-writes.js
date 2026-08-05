import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { activityHistoryEntry } from './lower-dvina-trace-phase-3-state.js';

export function appendActivity(input) {
  const {
    inserts, updates = [], appends, state, next, factual, partyId, turnNumber,
    changeSetId, idemId, inputDigest
  } = input;
  const semantic = factual.consequence.conversation?.semantic_exchange ?? null;
  const semanticBudget = semantic?.exchange?.time_budget ?? null;
  const resumedNpc = semantic?.resumed_npc_execution != null;
  const resumedPlayer = semantic?.resumed_player_execution != null;
  const resumed = resumedNpc || resumedPlayer;
  const pending = resumedNpc ? state.pending_npc_conversation_execution
    : resumedPlayer ? state.pending_player_conversation_execution : null;
  if (resumed && (pending?.activity_execution_id == null
      || pending.total_minutes == null || pending.elapsed_minutes == null)) {
    throw new Error('TRACE_M2_PENDING_CONVERSATION_ACTIVITY_INVALID');
  }
  const id = pending?.activity_execution_id
    ?? `activity:${partyId}:trace-phase3:${turnNumber}`;
  const duration = pending?.total_minutes ?? semanticBudget?.total_minutes
    ?? factual.consequence.duration_minutes;
  const attemptElapsed = semanticBudget?.elapsed_minutes ?? duration;
  const elapsed = resumed ? pending.elapsed_minutes + attemptElapsed
    : attemptElapsed;
  const remaining = semanticBudget?.remaining_minutes ?? 0;
  const completed = semanticBudget?.status !== 'paused';
  const attemptOrdinal = resumed ? pending.next_attempt_ordinal : 0;
  const cumulativeBefore = resumed ? pending.elapsed_minutes : 0;
  const currentContext = resumed ? {
    option_id: pending.option_id,
    ...(resumedNpc ? {
      resumed_npc_execution: {
        decision_trace_ref: structuredClone(pending.decision_trace_ref),
        conversation_id: pending.conversation_id,
        exchange_id: pending.exchange_id,
        contribution_index: pending.contribution_index
      }
    } : {
      resumed_player_execution: {
        conversation_id: pending.conversation_id,
        exchange_id: pending.exchange_id,
        contribution_index: pending.contribution_index
      }
    })
  } : {
    option_id: factual.mode_resolution.option_id,
    ...(next.pending_npc_conversation_execution == null ? {} : {
      pending_npc_execution: structuredClone(
        next.pending_npc_conversation_execution
      )
    }),
    ...(next.pending_player_conversation_execution == null ? {} : {
      pending_player_execution: structuredClone(
        next.pending_player_conversation_execution
      )
    })
  };
  const progress = completed ? {} : currentContext;
  const historyEntry = activityHistoryEntry({
    partyId,
    turnNumber,
    factual,
    inputDigest,
    changeSetId
  });
  (resumed ? updates : inserts).push(row('party_timed_activity_executions', id, {
    id,
    series_ordinal: 0,
    activity_snapshot: historyEntry.activity_snapshot,
    original_total_minutes: duration,
    cumulative_elapsed_numerator: elapsed,
    cumulative_elapsed_denominator: 1,
    remaining_time_numerator: remaining,
    remaining_time_denominator: 1,
    next_attempt_ordinal: attemptOrdinal + 1,
    status: completed ? 'completed' : 'paused',
    state_version: resumed ? pending.activity_state_version + 1 : 2,
    updated_change_set_id: changeSetId,
    terminal_change_set_id: completed ? changeSetId : null,
    execution_scope: 'standalone',
    activity_series_id: `series:${partyId}:trace-phase3:${turnNumber}`,
    activity_owner_ref: { entity_kind: 'actor', entity_id: state.actor_id },
    origin_location_snapshot: structuredClone(state.position),
    execution_context_snapshot: currentContext,
    originating_command_ref: {
      entity_kind: 'semantic_command',
      entity_id: pending?.originating_request_id
        ?? factual.player_input.request_id
    },
    originating_command_digest: canonicalDigest({
      input_digest: inputDigest,
      option_id: pending?.option_id ?? factual.mode_resolution.option_id
    }),
    idempotency_record_id: idemId,
    started_at_whole_minutes:
      (pending?.started_at ?? factual.time_update.clock_before).whole_minutes,
    started_at_subminute_numerator:
      (pending?.started_at ?? factual.time_update.clock_before)
        .subminute_numerator,
    started_at_subminute_denominator:
      (pending?.started_at ?? factual.time_update.clock_before)
        .subminute_denominator,
    last_processed_at_whole_minutes: next.clock.whole_minutes,
    last_processed_at_subminute_numerator: next.clock.subminute_numerator,
    last_processed_at_subminute_denominator: next.clock.subminute_denominator,
    next_boundary_at_whole_minutes: null,
    next_boundary_at_subminute_numerator: null,
    next_boundary_at_subminute_denominator: null,
    progress,
    preconditions_digest: canonicalDigest(factual.mode_resolution),
    terminal_reason_code: completed ? 'phase_3_activity_completed' : null
  }));
  appends.push(row('party_timed_activity_attempts', `${id}:${attemptOrdinal}`, {
    activity_execution_id: id,
    attempt_ordinal: attemptOrdinal,
    remaining_before_numerator: duration - cumulativeBefore,
    remaining_before_denominator: 1,
    planned_time_numerator: semanticBudget?.total_minutes ?? duration,
    planned_time_denominator: 1,
    actual_time_numerator: attemptElapsed,
    actual_time_denominator: 1,
    remaining_after_numerator: remaining,
    remaining_after_denominator: 1,
    cumulative_time_before_numerator: cumulativeBefore,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: cumulativeBefore
      + (semanticBudget?.elapsed_minutes ?? elapsed),
    cumulative_time_after_denominator: 1,
    crossed_whole_minute_boundaries: attemptElapsed,
    clock_commit_mode: 'direct_party_clock',
    execution_context_snapshot: currentContext,
    result_kind: completed ? 'completed' : 'paused',
    result_code: completed
      ? 'phase_3_activity_completed' : 'temporal_boundary_interruption',
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
    reason_code: completed
      ? 'phase_3_activity_completed' : 'temporal_boundary_interruption',
    progress_before: resumed ? {
      elapsed_minutes: cumulativeBefore,
      remaining_minutes: duration - cumulativeBefore
    } : {},
    progress_after: progress,
    resource_reservations: [],
    resource_consumptions: [],
    body_effect_refs: [],
    participant_attendance: [],
    rule_and_policy_pins: {},
    trace: historyEntry.execution_result
  }));
}
