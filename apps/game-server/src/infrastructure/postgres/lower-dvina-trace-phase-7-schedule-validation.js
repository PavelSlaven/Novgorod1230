import { canonicalDigest } from '@rus/materialization';

const DIRECT = new Set([
  'create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'apply_body_event'
]);

export function validPhase7ScheduleExecution(
  schedule, contracts, request, plan, actorStepCheck
) {
  const operation = schedule.semantic_operation;
  if (!operation || schedule.npc_ref !== request.npc_ref) return false;
  const semantic = operation.op === 'apply_semantic_activity';
  const semanticProfile = semantic
    ? contracts.semanticActivityProfiles.find((profile) =>
      profile.duration_class === plan.activity?.duration_class
        && profile.effort === plan.activity?.effort)
    : null;
  const profiles = Object.values(contracts.scheduleExecutions);
  const additionalOperations = schedule.additional_semantic_operations ?? [];
  const selectedOutcome = plan.resolution === 'generic_check'
    ? plan.check.outcomes[actorStepCheck?.result?.outcome?.band] : null;
  const selectedOperations = selectedOutcome?.operations ?? [];
  const selectedDomain = selectedOperations.filter(({ op }) =>
    !DIRECT.has(op)
      && Object.hasOwn(request.decision_scope.operation_contract, op));
  const additionalActivities = selectedOutcome?.additional_activity == null
    ? [] : [selectedOutcome.additional_activity];
  const planDomain = plan.operations.filter(({ op }) => !DIRECT.has(op));
  const actionProduction = plan.resolution === 'domain_request'
    && planDomain.length === 1
    && planDomain[0]?.op === 'request_item_use'
    && planDomain[0]?.action_production != null;
  const possibleAdditionalOperations = [
    ...((actionProduction || plan.resolution === 'generic_check'
      && selectedDomain.length === 1) ? [plan.activity] : []),
    ...additionalActivities
  ].map((activity) => ({
    op: 'apply_semantic_activity',
    activity: { owner: 'semantic', ...activity }
  }));
  const additionalDuration = additionalOperations.reduce((sum, candidate) => {
    const profile = contracts.semanticActivityProfiles.find((value) =>
      value.duration_class === candidate.activity?.duration_class
        && value.effort === candidate.activity?.effort);
    return profile == null ? Number.NaN : sum + profile.duration_minutes;
  }, 0);
  const additionalMatch = canonicalDigest(additionalOperations)
    === canonicalDigest(possibleAdditionalOperations);
  const profileMatch = semantic
    ? ['direct', 'generic_check'].includes(plan.resolution)
      && (plan.resolution !== 'direct'
        || plan.operations.every(({ op }) => DIRECT.has(op)))
      && canonicalDigest(operation.activity) === canonicalDigest(plan.activity)
      && schedule.execution_binding_ref === null
      && schedule.schedule_option_id === null
      && schedule.activity_profile_ref === semanticProfile?.profile_ref
      && Number(schedule.exact_elapsed.exact_minutes.numerator)
        === semanticProfile?.duration_minutes + additionalDuration
      && additionalMatch
    : (plan.resolution === 'domain_request'
        ? planDomain : selectedDomain).length === 1
      && canonicalDigest(operation) === canonicalDigest(
        (plan.resolution === 'domain_request' ? planDomain : selectedDomain)[0])
      && Object.hasOwn(request.decision_scope.operation_contract, operation.op)
      && (schedule.execution_binding_ref === null
        ? schedule.activity_profile_ref === null
          && schedule.schedule_option_id === null
        : profiles.some((profile) =>
          profile.execution_binding_id === schedule.execution_binding_ref
            && profile.activity_profile_ref === schedule.activity_profile_ref
            && profile.schedule_option_id === schedule.schedule_option_id));
  if (!profileMatch || (!semantic && (plan.resolution === 'domain_request'
    ? actionProduction
      ? !additionalMatch
        || Number(schedule.exact_elapsed.exact_minutes.numerator)
          !== additionalDuration
      : additionalOperations.length !== 0
    : selectedDomain.length !== 1 || !additionalMatch))) return false;
  if (semantic && (schedule.movement_proposal || schedule.property_proposal)) {
    return false;
  }
  const propertyTransitionRef = schedule.property_proposal?.transition_profile_id;
  if (propertyTransitionRef != null && ![
    contracts.bagTransition?.transition_profile_id,
    contracts.bagConcealTransition?.transition_profile_id
  ].includes(propertyTransitionRef)) return false;
  const execution = profiles.find((profile) =>
    profile.execution_binding_id === schedule.execution_binding_ref);
  if (!semantic && schedule.execution_binding_ref !== null
      && (execution == null
        || (execution.movement_ref == null
          ? schedule.movement_proposal != null
          : schedule.movement_proposal?.transition_ref !== execution.movement_ref)
        || canonicalDigest(execution.property_transition_refs ?? [])
          !== canonicalDigest(propertyTransitionRef == null
            ? [] : [propertyTransitionRef]))) return false;
  return validPinnedMovementShape(schedule.movement_proposal, contracts);
}

function validPinnedMovementShape(proposal, contracts) {
  if (proposal == null) return true;
  const binding = contracts.localTransition;
  return binding != null
    && proposal.transition_ref === binding.transition_id
    && proposal.location_ref === binding.location_ref
    && proposal.destination_zone_ref === binding.destination_zone_ref;
}
