import { assertValid, validateConsequencePackage } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function resolveConsequenceStage({ playerInput, modeResolution, retrievedState, availability, checks, commandRegistry }) {
  const command = commandRegistry.get(modeResolution.command_id);
  const output = await command.consequence(Object.freeze(structuredClone({ playerInput, modeResolution, retrievedState, availability, checks })));
  assertValid('turn_consequence_package', validateConsequencePackage(output));
  return freezeOutput(output);
}
