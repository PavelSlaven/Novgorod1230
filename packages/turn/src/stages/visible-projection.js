import { buildSafeNarratorPackage, validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { assertValid } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function buildVisibleProjectionStage({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, perception, visibleProjector }) {
  const sensoryDetails = buildPlayerSensoryDetails(perception);
  const candidate = await visibleProjector.project({
    version: 1,
    schema: 'turn_visible_projection_request',
    party_id: playerInput.party_id,
    turn_id: modeResolution.turn_id,
    visible_seed: structuredClone(consequence.visible_seed),
    sensory_details: sensoryDetails
  });
  const withSensoryDetails = {
    ...candidate,
    sensory_details: sensoryDetails
  };
  assertValid('visible_context_package', validateVisibleContext(withSensoryDetails));
  const safe = buildSafeNarratorPackage(withSensoryDetails);
  if (!safe.ok) {
    const error = new Error(`visible context security gate failed: ${safe.errors.join('; ')}`);
    error.code = 'TURN_VISIBLE_CONTEXT_REJECTED';
    throw error;
  }
  return freezeOutput(safe.package);
}

export function buildPlayerSensoryDetails(perception) {
  if (perception?.status !== 'evaluated' || !Array.isArray(perception?.cycle?.results)) return [];
  const levels = ['blocked','below_threshold','detected','localized','classified','identified','speech_understood'];
  return perception.cycle.results
    .filter((result) => result.observer_kind === 'player' && result.perceived === true)
    .map((result) => {
      const level = levels.indexOf(result.perception_level);
      return Object.freeze({
        event_id: result.event_id,
        modality: result.modality,
        perception_level: result.perception_level,
        direction_resolution: result.direction_resolution,
        ...(level >= levels.indexOf('classified') ? { semantic_class_id: result.identified_semantic_class_id } : {}),
        ...(level >= levels.indexOf('identified') ? { source_id: result.identified_source_id } : {})
      });
    });
}
