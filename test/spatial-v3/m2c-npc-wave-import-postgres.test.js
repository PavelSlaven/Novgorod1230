import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import pg from 'pg';
import {
  buildImportWithReadbackSql,
  buildTransactionalImportSql,
  validateAuthoringBundle,
} from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 180_000 });
const waveManifest = 'data/world-catalogs/novgorod/m2c-npc-wave/v1/manifest.json';
const expansion = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json';
const WAVE_TABLES = [
  'place_families',
  'spatial_node_place_family_bindings',
  'presence_rules',
  'npc_relationship_materialization_rules',
  'speech_address_forms',
  'household_composition_profiles',
  'slot_instance_variants',
  'water_body_presence_facets',
  'fauna_phase_activity_rules',
];

const approvedTarget = async () => ({
  ok: true,
  materialization_authorized: false,
  p28_activation: 'not_authorized',
  errors: [],
});

test('m2c-npc-wave imports through P12 with readback, idempotency and rollback', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const validation = await validateAuthoringBundle({
    root: process.cwd(),
    manifestPath: waveManifest,
    validateTargetApproval: approvedTarget,
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

  const name = `m2c-wave-import-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });

  assert.equal(docker(['run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=wave', '-e', 'POSTGRES_USER=wave', '-e', 'POSTGRES_DB=wave', 'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'wave']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'wave', password: 'wave', database: 'wave' });

  const schema = await readFile('infra/world-base/schema.sql', 'utf8');
  for (const [, part] of schema.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)) {
    await pool.query(await readFile(`infra/world-base/schema/${part}`, 'utf8'));
  }
  await pool.query(await buildTransactionalImportSql({ root: process.cwd(), manifestPath: expansion }));

  await pool.query(await buildImportWithReadbackSql({ root: process.cwd(), manifestPath: waveManifest }));

  const counts = {};
  for (const table of WAVE_TABLES) {
    counts[table] = (await pool.query(`SELECT count(*)::int AS n FROM world_base.${table}`)).rows[0].n;
    assert.ok(counts[table] > 0, table);
  }

  const dupSql = await buildTransactionalImportSql({
    root: process.cwd(),
    manifestPath: waveManifest,
    wrapTransaction: false,
  });
  await pool.query(`BEGIN;\n${dupSql}COMMIT;`);
  for (const table of WAVE_TABLES) {
    const after = (await pool.query(`SELECT count(*)::int AS n FROM world_base.${table}`)).rows[0].n;
    assert.equal(after, counts[table], `double import changed ${table}`);
  }

  const manifest = JSON.parse(await readFile(waveManifest, 'utf8'));
  const waveRoot = join(process.cwd(), dirname(waveManifest));
  const presenceDataset = manifest.datasets.find((d) => d.table === 'presence_rules');
  const presenceAbs = join(waveRoot, presenceDataset.file);
  const presenceRows = JSON.parse(await readFile(presenceAbs, 'utf8'));
  const mutated = structuredClone(presenceRows);
  mutated[0] = { ...mutated[0], presence_probability_ppm: mutated[0].presence_probability_ppm + 1 };
  const mutatedRel = 'datasets/presence_rules.mutated-postgres-test.json';
  const mutatedAbs = join(waveRoot, mutatedRel);
  const badBody = `${JSON.stringify(mutated, null, 2)}\n`;
  await writeFile(mutatedAbs, badBody, 'utf8');
  t.after(() => rm(mutatedAbs, { force: true }));
  const badManifest = structuredClone(manifest);
  badManifest.datasets = manifest.datasets.map((d) => (d.table === 'presence_rules'
    ? {
      ...d,
      file: mutatedRel,
      sha256: createHash('sha256').update(badBody).digest('hex'),
    }
    : d));
  const badManifestPath = join(waveRoot, 'manifest.mutated-postgres-test.json');
  await writeFile(badManifestPath, JSON.stringify(badManifest), 'utf8');
  t.after(() => rm(badManifestPath, { force: true }));

  let mismatch = false;
  try {
    await pool.query(await buildImportWithReadbackSql({
      root: process.cwd(),
      manifestPath: join('data/world-catalogs/novgorod/m2c-npc-wave/v1', 'manifest.mutated-postgres-test.json'),
    }));
  } catch (error) {
    mismatch = /P12_EXISTING_ROW_MISMATCH:presence_rules/u.test(String(error.message));
  }
  assert.equal(mismatch, true);

  for (const table of WAVE_TABLES) {
    const after = (await pool.query(`SELECT count(*)::int AS n FROM world_base.${table}`)).rows[0].n;
    assert.equal(after, counts[table], `failed import mutated ${table}`);
  }
});
