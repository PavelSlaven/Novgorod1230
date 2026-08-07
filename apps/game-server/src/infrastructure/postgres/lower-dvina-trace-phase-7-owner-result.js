import { canonicalDigest } from '@rus/materialization';
import {
  addElapsedTime,
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { serverError } from '../../errors.js';

export function assertPhase7OwnerResult({ factual, state, phase7Contracts,
  changeSetId }) {
  const phase7 = factual.consequence.phase7;
  const temporal = phase7.temporal;
  const scheduleTemporal = phase7.schedule_temporal;
  const schedule = phase7.schedule_execution;
  if (temporal.elapsed_before_decision !== 25
      || temporal.result.temporal_status !== 'paused'
      || scheduleTemporal?.result?.temporal_status !== 'completed'
      || scheduleTemporal.elapsed_after_decision !== 5
      || !sameClock(scheduleTemporal.result.clock_before,
        temporal.result.clock_after)
      || !sameClock(scheduleTemporal.result.clock_after,
        factual.time_update.clock_after)
      || !sameClock(temporal.result.clock_before, state.clock)
      || !['executed', 'started'].includes(schedule.status)
      || schedule.exact_elapsed.exact_minutes.denominator !== '1'
      || schedule.root_clock_write_count !== 0
      || schedule.parent_state_version !== state.party_state.state_version
      || !validActorStepCompletion(phase7)
      || !validCausality(phase7)
      || !validScheduleExecution(schedule, phase7Contracts,
        phase7.autonomous.request, phase7.autonomous.proposal.plan)
      || temporal.result.combined_change_set.change_set_id !== changeSetId
      || scheduleTemporal.result.combined_change_set.change_set_id
        !== changeSetId
      || factual.body_update.applied !== true
      || factual.body_update.proposal.profile_ref
        !== phase7Contracts.bodyEffect.effect_profile_id) {
    throw serverError(
      'TRACE_PHASE_7_OWNER_RESULT_INVALID',
      'Phase 7 factual commit failed closed.',
      { status: 409, details: null }
    );
  }
}

function validCausality(phase7) {
  const candidate = phase7.temporal.terminal_candidate;
  const transition = phase7.temporal.projection.waiting_transition;
  const signal = phase7.autonomous.signal;
  const boundary = phase7.autonomous.boundary;
  const actorStep = phase7.schedule_temporal.projection.active_npc_actor_step;
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
  const active = phase7.schedule_temporal.projection?.active_npc_actor_step;
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
        !== canonicalDigest(schedule.semantic_operation)) return false;
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

function validScheduleExecution(schedule, contracts, request, plan) {
  const operation = schedule.semantic_operation;
  if (!operation || schedule.npc_ref !== request.npc_ref) return false;
  const direct = operation.op === 'apply_semantic_activity';
  const semanticProfile = direct
    ? contracts.semanticActivityProfiles.find((profile) =>
      profile.duration_class === plan.activity?.duration_class
        && profile.effort === plan.activity?.effort)
    : null;
  const profiles = Object.values(contracts.scheduleExecutions);
  const profileMatch = direct
    ? plan.resolution === 'direct'
      && plan.operations.length === 0
      && canonicalDigest(operation.activity) === canonicalDigest(plan.activity)
      && schedule.execution_binding_ref === null
      && schedule.schedule_option_id === null
      && schedule.activity_profile_ref === semanticProfile?.profile_ref
      && Number(schedule.exact_elapsed.exact_minutes.numerator)
        === semanticProfile?.duration_minutes
    : plan.resolution === 'domain_request'
      && plan.operations.length === 1
      && canonicalDigest(operation) === canonicalDigest(plan.operations[0])
      && Object.hasOwn(request.decision_scope.operation_contract, operation.op)
      && (schedule.execution_binding_ref === null
        ? schedule.activity_profile_ref === null
          && schedule.schedule_option_id === null
        : profiles.some((profile) =>
          profile.execution_binding_id === schedule.execution_binding_ref
            && profile.activity_profile_ref === schedule.activity_profile_ref
            && profile.schedule_option_id === schedule.schedule_option_id));
  if (!profileMatch) return false;
  if (direct && (schedule.movement_proposal || schedule.property_proposal)) {
    return false;
  }
  const propertyTransitionRef =
    schedule.property_proposal?.transition_profile_id;
  if (propertyTransitionRef != null && ![
    contracts.bagTransition?.transition_profile_id,
    contracts.bagConcealTransition?.transition_profile_id
  ].includes(propertyTransitionRef)) return false;
  const execution = profiles.find((profile) =>
    profile.execution_binding_id === schedule.execution_binding_ref);
  if (!direct && schedule.execution_binding_ref !== null
      && (execution == null
        || (execution.movement_ref == null
          ? schedule.movement_proposal != null
          : schedule.movement_proposal?.transition_ref
            !== execution.movement_ref)
        || canonicalDigest(execution.property_transition_refs ?? [])
          !== canonicalDigest(propertyTransitionRef == null
            ? [] : [propertyTransitionRef]))) return false;
  if (!validPinnedMovementShape(schedule.movement_proposal, contracts)) {
    return false;
  }
  return true;
}

function validPinnedMovementShape(proposal, contracts) {
  if (proposal == null) return true;
  const binding = contracts.localTransition;
  if (binding == null) return false;
  // Shape-check against pinned transition binding; do not re-plan proposals.
  return proposal.transition_ref === binding.transition_id
    && proposal.location_ref === binding.location_ref
    && proposal.destination_zone_ref === binding.destination_zone_ref;
}

function exactIntegerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') return null;
  const value = Number(exact.numerator);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
