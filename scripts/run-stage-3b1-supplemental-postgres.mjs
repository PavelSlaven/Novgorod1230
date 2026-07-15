import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

import { applySupplementalCatalogBundle, supplementalDigest } from '../tools/world-catalog-workflow/src/index.js';

const root = resolve(import.meta.dirname, '..');
const bundleRoot = resolve(root, 'data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/bundle');
const databaseUrl = process.env.DATABASE_URL ?? process.env.RUS_WORLD_DATABASE_URL;
if (!databaseUrl) throw new Error('SUPPLEMENTAL_DATABASE_URL_REQUIRED');

const manifest = readJson('manifest.json');
const recordsByTable = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(dataset.path)]));
const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();
try {
  await bootstrapExternalReferences(client);
  const adapter = createPostgresAdapter(client);
  const result = await applySupplementalCatalogBundle({ manifest, recordsByTable, adapter, externalIds: {
    regions: new Set(['region_novgorod_land']),
    world_revisions: new Set(['novgorod_1230_research_revision_001']),
    region_social_roles: new Set(['nov_role_guard'])
  } });
  const rollbackResult = await verifyRollback(client, adapter);
  const statuses = await client.query(`SELECT count(*)::int AS count FROM world_base.world_revisions WHERE id = $1 AND status <> 'draft'`, [manifest.world_revision_id]);
  if (statuses.rows[0].count !== 0) throw new Error('SUPPLEMENTAL_ACTIVATION_FORBIDDEN');
  process.stdout.write(`${JSON.stringify({ pass: true, mode: 'apply', bundle_id: manifest.bundle_id, tables: result.tables, rollback: rollbackResult, records: Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, dataset.record_count])) }, null, 2)}\n`);
} finally {
  client.release();
  await pool.end();
}

function createPostgresAdapter(client) {
  return {
    async begin() { await client.query('BEGIN'); },
    async commit() { await client.query('COMMIT'); },
    async rollback() { await client.query('ROLLBACK'); },
    async insert(table, records) {
      if (records.length === 0) return;
      const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
      const quotedTable = quoteIdentifier(table);
      const quotedColumns = columns.map(quoteIdentifier).join(', ');
      for (const record of records) {
        const values = columns.map((column) => record[column]);
        const placeholders = values.map((value, index) => value && typeof value === 'object' ? `$${index + 1}::jsonb` : `$${index + 1}`);
        await client.query(`INSERT INTO world_base.${quotedTable} (${quotedColumns}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO NOTHING`, values.map((value) => value && typeof value === 'object' ? JSON.stringify(value) : value));
      }
    },
    async readback(table, records) {
      if (records.length === 0) return { record_count: 0, payload_digest: supplementalDigest([]) };
      const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
      const projections = columns.map((column) => records.some((record) => /^\d{4}-\d{2}-\d{2}$/u.test(record[column] ?? '')) ? `${quoteIdentifier(column)}::text AS ${quoteIdentifier(column)}` : quoteIdentifier(column)).join(', ');
      const rows = await client.query(`SELECT ${projections} FROM world_base.${quoteIdentifier(table)} WHERE id = ANY($1::text[])`, [records.map((record) => record.id)]);
      const byId = new Map(rows.rows.map((row) => [row.id, row]));
      const canonicalRows = records.map((record) => Object.fromEntries(Object.keys(record).map((column) => [column, byId.get(record.id)?.[column]])));
      return { record_count: rows.rows.length, payload_digest: supplementalDigest(canonicalRows) };
    }
  };
}

async function bootstrapExternalReferences(client) {
  await client.query(`INSERT INTO world_base.regions (id, canonical_name) VALUES ('region_novgorod_land', 'Novgorod Land') ON CONFLICT (id) DO NOTHING`);
  await client.query(`INSERT INTO world_base.world_revisions (id, title, catalog_digest, status) VALUES ('novgorod_1230_research_revision_001', 'CI parent revision', $1, 'draft') ON CONFLICT (id) DO NOTHING`, ['0'.repeat(64)]);
  await client.query(`INSERT INTO world_base.region_social_roles (id, region_id, title) VALUES ('nov_role_guard', 'region_novgorod_land', 'CI guard') ON CONFLICT (id) DO NOTHING`);
}

async function verifyRollback(client, adapter) {
  const record = { ...recordsByTable.source_records[0], id: 'src_stage3b1_rollback_probe' };
  const probeManifest = {
    schema_version: 1,
    bundle_id: 'stage3b1_rollback_probe',
    world_revision_id: manifest.world_revision_id,
    approval: 'draft',
    deletion_policy: 'none',
    provenance: { source_ids: [record.id], effective_at: '2026-07-15' },
    datasets: [{ table: 'source_records', path: 'rollback-probe.json', schema_id: 'rus.source_records.v1', record_count: 1, sha256: supplementalDigest([record]), dependency_order: 0 }]
  };
  const failingAdapter = { ...adapter, async readback() { return { record_count: 0, payload_digest: supplementalDigest([]) }; } };
  await assertRejectsReadback(() => applySupplementalCatalogBundle({ manifest: probeManifest, recordsByTable: { source_records: [record] }, adapter: failingAdapter }));
  const residual = await client.query(`SELECT count(*)::int AS count FROM world_base.source_records WHERE id = $1`, [record.id]);
  if (residual.rows[0].count !== 0) throw new Error('SUPPLEMENTAL_ROLLBACK_RESIDUAL_WRITE');
  return 'pass';
}

async function assertRejectsReadback(run) {
  try {
    await run();
  } catch (error) {
    if (String(error.message).startsWith('SUPPLEMENTAL_READBACK_MISMATCH:source_records:')) return;
    throw error;
  }
  throw new Error('SUPPLEMENTAL_ROLLBACK_PROBE_DID_NOT_FAIL');
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error(`SUPPLEMENTAL_SQL_IDENTIFIER_INVALID:${value}`);
  return `"${value}"`;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(bundleRoot, relativePath), 'utf8'));
}
