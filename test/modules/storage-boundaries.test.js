import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldBaseReader } from '@rus/world-base';
import { createPartyStore } from '@rus/party-store';

test('world base rejects mutating SQL', async () => {
  const reader = createWorldBaseReader({ query: async () => ({ rows: [] }) });
  await assert.rejects(() => reader.read('UPDATE world_base.regions SET x=1'));
  assert.deepEqual(await reader.read('SELECT * FROM world_base.regions'), { rows: [] });
});

test('party store is idempotent', async () => {
  let calls = 0;
  const store = createPartyStore({ transact: async () => ({ calls: ++calls }) });
  const first = await store.commit({ operations: [] }, { idempotencyKey: 'k' });
  const second = await store.commit({ operations: [] }, { idempotencyKey: 'k' });
  assert.equal(first, second);
  assert.equal(calls, 1);
});
