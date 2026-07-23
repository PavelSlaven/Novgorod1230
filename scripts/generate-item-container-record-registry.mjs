import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorldBaseSchemaReference } from './generate-world-base-schema-reference.mjs';

const CANDIDATE_ROOT = 'data/knowledge-source/imports/item-container-120-v5/candidate';
const OUTPUT = 'data/runtime-catalog/item-container-record-registry.v1.json';
const ADAPTER_OUTPUT = 'tools/runtime-catalog-activation/src/record-adapters.generated.js';
const OPERATIONAL_COLUMNS = new Set([
  'approved_at',
  'checked_at',
  'created_at',
  'updated_at'
]);

const NORMALIZER_BY_SQL_TYPE = Object.freeze({
  BIGINT: 'integer_decimal',
  BOOLEAN: 'boolean',
  DATE: 'date',
  INTEGER: 'integer_decimal',
  JSONB: 'jsonb',
  NUMERIC: 'numeric_decimal',
  TEXT: 'text_nfc',
  TIMESTAMPTZ: 'timestamptz_microseconds',
  UUID: 'text_nfc'
});

export async function buildItemContainerRecordRegistry({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const manifest = JSON.parse(
    await readFile(resolve(projectRoot, CANDIDATE_ROOT, 'manifest.json'), 'utf8')
  );
  const { schema } = await buildWorldBaseSchemaReference({ root: projectRoot });
  const schemaByTable = new Map(schema.tables.map((table) => [table.name, table]));
  const entries = [];

  for (const dataset of manifest.datasets) {
    const table = requiredTable(schemaByTable, dataset.table);
    const rows = JSON.parse(
      await readFile(resolve(projectRoot, CANDIDATE_ROOT, dataset.path), 'utf8')
    );
    const selectedColumns = new Set(
      rows.flatMap((row) => Object.keys(row))
    );
    const unknownColumns = [...selectedColumns]
      .filter((column) => !table.columns.some(({ name }) => name === column));
    if (unknownColumns.length > 0) {
      throw new Error(
        `${dataset.table} has columns absent from DDL: ${unknownColumns.join(', ')}`
      );
    }
    entries.push(buildEntry({
      table,
      canonicalColumns: table.columns.filter(({ name }) => selectedColumns.has(name)),
      dependencyOrder: dataset.dependency_order,
      operationDomain: 'catalog_membership'
    }));
  }

  const graphNodes = requiredTable(schemaByTable, 'graph_nodes');
  entries.push(buildEntry({
    table: graphNodes,
    canonicalColumns: graphNodes.columns.filter(({ name }) => !OPERATIONAL_COLUMNS.has(name)),
    dependencyOrder: manifest.datasets.length,
    operationDomain: 'dependency_assertion'
  }));

  return Object.freeze({
    schema: 'rus.catalog_record_registry.v1',
    catalog_scope: 'item_container_materialization_v2',
    entries
  });
}

export async function writeItemContainerRecordRegistry({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const registry = await buildItemContainerRecordRegistry({ root: projectRoot });
  const target = resolve(projectRoot, OUTPUT);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, render(registry), 'utf8');
  const adapterTarget = resolve(projectRoot, ADAPTER_OUTPUT);
  await mkdir(dirname(adapterTarget), { recursive: true });
  await writeFile(adapterTarget, renderAdapters(registry), 'utf8');
  return Object.freeze({ path: OUTPUT, adapter_path: ADAPTER_OUTPUT, table_count: registry.entries.length });
}

export async function checkItemContainerRecordRegistry({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const expected = render(await buildItemContainerRecordRegistry({ root: projectRoot }));
  const actual = await readFile(resolve(projectRoot, OUTPUT), 'utf8').catch(() => null);
  if (actual !== expected) {
    throw new Error(`${OUTPUT} is missing or stale; run npm run runtime-catalog:registry`);
  }
  const expectedAdapters = renderAdapters(JSON.parse(expected));
  const actualAdapters = await readFile(resolve(projectRoot, ADAPTER_OUTPUT), 'utf8').catch(() => null);
  if (actualAdapters !== expectedAdapters) {
    throw new Error(`${ADAPTER_OUTPUT} is missing or stale; run npm run runtime-catalog:registry`);
  }
  return Object.freeze({
    path: OUTPUT,
    table_count: JSON.parse(expected).entries.length
  });
}

function buildEntry({
  table,
  canonicalColumns,
  dependencyOrder,
  operationDomain
}) {
  const primaryKeyFields = table.columns
    .filter(({ primary_key: primaryKey }) => primaryKey)
    .map(({ name }) => name);
  if (primaryKeyFields.length === 0) {
    throw new Error(`${table.name} has no registered primary key.`);
  }
  const canonicalNames = canonicalColumns.map(({ name }) => name);
  if (primaryKeyFields.some((field) => !canonicalNames.includes(field))) {
    throw new Error(`${table.name} canonical columns omit a primary key field.`);
  }
  const columnNormalizers = Object.fromEntries(
    canonicalColumns.map(({ name, type }) => {
      const normalizer = NORMALIZER_BY_SQL_TYPE[type.toUpperCase()];
      if (!normalizer) throw new Error(`${table.name}.${name} has unsupported SQL type ${type}.`);
      return [name, normalizer];
    })
  );
  const adapterBase = table.name.replaceAll('_', '-');
  return Object.freeze({
    table_name: table.name,
    operation_domain: operationDomain,
    primary_key_fields: primaryKeyFields,
    canonical_columns: canonicalNames,
    excluded_operational_columns: table.columns
      .map(({ name }) => name)
      .filter((name) => OPERATIONAL_COLUMNS.has(name)),
    column_normalizers: columnNormalizers,
    canonical_row_schema_version: 'rus.catalog_record_projection.v2',
    dependency_order: dependencyOrder,
    reader_adapter_id: `${adapterBase}-reader-v1`,
    writer_adapter_id: operationDomain === 'dependency_assertion'
      ? `${adapterBase}-assertion-v1`
      : `${adapterBase}-writer-v1`
  });
}

function requiredTable(byName, tableName) {
  const table = byName.get(tableName);
  if (!table) throw new Error(`${tableName} is absent from world_base DDL.`);
  return table;
}

function render(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderAdapters(registry) {
  const entries = registry.entries.map((entry) => {
    const columns = entry.canonical_columns;
    const keys = entry.primary_key_fields;
    const quotedColumns = columns.map(quoteIdentifier).join(', ');
    const keyWhere = keys.map((column, index) =>
      `${quoteIdentifier(column)} = $${index + 1}`).join(' AND ');
    const insertValues = columns.map((_, index) => `$${index + 1}`).join(', ');
    const adapter = {
      table_name: entry.table_name,
      reader_adapter_id: entry.reader_adapter_id,
      writer_adapter_id: entry.writer_adapter_id,
      primary_key_fields: keys,
      canonical_columns: columns,
      select_all_sql:
        `SELECT ${quotedColumns} FROM world_base.${quoteIdentifier(entry.table_name)} ORDER BY ${keys.map(quoteIdentifier).join(', ')}`,
      select_by_key_sql:
        `SELECT ${quotedColumns} FROM world_base.${quoteIdentifier(entry.table_name)} WHERE ${keyWhere}`,
      insert_sql: entry.operation_domain === 'catalog_membership'
        ? `INSERT INTO world_base.${quoteIdentifier(entry.table_name)} (${quotedColumns}) VALUES (${insertValues})`
        : null
    };
    return `  ${JSON.stringify(entry.table_name)}: Object.freeze(${JSON.stringify(adapter)})`;
  });
  return `// Generated by scripts/generate-item-container-record-registry.mjs. Do not edit.\n`
    + `export const RECORD_ADAPTERS = Object.freeze({\n${entries.join(',\n')}\n});\n`;
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error(`Unsafe generated SQL identifier: ${value}`);
  return `"${value}"`;
}

const isCli = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const command = process.argv[2] ?? '--check';
  const action = command === '--write'
    ? writeItemContainerRecordRegistry
    : command === '--check'
      ? checkItemContainerRecordRegistry
      : null;
  if (!action) {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exitCode = 2;
  } else {
    action({ root: process.cwd() })
      .then((result) => process.stdout.write(
        `item/container record registry: OK (${result.table_count} tables)\n`
      ))
      .catch((error) => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
      });
  }
}
