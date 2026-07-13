import { freezeOutput } from './shared.js';

export async function buildHiddenUpdateStage({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, hiddenUpdater = null }) {
  const approved = structuredClone(consequence.hidden_update ?? {});
  if (!hiddenUpdater) return freezeOutput({ version: 1, schema: 'turn_hidden_update', approved_update: approved });
  const output = await hiddenUpdater.update({
    version: 1,
    schema: 'turn_hidden_update_request',
    player_input: structuredClone(playerInput),
    mode_resolution: structuredClone(modeResolution),
    retrieved_state: structuredClone(retrievedState),
    consequence: structuredClone(consequence),
    time_update: structuredClone(timeUpdate),
    approved_hidden_update: approved
  });
  if (!output || typeof output !== 'object' || Array.isArray(output)) throw new TypeError('hiddenUpdater.update must return an object');
  return freezeOutput({ version: 1, schema: 'turn_hidden_update', ...output });
}
