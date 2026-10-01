import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const rowKey = (row) => JSON.stringify(row);
const stableRows = (rows) => rows.map(rowKey).sort();

test('world route import commits, is idempotent, rejects conflicts and enforces deferred route checks', { timeout: 1_200_000 }, async (t) => {
  const validation = await validateAuthoringBundle({ manifestPath: candidateManifest });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const routes = JSON.parse(await readFile(candidateRows, 'utf8'));
  assert.equal(routes.length, 48);

  const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const container = `routes-b2-pg-${process.pid}`;
  let pool;
  let tempBundle;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', container]); if (tempBundle) await rm(tempBundle, { recursive: true, force: true }); });
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

  const manifest = JSON.parse(await readFile(candidateManifest, 'utf8'));
  const tables = manifest.datasets.map((dataset) => dataset.table);
  const rowCounts = async () => Object.fromEntries(await Promise.all(tables.map(async (table) => {
    const result = await pool.query(`SELECT count(*)::int AS n FROM world_base.${table}`);
    return [table, result.rows[0].n];
  })));
  const beforeStaged = await rowCounts();
  const staged = await buildStagedDryRunSql({ manifestPath: candidateManifest });
  assert.match(staged, /ROLLBACK;\s*$/u);
  const stagedReadback = await buildBundleReadbackSql({ manifestPath: candidateManifest, temporaryTablePrefix: 'sgr' });
  await pool.query(staged.replace(/ROLLBACK;\s*$/u, `SET CONSTRAINTS ALL IMMEDIATE;\n${stagedReadback}ROLLBACK;`));
  const absentBeforeCommit = await pool.query('SELECT count(*)::int AS n FROM world_base.spatial_v3_world_routes WHERE id=$1 AND version=2', [routes[0].id]);
  assert.equal(absentBeforeCommit.rows[0].n, 0, 'staged draft import rolls back after readback');
  assert.deepEqual(await rowCounts(), beforeStaged, 'staged rollback leaves every manifest table unchanged');

  const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async (table) => {
    const result = await pool.query(`SELECT to_jsonb(row_value) AS row FROM world_base.${table} AS row_value`);
    return [table, stableRows(result.rows.map(({ row }) => row))];
  })));
  const assertPriorRowsUnchanged = (before, after, message) => {
    for (const table of tables) {
      const afterCounts = new Map();
      for (const row of after[table]) afterCounts.set(row, (afterCounts.get(row) ?? 0) + 1);
      for (const row of before[table]) {
        const count = afterCounts.get(row) ?? 0;
        assert.ok(count > 0, `${message}: ${table} pre-existing row changed or disappeared`);
        afterCounts.set(row, count - 1);
      }
    }
  };
  const beforeImport = await snapshot();
  const makeCommitSql = async (manifestPath, suffix) => {
    const prefix = ({ commit_once: 'c1', commit_twice: 'c2', conflict: 'cf' })[suffix];
    const importSql = await buildTransactionalImportSql({ manifestPath, wrapTransaction: false, temporaryTablePrefix: prefix });
    const readbackSql = await buildBundleReadbackSql({ manifestPath, temporaryTablePrefix: `${prefix}r` });
    return `BEGIN;\n${importSql}SET CONSTRAINTS ALL IMMEDIATE;\n${readbackSql}COMMIT;\n`;
  };
  const commitSql = await makeCommitSql(candidateManifest, 'commit_once');
  await pool.query(commitSql);
  const afterFirstImport = await snapshot();
  assertPriorRowsUnchanged(beforeImport, afterFirstImport, 'first candidate commit');
  const routeCount = await pool.query('SELECT count(*)::int AS n FROM world_base.spatial_v3_world_routes WHERE version=2 AND provenance_ref=$1', ['m2c_world_routes_v1_candidate']);
  assert.equal(routeCount.rows[0].n, 48);

  await pool.query(await makeCommitSql(candidateManifest, 'commit_twice'));
  const afterRepeat = await snapshot();
  assert.deepEqual(afterRepeat, afterFirstImport, 'second import is idempotent across every candidate table');

  tempBundle = await mkdtemp(join(tmpdir(), 'routes-b2-conflict-'));
  await mkdir(join(tempBundle, 'datasets'));
  const conflictManifest = structuredClone(manifest);
  for (const dataset of conflictManifest.datasets) {
    const sourcePath = `data/world-catalogs/novgorod/spatial-v3/candidates/m2c-world-routes-v1/${dataset.file}`;
    const content = JSON.parse(await readFile(sourcePath, 'utf8'));
    if (dataset.table === 'spatial_v3_world_routes') {
      content[0].provenance_ref = `${content[0].provenance_ref}#conflict`;
      const bytes = `${JSON.stringify(content, null, 2)}\n`;
      dataset.sha256 = sha256(bytes);
      await writeFile(join(tempBundle, dataset.file), bytes);
    } else {
      await writeFile(join(tempBundle, dataset.file), await readFile(sourcePath));
    }
  }
  const conflictManifestPath = join(tempBundle, 'import-manifest.json');
  await writeFile(conflictManifestPath, `${JSON.stringify(conflictManifest, null, 2)}\n`);
  const beforeConflict = await snapshot();
  const conflictSql = await makeCommitSql(conflictManifestPath, 'conflict');
  await assert.rejects(pool.query(conflictSql), /P12_EXISTING_ROW_MISMATCH:spatial_v3_world_routes/u);
  assert.deepEqual(await snapshot(), beforeConflict, 'failed existing-row conflict is atomic');

  const target = routes.find((route) => route.id.includes('cross_g4_01'));
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN'); transactionOpen = true;
    await client.query("UPDATE world_base.spatial_v3_world_routes SET status='approved', reverse_route_version=1 WHERE id=$1 AND version=2", [target.id]);
    // Queue the deferred relation validator, which calls assert_spatial_v3_route for the mutated route.
    await client.query("UPDATE world_base.spatial_v3_world_route_segments SET line_name=line_name WHERE world_route_id=$1 AND world_route_version=2 AND ordinal=0", [target.id]);
    await assert.rejects(client.query('SET CONSTRAINTS ALL IMMEDIATE'), /route_cycle_or_branch/u);
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
  assert.deepEqual(await snapshot(), afterFirstImport, 'rejected reverse-version mutation leaves committed candidate unchanged');
});
