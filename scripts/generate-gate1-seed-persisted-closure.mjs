import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { digestValue } from '../tools/world-catalog-workflow/src/digest.js';
import { readCanonicalSeedTableClosure } from
  '../tools/world-catalog-workflow/src/seed-closure-readback.js';
import { buildGate1SeedClosureArtifacts } from
  './generate-gate1-seed-closure-request.mjs';

const root = resolve(import.meta.dirname, '..');
const importerRoot = resolve(root,
  'tools/rus13-world-base-importer/world_base_importer_v1');
const seedPath = resolve(importerRoot, 'world_base_seed_v1.sql.gz');
const reportPath = resolve(importerRoot,
  'reports/world_base_import_report_v1.json');
const outputRoot = resolve(root, 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/seed-closure-v1');

export async function deriveGate1SeedPersistedClosure(client) {
  for (let part = 1; part <= 17; part += 1) {
    await client.query(await readFile(resolve(root, 'infra/world-base/schema',
      `${String(part).padStart(2, '0')}.sql`), 'utf8'));
  }
  const [seedBytes, report] = await Promise.all([
    readFile(seedPath),
    readFile(reportPath, 'utf8').then(JSON.parse)
  ]);
  const seedSql = gunzipSync(seedBytes).toString('utf8');
  const startMarker = 'SET CONSTRAINTS ALL DEFERRED;';
  const start = seedSql.indexOf(startMarker);
  const end = seedSql.lastIndexOf('COMMIT;');
  if (start < 0 || end <= start) {
    throw new Error('GATE1_CANONICAL_SEED_INVALID');
  }
  const tableNames = Object.keys(report.summary.tables).sort();
  await client.query('BEGIN');
  try {
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    await client.query(seedSql.slice(start + startMarker.length, end));
    const tableClosure = await readCanonicalSeedTableClosure(client,
      tableNames);
    return Object.freeze({
      schema: 'rus.gate1_rus13_seed_persisted_closure.v1',
      seed_gzip_sha256: sha256(seedBytes),
      seed_sql_sha256: sha256(Buffer.from(seedSql)),
      table_count: tableClosure.length,
      total_row_count: tableClosure.reduce((total, table) =>
        total + table.row_count, 0),
      table_closure: tableClosure,
      table_closure_digest: digestValue(tableClosure),
      transaction: 'rolled_back_after_readback'
    });
  } finally {
    await client.query('ROLLBACK');
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.PR17_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('PR17_TEST_DATABASE_URL_REQUIRED');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const database = (await pool.query(
      'SELECT current_database() AS database')).rows[0]?.database;
    if (!/^pr17_[a-z0-9_]+$/u.test(String(database ?? ''))) {
      throw new Error(`PR17_ISOLATED_DATABASE_REQUIRED:${database}`);
    }
    const closure = await deriveGate1SeedPersistedClosure(pool);
    const artifacts = await buildGate1SeedClosureArtifacts({
      tableClosure: closure.table_closure
    });
    if (process.argv.includes('--write')) {
      await mkdir(outputRoot, { recursive: true });
      await Promise.all(Object.entries(artifacts).map(([name, value]) =>
        writeFile(resolve(outputRoot, `${name}.json`),
          `${JSON.stringify(value, null, 2)}\n`)));
    } else {
      process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`);
    }
  } finally {
    await pool.end();
  }
}
