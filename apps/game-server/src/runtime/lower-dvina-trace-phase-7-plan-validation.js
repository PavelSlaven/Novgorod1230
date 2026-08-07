import { canonicalDigest } from '@rus/materialization';
import { selectApplicableNpcActivityExecution } from '@rus/npc-runtime';

export function validateTracePhase7Plan({ plan, request, contracts,
  operationContract }) {
  if (canonicalDigest(request.decision_scope.operation_contract)
      !== canonicalDigest(operationContract)) {
    return rejected('NPC_OPERATION_CONTRACT_STALE');
  }
  const activityContract = operationContract.request_activity;
  if (activityContract == null) return rejected('NPC_ACTIVITY_PROFILE_NOT_APPLICABLE');
  if (plan.resolution === 'direct') {
    const profile = contracts.semanticActivityProfiles.find((candidate) =>
      candidate.duration_class === plan.activity.duration_class
        && candidate.effort === plan.activity.effort);
    return profile != null
      && withinAvailableTime(profile.duration_minutes, activityContract)
      ? accepted()
      : rejected('NPC_ACTIVITY_PROFILE_NOT_APPLICABLE');
  }
  if (plan.resolution !== 'domain_request') {
    return rejected('NPC_DOMAIN_REQUEST_NOT_APPLICABLE');
  }
  const operation = plan.operations.find(({ op }) =>
    op === 'request_activity'
      || op === 'request_item_use'
      || op === 'request_movement');
  if (operation?.op === 'request_activity') {
    if (!withinActivityCapabilities(activityContract, operation)) {
      return rejected('NPC_ACTIVITY_EXECUTION_NOT_APPLICABLE');
    }
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
      && withinAvailableTime(
        profileMinutes(selection.execution_binding), activityContract)
      ? accepted()
      : rejected(selection.errors[0]?.code
        ?? 'NPC_ACTIVITY_PROFILE_NOT_APPLICABLE');
  }
  if (operation?.op === 'request_movement') {
    return withinMovementCapabilities(
      operationContract.request_movement, operation)
      ? accepted()
      : rejected('NPC_MOVEMENT_OPERATION_NOT_APPLICABLE');
  }
  const itemContract = operationContract.request_item_use;
  return operation?.op === 'request_item_use'
    && itemContract != null
    && withinItemCapabilities(itemContract, operation)
    ? accepted()
    : rejected('NPC_ITEM_OPERATION_NOT_APPLICABLE');
}

function withinActivityCapabilities(contract, operation) {
  return Array.isArray(contract.activity_kinds)
    && contract.activity_kinds.includes(operation.activity_kind)
    && Array.isArray(contract.target_refs)
    && operation.target_refs.every((ref) => contract.target_refs.includes(ref));
}

function withinItemCapabilities(contract, operation) {
  return Array.isArray(contract.item_refs)
    && contract.item_refs.includes(operation.item_ref)
    && Array.isArray(contract.use_kinds)
    && contract.use_kinds.includes(operation.use_kind)
    && Array.isArray(contract.target_refs)
    && operation.target_refs.every((ref) => contract.target_refs.includes(ref));
}

function withinMovementCapabilities(contract, operation) {
  return contract != null
    && Array.isArray(contract.movement_kinds)
    && contract.movement_kinds.includes(operation.movement_kind)
    && Array.isArray(contract.target_refs)
    && contract.target_refs.includes(operation.target_ref);
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

function accepted() {
  return Object.freeze({ pass: true, errors: [] });
}

function rejected(code) {
  return Object.freeze({
    pass: false,
    errors: [Object.freeze({
      code,
      category: 'applicability',
      retryable: false
    })]
  });
}
