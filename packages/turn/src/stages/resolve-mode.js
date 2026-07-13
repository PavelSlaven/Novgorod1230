import { assertValid, validateTurnModeResolution } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function resolveTurnModeStage({ playerInput, routingContext = {}, modeResolver }) {
  const output = await modeResolver.resolve({
    version: 1,
    schema: 'turn_mode_resolution_request',
    player_input: structuredClone(playerInput),
    routing_context: structuredClone(routingContext)
  });
  assertValid('turn_mode_resolution', validateTurnModeResolution(output));
  return freezeOutput(output);
}
