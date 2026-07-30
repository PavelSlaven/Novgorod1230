import { createTurnAvailableActionSet } from '../command-registry.js';

export function buildAvailableActionsStage({
  playerInput,
  retrievedState,
  routingContext,
  commandRegistry
}) {
  return createTurnAvailableActionSet({
    registry: commandRegistry,
    committedState: retrievedState,
    actorId: String(routingContext.actor_id
      ?? retrievedState.actor_id
      ?? playerInput.party_id),
    policyPins: routingContext.policy_pins ?? retrievedState.policy_pins ?? []
  });
}
