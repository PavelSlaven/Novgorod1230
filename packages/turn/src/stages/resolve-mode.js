import { assertValid, validateTurnModeResolution } from '../validators.js';
import { freezeOutput } from './shared.js';
import { resolveRegisteredTurnCommand } from '../command-registry.js';
import {
  bindTurnStepWorkflowDraft
} from '../turn-step-workflow-draft.js';

export async function resolveTurnModeStage({
  playerInput,
  routingContext = {},
  retrievedState,
  actionSet,
  commandRegistry,
  services,
  now
}) {
  const resolved = await resolveRegisteredTurnCommand({
    registry: commandRegistry,
    playerInput,
    routingContext,
    committedState: retrievedState,
    actionSet,
    services,
    now
  });
  const mode = resolved.command.mode;
  const output = {
    version: 1, schema: 'turn_mode_resolution', turn_id: `turn:${playerInput.party_id}:${playerInput.turn_number}`, command_id: resolved.command.command_id, option_id: resolved.optionId,
    selected_primary_mode: mode.selected_primary_mode, secondary_modes: structuredClone(mode.secondary_modes ?? []),
    intent: { raw_text: playerInput.raw_text, normalized_intent: resolved.command.command_id, player_words_are_world_facts: false },
    resolution_plan: structuredClone(mode.resolution_plan), decision_trace: resolved.decisionTrace
  };
  assertValid('turn_mode_resolution', validateTurnModeResolution(output));
  const frozen = freezeOutput(output);
  if (resolved.executionDraft) {
    bindTurnStepWorkflowDraft(frozen, resolved.executionDraft);
  }
  return frozen;
}
