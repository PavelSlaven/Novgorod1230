import { assertValid, validateTurnWritePlan } from '../validators.js';
import { freezeOutput } from './shared.js';

export async function buildPersistencePlanStage(input) {
  const output = await input.writePlanner.plan({
    version: 1,
    schema: 'turn_write_plan_request',
    party_id: input.playerInput.party_id,
    turn_id: input.modeResolution.turn_id,
    player_input: structuredClone(input.playerInput),
    mode_resolution: structuredClone(input.modeResolution),
    availability: structuredClone(input.availability),
    consequence: structuredClone(input.consequence),
    time_update: structuredClone(input.timeUpdate),
    hidden_update: structuredClone(input.hiddenUpdate),
    visible_context: structuredClone(input.visibleContext),
    narration: structuredClone(input.narration)
  });
  assertValid('party_turn_write_plan', validateTurnWritePlan(output));
  return freezeOutput(output);
}
