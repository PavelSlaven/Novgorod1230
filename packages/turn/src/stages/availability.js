import { assertValid, validateAvailabilityDecision } from '../validators.js';
import { freezeOutput } from './shared.js';
import {
  getTurnStepWorkflowDraft,
  turnStepDraftPreparedDomainSlice
} from '../turn-step-workflow-draft.js';

export async function resolveAvailabilityStage({ playerInput, modeResolution, retrievedState, commandRegistry }) {
  const draft = getTurnStepWorkflowDraft(modeResolution);
  if (draft && draft.selected_command_id == null) {
    return freezeOutput({
      version: 1,
      schema: 'turn_availability_decision',
      status: 'available',
      can_attempt: true,
      reasons: [],
      check_requests: []
    });
  }
  const prepared = turnStepDraftPreparedDomainSlice(draft);
  if (prepared != null) {
    assertValid('turn_availability_decision',
      validateAvailabilityDecision(prepared.availability));
    return freezeOutput(prepared.availability);
  }
  const command = commandRegistry.get(modeResolution.command_id);
  const semanticPlan = draft?.loop_result?.step_traces?.findLast(
    ({ applied, player_response_boundary: boundary }) =>
      applied === true && boundary === true)?.approved_plan;
  const output = await command.availability(deepContext({ playerInput,
    modeResolution, retrievedState,
    ...(semanticPlan == null ? {} : { semanticPlan }) }));
  assertValid('turn_availability_decision', validateAvailabilityDecision(output));
  return freezeOutput(output);
}
function deepContext(value) { return Object.freeze(structuredClone(value)); }
