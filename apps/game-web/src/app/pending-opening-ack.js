const STORAGE_KEY = 'rus.pending_opening_ack';

export function storePendingOpeningAck(storage, pendingAck) {
  storage?.setItem?.(STORAGE_KEY, JSON.stringify(pendingAck));
}

export function storedPendingOpeningAck(storage, partyId) {
  const pendingAck = readPendingOpeningAck(storage);
  if (pendingAck?.party_id === String(partyId ?? '').trim()) {
    return pendingAck;
  }
  removeStoredPendingOpeningAck(storage);
  return null;
}

export function removeMatchingPendingOpeningAck(storage, expected) {
  const current = readPendingOpeningAck(storage);
  if (current && !samePendingOpeningAck(current, expected)) return;
  removeStoredPendingOpeningAck(storage);
}

export function removeStoredPendingOpeningAck(storage) {
  try { storage?.removeItem?.(STORAGE_KEY); }
  catch { /* storage is optional */ }
}

function readPendingOpeningAck(storage) {
  let raw = null;
  try { raw = storage?.getItem?.(STORAGE_KEY); }
  catch { return null; }
  if (!raw) return null;
  try { return normalizePendingOpeningAck(JSON.parse(raw)); }
  catch { return null; }
}

function normalizePendingOpeningAck(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const pendingAck = {
    party_id: String(value.party_id ?? '').trim(),
    client_ack_id: String(value.client_ack_id ?? '').trim(),
    acknowledged_at: String(value.acknowledged_at ?? '').trim()
  };
  return Object.values(pendingAck).every(Boolean) ? pendingAck : null;
}

function samePendingOpeningAck(left, right) {
  return left.party_id === right.party_id
    && left.client_ack_id === right.client_ack_id
    && left.acknowledged_at === right.acknowledged_at;
}
