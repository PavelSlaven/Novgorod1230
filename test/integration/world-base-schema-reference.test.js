import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import {
  buildWorldBaseSchemaReference,
  resolveApprovedDescription
} from '../../scripts/generate-world-base-schema-reference.mjs';
import { inspectWorldBaseSchema } from '../../scripts/check-world-base-schema.mjs';

const root = process.cwd();

async function expandedDdlDigest() {
  const entryPath = resolve(root, 'infra/world-base/schema.sql');
  const entry = await readFile(entryPath, 'utf8');
  const parts = [...entry.matchAll(/^\\ir\s+(.+)$/gmu)].map((match) => match[1].trim());
  const ddl = (await Promise.all(parts.map((part) => readFile(resolve(dirname(entryPath), part), 'utf8')))).join('\n');
  return createHash('sha256').update(ddl).digest('hex');
}

test('world_base schema reference contains all and only current DDL tables', async () => {
  const result = await buildWorldBaseSchemaReference({ root });
  const inspection = await inspectWorldBaseSchema({ root });
  const expectedNames = [...inspection.table_names].sort();
  const actualNames = result.schema.tables.map((table) => table.name).sort();
  const renderedNames = [...result.markdown.matchAll(/^### `world_base\.([a-z_][a-z0-9_]*)`$/gmu)].map((match) => match[1]).sort();

  assert.equal(result.schema.table_count, 186);
  assert.deepEqual(actualNames, expectedNames);
  assert.deepEqual(renderedNames, expectedNames);
  assert.equal(result.schema.ddl_sha256, await expandedDdlDigest());
  assert.match(result.markdown, /^<!-- GENERATED FILE\./u);
  assert.ok(result.schema.tables.every((table) => table.columns.length > 0));
});

test('schema reference uses approved descriptions only and marks missing descriptions explicitly', async () => {
  const result = await buildWorldBaseSchemaReference({ root });
  const missingDescriptions = result.schema.tables.flatMap((table) => table.columns.filter((column) => column.description === null));

  assert.ok(missingDescriptions.length > 0);
  assert.match(result.markdown, /Описание отсутствует\./u);
  assert.equal(resolveApprovedDescription({ common: {}, fields: {} }, 'invented_table', 'invented_column'), null);
});

test('world_base schema reference is byte-stable and matches the committed output', async () => {
  const first = await buildWorldBaseSchemaReference({ root });
  const second = await buildWorldBaseSchemaReference({ root });
  const committed = await readFile(resolve(root, 'infra/world-base/SCHEMA_REFERENCE.md'), 'utf8');

  assert.equal(second.markdown, first.markdown);
  assert.equal(committed, first.markdown);
});
