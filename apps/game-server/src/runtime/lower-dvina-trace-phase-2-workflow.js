import { runTurnWorkflow } from '@rus/turn';
import { isExpectedPostCommitPresentationFailure } from './lower-dvina-trace-post-commit-failure.js';
import { runWithinTurnDeadline } from './llm-turn-budget.js';

export async function runAndPersistTracePhase2Turn({ workflowInput, services,
  issuedAt, requestId, llmDiagnostics, repository, partyId, inputDigest,
  turnBudget }) {
  try {
    const result = await runTurnWorkflow(workflowInput, services, {
      now: issuedAt, requestId,
      onEvent: (event) => recordWorkflowProgress(llmDiagnostics, event),
    });
    return await runWithinTurnDeadline(turnBudget, () =>
      repository.persistPhase2Screen({ partyId, inputDigest, result, turnBudget }));
  } catch (error) {
    if (isExpectedPostCommitPresentationFailure(error)
        && services.committedPublicResult() != null) return services.committedPublicResult();
    if (services.turnCommitStatus() === 'not_started') {
      error.turn_commit_status = 'not_started';
    }
    throw error;
  }
}

function recordWorkflowProgress(diagnostics, event) {
  if (event?.type === 'stage_started') {
    const stageId = Number(event.stageId);
    const phase = stageId <= 6 ? 'understanding_action'
      : stageId <= 13 ? 'resolving_world'
        : stageId === 14 ? 'saving_result' : 'preparing_screen';
    diagnostics?.recordProgress?.(phase);
  }
  if (event?.type === 'stage_approved' && Number(event.stageId) === 14) {
    diagnostics?.recordProgress?.('preparing_screen', { commit_state: 'committed' });
  }
}
