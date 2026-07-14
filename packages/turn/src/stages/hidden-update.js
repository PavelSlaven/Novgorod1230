import { freezeOutput } from './shared.js';

export async function buildHiddenUpdateStage({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, commandRegistry }) {
  const approved = structuredClone(consequence.hidden_update ?? {});
  const command = commandRegistry.get(modeResolution.command_id);
  const output = typeof command.hiddenUpdate === 'function' ? await command.hiddenUpdate(Object.freeze(structuredClone({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, approved_update: approved }))) : { approved_update: approved };
  if (!output || typeof output !== 'object' || Array.isArray(output) || Object.keys(output).some((key) => !['approved_update', 'validation_report', 'trace'].includes(key))) throw Object.assign(new TypeError('Code hidden update must match the sealed contract.'), { code: 'TURN_HIDDEN_UPDATE_INVALID' });
  return freezeOutput({ version: 1, schema: 'turn_hidden_update', ...output });
}
