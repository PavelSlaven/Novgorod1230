import { assertValid, validateTurnWritePlan } from '../validators.js';
import { sealTurnWritePlan } from '../command-registry.js';
import {
  getTurnStepWorkflowDraft,
  mergeTurnStepDraftWriteTargets,
  turnStepDraftWriteTargets
} from '../turn-step-workflow-draft.js';
import { TURN_STEP_OPERATION_BATCH_TARGET } from '../turn-step-operation-batch.js';
import { turnFailure } from '../errors.js';
import {
  buildTurnStepCommitEnvelope
} from '../turn-step-commit-envelope.js';

export async function buildPersistencePlanStage(input) {
  const draft = getTurnStepWorkflowDraft(input.modeResolution);
  const command = input.commandRegistry.get(input.modeResolution.command_id);
  const { commandRegistry, ...serializableInput } = input;
  const draftTargets = draft ? turnStepDraftWriteTargets(draft) : [];
  const commandTargets = draft && draft.selected_command_id == null
    ? []
    : snapshotCommandTargets(await command.writeTargets(
      Object.freeze(structuredClone(serializableInput))
    ));
  rejectReservedBatchOwnership(commandTargets);
  const writeTargets = draft
    ? mergeTurnStepDraftWriteTargets(draftTargets, commandTargets)
    : commandTargets;
  const transition = input.consequence?.position_transition ?? null;
  const expectsPositionWrite = input.modeResolution?.resolution_plan?.expected_writes?.includes('party_current_position') === true;
  if (expectsPositionWrite && (!transition?.from_g4_id || !transition?.to_g4_id)) throw Object.assign(new Error('party_current_position requires explicit from/to G4.'), { code: 'TURN_G4_TRANSITION_REQUIRED' });
  const plan = {
    version: 2, schema: 'party_turn_write_plan', sealed_by: 'turn_code_planner_v2', party_id: input.playerInput.party_id, turn_id: input.modeResolution.turn_id,
    base_state_version: Number(input.retrievedState.party_state?.state_version ?? 0), write_targets: structuredClone(writeTargets),
    command_trace: structuredClone(input.modeResolution.decision_trace),
    ...(draft ? { turn_step_commit: buildTurnStepCommitEnvelope({
      ...input,
      draft
    }) } : {}),
    ...(input.ordinary_materialization_atomic_write_plan == null ? {} : {
      ordinary_materialization_atomic_write_plan: structuredClone(
        input.ordinary_materialization_atomic_write_plan)
    }),
    ...(input.action_production_atomic_write_plans?.length ? {
      action_production_atomic_write_plans: structuredClone(
        input.action_production_atomic_write_plans)
    } : {}),
    ...(input.local_fire_atomic_write_plans?.length ? {
      local_fire_atomic_write_plans: structuredClone(
        input.local_fire_atomic_write_plans)
    } : {}),
    ...(transition?.from_g4_id !== transition?.to_g4_id ? { first_entry_materialization: { g4_id: transition.to_g4_id }, destination_position: structuredClone(transition.destination_position) } : {})
  };
  assertValid('party_turn_write_plan', validateTurnWritePlan(plan));
  return sealTurnWritePlan(plan);
}

function rejectReservedBatchOwnership(commandTargets) {
  if (!Array.isArray(commandTargets)) return;
  const invalid = commandTargets.find(({ target } = {}) =>
    typeof target !== 'string' || target.trim() !== target);
  if (invalid) {
    throw turnFailure(
      'TURN_STEP_WRITE_TARGET_INVALID',
      'Domain command write targets require exact primitive string names.',
      { target: null }
    );
  }
  if (commandTargets.some(({ target }) =>
    target === TURN_STEP_OPERATION_BATCH_TARGET)) {
    throw turnFailure(
      'TURN_STEP_WRITE_TARGET_CONFLICT',
      'Domain commands cannot own the semantic operation batch target.',
      { target: TURN_STEP_OPERATION_BATCH_TARGET }
    );
  }
}

function snapshotCommandTargets(value) {
  try {
    return structuredClone(value);
  } catch (cause) {
    throw turnFailure(
      'TURN_STEP_WRITE_TARGET_INVALID',
      'Domain command write targets must be cloneable JSON data.',
      { cause: cause?.name ?? 'clone_failed' }
    );
  }
}
