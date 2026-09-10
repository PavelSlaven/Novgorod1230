import { removePendingTurn, storedPendingTurn, storePendingTurn } from './pending-turn.js';

export function createTurnRequest(input) {
  const requestId = `web:turn:${globalThis.crypto?.randomUUID?.()
    ?? crypto.randomUUID()}`;
  return Object.freeze({ ...input, request_id: requestId, idempotency_key: requestId });
}

export async function submitRecoverableTurn(api, storage, partyId, input = {}) {
  const pending = storedPendingTurn(storage, partyId)
    ?? { party_id: partyId, request: createTurnRequest(input) };
  storePendingTurn(storage, pending);
  try {
    const result = await submitTurnWithPresentationReplay(api, partyId, pending.request);
    removePendingTurn(storage, pending);
    return result;
  } catch (error) {
    // HTTP request validation rejects these before invoking any turn runtime.
    // Transport, unknown and post-commit presentation failures retain identity.
    if (error?.turn_commit_status === 'not_started' || (error?.httpStatus === 400
        && ['REQUEST_BODY_INVALID', 'TURN_INPUT_REQUIRED'].includes(error.code))) {
      removePendingTurn(storage, pending);
    }
    throw error;
  }
}

export async function submitTurnWithPresentationReplay(api, partyId, request) {
  const first = await api.submitTurn(partyId, request);
  if (first?.screen?.screen_status !== 'committed_presentation_pending') return first;
  const replay = await api.recoverPendingPresentation(partyId);
  if (replay?.screen?.screen_status === 'committed_presentation_pending') {
    throw uiError('PRESENTATION_PENDING', 'Факты хода сохранены; экран ещё готовится.');
  }
  return replay;
}

export function recoverPendingPresentation(api, partyId, screen) {
  return screen?.screen_status === 'committed_presentation_pending'
    ? api.recoverPendingPresentation(partyId) : null;
}

function uiError(code, message) {
  return Object.assign(new Error(message), { code });
}
