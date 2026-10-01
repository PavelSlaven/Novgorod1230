import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  buildBundleReadbackSql,
  buildStagedDryRunSql,
  buildTransactionalImportSql,
  validateAuthoringBundle,
} from '../p12-authoring-importer.mjs';
import { testContainerLabel } from '../../../test/helpers/test-containers.js';

const candidateManifest = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-world-routes-v1/import-manifest.json';
const baseManifest = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json';
const lineManifest = 'data/world-catalogs/novgorod/m2c-lines-v1-import-manifest.json';
const candidateRows = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-world-routes-v1/datasets/spatial_v3_world_routes.json';

test('world route draft passes staged P12 import and readback, then rolls back', { timeout: 1_200_000 }, async (t) => {
  const validation = await validateAuthoringBundle({ manifestPath: candidateManifest });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const routes = JSON.parse(await readFile(candidateRows, 'utf8'));
  assert.ok(routes.length > 0);

  const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const container = `routes-b2-pg-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', container]); });
  const started = docker(['run', ...testContainerLabel(), '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=routesb2', '-e', 'POSTGRES_USER=routesb2', '-e', 'POSTGRES_DB=routesb2', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', container, 'pg_isready', '-U', 'routesb2']).status === 0) { ready = true; break; }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.equal(ready, true);
  const port = Number(docker(['port', container, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'routesb2', password: 'routesb2', database: 'routesb2' });

  const schemaEntrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  for (const match of schemaEntrypoint.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)) {
    await pool.query(await readFile(`infra/world-base/schema/${match[1]}`, 'utf8'));
  }
  await pool.query(await buildTransactionalImportSql({ manifestPath: baseManifest, temporaryTablePrefix: 'routes_b2_base' }));
  await pool.query(await buildTransactionalImportSql({ manifestPath: lineManifest, temporaryTablePrefix: 'routes_b2_lines' }));

  const staged = await buildStagedDryRunSql({ manifestPath: candidateManifest });
  assert.match(staged, /ROLLBACK;\s*$/u);
  const readback = await buildBundleReadbackSql({ manifestPath: candidateManifest, temporaryTablePrefix: 'routes_b2_readback' });
  const transaction = staged.replace(/ROLLBACK;\s*$/u, `${readback}ROLLBACK;`);
  await pool.query(transaction);

  const route = routes[0];
  const remaining = await pool.query(
    'SELECT count(*)::int AS n FROM world_base.spatial_v3_world_routes WHERE id=$1 AND version=$2',
    [route.id, route.version],
  );
  assert.equal(remaining.rows[0].n, 0, 'the draft candidate was rolled back after readback');
});
