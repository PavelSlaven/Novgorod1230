import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import pg from 'pg';
import {
  buildBundleReadbackSql,
  buildImportWithReadbackSql,
  buildTransactionalImportSql,
  validateAuthoringBundle,
} from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { M2C_NPC_WAVE_TABLE_SET } from '../../tools/spatial-v3/m2c-npc-wave-bundle-validation.mjs';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 180_000 });
const waveManifestRel = 'data/world-catalogs/novgorod/m2c-npc-wave/v1/manifest.json';
const waveRootRel = 'data/world-catalogs/novgorod/m2c-npc-wave/v1';
const expansion = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json';

const approvedTarget = async () => ({
  ok: true,
  materialization_authorized: false,
  p28_activation: 'not_authorized',
  errors: [],
});

async function startPostgres(name) {
  assert.equal(docker(['run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=wave', '-e', 'POSTGRES_USER=wave', '-e', 'POSTGRES_DB=wave', 'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'wave']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'wave', password: 'wave', database: 'wave' });
  const schema = await readFile('infra/world-base/schema.sql', 'utf8');
  for (const [, part] of schema.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)) {
    await pool.query(await readFile(`infra/world-base/schema/${part}`, 'utf8'));
  }
  await pool.query(await buildTransactionalImportSql({ root: process.cwd(), manifestPath: expansion }));
  return pool;
}

async function waveTableCounts(pool) {
  const counts = {};
  for (const table of M2C_NPC_WAVE_TABLE_SET) {
    counts[table] = (await pool.query(`SELECT count(*)::int AS n FROM world_base.${table}`)).rows[0].n;
  }
  return counts;
}

test('m2c-npc-wave imports through P12 with readback, idempotency and rollback', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const validation = await validateAuthoringBundle({
    root: process.cwd(),
    manifestPath: waveManifestRel,
    validateTargetApproval: approvedTarget,
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));

  const name = `m2c-wave-import-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  pool = await startPostgres(name);

  await pool.query(await buildImportWithReadbackSql({ root: process.cwd(), manifestPath: waveManifestRel }));

  const counts = await waveTableCounts(pool);
  for (const table of M2C_NPC_WAVE_TABLE_SET) assert.ok(counts[table] > 0, table);

  const dupSql = await buildTransactionalImportSql({
    root: process.cwd(),
    manifestPath: waveManifestRel,
    wrapTransaction: false,
  });
  await pool.query(`BEGIN;\n${dupSql}COMMIT;`);
  const afterDup = await waveTableCounts(pool);
  for (const table of M2C_NPC_WAVE_TABLE_SET) assert.equal(afterDup[table], counts[table], `double import changed ${table}`);

  const manifest = JSON.parse(await readFile(waveManifestRel, 'utf8'));
  const waveRoot = join(process.cwd(), dirname(waveManifestRel));
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
    ? { ...d, file: mutatedRel, sha256: createHash('sha256').update(badBody).digest('hex') }
    : d));
  const badManifestPath = join(waveRoot, 'manifest.mutated-postgres-test.json');
  await writeFile(badManifestPath, JSON.stringify(badManifest), 'utf8');
  t.after(() => rm(badManifestPath, { force: true }));

  let mismatch = false;
  try {
    await pool.query(await buildImportWithReadbackSql({
      root: process.cwd(),
      manifestPath: join(waveRootRel, 'manifest.mutated-postgres-test.json'),
    }));
  } catch (error) {
    mismatch = /P12_EXISTING_ROW_MISMATCH:presence_rules/u.test(String(error.message));
  }
  assert.equal(mismatch, true);
  const afterMismatch = await waveTableCounts(pool);
  for (const table of M2C_NPC_WAVE_TABLE_SET) assert.equal(afterMismatch[table], counts[table], `failed import mutated ${table}`);
});

test('m2c-npc-wave readback mismatch on empty wave tables rolls back to zero rows', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `m2c-wave-readback-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  pool = await startPostgres(name);

  const dir = await mkdtemp(join(tmpdir(), 'm2c-wave-rb-'));
  await cp(join(process.cwd(), waveRootRel), dir, { recursive: true });
  t.after(() => rm(dir, { recursive: true, force: true }));

  const manifestFile = join(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const presenceDataset = manifest.datasets.find((d) => d.table === 'presence_rules');
  const presencePath = join(dir, presenceDataset.file);
  const presenceRows = JSON.parse(await readFile(presencePath, 'utf8'));
  const readbackOnly = structuredClone(presenceRows);
  readbackOnly[0] = { ...readbackOnly[0], presence_probability_ppm: readbackOnly[0].presence_probability_ppm + 1 };
  const readbackRel = 'datasets/presence_rules.readback-mismatch-test.json';
  const readbackBody = `${JSON.stringify(readbackOnly, null, 2)}\n`;
  await writeFile(join(dir, readbackRel), readbackBody, 'utf8');
  const readbackManifestFile = join(dir, 'manifest.readback-mismatch-test.json');
  manifest.datasets = manifest.datasets.map((d) => (d.table === 'presence_rules'
    ? { ...d, file: readbackRel, sha256: createHash('sha256').update(readbackBody).digest('hex') }
    : d));
  await writeFile(readbackManifestFile, JSON.stringify(manifest));

  const importSql = await buildTransactionalImportSql({
    root: process.cwd(),
    manifestPath: manifestFile,
    wrapTransaction: false,
    approvedWaveImportAllowed: true,
  });
  const readbackSql = await buildBundleReadbackSql({
    root: process.cwd(),
    manifestPath: readbackManifestFile,
  });
  let code = '';
  try {
    await pool.query(`BEGIN;\n${importSql}${readbackSql}COMMIT;`);
  } catch (error) {
    code = String(error.message);
  }
  assert.match(code, /P12_READBACK_MISMATCH:presence_rules/u);
  const empty = await waveTableCounts(pool);
  for (const table of M2C_NPC_WAVE_TABLE_SET) assert.equal(empty[table], 0, table);
});