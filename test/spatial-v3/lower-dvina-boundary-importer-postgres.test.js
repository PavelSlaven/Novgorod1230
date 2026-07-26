import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildLowerDvinaBoundaryV1ImportSql
} from '../../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';

const container = `lower-dvina-boundary-${randomUUID().slice(0, 12)}`;
const docker = (args, input, timeout = 60_000) =>
  spawnSync('docker', args, { input, encoding: 'utf8', timeout });

test('successor snapshot imports, reads back and replays in disposable PostgreSQL', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required');
  t.after(() => docker(['rm', '-f', container]));
  assert.equal(docker([
    'run', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=lower_dvina',
    '-e', 'POSTGRES_USER=lower_dvina',
    '-e', 'POSTGRES_DB=world',
    'postgres:16-alpine'
  ]).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    ready = docker([
      'exec', container, 'pg_isready', '-U', 'lower_dvina', '-d', 'world'
    ]).status === 0;
    if (ready) break;
  }
  assert.equal(ready, true);
  const psql = (sql, timeout) => docker([
    'exec', '-i', container,
    'psql', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', 'lower_dvina', '-d', 'world'
  ], sql, timeout);
  const schema = (await Promise.all(
    Array.from({ length: 20 }, (_, index) => readFile(
      `infra/world-base/schema/${String(index + 1).padStart(2, '0')}.sql`,
      'utf8'
    ))
  )).join('\n');
  const schemaResult = psql(schema, 120_000);
  assert.equal(schemaResult.status, 0, schemaResult.stderr);
  const importSql = await buildLowerDvinaBoundaryV1ImportSql();
  const imported = psql(importSql, 180_000);
  assert.equal(imported.status, 0, imported.stderr);
  const readback = psql(`
    SELECT count(*) FROM world_base.spatial_v3_world_route_segments
    WHERE world_route_id IN (
      'wrv3__lower_dvina_yp026_to_yp025',
      'wrv3__lower_dvina_yp025_to_yp026'
    );
    SELECT count(*) FROM world_base.spatial_v3_traversal_check_policies;
    SELECT count(*) FROM world_base.spatial_v3_traversal_risk_profiles;
    SELECT fatality_allowed, craft_destruction_allowed, inventory_wipe_allowed
    FROM world_base.spatial_v3_traversal_consequence_policies;
  `);
  assert.match(readback.stdout, /\b4\b/u);
  assert.match(readback.stdout, /\b2\b/u);
  assert.match(readback.stdout, /\b3\b/u);
  assert.match(readback.stdout, /f\s*\|\s*f\s*\|\s*f/u);
  const replay = psql(importSql, 180_000);
  assert.equal(replay.status, 0, replay.stderr);
});
