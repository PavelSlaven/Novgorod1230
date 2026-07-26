import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildWorldBaseSchemaReference } from
  '../../scripts/generate-world-base-schema-reference.mjs';
import {
  CANDIDATE_ROOT
} from './lower-dvina-boundary-v1-compiler.mjs';
import {
  validateLowerDvinaBoundaryV1
} from './lower-dvina-boundary-v1-validator.mjs';

const identifier = (value) => {
  if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
    throw new Error(`invalid_sql_identifier:${value}`);
  }
  return value;
};

function literal(value, type = '') {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const serialized = typeof value === 'object'
    ? JSON.stringify(value)
    : String(value);
  const quoted = `'${serialized.replaceAll("'", "''")}'`;
  return /\bJSONB?\b/iu.test(type) ? `${quoted}::jsonb` : quoted;
}

function primaryKey(schema) {
  const inline = schema.columns.filter(({ primary_key: key }) => key);
  if (inline.length > 0) return inline;
  const declaration = schema.constraints.find((constraint) =>
    /^PRIMARY KEY\s*\(/iu.test(constraint));
  const names = declaration?.match(/^PRIMARY KEY\s*\(([^)]+)\)/iu)?.[1]
    .split(',').map((name) => name.trim()) ?? [];
  return names.map((name) =>
    schema.columns.find((column) => column.name === name)).filter(Boolean);
}

export async function buildLowerDvinaBoundaryV1ImportSql({
  root = process.cwd(),
  rollback = false
} = {}) {
  const validation = await validateLowerDvinaBoundaryV1(root);
  if (!validation.pass) {
    throw new Error(`boundary_candidate_invalid:${
      validation.errors.map(({ code }) => code).join(',')
    }`);
  }
  const candidateRoot = resolve(root, CANDIDATE_ROOT);
  const manifest = JSON.parse(await readFile(resolve(
    candidateRoot, 'manifest.json'
  )));
  const ddl = await buildWorldBaseSchemaReference({ root });
  const schemas = new Map(ddl.schema.tables.map((table) =>
    [table.name, table]));
  const sql = ['BEGIN;', 'SET CONSTRAINTS ALL DEFERRED;'];
  for (const item of manifest.datasets) {
    const tableName = identifier(item.table);
    const schema = schemas.get(tableName);
    if (!schema) throw new Error(`boundary_import_table_not_in_schema:${tableName}`);
    const keys = primaryKey(schema);
    if (keys.length === 0) {
      throw new Error(`boundary_import_table_without_primary_key:${tableName}`);
    }
    const rows = JSON.parse(await readFile(resolve(candidateRoot, item.file)));
    const managed = schema.columns
      .filter(({ name }) => ['created_at', 'updated_at'].includes(name))
      .map(({ name }) => name);
    const comparable = managed.length > 0
      ? `(to_jsonb(actual) - ARRAY[${
          managed.map((name) => `'${name}'`).join(',')
        }]::text[])`
      : 'to_jsonb(actual)';
    for (const row of rows) {
      const columns = schema.columns.filter(({ name }) =>
        Object.hasOwn(row, name));
      const values = new Map(columns.map((column) => [
        column.name, literal(row[column.name], column.type)
      ]));
      const predicate = keys.map(({ name }) =>
        `actual.${identifier(name)} IS NOT DISTINCT FROM ${values.get(name)}`
      ).join(' AND ');
      const expected = Object.fromEntries(columns
        .filter(({ name }) => !managed.includes(name))
        .map(({ name }) => [name, row[name]]));
      sql.push(
        `INSERT INTO world_base.${tableName} (${
          columns.map(({ name }) => identifier(name)).join(',')
        })`,
        `VALUES (${columns.map(({ name }) => values.get(name)).join(',')})`,
        'ON CONFLICT DO NOTHING;',
        `DO $boundary$ BEGIN IF NOT EXISTS (SELECT 1 FROM world_base.${tableName} actual`,
        `  WHERE ${predicate} AND ${comparable} @> ${
          literal(expected, 'JSONB')
        }) THEN`,
        `  RAISE EXCEPTION 'BOUNDARY_IMPORT_READBACK_MISMATCH:${tableName}';`,
        'END IF; END $boundary$;'
      );
    }
    sql.push(
      `SELECT '${tableName}' AS table_name, count(*) AS row_count`,
      `FROM world_base.${tableName};`
    );
  }
  sql.push('SET CONSTRAINTS ALL IMMEDIATE;', rollback ? 'ROLLBACK;' : 'COMMIT;');
  return `${sql.join('\n')}\n`;
}

async function main() {
  const rootArgument = process.argv.slice(2)
    .find((argument) => !argument.startsWith('--'));
  process.stdout.write(await buildLowerDvinaBoundaryV1ImportSql({
    root: resolve(rootArgument ?? process.cwd()),
    rollback: process.argv.includes('--rollback')
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
