import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_TABLE_COUNT = 117;
const ENTRYPOINT = 'infra/world-base/schema.sql';

export async function inspectWorldBaseSchema({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const entryPath = join(projectRoot, ENTRYPOINT);
  const entryText = await readFile(entryPath, 'utf8');
  const partFiles = [...entryText.matchAll(/^\\ir\s+(.+)$/gmu)].map((match) => match[1].trim());
  if (partFiles.length === 0) throw new Error('world_base schema entrypoint has no \\ir parts.');

  const texts = [];
  for (const part of partFiles) {
    if (part.startsWith('/') || part.includes('..')) throw new Error(`Unsafe world_base schema part: ${part}`);
    const partPath = resolve(dirname(entryPath), part);
    const relativePartPath = relative(dirname(entryPath), partPath);
    if (relativePartPath === '..' || relativePartPath.startsWith(`..${sep}`) || isAbsolute(relativePartPath)) {
      throw new Error(`Schema part escapes infra/world-base: ${part}`);
    }
    texts.push(await readFile(partPath, 'utf8'));
  }

  const ddl = [entryText, ...texts].join('\n');
  const tableNames = [...ddl.matchAll(/CREATE\s+TABLE\s+world_base\.([a-z_][a-z0-9_]*)/giu)].map((match) => match[1]);
  const seen = new Set();
  const duplicates = new Set();
  for (const name of tableNames) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }

  return Object.freeze({
    schema: 'world_base',
    entrypoint: ENTRYPOINT,
    part_files: Object.freeze(partFiles.map((part) => relative(projectRoot, resolve(dirname(entryPath), part)).replaceAll('\\', '/'))),
    table_count: tableNames.length,
    table_names: Object.freeze([...tableNames]),
    duplicate_table_names: Object.freeze([...duplicates].sort()),
    has_world_reader_role: /CREATE\s+ROLE\s+world_reader/iu.test(ddl),
    revokes_public_create: /REVOKE\s+CREATE\s+ON\s+SCHEMA\s+world_base\s+FROM\s+PUBLIC/iu.test(ddl),
    grants_world_reader_usage: /GRANT\s+USAGE\s+ON\s+SCHEMA\s+world_base\s+TO\s+world_reader/iu.test(ddl),
    grants_world_reader_select: /GRANT\s+SELECT\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+world_base\s+TO\s+world_reader/iu.test(ddl),
    grants_default_world_reader_select: /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+world_base\s+GRANT\s+SELECT\s+ON\s+TABLES\s+TO\s+world_reader/iu.test(ddl),
    grants_world_reader_write: /GRANT\s+(?:ALL(?:\s+PRIVILEGES)?|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b[^;]*\bTO\s+world_reader/iu.test(ddl)
  });
}

export async function checkWorldBaseSchema(options) {
  const result = await inspectWorldBaseSchema(options);
  const errors = [];
  if (result.table_count !== EXPECTED_TABLE_COUNT) errors.push(`expected ${EXPECTED_TABLE_COUNT} tables, found ${result.table_count}`);
  if (result.duplicate_table_names.length) errors.push(`duplicate tables: ${result.duplicate_table_names.join(', ')}`);
  if (!result.has_world_reader_role) errors.push('world_reader role is missing');
  if (!result.revokes_public_create) errors.push('PUBLIC CREATE revoke is missing');
  if (!result.grants_world_reader_usage) errors.push('world_reader schema USAGE grant is missing');
  if (!result.grants_world_reader_select) errors.push('world_reader SELECT grant is missing');
  if (!result.grants_default_world_reader_select) errors.push('world_reader default SELECT grant is missing');
  if (result.grants_world_reader_write) errors.push('world_reader has a write grant in canonical DDL');
  if (errors.length) throw new Error(`world_base schema check failed:\n- ${errors.join('\n- ')}`);
  return result;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  checkWorldBaseSchema({ root: process.cwd() })
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
