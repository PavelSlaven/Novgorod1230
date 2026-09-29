import { serverError } from '../errors.js';
import { isExpectedPostCommitPresentationFailure } from './lower-dvina-trace-post-commit-failure.js';
import { resolveCommittedPhase2PresentationAfterFailure } from './lower-dvina-trace-phase-2-presentation-resolve.js';

export async function recoverTracePendingPresentation({
  partyId, session, repository, narrator, turnBudget
}) {
  if (session?.screen?.screen_status !== 'committed_presentation_pending') return null;
  const state = await repository.loadPhase2State(partyId, { turnBudget });
  const idempotencyKey = state.last_turn?.idempotency_key;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
    throw serverError('TRACE_PHASE_2_PRESENTATION_INVALID',
      'Pending presentation lacks its committed turn identity.', { status: 409 });
  }
  const replay = await repository.loadPhase2Replay({ partyId, idempotencyKey, turnBudget });
  if (replay == null) throw serverError('TRACE_PHASE_2_PRESENTATION_INVALID',
    'Pending presentation replay is unavailable.', { status: 409 });
  const inputDigest = replay.input_digest;
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
      fallback: null
    });
  }
}
