import { deepFreeze } from '@rus/kernel';

export function resolveTurnStepDomainOwner({
  operation, plan, request, actor, playerSafeState, committedState,
  externalRegistry, semanticBindings, availableOptions, preparedChainContext,
  services, isOrdinaryDiscoveryInScope, isSpatialSemanticRemainderInScope,
  isActionProductionOwnerInScope
}) {
  const externalHandler = externalRegistry?.domain?.(operation);
  if (typeof externalHandler === 'function') {
    return { kind: 'external', handler: externalHandler };
  }
  const matches = semanticBindings.filter(({ command, binding }) =>
    ((preparedChainContext?.prior_effect_count ?? 0) > 0
      || availableOptions.has(command.option_id))
    && binding.operation === operation.op
    && binding.matches(deepFreeze({
      operation: structuredClone(operation), plan: structuredClone(plan),
      actor: structuredClone(actor),
      player_safe_state: structuredClone(playerSafeState),
      committed_state: structuredClone(committedState)
    })) === true);
  if (matches.length === 1) return { kind: 'binding', command: matches[0].command };
  if (matches.length > 1) return { kind: 'ambiguous' };
  if (operation.op === 'request_discovery'
      && typeof services.turnStepOrdinaryDiscoveryResolver === 'function'
      && isOrdinaryDiscoveryInScope({ operation, playerSafeState })) {
    return { kind: 'ordinary_discovery' };
  }
  if (operation.op === 'request_world_process'
      && typeof services.turnStepWorldProcessResolver === 'function') {
    return { kind: 'world_process' };
  }
  if (typeof services.turnStepSpatialSemanticResolver === 'function'
      && isSpatialSemanticRemainderInScope({ operation, playerSafeState })) {
    return { kind: 'spatial' };
  }
  if (typeof services.turnStepActionProductionOwner === 'function'
      && isActionProductionOwnerInScope({ operation, playerSafeState,
        remainingIntent: request.remaining_intent })) {
    return { kind: 'action_production' };
  }
  return { kind: 'missing' };
}
