import { canonicalDigest } from '@rus/materialization';
import { selectApplicableNpcActivityExecution } from '@rus/npc-runtime';
import {
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { serverError } from '../../errors.js';
import { resolveTracePhase7DomainProposals } from
  '../../runtime/lower-dvina-trace-phase-7-owner-proposals.js';

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
      || schedule.status !== 'executed'
      || schedule.exact_elapsed.exact_minutes.denominator !== '1'
      || schedule.root_clock_write_count !== 0
      || schedule.parent_state_version !== state.party_state.state_version
      || !validActorStepCompletion(phase7)
      || !validCausality(phase7)
      || !validScheduleExecution(schedule, phase7Contracts,
        phase7.autonomous.request, phase7.autonomous.proposal.plan, state)
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
  const candidateRef = {
    entity_kind: 'temporal_boundary_candidate',
    entity_id: candidate?.boundary_id
  };
  const transitionRef = {
    entity_kind: 'npc_activity_factual_transition',
    entity_id: transition?.transition_id
  };
  return sameClock(candidate?.scheduled_at, phase7.temporal.result.clock_after)
    && sameClock(
      completion?.scheduled_at,
      phase7.schedule_temporal.projection.active_npc_actor_step?.completed_at
    )
    && canonicalDigest(transition?.source_candidate_ref)
      === canonicalDigest(candidateRef)
    && canonicalDigest(transition?.causal_parent_refs)
      === canonicalDigest([candidateRef])
    && canonicalDigest(signal?.source_event_ref)
      === canonicalDigest(transitionRef)
    && canonicalDigest(signal?.causal_parent_refs)
      === canonicalDigest([candidateRef])
    && canonicalDigest(boundary?.signal_refs)
      === canonicalDigest([{
        entity_kind: 'npc_decision_signal',
        entity_id: signal?.signal_id
      }])
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
  const completionClock = active?.completed_at;
  const finalClock = phase7.schedule_temporal.result.clock_after;
  if (actorStep?.status !== 'started'
      || active?.status !== 'completed'
      || completionClock == null
      || canonicalDigest(actorStep.clock_before)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(actorStep.clock_after)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(schedule.clock_before)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(schedule.clock_after)
        !== canonicalDigest(completionClock)
      || compareGameTimestamp(completionClock, finalClock) > 0
      || exactIntegerElapsed(schedule.clock_before, schedule.clock_after)
        !== Number(schedule.exact_elapsed.exact_minutes.numerator)
      || active.npc_ref !== schedule.npc_ref
      || canonicalDigest(active.started_at) !== canonicalDigest(temporalClock)
      || canonicalDigest(active.completed_at)
        !== canonicalDigest(completionClock)
      || canonicalDigest(active.semantic_operation)
        !== canonicalDigest(schedule.semantic_operation)) return false;
  return canonicalDigest({
    ...structuredClone(actorStep),
    status: 'executed',
    failure_code: null,
    clock_after: structuredClone(completionClock)
  }) === canonicalDigest(schedule);
}

function validScheduleExecution(schedule, contracts, request, plan, state) {
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
  if (!direct && operation.op === 'request_activity') {
    const selected = selectApplicableNpcActivityExecution({
      operation,
      activity_profiles: contracts.scheduleActivityProfiles,
      execution_bindings: profiles,
      movement_bindings: [contracts.localTransition],
      property_transition_profiles: [
        contracts.bagTransition, contracts.bagConcealTransition
      ].filter(Boolean)
    });
    if (!selected.pass || canonicalDigest(selected.execution_binding)
        !== canonicalDigest(execution)) return false;
  }
  if (!direct && schedule.execution_binding_ref !== null
      && (execution == null
        || (execution.movement_ref == null
          ? schedule.movement_proposal != null
          : schedule.movement_proposal?.transition_ref
            !== execution.movement_ref)
        || canonicalDigest(execution.property_transition_refs ?? [])
          !== canonicalDigest(propertyTransitionRef == null
            ? [] : [propertyTransitionRef]))) return false;
  if (direct) return true;
  let expected;
  try {
    expected = resolveTracePhase7DomainProposals({
      operation, state, contracts, profile: execution
    });
  } catch {
    return false;
  }
  return canonicalDigest(schedule.movement_proposal)
      === canonicalDigest(expected.movement)
    && canonicalDigest(schedule.property_proposal)
      === canonicalDigest(expected.property);
}

function exactIntegerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') return null;
  const value = Number(exact.numerator);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
