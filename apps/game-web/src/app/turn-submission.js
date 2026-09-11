import { removePendingTurn, storedPendingTurn, storePendingTurn } from './pending-turn.js';

export function createTurnRequest(input) {
  const requestId = `web:turn:${globalThis.crypto?.randomUUID?.()
    ?? crypto.randomUUID()}`;
  return Object.freeze({ ...input, request_id: requestId, idempotency_key: requestId });
}

export async function submitRecoverableTurn(api, storage, partyId, input = {},
  { onProgress = null, pollIntervalMs = 1_000 } = {}) {
  const pending = storedPendingTurn(storage, partyId)
    ?? { party_id: partyId, request: createTurnRequest(input) };
  storePendingTurn(storage, pending);
  const stopProgress = watchTurnProgress(api, partyId, pending.request.request_id,
    onProgress, pollIntervalMs);
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
  } finally {
    stopProgress();
  }
}

function watchTurnProgress(api, partyId, requestId, onProgress, intervalMs) {
  if (typeof api?.getTurnProgress !== 'function' || typeof onProgress !== 'function') return () => {};
  let stopped = false, polling = false;
  const poll = async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const progress = await api.getTurnProgress(partyId, requestId);
      if (!stopped && progress != null) onProgress(progress);
    } catch { /* turn progress is optional; the turn request remains authoritative */ }
    finally { polling = false; }
  };
  void poll();
  const timer = globalThis.setInterval(poll, intervalMs);
  return () => { stopped = true; globalThis.clearInterval(timer); };
}

export async function submitTurnWithPresentationReplay(api, partyId, request) {
  const first = await api.submitTurn(partyId, request);
  if (first?.screen?.screen_status !== 'committed_presentation_pending') return first;
  const replay = await api.recoverPendingPresentation(partyId, request.request_id);
  if (replay?.screen?.screen_status === 'committed_presentation_pending') {
    throw uiError('PRESENTATION_PENDING', 'Факты хода сохранены; экран ещё готовится.');
  }
  return replay;
}

export function recoverPendingPresentation(api, partyId, screen,
  { onProgress = null, pollIntervalMs = 1_000 } = {}) {
  if (screen?.screen_status !== 'committed_presentation_pending') return null;
  return recoverWithProgress(api, partyId, screen.turn_id, onProgress,
    pollIntervalMs);
}

async function recoverWithProgress(api, partyId, requestId, onProgress,
  pollIntervalMs) {
  const stopProgress = watchTurnProgress(api, partyId, requestId, onProgress,
    pollIntervalMs);
  try { return await api.recoverPendingPresentation(partyId, requestId); }
  finally { stopProgress(); }
}

function uiError(code, message) {
  return Object.assign(new Error(message), { code });
}
