import { sha256 } from '@rus/kernel';

export function createPartyStore({ transact }) {
  if (typeof transact !== 'function') throw new TypeError('transact function is required.');
  const committed = new Map();
  return Object.freeze({
    async commit(writePlan, { idempotencyKey = sha256(writePlan) } = {}) {
      if (committed.has(idempotencyKey)) return committed.get(idempotencyKey);
      const result = await transact(writePlan);
      const record = Object.freeze({ idempotency_key: idempotencyKey, result });
      committed.set(idempotencyKey, record);
      return record;
    }
  });
}
