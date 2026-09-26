import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { canonicalDigest } from '../../packages/contracts/src/spatial-v3/controlled-vocabularies.js';
import { materializeSpatialV3GeneratedScene } from '../../packages/materialization/src/spatial-v3-generated-scene.js';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { buildTransactionalImportSql, validateAuthoringBundle } from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { testContainerLabel } from '../helpers/test-containers.js';

const manifestPath = 'data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json';
const basePath = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json';
const acousticRoot = 'data/world-catalogs/novgorod/m2c-acoustic';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });

test('M2c acoustic promotion preserves approved raw evidence and exact dependency datasets', async () => {
  const raw = [];
  for (const root of [acousticRoot, `${acousticRoot}/canonical-terminal`]) {
    const approval = await json(`${root}/approval.json`);
    assert.equal(sha(await readFile(`${root}/candidate.json`)), approval.candidate_sha256);
    assert.equal(sha(await readFile(`${root}/authoring-rows.json`)), approval.authoring_rows_sha256);
    raw.push(...await json(`${root}/authoring-rows.json`));
  }
  const rows = await json(`${acousticRoot}/approved/spatial_v3_g6_acoustic_baselines.json`);
  assert.equal(rows.length, 71);
  assert.deepEqual(rows, raw.map((row) => {
    const promoted = { entity_kind: 'g6_acoustic_baseline', ...row, status: 'approved' };
    return { ...promoted, canonical_digest: canonicalDigest(promoted) };
  }));
  const manifest = await json(manifestPath);
  for (const entry of (await json(basePath)).datasets) {
    if (['source_records', 'spatial_v3_authoring_versions'].includes(entry.table)) continue;
    const actual = manifest.datasets.find((row) => row.table === entry.table);
    assert.equal(actual.sha256, entry.sha256, `${entry.table} unchanged`);
    assert.equal(resolve(dirname(manifestPath), actual.file), resolve(dirname(basePath), entry.file));
  }
  const validation = await validateAuthoringBundle({ root: process.cwd(), manifestPath });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
});

test('approved generated25 and canonical46 acoustic bundle imports exact pins through P12 and DDL23', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const container = `m2c-acoustic-import-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', container]); });
  const started = docker(['run', ...testContainerLabel(), '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=m2c', '-e', 'POSTGRES_USER=m2c', '-e', 'POSTGRES_DB=m2c', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', container, 'pg_isready', '-U', 'm2c']).status === 0) { ready = true; break; }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.equal(ready, true);
  const port = Number(docker(['port', container, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'm2c', password: 'm2c', database: 'm2c' });
  const entrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  for (const match of entrypoint.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)) {
    await pool.query(await readFile(`infra/world-base/schema/${match[1]}`, 'utf8'));
  }
  const sql = await buildTransactionalImportSql({ root: process.cwd(), manifestPath });
  await pool.query(sql);
  await pool.query(sql);
  const rows = await json(`${acousticRoot}/approved/spatial_v3_g6_acoustic_baselines.json`);
  const reader = createSpatialV3WorldBaseReader({ query: (query, params) => pool.query(query, params) });
  const base = await json(basePath);
  const load = (table) => json(resolve(dirname(basePath), base.datasets.find((entry) => entry.table === table).file));
  const templates = await load('spatial_v3_g5_generation_templates');
  const nodes = await load('spatial_v3_nodes');
  const scenes = await load('spatial_v3_scene_templates');
  for (const row of rows) {
    const source = row.canonical_g5_id ? nodes.find((node) => node.id === row.canonical_g5_id && node.version === row.canonical_g5_version)
      : templates.find((template) => template.id === row.g5_template_id && template.version === row.g5_template_version);
    const result = await reader[row.canonical_g5_id ? 'readPinnedCanonicalG5AcousticClosure' : 'readPinnedG5AcousticClosure']({
      ...(row.canonical_g5_id ? { canonical_g5: source } : { g5_template: source }),
      scene_template: scenes.find((template) => template.id === row.scene_template_id && template.version === row.scene_template_version),
      world_revision_id: row.world_revision_id
    });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(result.value.rows.length, 1);
    const stored = result.value.rows[0];
    for (const [key, value] of Object.entries(row)) {
      if (key !== 'entity_kind') assert.deepEqual(stored[key], value, `${row.id}.${key}`);
    }
    assert.equal(stored.authoring_digest, row.canonical_digest);
    const scene = await reader.readPinnedSceneTemplateClosure({ id: row.scene_template_id,
      version: row.scene_template_version, world_revision_id: row.world_revision_id });
    assert.equal(scene.ok, true, JSON.stringify(scene.error));
    const produced = materializeSpatialV3GeneratedScene({ party_id: 'acoustic-import-test',
      site_id: `site:${row.id}`, baseline_id: `baseline:${row.id}`, change_set_id: `change:${row.id}`,
      materializer_version: 'm2c', materialization_trace_id: `trace:${row.id}`,
      ...(row.canonical_g5_id ? { canonical_g5: source } : { generation_template: source }),
      scene_closure: scene.value, acoustic_rows: result.value.rows });
    assert.equal(produced.ok, true, JSON.stringify(produced.error));
  }
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM world_base.spatial_v3_g6_acoustic_baselines')).rows[0].count, 71);
  const generated = rows.find((row) => row.g5_template_id);
  const canonical = rows.find((row) => row.canonical_g5_id);
  for (const [g5, version] of [[canonical.canonical_g5_id, canonical.canonical_g5_version], [null, null]]) {
    await pool.query('BEGIN');
    await assert.rejects(pool.query(`UPDATE world_base.spatial_v3_g6_acoustic_baselines
      SET canonical_g5_id=$2,canonical_g5_version=$3,g5_template_id=$4,g5_template_version=$5
      WHERE id=$1`, [generated.id, g5, version, g5 ? generated.g5_template_id : null,
      g5 ? generated.g5_template_version : null]), (error) => error.code === '23514');
    await pool.query('ROLLBACK');
  }
});
