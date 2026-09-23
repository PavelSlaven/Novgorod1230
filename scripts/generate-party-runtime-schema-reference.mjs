import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPATIAL_V3_TARGET_MIGRATION_FILES } from '../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const OUTPUT = 'infra/party-db/SCHEMA_REFERENCE.md';
const SOURCE = 'schemas/party-db';
const TABLE = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?party_runtime\.([a-z_][a-z0-9_]*)\s*\(/giu;
const ALTER = /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?party_runtime\.([a-z_][a-z0-9_]*)\b/giu;
const INDEX = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-z_][a-z0-9_]*\s+ON\s+party_runtime\.([a-z_][a-z0-9_]*)\b/giu;

export async function buildPartyRuntimeSchemaReference({ root = '.' } = {}) {
  const projectRoot = resolve(root);
  const tables = new Map();
  const migrations = [];
  for (const file of SPATIAL_V3_TARGET_MIGRATION_FILES) {
    const ddl = await readFile(resolve(projectRoot, SOURCE, file), 'utf8');
    migrations.push({ file, ddl });
    const changes = [
      ...[...ddl.matchAll(TABLE)].map((match) => ({ match, kind: 'CREATE TABLE' })),
      ...[...ddl.matchAll(ALTER)].map((match) => ({ match, kind: 'ALTER TABLE' })),
      ...[...ddl.matchAll(INDEX)].map((match) => ({ match, kind: 'CREATE INDEX' }))
    ].sort((left, right) => left.match.index - right.match.index);
    for (const { match, kind } of changes) {
      if (ddl[match.index - 1] === "'") continue; // Dynamic SQL is shown in its source migration.
      if (kind === 'CREATE TABLE') {
        if (tables.has(match[1])) throw new Error(`Duplicate CREATE TABLE party_runtime.${match[1]}`);
        tables.set(match[1], []);
      }
      const statements = tables.get(match[1]);
      if (!statements) throw new Error(`DDL references unknown party_runtime.${match[1]} in ${file}`);
      statements.push({ file, sql: statementAt(ddl, match.index, file) });
    }
  }
  const lines = [
    '<!-- GENERATED FILE. Sources: schemas/party-db/001–033, ordered by the game-server migration manifest. Run `npm run docs:generate`; do not edit manually. -->',
    '# Справочник схемы `party_runtime`',
    '',
    `- Исполняемый источник: ${SPATIAL_V3_TARGET_MIGRATION_FILES.length} упорядоченных SQL-миграций в \`${SOURCE}/\`.`,
    `- Таблиц: ${tables.size}.`,
    '- Для каждой таблицы приведены SQL-определения `CREATE TABLE`, `ALTER TABLE` и `CREATE INDEX` в порядке миграций. Полный SQL всех миграций, включая `DROP`, триггеры и условные блоки, приведён ниже. Исполняемые файлы остаются источником истины.',
    '',
    '## Порядок миграций',
    '',
    ...SPATIAL_V3_TARGET_MIGRATION_FILES.map((file) => `- [\`${file}\`](../../${SOURCE}/${file})`),
    ''
  ];
  for (const [name, statements] of [...tables].sort(([left], [right]) => left.localeCompare(right, 'en'))) {
    const link = (file) => `[\`${file}\`](../../${SOURCE}/${file})`;
    lines.push(`## \`party_runtime.${name}\``, '');
    for (const { file, sql } of statements) lines.push(`Источник: ${link(file)}`, '', '```sql', sql, '```', '');
  }
  lines.push('## Полный SQL миграций', '');
  for (const { file, ddl } of migrations) {
    lines.push(`### [\`${file}\`](../../${SOURCE}/${file})`, '', '```sql', ddl.trimEnd(), '```', '');
  }
  return Object.freeze({ table_count: tables.size, migration_count: SPATIAL_V3_TARGET_MIGRATION_FILES.length, markdown: `${lines.join('\n').trimEnd()}\n` });
}

function statementAt(ddl, start, file) {
  let quote = null;
  for (let index = start; index < ddl.length; index += 1) {
    const char = ddl[index];
    if (quote) {
      if (char === quote && ddl[index + 1] === quote) index += 1;
      else if (char === quote) quote = null;
    } else if (char === "'" || char === '"') quote = char;
    else if (char === ';') return ddl.slice(start, index + 1).trim();
  }
  throw new Error(`Unterminated SQL statement in ${file} at offset ${start}`);
}

export async function writePartyRuntimeSchemaReference({ root = '.' } = {}) {
  const result = await buildPartyRuntimeSchemaReference({ root });
  await writeFile(resolve(root, OUTPUT), result.markdown, 'utf8');
  return Object.freeze({ path: OUTPUT, table_count: result.table_count });
}

export async function checkPartyRuntimeSchemaReference({ root = '.' } = {}) {
  const result = await buildPartyRuntimeSchemaReference({ root });
  const committed = await readFile(resolve(root, OUTPUT), 'utf8').catch(() => null);
  if (committed !== result.markdown) throw new Error(`${OUTPUT} is missing or stale; run npm run docs:generate`);
  return Object.freeze({ path: OUTPUT, table_count: result.table_count });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const action = process.argv[2] === '--write' ? writePartyRuntimeSchemaReference : process.argv[2] === '--check' ? checkPartyRuntimeSchemaReference : null;
  if (!action) {
    process.stderr.write('Expected --write or --check\n');
    process.exitCode = 2;
  } else {
    action({ root: process.cwd() })
      .then((result) => process.stdout.write(`party_runtime schema reference: OK (${result.table_count} tables)\n`))
      .catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
  }
}
