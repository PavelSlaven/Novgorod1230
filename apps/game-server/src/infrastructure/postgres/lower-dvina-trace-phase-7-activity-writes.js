import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { tracePhase7ActorStep } from
  '../../runtime/lower-dvina-trace-phase-7-schedule-execution.js';

export function appendPhase7Activities({ inserts, updates, appends, partyId, state,
  factual, next, turnNumber, changeSetId, idemId }) {
  const phase7 = factual.consequence.phase7;
  const restId = factual.consequence.activity_attempt_id;
  const prior = state.phase7_fire_rest?.status === 'paused'
    ? state.phase7_fire_rest : null;
  const first = prior == null;
  const before = prior?.exact_elapsed_minutes ?? 0;
  const segment = Number(
    factual.time_update.exact_elapsed.exact_minutes.numerator);
  const after = before + segment;
  const ordinal = prior?.next_attempt_ordinal ?? 0;
  const completed = phase7.schedule_temporal.rest_completed === true;
  (first ? inserts : updates).push(row('party_timed_activity_executions', restId,
    activityExecution({
      id: restId,
      first, completed, before, after, ordinal,
      profileRef: 'trace_ld_v1_activity_fire_rest',
      ownerRef: { entity_kind: 'actor', entity_id: state.actor_id },
      state,
      factual,
      next,
      changeSetId,
      idemId,
      context: {
        boundary_id: phase7.autonomous.boundary.boundary_id,
        decision_request_id: phase7.autonomous.request.request_id
      }
    })));
  appends.push(row('party_timed_activity_attempts', `${restId}:${ordinal}`,
    activityAttempt({
      id: restId,
      before,
      after,
      segment,
      ordinal,
      completed,
      clockBefore: state.clock,
      clockAfter: next.clock,
      turnNumber,
      changeSetId,
      idemId,
      trace: {
        processed_boundary_ids:
          [...phase7.temporal.result.trace.processed_boundary_ids,
            ...phase7.schedule_temporal.result.trace.processed_boundary_ids],
        autonomous_decision_request_id:
          phase7.autonomous.request.request_id,
        npc_actor_step_check: structuredClone(phase7.actor_step_check),
        causality: {
          waiting_terminal_candidate: structuredClone(
            phase7.temporal.terminal_candidate
          ),
          waiting_terminal_candidate_ref: ref(
            'temporal_boundary_candidate',
            phase7.temporal.terminal_candidate.boundary_id
          ),
          waiting_transition: structuredClone(
            phase7.temporal.waiting_transition
          ),
          waiting_transition_ref: ref(
            'npc_activity_factual_transition',
            phase7.temporal.waiting_transition.transition_id
          ),
          decision_signal_ref: ref(
            'npc_decision_signal',
            phase7.autonomous.signal.signal_id
          ),
          decision_boundary_ref: ref(
            'npc_decision_boundary',
            phase7.autonomous.boundary.boundary_id
          ),
          decision_trace_ref: structuredClone(
            tracePhase7ActorStep(
              phase7.schedule_temporal.projection,
              phase7.actor_step).decision_trace_ref
          ),
          actor_step_completion_candidate_ref: ref(
            'temporal_boundary_candidate',
            phase7.schedule_temporal.completion_candidate.boundary_id
          ),
          actor_step_completion_candidate: structuredClone(
            phase7.schedule_temporal.completion_candidate
          )
        },
        npc_schedule_result: scheduleTrace(phase7.schedule_execution,
          changeSetId)
      },
      bodyEffectRefs: completed
        ? [factual.body_update.proposal.profile_ref] : []
    })));
  if (!first) return;
  inserts.push(row('party_activity_participant_bindings',
    `${restId}:player_character:${state.actor_id}`, {
      activity_execution_id: restId,
      participant_kind: 'player_character',
      participant_id: state.actor_id,
      role_id: 'resting_actor',
      required: true,
      status: 'active',
      bound_change_set_id: changeSetId,
      terminal_change_set_id: null,
      state_version: 1
    }));
}

function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

function scheduleTrace(execution, changeSetId) {
  return {
    status: execution.status,
    failure_code: execution.failure_code ?? null,
    semantic_operation: structuredClone(execution.semantic_operation),
    ...(execution.additional_semantic_operations?.length > 0 ? {
      additional_semantic_operations: structuredClone(
        execution.additional_semantic_operations)
    } : {}),
    execution_binding_ref: execution.execution_binding_ref,
    schedule_option_id: execution.schedule_option_id,
    activity_profile_ref: execution.activity_profile_ref,
    exact_elapsed: structuredClone(execution.exact_elapsed),
    clock_before: structuredClone(execution.clock_before),
    clock_after: structuredClone(execution.clock_after),
    factual_result_source: execution.factual_result_source,
    change_set_id: changeSetId
  };
}

function activityExecution({ id, profileRef, ownerRef, state, factual, next,
  changeSetId, idemId, context, first, completed, after, ordinal }) {
  if (!profileRef) throw new Error('TRACE_PHASE_7_ACTIVITY_PROFILE_GAP');
  return {
    id,
    route_plan_execution_id: null,
    plan_step_ordinal: null,
    series_ordinal: 0,
    activity_snapshot: {
      activity_profile_ref: profileRef,
      exact_duration_minutes: 30
    },
    original_total_minutes: 30,
    cumulative_elapsed_numerator: after,
    cumulative_elapsed_denominator: 1,
    remaining_time_numerator: 30 - after,
    remaining_time_denominator: 1,
    next_attempt_ordinal: ordinal + 1,
    status: completed ? 'completed' : 'paused',
    state_version: ordinal + 2,
    updated_change_set_id: changeSetId,
    terminal_change_set_id: completed ? changeSetId : null,
    execution_scope: 'standalone',
    activity_series_id: `series:${id}`,
    activity_owner_ref: ownerRef,
    origin_location_snapshot: structuredClone(state.position),
    execution_context_snapshot: context,
    originating_command_ref: {
      entity_kind: 'semantic_command',
      entity_id: first ? factual.player_input.request_id
        : state.phase7_history[0].request_id
    },
    originating_command_digest: canonicalDigest({
      request_id: factual.player_input.request_id,
      profile_ref: profileRef
    }),
    idempotency_record_id: idemId,
    started_at_whole_minutes:
      (state.phase7_fire_rest?.started_at ?? state.clock).whole_minutes,
    started_at_subminute_numerator:
      (state.phase7_fire_rest?.started_at ?? state.clock)
        .subminute_numerator,
    started_at_subminute_denominator:
      (state.phase7_fire_rest?.started_at ?? state.clock)
        .subminute_denominator,
    last_processed_at_whole_minutes: next.clock.whole_minutes,
    last_processed_at_subminute_numerator: next.clock.subminute_numerator,
    last_processed_at_subminute_denominator: next.clock.subminute_denominator,
    next_boundary_at_whole_minutes: null,
    next_boundary_at_subminute_numerator: null,
    next_boundary_at_subminute_denominator: null,
    progress: {},
    preconditions_digest: canonicalDigest(context),
    terminal_reason_code: completed
      ? 'phase_7_fire_rest_completed' : null
  };
}

function activityAttempt({ id, before, after, segment, ordinal, completed,
  clockBefore, clockAfter, turnNumber, changeSetId, idemId, trace,
  bodyEffectRefs }) {
  return {
    activity_execution_id: id,
    attempt_ordinal: ordinal,
    remaining_before_numerator: 30 - before,
    remaining_before_denominator: 1,
    planned_time_numerator: segment,
    planned_time_denominator: 1,
    actual_time_numerator: segment,
    actual_time_denominator: 1,
    remaining_after_numerator: 30 - after,
    remaining_after_denominator: 1,
    cumulative_time_before_numerator: before,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: after,
    cumulative_time_after_denominator: 1,
    crossed_whole_minute_boundaries: segment,
    clock_commit_mode: 'direct_party_clock',
    execution_context_snapshot: trace,
    result_kind: completed ? 'completed' : 'paused',
    result_code: completed
      ? 'phase_7_fire_rest_completed' : 'external_temporal_boundary',
    dynamic_dependency_pins: { pins: [] },
    result_change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    started_at_whole_minutes: clockBefore.whole_minutes,
    started_at_subminute_numerator: clockBefore.subminute_numerator,
    started_at_subminute_denominator: clockBefore.subminute_denominator,
    ended_at_whole_minutes: clockAfter.whole_minutes,
    ended_at_subminute_numerator: clockAfter.subminute_numerator,
    ended_at_subminute_denominator: clockAfter.subminute_denominator,
    reason_code: completed
      ? 'phase_7_fire_rest_completed' : 'external_temporal_boundary',
    progress_before: {},
    progress_after: {},
    resource_reservations: [],
    resource_consumptions: [],
    body_effect_refs: bodyEffectRefs,
    participant_attendance: [],
    rule_and_policy_pins: { pins: [] },
    trace
  };
}
