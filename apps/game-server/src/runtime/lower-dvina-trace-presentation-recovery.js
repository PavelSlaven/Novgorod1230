import { serverError } from '../errors.js';
import { isExpectedPostCommitPresentationFailure } from './lower-dvina-trace-post-commit-failure.js';

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
  try {
    return await repository.replayPhase2Turn({ partyId, replay, narrator, turnBudget });
  } catch (error) {
    if (isExpectedPostCommitPresentationFailure(error)) return null;
    throw error;
  }
}
