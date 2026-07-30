import { createTurnAvailableActionSet } from '../command-registry.js';
import { freezeOutput } from './shared.js';

export async function revalidateTurnContextStage({
  playerInput,
  modeResolution,
  routingContext = {},
  actionSet,
  commandRegistry,
  stateReader
}) {
  const state = await stateReader.read({
    party_id: playerInput.party_id,
    turn_number: playerInput.turn_number,
    requested_blocks: structuredClone(commandRegistry.stateBlocks()),
    routing_context: structuredClone(routingContext),
    revalidation: true
  });
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('stateReader.read must return an object');
  }
  let refreshed;
  try {
    refreshed = await createTurnAvailableActionSet({
      registry: commandRegistry,
      committedState: state,
      actorId: routingContext.actor_id ?? playerInput.party_id,
      policyPins: routingContext.policy_pins ?? []
    });
  } catch (error) {
    if (error.code === 'TURN_AVAILABLE_ACTION_SET_EMPTY') {
      throw staleError();
    }
    throw error;
  }
  if (refreshed.state_version !== actionSet.state_version
      || refreshed.options_digest !== actionSet.options_digest
      || !refreshed.options.some(
        ({ option_id: optionId }) => optionId === modeResolution.option_id
      )) {
    throw staleError();
  }
  return freezeOutput({
    version: 1,
    schema: 'revalidated_turn_state',
    ...state
  });
}

function staleError() {
  return Object.assign(
    new Error('Committed state changed after semantic intent resolution.'),
    { code: 'TURN_SEMANTIC_STATE_STALE' }
  );
}
