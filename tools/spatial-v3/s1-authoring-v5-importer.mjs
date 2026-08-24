import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildWorldBaseSchemaReference } from
  '../../scripts/generate-world-base-schema-reference.mjs';

const ROOT =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v5';

export async function buildS1AuthoringV5ImportSql({
  root = process.cwd(), rollback = false
} = {}) {
  const candidateRoot = resolve(root, ROOT);
  const manifest = JSON.parse(await readFile(
    resolve(candidateRoot, 'manifest.json'), 'utf8'
  ));
  if (manifest.world_revision_id
      !== 'novgorod_spatial_v3_production_v5_candidate_001'
    || manifest.catalog_digest
      !== 'aa62e775635c5ec17693f3c15f7ef0a7427a77733566f534afc1dd201c5a42a8'
    || manifest.status !== 'approved') {
    throw new Error('s1_authoring_v5_manifest_mismatch');
  }
  const schema = await buildWorldBaseSchemaReference({ root });
  const tables = new Map(schema.schema.tables.map((table) => [
    table.name, table
  ]));
  const sql = ['BEGIN;', 'SET CONSTRAINTS ALL DEFERRED;'];
  for (const dataset of manifest.datasets) {
    const rowsText = await readFile(resolve(candidateRoot, dataset.file), 'utf8');
    if (sha256(rowsText) !== dataset.sha256) {
      throw new Error(`s1_authoring_v5_dataset_digest_mismatch:${dataset.table}`);
    }
    const table = tables.get(dataset.table);
    if (!table) throw new Error(`s1_authoring_v5_unknown_table:${dataset.table}`);
    const keys = primaryKey(table);
    for (const row of JSON.parse(rowsText)) {
      const columns = table.columns.filter(({ name }) => Object.hasOwn(row, name));
      const values = new Map(columns.map((column) => [
        column.name, literal(row[column.name], column.type)
      ]));
      const predicate = keys.map(({ name }) =>
        `actual.${name} IS NOT DISTINCT FROM ${values.get(name)}`).join(' AND ');
      const managed = new Set(['created_at', 'updated_at']);
      const expected = Object.fromEntries(columns.filter(({ name }) =>
        !managed.has(name)).map(({ name }) => [name, row[name]]));
      sql.push(
        `INSERT INTO world_base.${dataset.table} (${columns.map(({ name }) => name).join(',')})`,
        `VALUES (${columns.map(({ name }) => values.get(name)).join(',')})`,
        'ON CONFLICT DO NOTHING;',
        `DO $s1$ BEGIN IF NOT EXISTS (SELECT 1 FROM world_base.${dataset.table} actual`,
        `  WHERE ${predicate} AND to_jsonb(actual) @> ${literal(expected, 'JSONB')}) THEN`,
        `  RAISE EXCEPTION 'S1_AUTHORING_V5_IMPORT_READBACK_MISMATCH:${dataset.table}';`,
        'END IF; END $s1$;'
      );
    }
  }
  sql.push('SET CONSTRAINTS ALL IMMEDIATE;', rollback ? 'ROLLBACK;' : 'COMMIT;');
  return `${sql.join('\n')}\n`;
}

function primaryKey(table) {
  const inline = table.columns.filter(({ primary_key: key }) => key);
  if (inline.length) return inline;
  const names = table.constraints.find((constraint) => /^PRIMARY KEY\s*\(/u
    .test(constraint))?.match(/^PRIMARY KEY\s*\(([^)]+)\)/u)?.[1]
    ?.split(',').map((name) => name.trim()) ?? [];
  return names.map((name) => table.columns.find((column) =>
    column.name === name));
}

function literal(value, type = '') {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const quoted = `'${serialized.replaceAll("'", "''")}'`;
  return /\bJSONB?\b/iu.test(type) ? `${quoted}::jsonb` : quoted;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
