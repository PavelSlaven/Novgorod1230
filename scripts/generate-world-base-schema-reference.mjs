import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TABLE_GROUPS,
  TABLE_PURPOSE_FALLBACK,
  common,
  fields
} from '../infra/world-base/field-descriptions.js';

const ENTRYPOINT = 'infra/world-base/schema.sql';
const OUTPUT = 'infra/world-base/SCHEMA_REFERENCE.md';
const GENERATED_HEADER = '<!-- GENERATED FILE. Sources: infra/world-base/schema.sql, infra/world-base/schema/*.sql and infra/world-base/field-descriptions.js. Run `npm run world-db:schema-doc`; do not edit manually. -->';

export async function buildWorldBaseSchemaReference({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const source = await readExpandedDdl(projectRoot);
  const tables = parseWorldBaseTables(source.ddl);
  applyAddedColumns(tables, source.ddl);
  applyUniqueIndexes(tables, source.ddl);
  const glossary = { common, fields };
  for (const table of tables) {
    table.purpose = approvedTablePurpose(table.name);
    for (const column of table.columns) {
      column.description = resolveApprovedDescription(glossary, table.name, column.name);
    }
  }
  const schema = {
    schema_name: 'world_base',
    entrypoint: ENTRYPOINT,
    part_files: source.partFiles,
    ddl_sha256: sha256(source.ddl),
    table_count: tables.length,
    tables
  };
  return Object.freeze({ schema, markdown: renderReference(schema) });
}

export async function writeWorldBaseSchemaReference({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const result = await buildWorldBaseSchemaReference({ root: projectRoot });
  await writeFile(resolve(projectRoot, OUTPUT), result.markdown, 'utf8');
  return Object.freeze({ path: OUTPUT, table_count: result.schema.table_count, ddl_sha256: result.schema.ddl_sha256 });
}

export async function checkWorldBaseSchemaReference({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const result = await buildWorldBaseSchemaReference({ root: projectRoot });
  const committed = await readFile(resolve(projectRoot, OUTPUT), 'utf8').catch(() => null);
  if (committed !== result.markdown) {
    throw new Error(`${OUTPUT} is missing or stale; run npm run world-db:schema-doc`);
  }
  return Object.freeze({ path: OUTPUT, table_count: result.schema.table_count, ddl_sha256: result.schema.ddl_sha256 });
}

export function resolveApprovedDescription(glossary, tableName, columnName) {
  const tableDescription = glossary?.fields?.[tableName]?.[columnName];
  if (typeof tableDescription === 'string' && tableDescription.trim()) return tableDescription.trim();
  const commonDescription = glossary?.common?.[columnName];
  if (typeof commonDescription === 'string' && commonDescription.trim()) return commonDescription.trim();
  return null;
}

async function readExpandedDdl(projectRoot) {
  const entryPath = resolve(projectRoot, ENTRYPOINT);
  const entry = await readFile(entryPath, 'utf8');
  const includes = [...entry.matchAll(/^\\ir\s+(.+)$/gmu)].map((match) => match[1].trim());
  if (includes.length === 0) throw new Error(`${ENTRYPOINT} has no DDL parts`);
  const partPaths = includes.map((part) => resolve(dirname(entryPath), part));
  const partFiles = partPaths.map((path) => relative(projectRoot, path).replaceAll('\\', '/'));
  const ddl = (await Promise.all(partPaths.map((path) => readFile(path, 'utf8')))).join('\n');
  return { ddl, partFiles };
}

function parseWorldBaseTables(ddl) {
  const tables = [];
  const pattern = /CREATE\s+TABLE\s+world_base\.([a-z_][a-z0-9_]*)\s*\(/giu;
  for (const match of ddl.matchAll(pattern)) {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = findMatchingParenthesis(ddl, bodyStart - 1);
    if (bodyEnd < 0) throw new Error(`Unclosed CREATE TABLE world_base.${match[1]}`);
    const items = splitTopLevel(ddl.slice(bodyStart, bodyEnd));
    const columns = [];
    const constraints = [];
    for (const item of items) {
      if (isTableConstraint(item)) constraints.push(normalizeSql(item));
      else columns.push(parseColumn(item, match[1]));
    }
    tables.push({ name: match[1], purpose: null, columns, constraints });
  }
  const names = new Set();
  for (const table of tables) {
    if (names.has(table.name)) throw new Error(`Duplicate CREATE TABLE world_base.${table.name}`);
    names.add(table.name);
  }
  return tables;
}

function applyAddedColumns(tables, ddl) {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const pattern = /ALTER\s+TABLE\s+world_base\.([a-z_][a-z0-9_]*)\s+ADD\s+COLUMN\s+([\s\S]*?);/giu;
  for (const match of ddl.matchAll(pattern)) {
    const table = byName.get(match[1]);
    if (!table) throw new Error(`ALTER TABLE references unknown world_base.${match[1]}`);
    const column = parseColumn(match[2], match[1]);
    if (table.columns.some((item) => item.name === column.name)) throw new Error(`Duplicate column world_base.${match[1]}.${column.name}`);
    table.columns.push(column);
  }
}

function applyUniqueIndexes(tables, ddl) {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const pattern = /CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s+ON\s+world_base\.([a-z_][a-z0-9_]*)\s*([\s\S]*?);/giu;
  for (const match of ddl.matchAll(pattern)) {
    const table = byName.get(match[2]);
    if (!table) throw new Error(`UNIQUE INDEX references unknown world_base.${match[2]}`);
    table.constraints.push(normalizeSql(`UNIQUE INDEX ${match[1]} ${match[3]}`));
  }
}

function parseColumn(item, tableName) {
  const normalized = normalizeSql(item);
  const match = /^([a-z_][a-z0-9_]*)\s+([\s\S]+)$/iu.exec(normalized);
  if (!match) throw new Error(`Cannot parse column in world_base.${tableName}: ${normalized}`);
  const name = match[1];
  const definition = match[2];
  const keyword = /\s+(?=(?:NOT\s+NULL|NULL\b|DEFAULT\b|PRIMARY\s+KEY|UNIQUE\b|REFERENCES\b|CHECK\s*\())/iu.exec(definition);
  const type = (keyword ? definition.slice(0, keyword.index) : definition).trim();
  if (!type) throw new Error(`Column type is missing for world_base.${tableName}.${name}`);
  const referenceMatch = /\bREFERENCES\s+world_base\.([a-z_][a-z0-9_]*)\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+(CASCADE|RESTRICT|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION))?/iu.exec(definition);
  const defaultMatch = /\bDEFAULT\s+(.+?)(?=\s+(?:NOT\s+NULL|PRIMARY\s+KEY|UNIQUE\b|REFERENCES\b|CHECK\s*\()|$)/iu.exec(definition);
  const primaryKey = /\bPRIMARY\s+KEY\b/iu.test(definition);
  return {
    name,
    type,
    nullable: !primaryKey && !/\bNOT\s+NULL\b/iu.test(definition),
    default: defaultMatch?.[1]?.trim() ?? null,
    primary_key: primaryKey,
    unique: /\bUNIQUE\b/iu.test(definition),
    references: referenceMatch ? {
      table: referenceMatch[1],
      columns: referenceMatch[2].split(',').map((value) => value.trim()),
      on_delete: referenceMatch[3]?.replace(/\s+/gu, ' ').toUpperCase() ?? null
    } : null,
    checks: extractCheckClauses(definition),
    definition,
    description: null
  };
}

function extractCheckClauses(definition) {
  const result = [];
  const pattern = /\bCHECK\s*\(/giu;
  for (const match of definition.matchAll(pattern)) {
    const open = match.index + match[0].lastIndexOf('(');
    const end = findMatchingParenthesis(definition, open);
    if (end < 0) throw new Error(`Unclosed CHECK clause: ${definition}`);
    result.push(normalizeSql(definition.slice(match.index, end + 1)));
  }
  return result;
}

function splitTopLevel(body) {
  const result = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (char === quote && body[index + 1] === quote) index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      result.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  const last = body.slice(start).trim();
  if (last) result.push(last);
  return result;
}

function findMatchingParenthesis(text, openIndex) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index + 1] === quote) index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '(') depth += 1;
    else if (char === ')' && --depth === 0) return index;
  }
  return -1;
}

function isTableConstraint(item) {
  return /^(?:CONSTRAINT\b|PRIMARY\s+KEY\b|FOREIGN\s+KEY\b|UNIQUE\s*\(|CHECK\s*\()/iu.test(item.trim());
}

function approvedTablePurpose(tableName) {
  const value = TABLE_PURPOSE_FALLBACK[tableName];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function renderReference(schema) {
  const lines = [
    GENERATED_HEADER,
    '# Справочник схемы `world_base`',
    '',
    `- Исполняемый источник: \`${schema.entrypoint}\` и ${schema.part_files.length} упорядоченных SQL-частей.`,
    `- SHA-256 развёрнутого DDL: \`${schema.ddl_sha256}\`.`,
    `- Таблиц: ${schema.table_count}.`,
    '- Описания берутся только из утверждённого `infra/world-base/field-descriptions.js`; отсутствие описания не заполняется эвристикой.',
    ''
  ];
  const byName = new Map(schema.tables.map((table) => [table.name, table]));
  const rendered = new Set();
  for (const group of TABLE_GROUPS) {
    const groupTables = group.tables.map((name) => byName.get(name)).filter(Boolean);
    if (groupTables.length === 0) continue;
    lines.push(`## ${group.title}`, '');
    for (const table of groupTables) {
      renderTable(lines, table);
      rendered.add(table.name);
    }
  }
  const ungrouped = schema.tables.filter((table) => !rendered.has(table.name));
  if (ungrouped.length) {
    lines.push('## Без утверждённой группы', '');
    for (const table of ungrouped) renderTable(lines, table);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderTable(lines, table) {
  lines.push(
    `### \`world_base.${table.name}\``,
    '',
    table.purpose ?? 'Описание назначения отсутствует.',
    '',
    '| Поле | Тип | NULL | Default | FK | Constraints | Описание |',
    '|---|---|---:|---|---|---|---|'
  );
  for (const column of table.columns) {
    const reference = column.references
      ? `world_base.${column.references.table}(${column.references.columns.join(', ')})${column.references.on_delete ? ` ON DELETE ${column.references.on_delete}` : ''}`
      : '—';
    const constraints = [
      ...(!column.nullable ? ['NOT NULL'] : []),
      ...(column.primary_key ? ['PRIMARY KEY'] : []),
      ...(column.unique ? ['UNIQUE'] : []),
      ...column.checks
    ];
    lines.push(`| \`${escapeCell(column.name)}\` | \`${escapeCell(column.type)}\` | ${column.nullable ? 'да' : 'нет'} | ${column.default ? `\`${escapeCell(column.default)}\`` : '—'} | ${reference === '—' ? reference : `\`${escapeCell(reference)}\``} | ${constraints.length ? constraints.map((value) => `\`${escapeCell(value)}\``).join('<br>') : '—'} | ${escapeCell(column.description ?? 'Описание отсутствует.')} |`);
  }
  lines.push('', '**Ограничения таблицы:**', '');
  if (table.constraints.length) {
    for (const constraint of table.constraints) lines.push(`- \`${escapeCell(constraint)}\``);
  } else {
    lines.push('- Явные табличные constraints отсутствуют.');
  }
  lines.push('');
}

function normalizeSql(value) {
  return String(value).replace(/--.*$/gmu, '').replace(/\s+/gu, ' ').trim();
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\s+/gu, ' ').trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const command = process.argv[2] ?? '--check';
  const action = command === '--write' ? writeWorldBaseSchemaReference : command === '--check' ? checkWorldBaseSchemaReference : null;
  if (!action) {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exitCode = 2;
  } else {
    action({ root: process.cwd() })
      .then((result) => process.stdout.write(`world_base schema reference: OK (${result.table_count} tables; ${result.ddl_sha256})\n`))
      .catch((error) => {
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exitCode = 1;
      });
  }
}
