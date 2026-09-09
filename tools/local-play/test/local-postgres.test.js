import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { classifyLocalDatabases, ensureLocalPostgres } from
  '../local-postgres.js';

const query = (count, sentinels) => async (sql, [name] = []) => ({ rows: [
  sql.includes('to_regclass') ? { present: sentinels.includes(name) } : { count }
] });
const worldSentinels = [
  'world_base.spatial_v3_world_revisions',
  'world_base.runtime_catalog_activation_events',
  'world_base.domain_catalog_revisions', 'world_base.catalog_imports'
];
const partySentinels = [
  'party_runtime.schema_migrations', 'party_runtime.parties',
  'party_runtime.party_catalog_pins'
];

test('classifyLocalDatabases distinguishes fresh, partial, and existing databases', async () => {
  assert.equal(await classifyLocalDatabases({ worldQuery: query(0, []),
    partyQuery: query(0, []) }), 'fresh');
  assert.equal(await classifyLocalDatabases({ worldQuery: query(1, worldSentinels),
    partyQuery: query(0, []) }), 'partial');
  assert.equal(await classifyLocalDatabases({ worldQuery: query(1, worldSentinels),
    partyQuery: query(2, partySentinels) }), 'existing');
});

test('managed PostgreSQL is initialized, classified, and stopped', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-pg-test-'));
  const native = join(directory, 'native');
  await mkdir(join(native, 'bin'), { recursive: true });
  for (const file of ['initdb.exe', 'postgres.exe', 'pg_ctl.exe']) {
    await writeFile(join(native, 'bin', file), 'test');
  }
  const calls = [];
  try {
    const process = { exitCode: null };
    const pools = [readinessPool(), adminPool(calls), queryPool(), queryPool()];
    const result = await ensureLocalPostgres({ dataRoot: directory,
      reservePort: async () => 55432, loadBinaries: async () => ({
        nativeDir: native }), spawnProcess: () => process,
      command: (executable, args) => {
        calls.push([executable, ...args]);
        if (executable.endsWith('initdb.exe')) {
          const data = args.find((arg) => arg.startsWith('--pgdata='))
            .slice('--pgdata='.length);
          mkdirSync(data, { recursive: true });
          writeFileSync(join(data, 'PG_VERSION'), '16');
        }
        return { status: 0, stderr: '' };
      }, createPool: () => pools.shift() });
    assert.equal(result.state, 'fresh');
    assert.match(result.worldUrl, /127\.0\.0\.1:55432\/novgorod_world/u);
    assert.ok(calls[0].includes('--encoding=UTF8'));
    assert.equal(calls.filter((value) => value === 'CREATE').length, 4);
    await result.close();
    assert.ok(calls.at(-1).includes('stop'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function readinessPool() {
  return { query: async () => ({ rows: [{ '?column?': 1 }] }),
    end: async () => {} };
}
function adminPool(calls) {
  return { query: async (sql) => {
    if (sql.includes('pg_roles') || sql.includes('pg_database')) {
      return { rows: [] };
    }
    calls.push(sql.split(' ')[0]); return { rows: [] };
  }, end: async () => {} };
}

function queryPool() {
  return { query: async (sql) => ({ rows: [sql.includes('to_regclass')
    ? { present: false } : { count: 0 }] }), end: async () => {} };
}
