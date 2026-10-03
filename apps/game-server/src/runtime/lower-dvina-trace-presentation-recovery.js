import { serverError } from '../errors.js';
import { isExpectedPostCommitPresentationFailure } from './lower-dvina-trace-post-commit-failure.js';
import { committedPendingReplayResult } from './lower-dvina-trace-phase-10-replay.js';
import { resolveCommittedPhase2PresentationAfterFailure } from './lower-dvina-trace-phase-2-presentation-resolve.js';

export async function recoverTracePendingPresentation({
  partyId, session, repository, narrator, turnBudget
}) {
  if (session?.screen?.screen_status !== 'committed_presentation_pending') return null;
  // Budget exhaustion while reading leaves the committed screen pending; the caller
  // reloads the session, so nothing is lost and nothing throws.
  const state = await withinBudget(() => repository.loadPhase2State(partyId, { turnBudget }));
  if (state === BUDGET_ENDED) return null;
  const idempotencyKey = state.last_turn?.idempotency_key;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
    throw serverError('TRACE_PHASE_2_PRESENTATION_INVALID',
      'Pending presentation lacks its committed turn identity.', { status: 409 });
  }
  const replay = await withinBudget(() =>
    repository.loadPhase2Replay({ partyId, idempotencyKey, turnBudget }));
  if (replay === BUDGET_ENDED) return null;
  if (replay == null) throw serverError('TRACE_PHASE_2_PRESENTATION_INVALID',
    'Pending presentation replay is unavailable.', { status: 409 });
  const inputDigest = replay.input_digest;
  const pendingFallback = committedPendingReplayResult({
    partyId, idempotencyKey, inputDigest, replay
  });
  try {
    return await repository.replayPhase2Turn({ partyId, replay, narrator, turnBudget });
  } catch (error) {
    if (!isExpectedPostCommitPresentationFailure(error)) throw error;
    return await resolveCommittedPhase2PresentationAfterFailure({
      partyId,
      idempotencyKey,
      inputDigest,
      repository,
      narrator,
      turnBudget,
      fallback: pendingFallback
    });
  }
}

const BUDGET_ENDED = Symbol('turn budget ended');

async function withinBudget(load) {
  try { return await load(); }
  catch (error) {
    if (error?.code === 'LLM_TURN_BUDGET_EXHAUSTED') return BUDGET_ENDED;
    throw error;
  }
}
