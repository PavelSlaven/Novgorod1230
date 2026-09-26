const KEY = 'rus.pending_new_game';

export function newGameRequest(storage, input, createId = () =>
  globalThis.crypto.randomUUID()) {
  const normalized = Object.fromEntries(['scenario_id', 'start_text']
    .filter((key) => typeof input?.[key] === 'string' && input[key].trim())
    .map((key) => [key, input[key].trim()]));
  const stored = read(storage);
  if (stored && JSON.stringify(stored.input) === JSON.stringify(normalized)) {
    return Object.freeze({ ...normalized, request_id: stored.request_id });
  }
  const pending = { version: 1, request_id: `web:new-game:${createId()}`,
    input: normalized };
  storage?.setItem?.(KEY, JSON.stringify(pending));
  return Object.freeze({ ...normalized, request_id: pending.request_id });
}

export function clearNewGameRequest(storage, requestId) {
  if (read(storage)?.request_id === requestId) storage?.removeItem?.(KEY);
}

export function storedNewGameRequest(storage) { return read(storage); }

function read(storage) {
  try {
    const value = JSON.parse(storage?.getItem?.(KEY) ?? 'null');
    return value?.version === 1 && typeof value.request_id === 'string'
      && value.request_id && value.input && typeof value.input === 'object'
      && !Array.isArray(value.input) ? value : null;
  } catch { return null; }
}
