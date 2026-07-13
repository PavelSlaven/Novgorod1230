import { assertValid, validateConsequencePackage } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function resolveConsequenceStage({ playerInput, modeResolution, retrievedState, availability, checks, consequenceResolver }) {
  const output = await consequenceResolver.resolve({
    version: 1,
    schema: 'turn_consequence_request',
    player_input: structuredClone(playerInput),
    mode_resolution: structuredClone(modeResolution),
    retrieved_state: structuredClone(retrievedState),
    availability: structuredClone(availability),
    check_results: structuredClone(checks)
  });
  assertValid('turn_consequence_package', validateConsequencePackage(output));
  return freezeOutput(output);
}
