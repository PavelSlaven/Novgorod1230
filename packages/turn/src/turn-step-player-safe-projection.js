import { isDeepStrictEqual } from 'node:util';

export function initialWorkingProjectionFrom(projected) {
  const descriptor = Object.getOwnPropertyDescriptor(
    projected, 'initial_working_projection'
  );
  if (descriptor == null) {
    return projected.player_safe_state;
  }
  if (descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')
      || !plain(descriptor.value)) {
    throw Object.assign(new Error(
      'Player-safe projector initial_working_projection must be an own data object.'
    ), { code: 'TURN_STEP_PLAYER_SAFE_PROJECTION_INVALID' });
  }
  return descriptor.value;
}

export function projectAvailableDomainOperations({ state, operations,
  semanticBindings, preparedFollowupCandidates = [] }) {
  const playerSafeState = structuredClone(state);
  delete playerSafeState.available_domain_operation_grounding;
  const grounding = availableDomainOperationGrounding(
    operations, semanticBindings);
  if (grounding.length > 0) {
    playerSafeState.available_domain_operation_grounding = grounding;
  }
  return { player_safe_state: playerSafeState,
    available_domain_operations: structuredClone(operations),
    ...(preparedFollowupCandidates.length === 0 ? {} : {
      prepared_followup_candidates: structuredClone(preparedFollowupCandidates)
    }) };
}

function availableDomainOperationGrounding(operations, semanticBindings) {
  return operations.flatMap((operation) => {
    const matches = semanticBindings.filter(({ command, binding }) =>
      command.semantic_grounding != null && bindingOperations(binding).some(
        (candidate) => isDeepStrictEqual(candidate, operation)));
    return matches.length !== 1 ? [] : [{ operation: structuredClone(operation),
      semantic_scope: structuredClone(matches[0].command.semantic_grounding) }];
  });
}

function bindingOperations(binding) {
  return (binding.operation_dtos
    ?? (binding.operation_dto == null ? [] : [binding.operation_dto]))
    .map((operation) => structuredClone(operation));
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
