import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { assertValid, validateNarrationResult } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function buildNarrationStage({ playerInput, modeResolution, visibleContext, narrator }) {
  if (detectHiddenLeaks(visibleContext).length) throw new Error('Narrator input contains hidden data.');
  const output = await narrator.run({
    version: 1,
    schema: 'narration_request',
    request_id: modeResolution.turn_id,
    surface: 'turn',
    visible_context: structuredClone(visibleContext),
    context: {
      player_input: structuredClone(playerInput),
      mode_resolution: structuredClone(modeResolution)
    },
    style_policy: { preserve_uncertainty: true, no_new_world_facts: true },
    max_repairs: 1
  });
  assertValid('narration_flow_result', validateNarrationResult(output));
  return freezeOutput(output);
}
