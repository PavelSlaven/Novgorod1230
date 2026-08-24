import { isDeepStrictEqual } from 'node:util';
import {
  matchesOperationContract,
  selectApplicableNpcActivityExecution
} from '@rus/npc-runtime';

export function validateTracePhase7Plan({ plan, request, contracts,
  operationContract }) {
  if (!isDeepStrictEqual(
    request.decision_scope.operation_contract,
    operationContract
  )) {
    return rejected('NPC_OPERATION_CONTRACT_STALE');
  }
  if (plan.resolution === 'direct' || plan.resolution === 'generic_check') {
    const profile = contracts.semanticActivityProfiles.find((candidate) =>
      candidate.duration_class === plan.activity.duration_class
        && candidate.effort === plan.activity.effort);
    const additionalProfiles = plan.resolution === 'generic_check'
      ? Object.values(plan.check.outcomes).flatMap(({ additional_activity }) =>
          additional_activity == null ? [] : [additional_activity])
      : [];
    const additionalApplicable = additionalProfiles.every((activity) =>
      contracts.semanticActivityProfiles.some((candidate) =>
        candidate.duration_class === activity.duration_class
          && candidate.effort === activity.effort));
    const outcomesApplicable = plan.resolution !== 'generic_check'
      || Object.values(plan.check.outcomes).every(({ operations }) =>
        operations.every((operation) =>
          Object.hasOwn(operationContract, operation.op)
          && matchesOperationContract(operation, operationContract[operation.op])));
    return profile != null && additionalApplicable && outcomesApplicable
      ? accepted()
      : rejected('NPC_ACTIVITY_PROFILE_NOT_APPLICABLE');
  }
  if (plan.resolution !== 'domain_request') {
    return rejected('NPC_DOMAIN_REQUEST_NOT_APPLICABLE');
  }
  const domainOperations = plan.operations.filter(({ op }) =>
    Object.hasOwn(operationContract, op));
  const operation = domainOperations[0];
  if (domainOperations.length !== 1
      || !Object.hasOwn(operationContract, operation.op)
      || !matchesOperationContract(operation, operationContract[operation.op])) {
    return rejected(operation?.op === 'request_item_use'
      ? 'NPC_ITEM_OPERATION_NOT_APPLICABLE'
      : operation?.op === 'request_movement'
        ? 'NPC_MOVEMENT_OPERATION_NOT_APPLICABLE'
        : operation?.op === 'request_world_process'
          ? 'NPC_WORLD_PROCESS_NOT_APPLICABLE'
          : 'NPC_DOMAIN_REQUEST_NOT_APPLICABLE');
  }
  if (operation.op === 'request_activity') {
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
      ? accepted()
      : rejected(selection.errors[0]?.code
        ?? 'NPC_ACTIVITY_PROFILE_NOT_APPLICABLE');
  }
  return accepted();
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
