import { assertValid, validateTurnWritePlan } from '../validators.js';
import { sealTurnWritePlan } from '../command-registry.js';

export async function buildPersistencePlanStage(input) {
  const command = input.commandRegistry.get(input.modeResolution.command_id);
  const { commandRegistry, ...serializableInput } = input;
  const writeTargets = await command.writeTargets(Object.freeze(structuredClone(serializableInput)));
  const transition = input.consequence?.position_transition ?? null;
  const expectsPositionWrite = input.modeResolution?.resolution_plan?.expected_writes?.includes('party_current_position') === true;
  if (expectsPositionWrite && (!transition?.from_g4_id || !transition?.to_g4_id)) throw Object.assign(new Error('party_current_position requires explicit from/to G4.'), { code: 'TURN_G4_TRANSITION_REQUIRED' });
  const plan = {
    version: 2, schema: 'party_turn_write_plan', sealed_by: 'turn_code_planner_v2', party_id: input.playerInput.party_id, turn_id: input.modeResolution.turn_id,
    base_state_version: Number(input.retrievedState.party_state?.state_version ?? 0), write_targets: structuredClone(writeTargets),
    command_trace: structuredClone(input.modeResolution.decision_trace),
    ...(input.perception?.status === 'evaluated' ? { perception_cycle: input.perception.cycle, perception_pins: structuredClone(input.perception.pins), perception_reaction_decisions: structuredClone(input.perception.reaction_decisions) } : {}),
    ...(transition?.from_g4_id !== transition?.to_g4_id ? { first_entry_materialization: { g4_id: transition.to_g4_id }, destination_position: structuredClone(transition.destination_position) } : {})
  };
  assertValid('party_turn_write_plan', validateTurnWritePlan(plan));
  return sealTurnWritePlan(plan);
}
