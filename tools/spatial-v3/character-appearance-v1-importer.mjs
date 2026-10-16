import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { buildTargetAppearanceTransferImportArtifacts, buildTargetAppearanceTransferV3ImportArtifacts } from '../runtime-catalog-activation/src/target-appearance-transfer.js';

import { buildWorldBaseSchemaReference } from '../../scripts/generate-world-base-schema-reference.mjs';
import {
  CHARACTER_APPEARANCE_CANDIDATE_ROOT,
  validateCharacterAppearanceV1
} from './character-appearance-v1-validator.mjs';

const identifier = (value) => {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) throw new Error(`invalid_sql_identifier:${value}`);
  return value;
};

function literal(value, type = '') {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const quoted = `'${serialized.replaceAll("'", "''")}'`;
  return /\bJSONB?\b/iu.test(type) ? `${quoted}::jsonb` : quoted;
}

function primaryKey(schema) {
  const inline = schema.columns.filter(({ primary_key: key }) => key);
  if (inline.length > 0) return inline;
  const declaration = schema.constraints.find((constraint) => /^PRIMARY KEY\s*\(/iu.test(constraint));
  const names = declaration?.match(/^PRIMARY KEY\s*\(([^)]+)\)/iu)?.[1]
    .split(',').map((name) => name.trim()) ?? [];
  return names.map((name) => schema.columns.find((column) => column.name === name)).filter(Boolean);
}

// S1 v5/v6 parent_revision FK needs v4 revision row; not full appearance DDL/import.
const PARENT_REVISION_ENSURE_TABLES = Object.freeze([
  'source_records',
  'world_revisions',
  'spatial_v3_world_revisions'
]);

export async function buildCharacterAppearanceParentRevisionEnsureSql({
  root = process.cwd(), rollback = false
} = {}) {
  return buildCharacterAppearanceV1ImportSql({
    root, rollback, tables: PARENT_REVISION_ENSURE_TABLES
  });
}

export async function buildCharacterAppearanceV1ImportSql({
  root = process.cwd(), rollback = false, tables = null
} = {}) {
  const validation = await validateCharacterAppearanceV1(root);
  if (!validation.pass) throw new Error(`character_appearance_candidate_invalid:${validation.errors.map(({ code }) => code).join(',')}`);
  const candidateRoot = resolve(root, CHARACTER_APPEARANCE_CANDIDATE_ROOT);
  const manifest = JSON.parse(await readFile(resolve(candidateRoot, 'manifest.json')));
  const datasets = tables == null
    ? manifest.datasets
    : manifest.datasets.filter((item) => tables.includes(item.table));
  if (tables != null && datasets.length !== tables.length) {
    throw new Error('character_appearance_parent_revision_tables_missing');
  }
  const rowsByTable = new Map(await Promise.all(datasets.map(async (item) =>
    [item.table, JSON.parse(await readFile(resolve(candidateRoot, item.file)))])));
  return buildAppearanceRowsSql({ root, rollback, datasets, rowsByTable });
}

/** Exact reviewed target successor through the existing appearance insert/readback owner. */
export async function buildTargetAppearanceTransferImportSql({ root = process.cwd(), rollback = false } = {}) {
  const { manifest: expectedManifest, datasets: expectedRows } =
    await buildTargetAppearanceTransferImportArtifacts({ repositoryRoot: root });
  const candidateRoot = resolve(root, 'data/world-catalogs/novgorod/live-world-runtime-v17');
  const bytes = await readFile(resolve(candidateRoot, 'appearance-transfer-v2-import-manifest.json'));
  const manifest = JSON.parse(bytes);
  const approval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-appearance-repin-data-approval.json')));
  if (approval.decision !== 'APPROVE_DATA_ONLY'
    || approval.target_appearance_mapped_approval?.import_manifest_sha256 !== sha256(bytes)
    || JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
    throw new Error('TARGET_APPEARANCE_EXACT_IMPORT_MAPPING_APPROVAL_REQUIRED');
  }
  const rowsByTable = new Map();
  for (const item of manifest.datasets) {
    const content = await readFile(resolve(candidateRoot, item.file));
    const rows = JSON.parse(content);
    if (sha256(content) !== item.sha256 || JSON.stringify(rows) !== JSON.stringify(expectedRows[item.table])) {
      throw new Error('TARGET_APPEARANCE_IMPORT_DATASET_MISMATCH');
    }
    rowsByTable.set(item.table, rows);
  }
  return buildAppearanceRowsSql({ root, rollback, datasets: manifest.datasets, rowsByTable,
    requiredExistingRows: manifest.existing_dependencies });
}

/** SQL for the independently data-approved 129-row v3 mapping; no DB connection. */
export async function buildTargetAppearanceTransferV3ImportSql({ root = process.cwd(), rollback = false } = {}) {
  const { manifest: expectedManifest, datasets: expectedRows } =
    await buildTargetAppearanceTransferV3ImportArtifacts({ repositoryRoot: root });
  const candidateRoot = resolve(root, 'data/world-catalogs/novgorod/live-world-runtime-v17');
  const manifest = JSON.parse(await readFile(resolve(candidateRoot, 'appearance-transfer-v3-import-manifest.json')));
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
    throw new Error('TARGET_APPEARANCE_V3_IMPORT_MAPPING_MISMATCH');
  }
  const rowsByTable = new Map();
  for (const item of manifest.datasets) {
    const content = await readFile(resolve(candidateRoot, item.file));
    const rows = JSON.parse(content);
    if (sha256(content) !== item.sha256 || JSON.stringify(rows) !== JSON.stringify(expectedRows[item.table])) {
      throw new Error('TARGET_APPEARANCE_V3_IMPORT_DATASET_MISMATCH');
    }
    rowsByTable.set(item.table, rows);
  }
  return buildAppearanceRowsSql({ root, rollback, datasets: manifest.datasets, rowsByTable });
}

async function buildAppearanceRowsSql({ root, rollback, datasets, rowsByTable, requiredExistingRows = {} }) {
  const ddl = await buildWorldBaseSchemaReference({ root });
  const schemas = new Map(ddl.schema.tables.map((table) => [table.name, table]));
  const sql = ['BEGIN;', 'SET CONSTRAINTS ALL DEFERRED;'];
  for (const [table, rows] of Object.entries(requiredExistingRows)) for (const row of rows) {
    sql.push(`DO $appearance$ BEGIN IF NOT EXISTS (SELECT 1 FROM world_base.${identifier(table)} actual`,
      `WHERE actual.id=${literal(row.id)} AND to_jsonb(actual) @> ${literal(row, 'JSONB')}) THEN`,
      `RAISE EXCEPTION 'CHARACTER_APPEARANCE_DEPENDENCY_READBACK_MISMATCH:${identifier(table)}';`,
      'END IF; END $appearance$;');
  }
  for (const item of dependencyOrder(datasets)) {
    const tableName = identifier(item.table);
    const schema = schemas.get(tableName);
    if (!schema) throw new Error(`character_appearance_import_table_not_in_schema:${tableName}`);
    const keys = primaryKey(schema);
    if (keys.length === 0) throw new Error(`character_appearance_import_table_without_primary_key:${tableName}`);
    const rows = rowsByTable.get(item.table);
    const managed = schema.columns.filter(({ name }) => ['created_at', 'updated_at'].includes(name)).map(({ name }) => name);
    const comparable = managed.length > 0
      ? `(to_jsonb(actual) - ARRAY[${managed.map((name) => `'${name}'`).join(',')}]::text[])`
      : 'to_jsonb(actual)';
    for (const row of rows) {
      const columns = schema.columns.filter(({ name }) => Object.hasOwn(row, name));
      const values = new Map(columns.map((column) => [column.name, literal(row[column.name], column.type)]));
      const predicate = keys.map(({ name }) => `actual.${identifier(name)} IS NOT DISTINCT FROM ${values.get(name)}`).join(' AND ');
      const expected = Object.fromEntries(columns.filter(({ name }) => !managed.includes(name)).map(({ name }) => [name, row[name]]));
      sql.push(
        `INSERT INTO world_base.${tableName} (${columns.map(({ name }) => identifier(name)).join(',')})`,
        `VALUES (${columns.map(({ name }) => values.get(name)).join(',')})`,
        'ON CONFLICT DO NOTHING;',
        `DO $appearance$ BEGIN IF NOT EXISTS (SELECT 1 FROM world_base.${tableName} actual`,
        `  WHERE ${predicate} AND ${comparable} @> ${literal(expected, 'JSONB')}) THEN`,
        `  RAISE EXCEPTION 'CHARACTER_APPEARANCE_IMPORT_READBACK_MISMATCH:${tableName}';`,
        'END IF; END $appearance$;'
      );
    }
  }
  sql.push('SET CONSTRAINTS ALL IMMEDIATE;', rollback ? 'ROLLBACK;' : 'COMMIT;');
  return `${sql.join('\n')}\n`;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function dependencyOrder(datasets = []) {
  const remaining = new Map(datasets.map((item) => [item.table, item]));
  const ordered = [];
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((item) =>
      (item.depends_on ?? []).every((dependency) => !remaining.has(dependency))
    ).sort((left, right) => left.table.localeCompare(right.table));
    if (ready.length === 0) throw new Error('character_appearance_dataset_dependency_cycle');
    for (const item of ready) { ordered.push(item); remaining.delete(item.table); }
  }
  return ordered;
}

async function main() {
  const rootArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const build = process.argv.includes('--target-transfer-v3')
    ? buildTargetAppearanceTransferV3ImportSql
    : process.argv.includes('--target-transfer')
      ? buildTargetAppearanceTransferImportSql : buildCharacterAppearanceV1ImportSql;
  process.stdout.write(await build({
    root: resolve(rootArgument ?? process.cwd()),
    rollback: process.argv.includes('--rollback')
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
