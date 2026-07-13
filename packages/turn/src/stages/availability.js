import { assertValid, validateAvailabilityDecision } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function resolveAvailabilityStage({ playerInput, modeResolution, retrievedState, availabilityResolver }) {
  const output = await availabilityResolver.resolve({
    version: 1,
    schema: 'turn_availability_request',
    player_input: structuredClone(playerInput),
    mode_resolution: structuredClone(modeResolution),
    retrieved_state: structuredClone(retrievedState)
  });
  assertValid('turn_availability_decision', validateAvailabilityDecision(output));
  return freezeOutput(output);
}
