import { canonicalDigest } from '@rus/materialization';
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
      || schedule.status !== 'executed'
      || schedule.exact_elapsed.exact_minutes.denominator !== '1'
      || Number(schedule.exact_elapsed.exact_minutes.numerator) !== 5
      || schedule.root_clock_write_count !== 0
      || schedule.parent_state_version !== state.party_state.state_version
      || !validActorStepCompletion(phase7)
      || !validScheduleExecution(schedule, phase7Contracts,
        phase7.autonomous.request)
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

const sameClock = (left, right) =>
  canonicalDigest(left) === canonicalDigest(right);

function validActorStepCompletion(phase7) {
  const actorStep = phase7.actor_step;
  const schedule = phase7.schedule_execution;
  const temporalClock = phase7.temporal.result.clock_after;
  const completionClock = phase7.schedule_temporal.result.clock_after;
  const active = phase7.schedule_temporal.projection?.active_npc_actor_step;
  if (actorStep?.status !== 'started'
      || canonicalDigest(actorStep.clock_before)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(actorStep.clock_after)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(schedule.clock_before)
        !== canonicalDigest(temporalClock)
      || canonicalDigest(schedule.clock_after)
        !== canonicalDigest(completionClock)
      || active?.status !== 'completed'
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

function validScheduleExecution(schedule, contracts, request) {
  const operation = schedule.semantic_operation;
  if (!operation
      || !Object.hasOwn(
        request.decision_scope.operation_contract, operation.op
      )) return false;
  const profiles = Object.values(contracts.scheduleExecutions);
  const profileMatch = schedule.execution_binding_ref === null
    ? schedule.activity_profile_ref === null
      && schedule.schedule_option_id === null
    : profiles.some((profile) =>
      profile.execution_binding_id === schedule.execution_binding_ref
        && profile.activity_profile_ref === schedule.activity_profile_ref
        && profile.schedule_option_id === schedule.schedule_option_id);
  if (!profileMatch) return false;
  if (schedule.movement_proposal
      && schedule.movement_proposal.transition_ref
        !== contracts.localTransition.transition_id) return false;
  const propertyTransitionRef =
    schedule.property_proposal?.transition_profile_id;
  return propertyTransitionRef == null || [
    contracts.bagTransition?.transition_profile_id,
    contracts.bagConcealTransition?.transition_profile_id
  ].includes(propertyTransitionRef);
}
