import { createTurnScreenReadModel, validateTurnScreen } from '@rus/presentation';
import { freezeOutput } from './shared.js';

export function buildScreenProjectionStage({ playerInput, modeResolution, visibleContext, narration, consequence, screenProjector = null }) {
  const actions = structuredClone(consequence.suggested_actions ?? []);
  const defaultScreen = createTurnScreenReadModel({
    partyId: playerInput.party_id,
    turnId: modeResolution.turn_id,
    turnNumber: playerInput.turn_number,
    visibleContext,
    narration,
    actions,
    panels: {}
  });
  const screen = screenProjector
    ? screenProjector.project({ playerInput, modeResolution, visibleContext, narration, actions, defaultScreen })
    : defaultScreen;
  const validation = validateTurnScreen(screen);
  if (!validation.ok) {
    const error = new Error(`turn_screen invalid: ${validation.errors.join('; ')}`);
    error.code = 'TURN_SCREEN_INVALID';
    error.details = { errors: validation.errors };
    throw error;
  }
  return freezeOutput(screen);
}
