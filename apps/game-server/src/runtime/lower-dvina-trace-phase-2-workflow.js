import { runTurnWorkflow } from '@rus/turn';
import { serverError } from '../errors.js';
import { isExpectedPostCommitPresentationFailure } from './lower-dvina-trace-post-commit-failure.js';
import { committedPendingReplayResult, completePendingTracePhase10Replay } from './lower-dvina-trace-phase-10-replay.js';
import { runWithinTurnDeadline } from './llm-turn-budget.js';

export async function runAndPersistTracePhase2Turn({ workflowInput, services,
  issuedAt, requestId, llmDiagnostics, repository, partyId, inputDigest,
  turnBudget }) {
  try {
    const result = await runTurnWorkflow(workflowInput, services, {
      now: issuedAt, requestId,
      onEvent: (event) => recordWorkflowProgress(llmDiagnostics, event),
    });
    trace(llmDiagnostics, { event: 'workflow_completed', result,
      checkpoint: result.checkpoint ?? null });
    return await runWithinTurnDeadline(turnBudget, () =>
      repository.persistPhase2Screen({ partyId, inputDigest, result, turnBudget }));
  } catch (error) {
    trace(llmDiagnostics, { event: 'workflow_failed',
      result: error?.details?.result ?? null,
      error_events: error?.details?.events ?? null,
      checkpoint: error?.details?.checkpoint ?? null });
    if (isExpectedPostCommitPresentationFailure(error)
        && services.committedPublicResult() != null) return services.committedPublicResult();
    if (services.turnCommitStatus() === 'not_started') {
      error.turn_commit_status = 'not_started';
    }
    throw error;
  }
}

export async function completeTracePhase2Replay({ partyId, requestId, idempotencyKey,
  rawText, inputDigest, replay, repository, bundleLoader, narrator, turnBudget,
  llmDiagnostics }) {
  trace(llmDiagnostics, { event: 'turn_replay', party_id: partyId,
    request_id: requestId, idempotency_key: idempotencyKey, raw_input: rawText, replay });
  if (replay.input_digest !== inputDigest) throw serverError(
    'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT',
    'The idempotency identity is already bound to another input.', { status: 409 });
  llmDiagnostics?.recordProgress?.('recovering_saved_result', { commit_state: 'committed' });
  try {
    replay = await completePendingTracePhase10Replay({ partyId, idempotencyKey, replay,
      repository, bundleLoader, turnBudget });
    return repository.replayPhase2Turn
      ? await repository.replayPhase2Turn({ partyId, replay, narrator, turnBudget })
      : replay.public_result;
  } catch (error) {
    if (!isExpectedPostCommitPresentationFailure(error)) throw error;
    const pending = committedPendingReplayResult({ partyId, idempotencyKey, inputDigest, replay });
    if (pending != null) return pending;
    throw error;
  }
}

export function recordTracePhase2TurnContext(diagnostics, {
  partyId, requestId, idempotencyKey, rawText, inputDigest, state, bundle,
  phase2Bundle, contracts, playerSafeStateProjector
}) {
  if (typeof diagnostics?.recordGameplayTrace !== 'function') return;
  let playerSafeState;
  try {
    playerSafeState = playerSafeStateProjector({ committed_state: state,
      actor_id: state.actor_id, scene_presentation: bundle.scene_presentation ?? null });
  } catch (error) {
    playerSafeState = { event: 'capture_failed', source_event: 'player_safe_state',
      code: error?.code ?? null };
  }
  trace(diagnostics, { event: 'turn_context', party_id: partyId,
    request_id: requestId, idempotency_key: idempotencyKey, input_digest: inputDigest,
    raw_input: rawText, authoritative_context: state, player_safe_state: playerSafeState,
    scenario: { definition_revision: bundle.definition_revision ?? null,
      profile: bundle.profile ?? null, bindings: bundle.artifact_pins ?? null,
      phase_2_bindings: phase2Bundle?.artifact_pins ?? null, contracts } });
}

function recordWorkflowProgress(diagnostics, event) {
  trace(diagnostics, { event: 'workflow_event',
    stage_id: event?.stageId ?? null, status: event?.type ?? null,
    digest: event?.digest ?? null });
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
function trace(diagnostics, record) {
  try { diagnostics?.recordGameplayTrace?.(record); }
  catch { /* Diagnostic capture must not affect gameplay. */ }
}
