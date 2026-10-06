import {
  requireTurnStepCommitEnvelope,
  requireTurnStepOperationBatch
} from '@rus/turn';
import { serverError } from '../../errors.js';
import {
  commitLowerDvinaTraceTurnStep
} from './lower-dvina-trace-turn-step-commit.js';

export async function routeLowerDvinaTraceTurnStepCommit(input) {
  const { writePlan } = input;
  const batches = writePlan.write_targets.filter(({ target }) =>
    target === 'party_turn_step_operations');
  if (batches.length > 1) fail('Exactly one turn-step batch is allowed.');
  if (batches.length === 1) {
    try {
      requireTurnStepOperationBatch(batches[0].value);
    } catch (cause) {
      fail('Turn-step batch failed its public contract.', cause?.details);
    }
  }
  if (writePlan.turn_step_commit != null) {
    try {
      requireTurnStepCommitEnvelope(writePlan.turn_step_commit, {
        party_id: writePlan.party_id,
        turn_id: writePlan.turn_id,
        base_state_version: writePlan.base_state_version,
        command_trace: writePlan.command_trace,
        write_targets: writePlan.write_targets
      });
    } catch (cause) {
      throw serverError(
        'TRACE_TURN_STEP_COMMIT_ENVELOPE_INVALID',
        'Turn-step commit envelope failed its public contract.',
        { status: 409, details: cause?.details }
      );
    }
  }
  const factual = writePlan.write_targets.find(({ target }) =>
    target === 'party_state')?.value;
  if (writePlan.turn_step_commit != null && factual == null) {
    return {
      handled: true,
      result: await commitLowerDvinaTraceTurnStep(input)
    };
  }
  if (batches.length > 0 && writePlan.turn_step_commit == null) {
    fail('Turn-step batch lacks its root commit envelope.');
  }
  return { handled: false, factual };
}

function fail(message, details = null) {
  throw serverError(
    'TRACE_TURN_STEP_OPERATION_BATCH_INVALID',
    message,
    { status: 409, details }
  );
}
