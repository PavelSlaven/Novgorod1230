import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildLowerDvinaV2ImportSql
} from '../../tools/spatial-v3/lower-dvina-v2-importer.mjs';

const container = `lower-dvina-v2-import-${randomUUID().slice(0, 12)}`;
const docker = (args, input, timeout = 60_000) =>
  spawnSync('docker', args, { input, encoding: 'utf8', timeout });

test('full v2 snapshot imports transactionally and reads back in disposable PostgreSQL', async (t) => {
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
    if (docker(['exec', container, 'pg_isready', '-U', 'lower_dvina', '-d', 'world']).status === 0) {
      await new Promise((done) => setTimeout(done, 750));
      if (docker(['exec', container, 'pg_isready', '-U', 'lower_dvina', '-d', 'world']).status === 0) {
        ready = true;
        break;
      }
    }
  }
  assert.equal(ready, true);
  const psql = (sql, timeout) => docker([
    'exec', '-i', container,
    'psql', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', 'lower_dvina', '-d', 'world'
  ], sql, timeout);
  const schema = (await Promise.all(
    Array.from({ length: 19 }, (_, index) => readFile(
      `infra/world-base/schema/${String(index + 1).padStart(2, '0')}.sql`,
      'utf8'
    ))
  )).join('\n');
  assert.equal(psql(schema).status, 0);
  const importSql = await buildLowerDvinaV2ImportSql();
  const imported = psql(importSql, 120_000);
  assert.equal(imported.status, 0, imported.stderr);
  const readback = psql(`
    SELECT status, catalog_digest
    FROM world_base.spatial_v3_world_revisions
    WHERE id='novgorod_spatial_v3_production_v2_candidate_001';
    SELECT count(*) FROM world_base.spatial_v3_authoring_versions
    WHERE world_revision_id='novgorod_spatial_v3_production_v2_candidate_001';
  `);
  assert.match(readback.stdout, /approved/);
  assert.match(readback.stdout, /\b1729\b/);
  const repeat = psql(importSql, 120_000);
  assert.equal(repeat.status, 0, repeat.stderr);
});
