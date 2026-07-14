import { assertValid, validateAvailabilityDecision } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function resolveAvailabilityStage({ playerInput, modeResolution, retrievedState, commandRegistry }) {
  const command = commandRegistry.get(modeResolution.command_id);
  const output = await command.availability(deepContext({ playerInput, modeResolution, retrievedState }));
  assertValid('turn_availability_decision', validateAvailabilityDecision(output));
  return freezeOutput(output);
}
function deepContext(value) { return Object.freeze(structuredClone(value)); }
