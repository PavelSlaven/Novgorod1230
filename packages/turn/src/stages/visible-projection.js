import { buildSafeNarratorPackage, validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { assertValid } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function buildVisibleProjectionStage({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, bodyUpdate, visibleProjector }) {
  const candidate = await visibleProjector.project({
    version: 1,
    schema: 'turn_visible_projection_request',
    player_input: structuredClone(playerInput),
    mode_resolution: structuredClone(modeResolution),
    retrieved_state: structuredClone(retrievedState),
    consequence: structuredClone(consequence),
    time_update: structuredClone(timeUpdate),
    body_update: structuredClone(bodyUpdate),
    visible_seed: structuredClone(consequence.visible_seed)
  });
  assertValid('visible_context_package', validateVisibleContext(candidate));
  const safe = buildSafeNarratorPackage(candidate);
  if (!safe.ok) {
    const error = new Error(`visible context security gate failed: ${safe.errors.join('; ')}`);
    error.code = 'TURN_VISIBLE_CONTEXT_REJECTED';
    throw error;
  }
  return freezeOutput(safe.package);
}
