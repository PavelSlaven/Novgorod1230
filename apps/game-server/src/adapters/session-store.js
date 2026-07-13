export function createInMemorySessionStore() {
  const sessions = new Map();
  return Object.freeze({
    async load(partyId) {
      const value = sessions.get(key(partyId));
      return value == null ? null : structuredClone(value);
    },
    async save(partyId, value) {
      const id = key(partyId);
      sessions.set(id, structuredClone(value));
      return structuredClone(value);
    },
    async delete(partyId) {
      return sessions.delete(key(partyId));
    }
  });
}

function key(value) {
  const id = String(value ?? '').trim();
  if (!id) throw new TypeError('partyId is required.');
  return id;
}
