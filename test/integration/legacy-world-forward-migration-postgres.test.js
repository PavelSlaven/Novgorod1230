import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  WORLD_RUNTIME_CATALOG_MIGRATION,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  readPostgresSchemaFingerprint
} from '../../tools/runtime-catalog-activation/src/forward-migration.js';

const LEGACY_WORLD_SCHEMA_FINGERPRINT =
  '869021eded07633eec27048a102600385248e5a8e5f8dd499943d404e17fad8f';
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('legacy world schema migrates forward without losing existing rows', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated legacy world migration test');
    return;
  }

  const name = `legacy-world-forward-migration-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', name]);
  });

  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', 'POSTGRES_USER=legacy_migration',
    '-e', 'POSTGRES_DB=legacy_migration',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker([
      'exec', name, 'pg_isready', '-U', 'legacy_migration', '-d', 'legacy_migration'
    ]).status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (docker([
        'exec', name, 'pg_isready', '-U', 'legacy_migration', '-d', 'legacy_migration'
      ]).status === 0) {
        ready = true;
        break;
      }
    }
  }
  assert.equal(ready, true);

  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'legacy_migration',
    password: 'local_only',
    database: 'legacy_migration',
    max: 2
  });

  const schemaFiles = (await readdir(
    new URL('../../infra/world-base/schema/', import.meta.url)
  ))
    .filter((file) => /^\d+\.sql$/u.test(file) && Number.parseInt(file, 10) <= 8)
    .sort();
  for (const file of schemaFiles) {
    await pool.query(await readFile(
      new URL(`../../infra/world-base/schema/${file}`, import.meta.url),
      'utf8'
    ));
  }
  await pool.query(`
    ALTER TABLE world_base.graph_nodes DROP CONSTRAINT graph_nodes_scale_level_check;
    ALTER TABLE world_base.graph_nodes ADD CONSTRAINT graph_nodes_scale_level_check
      CHECK (scale_level IS NULL OR scale_level = ANY (
        ARRAY['G0'::text,'G1'::text,'G2'::text,'G3'::text,'G4'::text,'G5'::text]
      ));
    ALTER TABLE world_base.graph_edges DROP CONSTRAINT graph_edges_scale_level_check;
    ALTER TABLE world_base.graph_edges ADD CONSTRAINT graph_edges_scale_level_check
      CHECK (scale_level IS NULL OR scale_level = ANY (
        ARRAY['G0'::text,'G1'::text,'G2'::text,'G3'::text,'G4'::text,'G5'::text]
      ));
  `);
  assert.equal(
    await readPostgresSchemaFingerprint(pool, 'world_base'),
    LEGACY_WORLD_SCHEMA_FINGERPRINT
  );

  await pool.query("INSERT INTO world_base.regions(id) VALUES ('legacy-region')");
  await pool.query(`
    INSERT INTO world_base.graph_nodes
      (id, region_id, node_type, scale_level, status)
    VALUES ('legacy-g5-node', 'legacy-region', 'location', 'G5', 'approved')
  `);
  await assert.rejects(
    () => runWorldRuntimeCatalogMigration(pool),
    (error) => error?.code === '23514'
  );
  assert.equal(
    await readPostgresSchemaFingerprint(pool, 'world_base'),
    LEGACY_WORLD_SCHEMA_FINGERPRINT,
    'a rejected bridge must roll back every DDL statement'
  );
  assert.equal((await pool.query(
    "SELECT count(*)::int AS count FROM world_base.graph_nodes WHERE id='legacy-g5-node'"
  )).rows[0].count, 1, 'a rejected bridge must preserve the incompatible source row');
  await pool.query("DELETE FROM world_base.graph_nodes WHERE id='legacy-g5-node'");

  await pool.query(`
    INSERT INTO world_base.graph_nodes
      (id, region_id, node_type, scale_level, status)
    VALUES ('legacy-node', 'legacy-region', 'location', 'G4', 'approved')
  `);

  const applied = await runWorldRuntimeCatalogMigration(pool);
  assert.equal(applied.status, 'applied');
  assert.equal(
    applied.schema_fingerprint,
    WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint
  );
  assert.deepEqual(
    (await pool.query(
      "SELECT id,region_id,node_type,scale_level,status FROM world_base.graph_nodes WHERE id='legacy-node'"
    )).rows,
    [{
      id: 'legacy-node',
      region_id: 'legacy-region',
      node_type: 'location',
      scale_level: 'G4',
      status: 'approved'
    }]
  );
  assert.equal((await runWorldRuntimeCatalogMigration(pool)).status, 'already_applied');
});
