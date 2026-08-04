import { deepFreeze, sha256 } from '@rus/kernel';
import { turnFailure } from '../errors.js';
import { freezeOutput } from './shared.js';

export async function buildHiddenUpdateStage({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, commandRegistry }) {
  const approved = structuredClone(consequence.hidden_update ?? {});
  const command = commandRegistry.get(modeResolution.command_id);
  const output = typeof command?.hiddenUpdate === 'function' ? await command.hiddenUpdate(deepFreeze(structuredClone({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, approved_update: approved }))) : { approved_update: approved };
  if (!output || typeof output !== 'object' || Array.isArray(output) || Object.keys(output).some((key) => !['approved_update', 'validation_report', 'trace'].includes(key))) throw Object.assign(new TypeError('Code hidden update must match the sealed contract.'), { code: 'TURN_HIDDEN_UPDATE_INVALID' });
  return freezeOutput({
    version: 1,
    schema: 'turn_hidden_update',
    ...output,
    approved_update: mergeApprovedUpdate(approved, output.approved_update)
  });
}

function mergeApprovedUpdate(approved, proposed) {
  if (!plain(approved) || !plain(proposed)) {
    throw Object.assign(
      new TypeError('approved_update must be an object.'),
      { code: 'TURN_HIDDEN_UPDATE_INVALID' }
    );
  }
  const merged = {};
  const keys = [...new Set([
    ...Object.keys(approved),
    ...Object.keys(proposed)
  ])].sort();
  for (const key of keys) {
    if (Object.hasOwn(approved, key) && Object.hasOwn(proposed, key)
        && sha256(approved[key]) !== sha256(proposed[key])) {
      throw turnFailure(
        'TURN_HIDDEN_UPDATE_CONFLICT',
        `Hidden update conflicts on ${key}.`,
        { key }
      );
    }
    merged[key] = structuredClone(
      Object.hasOwn(proposed, key) ? proposed[key] : approved[key]
    );
  }
  return merged;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
