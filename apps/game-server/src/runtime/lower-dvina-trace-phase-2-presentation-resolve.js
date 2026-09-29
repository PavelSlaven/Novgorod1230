import { isExpectedPostCommitPresentationFailure } from './lower-dvina-trace-post-commit-failure.js';
import { committedPendingReplayResult } from './lower-dvina-trace-phase-10-replay.js';
import { runWithinTurnDeadline } from './llm-turn-budget.js';

const SAME_REQUEST_PRESENTATION_ATTEMPTS = 3;

export async function resolveCommittedPhase2PresentationAfterFailure({
  partyId,
  idempotencyKey,
  inputDigest,
  repository,
  narrator,
  turnBudget,
  fallback,
  maxAttempts = SAME_REQUEST_PRESENTATION_ATTEMPTS
}) {
  if (fallback == null || typeof repository?.loadPhase2Replay !== 'function') {
    return fallback;
  }
  let replay = await repository.loadPhase2Replay({ partyId, idempotencyKey, turnBudget });
  if (replay == null) return fallback;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await runWithinTurnDeadline(turnBudget, () =>
        repository.replayPhase2Turn({ partyId, replay, narrator, turnBudget }));
      if (presentationResolved(result)) return result;
      replay = await repository.loadPhase2Replay({ partyId, idempotencyKey, turnBudget });
      if (replay == null) break;
    } catch (error) {
      if (!isExpectedPostCommitPresentationFailure(error)) throw error;
      replay = await repository.loadPhase2Replay({ partyId, idempotencyKey, turnBudget });
      if (replay == null) break;
    }
  }
  const pending = committedPendingReplayResult({
    partyId, idempotencyKey, inputDigest, replay
  });
  return pending ?? fallback;
}

function presentationResolved(result) {
  const screen = result?.screen;
  if (screen?.schema === 'factual_turn_delivery_screen') return true;
  return screen?.screen_status === 'ready';
}
