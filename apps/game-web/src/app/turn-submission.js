export function createTurnRequest(input) {
  const requestId = `web:turn:${globalThis.crypto?.randomUUID?.()
    ?? crypto.randomUUID()}`;
  return Object.freeze({ ...input, request_id: requestId, idempotency_key: requestId });
}

export async function submitTurnWithPresentationReplay(api, partyId, request) {
  const first = await api.submitTurn(partyId, request);
  if (first?.screen?.screen_status !== 'committed_presentation_pending') return first;
  const replay = await api.submitTurn(partyId, request);
  if (replay?.screen?.screen_status === 'committed_presentation_pending') {
    throw uiError('PRESENTATION_PENDING', 'Экран хода ещё готовится. Повтори действие.');
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
