import { freezeOutput } from './shared.js';

export async function loadTurnContextStage({ playerInput, modeResolution, stateReader }) {
  const requestedBlocks = modeResolution.resolution_plan.state_blocks_to_load;
  const state = await stateReader.read({
    party_id: playerInput.party_id,
    turn_number: playerInput.turn_number,
    requested_blocks: structuredClone(requestedBlocks),
    mode_resolution: structuredClone(modeResolution)
  });
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('stateReader.read must return an object');
  return freezeOutput({ version: 1, schema: 'retrieved_turn_state', ...state });
}
