import { removePendingTurn, storedPendingTurn, storePendingTurn } from './pending-turn.js';

export function createTurnRequest(input) {
  const requestId = `web:turn:${globalThis.crypto?.randomUUID?.()
    ?? crypto.randomUUID()}`;
  return Object.freeze({ ...input, request_id: requestId, idempotency_key: requestId });
}

export async function submitRecoverableTurn(api, storage, partyId, input = {},
  { onProgress = null, pollIntervalMs = 1_000,
    now = () => Date.now() } = {}) {
  const pending = storedPendingTurn(storage, partyId)
    ?? { party_id: partyId, request: createTurnRequest(input) };
  storePendingTurn(storage, pending);
  const stopProgress = watchTurnProgress(api, partyId, pending.request.request_id,
    onProgress, pollIntervalMs, now, {
      phase: 'accepted', commit_state: 'unconfirmed', elapsed_seconds: 0
    });
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

function watchTurnProgress(api, partyId, requestId, onProgress, intervalMs,
  now, initialProgress) {
  if (typeof api?.getTurnProgress !== 'function' || typeof onProgress !== 'function') return () => {};
  const startedAt = now();
  let stopped = false, polling = false, serverElapsed = 0;
  let publishedElapsed = 0;
  let latest = initialProgress;
  const publishElapsed = () => {
    if (stopped) return;
    const localElapsed = Math.max(0, Math.floor((now() - startedAt) / 1_000));
    publishedElapsed = Math.max(publishedElapsed, serverElapsed, localElapsed);
    onProgress({ ...latest, elapsed_seconds: publishedElapsed });
  };
  const poll = async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const progress = await api.getTurnProgress(partyId, requestId);
      if (!stopped && progress != null) {
        latest = { ...latest, ...progress };
        serverElapsed = Math.max(serverElapsed, progress.elapsed_seconds ?? 0);
        publishElapsed();
      }
    } catch { /* turn progress is optional; the turn request remains authoritative */ }
    finally { polling = false; }
  };
  void poll();
  const timer = globalThis.setInterval(() => {
    publishElapsed();
    void poll();
  }, intervalMs);
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
  { onProgress = null, pollIntervalMs = 1_000,
    now = () => Date.now() } = {}) {
  if (screen?.screen_status !== 'committed_presentation_pending') return null;
  return recoverWithProgress(api, partyId, screen.turn_id, onProgress,
    pollIntervalMs, now);
}

async function recoverWithProgress(api, partyId, requestId, onProgress,
  pollIntervalMs, now) {
  const stopProgress = watchTurnProgress(api, partyId, requestId, onProgress,
    pollIntervalMs, now, { phase: 'recovering_saved_result',
      commit_state: 'committed', elapsed_seconds: 0 });
  try { return await api.recoverPendingPresentation(partyId, requestId); }
  finally { stopProgress(); }
}

function uiError(code, message) {
  return Object.assign(new Error(message), { code });
}
