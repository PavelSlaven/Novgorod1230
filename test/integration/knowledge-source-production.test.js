import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { newDb, DataType } from 'pg-mem';
import {
  createProductionV2RollbackSourceRoot
} from '../../apps/game-server/src/composition/production-v2-rollback-source.js';

function createMemoryPostgres() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'rus_test' });
  db.public.registerFunction({ name: 'current_user', returns: DataType.text, implementation: () => 'rus_test_user' });
  return db.adapters.createPg().Pool;
}

test('production composition injects explicit knowledge-source port and starts without legacy path access', async (t) => {
  const here = dirname(fileURLToPath(import.meta.url));
  const bindings = resolve(here, '../fixtures/runtime-bindings/knowledge-source-bindings.js');
  const projectRoot = resolve(here, '../..');
  const root = await createProductionV2RollbackSourceRoot({
    env: {
      RUS_WORLD_DATABASE_URL: 'postgres://memory',
      RUS_PARTY_DATABASE_URL: 'postgres://memory',
      RUS_RUNTIME_BINDINGS_MODULE: bindings,
      DEEPSEEK_API_KEY: 'fixture',
      DEEPSEEK_BASE_URL: 'http://127.0.0.1:1'
    },
    PoolClass: createMemoryPostgres(),
    config: {
      runtimeBindingsModule: bindings,
      runMigrations: true,
      probeProvider: false,
      knowledgeSourceRoot: resolve(projectRoot, 'data/knowledge-source'),
      generatedKnowledgeRoot: resolve(projectRoot, 'generated/knowledge-source')
    }
  });
  t.after(() => root.close());
  assert.equal(root.health().composition, 'production');
});
