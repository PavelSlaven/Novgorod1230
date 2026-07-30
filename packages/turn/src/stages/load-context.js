import { freezeOutput } from './shared.js';

export async function loadTurnContextStage({
  playerInput,
  routingContext = {},
  commandRegistry,
  stateReader
}) {
  const requestedBlocks = commandRegistry.stateBlocks();
  const state = await stateReader.read({
    party_id: playerInput.party_id,
    turn_number: playerInput.turn_number,
    requested_blocks: structuredClone(requestedBlocks),
    routing_context: structuredClone(routingContext)
  });
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('stateReader.read must return an object');
  return freezeOutput({ version: 1, schema: 'retrieved_turn_state', ...state });
}
