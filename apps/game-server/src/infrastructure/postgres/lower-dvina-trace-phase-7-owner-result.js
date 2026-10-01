import { canonicalDigest } from '@rus/materialization';
import { validPhase7ScheduleExecution } from
  './lower-dvina-trace-phase-7-schedule-validation.js';
import {
  addElapsedTime,
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { serverError } from '../../errors.js';
import { validTracePhase7ActorStepCheck } from
  './lower-dvina-trace-phase-7-check-result.js';
import { tracePhase7ActorStep } from
  '../../runtime/lower-dvina-trace-phase-7-schedule-execution.js';

export function assertPhase7OwnerResult({ factual, state, phase7Contracts,
  changeSetId }) {
  const phase7 = factual.consequence.phase7;
  const temporal = phase7.temporal;
  const scheduleTemporal = phase7.schedule_temporal;
  const schedule = phase7.schedule_execution;
  const resumed = phase7.resumed === true;
  const needsCheckRefusal = schedule?.status === 'declined'
    && schedule?.failure_code === 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED';
  if ((!resumed && phase7.autonomous.request.root_turn_id
        !== factual.mode_resolution?.turn_id)
      || (resumed && !validResume({ phase7, factual, state, phase7Contracts }))
      || temporal.elapsed_before_decision !== 25
      || temporal.result.temporal_status !== 'paused'
      || !['completed', 'paused'].includes(
        scheduleTemporal?.result?.temporal_status
      )
      || (scheduleTemporal.result.temporal_status === 'completed'
        && (scheduleTemporal.elapsed_after_decision !== 5
          || !sameClock(scheduleTemporal.result.clock_after,
            factual.time_update.clock_after)))
      || (scheduleTemporal.result.temporal_status === 'paused'
        && !sameClock(scheduleTemporal.result.clock_after,
          factual.time_update.clock_after))
      || !sameClock(scheduleTemporal.result.clock_before,
        temporal.result.clock_after)
      || (!resumed
        && !sameClock(temporal.result.clock_before, state.clock))
      || !(needsCheckRefusal || ['executed', 'started'].includes(schedule.status))
      || schedule.exact_elapsed.exact_minutes.denominator !== '1'
      || schedule.root_clock_write_count !== 0
      || schedule.parent_state_version !== (resumed
        ? state.phase7_fire_rest.resume_state.schedule_execution
          .parent_state_version
        : state.party_state.state_version)
      || (needsCheckRefusal
        ? !validNeedsCheckRefusal(phase7, factual, state)
        : !validActorStepCompletion(phase7)
          || !validCausality(phase7)
          || !validPhase7ScheduleExecution(schedule, phase7Contracts,
            phase7.autonomous.request, phase7.autonomous.proposal.plan,
            phase7.actor_step_check)
          || (resumed
        ? !sameValue(phase7.actor_step_check,
          state.phase7_fire_rest.resume_state.actor_step_check)
        : !validTracePhase7ActorStepCheck(phase7, phase7Contracts, factual,
          state)))
      || (!resumed
        && temporal.result.combined_change_set.change_set_id !== changeSetId)
      || scheduleTemporal.result.combined_change_set.change_set_id
        !== changeSetId
      || (scheduleTemporal.result.temporal_status === 'completed'
        ? factual.body_update.applied !== true
          || factual.body_update.proposal.profile_ref
            !== phase7Contracts.bodyEffect.effect_profile_id
        : factual.body_update.applied !== false)) {
    throw serverError(
      'TRACE_PHASE_7_OWNER_RESULT_INVALID',
      'Phase 7 factual commit failed closed.',
      { status: 409, details: null }
    );
  }
}

function validNeedsCheckRefusal(phase7, factual, state) {
  const { actor_step: actorStep, schedule_execution: schedule,
    schedule_temporal: scheduleTemporal, autonomous } = phase7;
  const domainResult = scheduleTemporal?.needs_check_refusal;
  const error = domainResult?.errors?.[0];
  const queueIds = error?.queue_ids ?? (error?.queue_id == null
    ? [] : [error.queue_id]);
  const signal = autonomous?.signal;
  const candidate = phase7.temporal?.terminal_candidate;
  const transition = phase7.temporal?.waiting_transition;
  const boundary = autonomous?.boundary;
  const decisionSignals = autonomous?.decision_records?.[0]?.orderedSignals;
  return actorStep?.status === 'refused'
    && actorStep.npc_ref === schedule.npc_ref
    && actorStep.failure_code === schedule.failure_code
    && domainResult?.pass === false
    && domainResult.errors?.length === 1
    && error?.code === 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED'
    && typeof error.path === 'string'
    && error.path.length > 0
    && queueIds.length > 0
    && queueIds.every((id) => typeof id === 'string' && id.length > 0)
    && schedule.semantic_operation === null
    && schedule.execution_binding_ref === null
    && schedule.schedule_option_id === null
    && schedule.activity_profile_ref === null
    && schedule.status === 'declined'
    && schedule.factual_result_source === 'needs_check_refusal'
    && schedule.clock_before.whole_minutes
      === phase7.temporal.result.clock_after.whole_minutes
    && schedule.clock_after.whole_minutes === schedule.clock_before.whole_minutes
    && schedule.exact_elapsed.exact_minutes.numerator === '0'
    && (scheduleTemporal.result.temporal_status === 'completed'
      ? scheduleTemporal.rest_completed === true
      : scheduleTemporal.result.temporal_status === 'paused'
        && scheduleTemporal.rest_completed === false
        && phase7.resumed !== true)
    && scheduleTemporal.completion_candidate == null
    && !scheduleTemporal.projection.active_npc_actor_steps?.some(({ npc_ref }) =>
      npc_ref === schedule.npc_ref)
    && sameClock(scheduleTemporal.result.clock_after,
      factual.time_update.clock_after)
    && sameClock(actorStep.clock_before, phase7.temporal.result.clock_after)
    && sameClock(actorStep.clock_after, phase7.temporal.result.clock_after)
    && candidate?.boundary_id != null
    && sameClock(candidate.scheduled_at, phase7.temporal.result.clock_after)
    && sameValue(transition?.source_candidate_ref, {
      entity_kind: 'temporal_boundary_candidate',
      entity_id: candidate.boundary_id
    })
    && sameValue(signal?.source_event_ref, {
      entity_kind: 'npc_activity_factual_transition',
      entity_id: transition?.transition_id
    })
    && Array.isArray(decisionSignals)
    && decisionSignals.some(({ signal_id }) => signal_id === signal?.signal_id)
    && (autonomous.consumed_signal_ids ?? []).includes(signal?.signal_id)
    && (state.active_npc_actor_steps ?? []).every(({ npc_ref }) =>
      npc_ref !== schedule.npc_ref);
}

function validResume({ phase7, factual, state, phase7Contracts }) {
  const rest = state.phase7_fire_rest;
  const prior = rest?.resume_state;
  const before = prior?.schedule_execution;
  const after = phase7.schedule_execution;
  if (prior?.temporal == null || prior?.autonomous == null
      || prior?.actor_step == null || prior?.actor_step_owner_outputs == null
      || prior?.schedule_temporal == null || before == null) return false;
  const changed = before?.status !== after?.status;
  if (before?.status === 'declined'
      && before?.failure_code === 'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED') {
    return rest?.status === 'paused'
      && rest.activity_execution_id === factual.consequence.activity_attempt_id
      && Number.isSafeInteger(rest.exact_elapsed_minutes)
      && rest.exact_elapsed_minutes >= 25
      && rest.exact_elapsed_minutes < 30
      && rest.approved_body_effect_ref
        === phase7Contracts.bodyEffect.effect_profile_id
      && phase7.approved_body_effect_ref
        === phase7Contracts.bodyEffect.effect_profile_id
      && sameValue(state.clock, prior?.schedule_temporal?.result?.clock_after)
      && sameValue(phase7.temporal, prior?.temporal)
      && sameValue(phase7.autonomous, prior?.autonomous)
      && sameValue(phase7.actor_step, prior?.actor_step)
      && sameValue(phase7.actor_step_owner_outputs,
        prior?.actor_step_owner_outputs)
      && after?.status === 'declined'
      && after?.failure_code === before.failure_code
      && phase7.schedule_applied_in_this_attempt === false;
  }
  return rest?.status === 'paused'
    && rest.activity_execution_id === factual.consequence.activity_attempt_id
    && Number.isSafeInteger(rest.exact_elapsed_minutes)
    && rest.exact_elapsed_minutes >= 25
    && rest.exact_elapsed_minutes < 30
    && rest.approved_body_effect_ref
      === phase7Contracts.bodyEffect.effect_profile_id
    && phase7.approved_body_effect_ref
      === phase7Contracts.bodyEffect.effect_profile_id
    && sameValue(state.clock, prior?.schedule_temporal?.result?.clock_after)
    && sameValue(phase7.temporal, prior?.temporal)
    && sameValue(phase7.autonomous, prior?.autonomous)
    && sameValue(phase7.actor_step, prior?.actor_step)
    && sameValue(phase7.actor_step_owner_outputs,
      prior?.actor_step_owner_outputs)
    && before?.status != null
    && ['started', 'executed'].includes(before.status)
    && ['started', 'executed'].includes(after?.status)
    && (before.status !== 'executed' || after.status === 'executed')
    && phase7.schedule_applied_in_this_attempt === changed;
}

const sameValue = (left, right) =>
  canonicalDigest(left) === canonicalDigest(right);

function validCausality(phase7) {
  const candidate = phase7.temporal.terminal_candidate;
  const transition = phase7.temporal.waiting_transition;
  const signal = phase7.autonomous.signal;
  const boundary = phase7.autonomous.boundary;
  const actorStep = tracePhase7ActorStep(
    phase7.schedule_temporal.projection, phase7.actor_step);
  const completion = phase7.schedule_temporal.completion_candidate;
  const orderedSignals =
    phase7.autonomous.decision_records?.[0]?.orderedSignals;
  const candidateRef = {
    entity_kind: 'temporal_boundary_candidate',
    entity_id: candidate?.boundary_id
  };
  const transitionRef = {
    entity_kind: 'npc_activity_factual_transition',
    entity_id: transition?.transition_id
  };
  const restEnd = phase7.schedule_temporal.result.clock_after;
  const completed = actorStep?.status === 'completed';
  const stillRunning = actorStep?.status === 'started';
  return sameClock(candidate?.scheduled_at, phase7.temporal.result.clock_after)
    && (completed
      ? sameClock(completion?.scheduled_at, actorStep?.completed_at)
      : stillRunning
        && compareGameTimestamp(completion?.scheduled_at, restEnd) > 0)
    && canonicalDigest(transition?.source_candidate_ref)
      === canonicalDigest(candidateRef)
    && canonicalDigest(transition?.causal_parent_refs)
      === canonicalDigest([candidateRef])
    && canonicalDigest(signal?.source_event_ref)
      === canonicalDigest(transitionRef)
    && canonicalDigest(signal?.causal_parent_refs)
      === canonicalDigest([candidateRef])
    && Array.isArray(orderedSignals)
    && orderedSignals.some(({ signal_id: signalId }) =>
      signalId === signal?.signal_id)
    && canonicalDigest(boundary?.signal_refs) === canonicalDigest(
      orderedSignals.map(({ signal_id: signalId }) => ({
        entity_kind: 'npc_decision_signal',
        entity_id: signalId
      })))
    && canonicalDigest(completion?.source_ref)
      === canonicalDigest(actorStep?.decision_trace_ref)
    && canonicalDigest(completion?.causal_parent_refs)
      === canonicalDigest([actorStep?.decision_trace_ref]);
}

const sameClock = (left, right) =>
  canonicalDigest(left) === canonicalDigest(right);

function validActorStepCompletion(phase7) {
  const actorStep = phase7.actor_step;
  const schedule = phase7.schedule_execution;
  const temporalClock = phase7.temporal.result.clock_after;
  const active = tracePhase7ActorStep(
    phase7.schedule_temporal.projection, phase7.actor_step);
  const finalClock = phase7.schedule_temporal.result.clock_after;
  if (actorStep?.status !== 'started'
      || active?.npc_ref !== schedule.npc_ref
      || canonicalDigest(actorStep.clock_before)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(actorStep.clock_after)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(schedule.clock_before)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(active.started_at) !== canonicalDigest(temporalClock)
      || canonicalDigest(active.semantic_operation)
        !== canonicalDigest(schedule.semantic_operation)
      || canonicalDigest(active.additional_semantic_operations ?? [])
        !== canonicalDigest(schedule.additional_semantic_operations ?? [])) {
    return false;
  }
  if (active.status === 'completed') {
    const completionClock = active.completed_at;
    if (completionClock == null
        || schedule.status !== 'executed'
        || canonicalDigest(schedule.clock_after)
          !== canonicalDigest(completionClock)
        || compareGameTimestamp(completionClock, finalClock) > 0
        || exactIntegerElapsed(schedule.clock_before, schedule.clock_after)
          !== Number(schedule.exact_elapsed.exact_minutes.numerator)
        || canonicalDigest(active.completed_at)
          !== canonicalDigest(completionClock)) return false;
    return canonicalDigest({
      ...structuredClone(actorStep),
      status: 'executed',
      failure_code: null,
      clock_after: structuredClone(completionClock)
    }) === canonicalDigest(schedule);
  }
  if (active.status !== 'started'
      || schedule.status !== 'started'
      || compareGameTimestamp(
        addElapsedTime(active.started_at, active.planned_exact_elapsed),
        finalClock) <= 0) {
    return false;
  }
  return canonicalDigest(actorStep) === canonicalDigest(schedule);
}

function exactIntegerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') return null;
  const value = Number(exact.numerator);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
