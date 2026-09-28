import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildBundleReadbackSql, buildTransactionalImportSql } from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120_000 });
const name = `p12-text-array-${process.pid}`;
const gap = (code) => ({ code, subject_ref: 'p12', dependency_pins: ['catalog'], blocking: true });

test('P12 TEXT[] import round-trips through PostgreSQL with readback verification', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required');
  const dir = await mkdtemp(join(tmpdir(), 'p12-text-array-'));
  await mkdir(join(dir, 'datasets'));
  const revision = JSON.stringify([{ id: 'p12-revision', catalog_digest: 'a'.repeat(64), status: 'approved', provenance_ref: 'p12-source' }]);
  await writeFile(join(dir, 'datasets/revisions.json'), revision);
  const presence = JSON.stringify([{
    rule_id: 'pr_text_array',
    rule_version: 1,
    world_revision_id: 'p12-revision',
    scope_kind: 'place_family',
    scope_ref: 'pf_test',
    subject_kind: 'category',
    subject_ref: 'cat_test',
    category_id: 'cat_test',
    variants: [],
    presence_probability_ppm: 1000,
    count_limit: 1,
    allowed_seasons: ['spring', 'a,b', 'c"d'],
    allowed_times: [],
    guards: ['guard,one'],
    refresh_class: 'none',
    confidence: 'low',
    status: 'approved',
    provenance_ref: 'p12-source',
    authoring_payload: {},
  }]);
  await writeFile(join(dir, 'datasets/presence_rules.json'), presence);
  const manifest = {
    schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
    bundle_id: 'p12-text-array',
    world_revision_id: 'p12-revision',
    status: 'approved',
    provenance_ref: 'p12-source',
    delete_policy: 'forbid',
    bundle_kind: 'dependency_closure',
    data_gaps: [gap('CANONICAL_G5_INVENTORY_DATA_GAP')],
    datasets: [
      { table: 'spatial_v3_world_revisions', file: 'datasets/revisions.json', sha256: createHash('sha256').update(revision).digest('hex'), status: 'approved', provenance_ref: 'p12-source', delete_policy: 'forbid', depends_on: [] },
      { table: 'presence_rules', file: 'datasets/presence_rules.json', sha256: createHash('sha256').update(presence).digest('hex'), status: 'approved', provenance_ref: 'p12-source', delete_policy: 'forbid', depends_on: ['spatial_v3_world_revisions'] },
    ],
  };
  const manifestFile = join(dir, 'manifest.json');
  await writeFile(manifestFile, JSON.stringify(manifest));
  t.after(() => docker(['rm', '-fv', name]));
  assert.equal(docker(['run', ...testContainerLabel(), '-d', '--name', name, '-e', 'POSTGRES_PASSWORD=p12', '-e', 'POSTGRES_USER=p12', '-e', 'POSTGRES_DB=p12', 'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((done) => setTimeout(done, 350));
    if (docker(['exec', name, 'pg_isready', '-U', 'p12', '-d', 'p12']).status === 0) { ready = true; break; }
  }
  assert.equal(ready, true);
  const ddlParts = await Promise.all(Array.from({ length: 27 }, (_, i) => readFile(`infra/world-base/schema/${String(i + 1).padStart(2, '0')}.sql`, 'utf8')));
  const psql = (sql) => docker(['exec', '-i', name, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'p12', '-d', 'p12'], sql);
  assert.equal(psql(`${ddlParts.join('\n')}\nINSERT INTO world_base.source_records (id,status) VALUES ('p12-source','approved');`).status, 0);
  const importSql = await buildTransactionalImportSql({ root: process.cwd(), manifestPath: manifestFile, wrapTransaction: false, allowTypedGaps: true });
  const readbackSql = await buildBundleReadbackSql({ root: process.cwd(), manifestPath: manifestFile });
  const ok = psql(`BEGIN;\n${importSql}${readbackSql}ROLLBACK;`);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /readback_table/u);
});
