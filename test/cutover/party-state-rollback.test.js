import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemorySessionStore } from '../../apps/game-server/src/adapters/session-store.js';
import { readServerConfig } from '../../apps/game-server/src/config.js';

test('route rollback does not mutate party session state', async () => {
  const store = createInMemorySessionStore();
  const original = { version: 1, schema: 'game_server_session', party_id: 'party-cutover-1', turn_number: 7, screen: { schema: 'turn_screen', version: 1 }, updated_at: '2026-07-12T00:00:00.000Z' };
  await store.save(original.party_id, original);

  const staging = readServerConfig({ RUS_RUNTIME_ROUTE: 'legacy', RUS_CUTOVER_STAGE: process.env.RUS_CUTOVER_STAGE ?? '0' });
  assert.equal(staging.runtimeRoute, 'legacy');
  const afterRollback = await store.load(original.party_id);
  assert.deepEqual(afterRollback, original);

  const modular = readServerConfig({ RUS_RUNTIME_ROUTE: 'modular', RUS_RUNTIME_BINDINGS_MODULE: './bindings.js' });
  assert.equal(modular.runtimeRoute, 'modular');
  assert.deepEqual(await store.load(original.party_id), original);
});
