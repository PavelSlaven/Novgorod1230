import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemorySessionStore } from '../../apps/game-server/src/adapters/session-store.js';
import {
  assertModularStartupConfig,
  readServerConfig
} from '../../apps/game-server/src/config.js';
import {
  SPATIAL_V3_PRODUCTION_BINDINGS_MODULE
} from '../../apps/game-server/src/runtime/load-spatial-v3-bindings.js';

test('rollback identity does not expose a v2 runtime route or mutate state', async () => {
  const store = createInMemorySessionStore();
  const original = { version: 1, schema: 'game_server_session', party_id: 'party-cutover-1', turn_number: 7, screen: { schema: 'turn_screen', version: 1 }, updated_at: '2026-07-12T00:00:00.000Z' };
  await store.save(original.party_id, original);

  const staging = readServerConfig({
    RUS_RUNTIME_ROUTE: 'legacy',
    RUS_SPATIAL_V3_BINDINGS_MODULE:
      SPATIAL_V3_PRODUCTION_BINDINGS_MODULE
  });
  assert.throws(
    () => assertModularStartupConfig(staging),
    (error) => error.code === 'RUNTIME_ROUTE_INACTIVE'
  );
  const afterRollback = await store.load(original.party_id);
  assert.deepEqual(afterRollback, original);

  const modular = readServerConfig({
    RUS_RUNTIME_ROUTE: 'modular',
    RUS_SPATIAL_V3_BINDINGS_MODULE:
      SPATIAL_V3_PRODUCTION_BINDINGS_MODULE,
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: 'e'.repeat(64)
  });
  assert.equal(modular.runtimeRoute, 'modular');
  assert.deepEqual(await store.load(original.party_id), original);
});
