import { canonicalDigest } from '@rus/materialization';
import { selectApplicableNpcActivityExecution } from '@rus/npc-runtime';

export function validateTracePhase7Plan({ plan, request, contracts,
  operationContract }) {
  if (canonicalDigest(request.decision_scope.operation_contract)
      !== canonicalDigest(operationContract)) {
    return false;
  }
  const activityContract = operationContract.request_activity;
  if (activityContract == null) return false;
  if (plan.resolution === 'direct') {
    const profile = contracts.semanticActivityProfiles.find((candidate) =>
      candidate.duration_class === plan.activity.duration_class
        && candidate.effort === plan.activity.effort);
    return profile != null
      && withinAvailableTime(profile.duration_minutes, activityContract);
  }
  if (plan.resolution !== 'domain_request') return false;
  const operation = plan.operations.find(({ op }) =>
    op === 'request_activity' || op === 'request_item_use');
  if (operation?.op === 'request_activity') {
    const selection = selectApplicableNpcActivityExecution({
      operation,
      activity_profiles: contracts.scheduleActivityProfiles,
      execution_bindings: Object.values(contracts.scheduleExecutions),
      movement_bindings: [contracts.localTransition],
      property_transition_profiles: [
        contracts.bagTransition, contracts.bagConcealTransition
      ]
    });
    return selection.pass
      && activityContract.activity_kinds.includes(operation.activity_kind)
      && withinAvailableTime(
        profileMinutes(selection.execution_binding), activityContract);
  }
  const itemContract = operationContract.request_item_use;
  return operation?.op === 'request_item_use'
    && itemContract != null
    && itemContract.item_refs.includes(operation.item_ref)
    && itemContract.use_kinds.includes(operation.use_kind)
    && sameSet(operation.target_refs, itemContract.target_refs);
}

function profileMinutes(profile) {
  return (profile.elapsed_plan?.stages ?? []).reduce(
    (sum, stage) => sum + stage.duration_minutes, 0);
}

function withinAvailableTime(minutes, contract) {
  return Number.isSafeInteger(minutes)
    && minutes > 0
    && minutes <= contract.maximum_elapsed_minutes;
}

function sameSet(left, right) {
  return left.length === right.length
    && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}
