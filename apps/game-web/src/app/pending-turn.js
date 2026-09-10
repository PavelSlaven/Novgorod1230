const STORAGE_KEY = 'rus.pending_turn';

export function storedPendingTurn(storage, partyId) {
  try {
    const pending = JSON.parse(storage?.getItem?.(STORAGE_KEY) ?? 'null');
    return pending?.party_id === partyId
      && typeof pending.request?.request_id === 'string'
      && typeof pending.request?.idempotency_key === 'string'
      ? pending : null;
  } catch { return null; }
}

export function storePendingTurn(storage, pending) {
  if (typeof storage?.setItem !== 'function') throw Object.assign(
    new Error('Не удалось сохранить ход для восстановления. Проверьте доступ к хранилищу браузера.'),
    { code: 'TURN_RECOVERY_STORAGE_UNAVAILABLE' });
  storage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function removePendingTurn(storage, pending) {
  const current = storedPendingTurn(storage, pending.party_id);
  if (current?.request?.request_id === pending.request.request_id) {
    storage.removeItem(STORAGE_KEY);
  }
}
