import { createTurnAvailableActionSet } from '../command-registry.js';
import { freezeOutput } from './shared.js';
import { getTurnStepWorkflowDraft } from '../turn-step-workflow-draft.js';

export async function revalidateTurnContextStage({
  playerInput,
  modeResolution,
  routingContext = {},
  actionSet,
  commandRegistry,
  stateReader,
  retrievedState,
  finalCommit = false
}) {
  const request = {
    party_id: playerInput.party_id,
    turn_number: playerInput.turn_number,
    requested_blocks: structuredClone(commandRegistry.stateBlocks()),
    routing_context: structuredClone(routingContext),
    revalidation: true,
    ...(finalCommit ? { final_commit: true } : {})
  };
  const revalidated = typeof stateReader.revalidate === 'function'
    ? await stateReader.revalidate(request)
    : await stateReader.read(request);
  if (Number.isSafeInteger(revalidated)
      && revalidated !== actionSet.state_version) {
    throw staleError();
  }
  const state = Number.isSafeInteger(revalidated)
    ? retrievedState
    : revalidated;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('stateReader.read must return an object');
  }
  const draft = getTurnStepWorkflowDraft(modeResolution);
  if (draft && Number(state.party_state?.state_version
      ?? state.state_version) !== draft.base_state_version) {
    throw staleError();
  }
  if (draft && draft.selected_command_id == null) {
    return freezeOutput({
      version: 1,
      schema: 'revalidated_turn_state',
      ...state
    });
  }
  let refreshed;
  try {
    refreshed = await createTurnAvailableActionSet({
      registry: commandRegistry,
      committedState: state,
      actorId: routingContext.actor_id ?? playerInput.party_id,
      policyPins: routingContext.policy_pins ?? []
    });
  } catch (error) {
    if (error.code === 'TURN_AVAILABLE_ACTION_SET_EMPTY') {
      throw staleError();
    }
    throw error;
  }
  if (refreshed.state_version !== actionSet.state_version
      || refreshed.options_digest !== actionSet.options_digest
      || !refreshed.options.some(
        ({ option_id: optionId }) => optionId === modeResolution.option_id
      )) {
    throw staleError();
  }
  return freezeOutput({
    version: 1,
    schema: 'revalidated_turn_state',
    ...state
  });
}

function staleError() {
  return Object.assign(
    new Error('Committed state changed after semantic intent resolution.'),
    { code: 'TURN_SEMANTIC_STATE_STALE' }
  );
}
