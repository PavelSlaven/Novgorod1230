import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';
import { validateTurnStepCommitEnvelope } from './validators.js';

export function buildTurnStepCommitEnvelope(input) {
  const loop = input.draft?.loop_result;
  const envelope = {
    version: 1,
    schema: 'turn_step_commit_envelope_v1',
    party_id: input.playerInput.party_id,
    root_turn_id: input.modeResolution.turn_id,
    base_state_version: Number(input.retrievedState.party_state?.state_version),
    player_input: structuredClone(input.playerInput),
    mode_resolution: structuredClone(input.modeResolution),
    checks: structuredClone(input.checks),
    consequence: structuredClone(input.consequence),
    time_update: structuredClone(input.timeUpdate),
    body_update: structuredClone(input.bodyUpdate),
    hidden_update: structuredClone(input.hiddenUpdate),
    visible_context: structuredClone(input.visibleContext),
    loop_trace: {
      version: 1,
      schema: 'turn_step_commit_trace_v1',
      root_turn_id: loop.root_turn_id,
      request_id: input.playerInput.request_id,
      committed_state_version: loop.committed_state_version,
      status: loop.status,
      stop_reason: loop.stop_reason,
      working_revision: loop.working_revision,
      next_step_index: loop.next_step_index,
      remaining_intent: loop.remaining_intent,
      completed_steps: structuredClone(loop.completed_steps),
      step_traces: structuredClone(loop.step_traces),
      check_results: structuredClone(input.checks.results),
      clarification: structuredClone(loop.clarification)
    }
  };
  const validation = validateTurnStepCommitEnvelope(envelope);
  if (!validation.ok) {
    throw turnFailure(
      'TURN_STEP_COMMIT_ENVELOPE_INVALID',
      'Semantic turn commit envelope is invalid.',
      { errors: validation.errors }
    );
  }
  return deepFreeze(envelope);
}

export function requireTurnStepCommitEnvelope(value, binding = null) {
  let snapshot;
  try {
    snapshot = structuredClone(value);
  } catch {
    snapshot = null;
  }
  const validation = validateTurnStepCommitEnvelope(snapshot, binding);
  if (!validation.ok) {
    throw turnFailure(
      'TURN_STEP_COMMIT_ENVELOPE_INVALID',
      'Semantic turn commit envelope is invalid.',
      { errors: validation.errors }
    );
  }
  return deepFreeze(snapshot);
}
