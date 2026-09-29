import { isExpectedPostCommitPresentationFailure } from './lower-dvina-trace-post-commit-failure.js';
import { committedPendingReplayResult } from './lower-dvina-trace-phase-10-replay.js';
import {
  GAMEPLAY_LLM_CALL_TIMEOUT_MS,
  runWithinTurnDeadline
} from './llm-turn-budget.js';

export const SAME_REQUEST_PRESENTATION_ATTEMPTS = 2;

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
  let replay = await loadPhase2ReplaySafe(repository, {
    partyId, idempotencyKey, turnBudget
  });
  if (replay == null) return fallback;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!canAffordPresentationAttempt(turnBudget)) break;
    try {
      const result = await runWithinTurnDeadline(turnBudget, () =>
        repository.replayPhase2Turn({ partyId, replay, narrator, turnBudget }));
      if (presentationResolved(result)) return result;
      replay = await loadPhase2ReplaySafe(repository, {
        partyId, idempotencyKey, turnBudget
      });
      if (replay == null) break;
    } catch (error) {
      if (isTurnBudgetExhausted(error)) break;
      if (!isExpectedPostCommitPresentationFailure(error)) throw error;
      replay = await loadPhase2ReplaySafe(repository, {
        partyId, idempotencyKey, turnBudget
      });
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

function isTurnBudgetExhausted(error) {
  return error?.code === 'LLM_TURN_BUDGET_EXHAUSTED';
}

function canAffordPresentationAttempt(turnBudget) {
  const remaining = turnBudget?.remaining?.();
  if (!remaining) return true;
  return remaining.deadline_ms > GAMEPLAY_LLM_CALL_TIMEOUT_MS;
}

async function loadPhase2ReplaySafe(repository, input) {
  try {
    return await runWithinTurnDeadline(input.turnBudget, () =>
      repository.loadPhase2Replay(input));
  } catch (error) {
    if (isTurnBudgetExhausted(error)) return null;
    throw error;
  }
}
