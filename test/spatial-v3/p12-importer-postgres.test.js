import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildStagedDryRunSql, validateAuthoringBundle } from '../../tools/spatial-v3/p12-authoring-importer.mjs';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 45_000 });
const name = `p12-import-${process.pid}`;
const gap = (code) => ({ code, subject_ref: 'p12', dependency_pins: ['catalog'], blocking: true });

test('P12 runs FK-derived staged import/readback only in isolated PostgreSQL and rolls it back', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required for isolated P12 PostgreSQL test');
  const dir = await mkdtemp(join(tmpdir(), 'p12-pg-')); await mkdir(join(dir, 'datasets'));
  const rows = JSON.stringify([{ id: 'p12-revision', catalog_digest: 'a'.repeat(64), status: 'draft', provenance_ref: 'p12-source' }]);
  await writeFile(join(dir, 'datasets/revisions.json'), rows);
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1', bundle_id: 'p12-pg', world_revision_id: 'p12-revision', status: 'draft', provenance_ref: 'p12-source', delete_policy: 'forbid', data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP'), gap('DIRECTIONAL_EXIT_READINESS_DATA_GAP'), gap('ROUTE_BINDING_DATA_GAP'), gap('APPROVED_PROFILE_DATA_GAP')], datasets: [{ table: 'spatial_v3_world_revisions', file: 'datasets/revisions.json', sha256: createHash('sha256').update(rows).digest('hex'), status: 'draft', provenance_ref: 'p12-source', delete_policy: 'forbid', depends_on: [] }] };
  const manifestFile = join(dir, 'manifest.json'); await writeFile(manifestFile, JSON.stringify(manifest));
  assert.equal((await validateAuthoringBundle({ root: process.cwd(), manifestPath: manifestFile })).errors.length, 0);
  const staged = await buildStagedDryRunSql({ root: process.cwd(), manifestPath: manifestFile }); assert.match(staged, /BEGIN;[\s\S]*imported_rows[\s\S]*ROLLBACK;/);
  t.after(() => docker(['rm', '-f', name]));
  assert.equal(docker(['run', '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=p12_local', '-e', 'POSTGRES_USER=p12', '-e', 'POSTGRES_DB=p12', 'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((done) => setTimeout(done, 350));
    if (docker(['exec', name, 'pg_isready', '-U', 'p12', '-d', 'p12']).status === 0) {
      // PostgreSQL can report accepting connections just before init scripts
      // have released their last startup lock on a busy Docker host.
      await new Promise((done) => setTimeout(done, 500));
      if (docker(['exec', name, 'pg_isready', '-U', 'p12', '-d', 'p12']).status === 0) { ready = true; break; }
    }
  }
  assert.equal(ready, true);
  const ddl = (await Promise.all(Array.from({ length: 14 }, (_, i) => readFile(`infra/world-base/schema/${String(i + 1).padStart(2, '0')}.sql`, 'utf8')))).join('\n');
  const psql = (sql) => docker(['exec', '-i', name, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'p12', '-d', 'p12'], sql);
  assert.equal(psql(ddl).status, 0); assert.equal(psql("INSERT INTO world_base.source_records (id,status) VALUES ('p12-source','approved');").status, 0);
  const result = psql(staged); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /spatial_v3_world_revisions/); assert.match(result.stdout, /\b1\b/);
  assert.match(psql("SELECT count(*) FROM world_base.spatial_v3_world_revisions WHERE id='p12-revision';").stdout, /\b0\b/);
});
