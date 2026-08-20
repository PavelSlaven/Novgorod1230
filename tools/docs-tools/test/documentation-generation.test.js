import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDocumentationOutputs,
  checkDocumentationOutputs,
  validateDocumentationTree
} from '../src/index.js';
import { buildWorldBaseSchemaReference } from '../../../scripts/generate-world-base-schema-reference.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('documentation outputs are deterministic', async () => {
  const first = await buildDocumentationOutputs(root);
  const second = await buildDocumentationOutputs(root);
  assert.deepEqual([...first.entries()], [...second.entries()]);
});

test('agent instruction links resolve to repository files', async () => {
  for (const relativePath of ['AGENTS.md', '.github/README.md', '.github/copilot-instructions.md']) {
    const absolutePath = join(root, relativePath);
    const text = await readFile(absolutePath, 'utf8');
    const targets = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)].map((match) => match[1]);
    assert.ok(targets.length > 0, `${relativePath} must contain repository links`);
    for (const target of targets) {
      if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) continue;
      const resolvedTarget = resolve(dirname(absolutePath), target.split('#')[0]);
      assert.equal((await stat(resolvedTarget)).isFile(), true, `${relativePath}: missing ${target}`);
    }
  }
  await assert.rejects(stat(join(root, '.github/AGENTS.md')));
  await assert.rejects(stat(join(root, '.codex/skills/README.md')));
  await assert.rejects(stat(join(root, '.codex/skills/graphify/SKILL.md')));
  await assert.rejects(stat(join(root, '.agents/skills/graphify/SKILL.md')));

  const readme = await readFile(join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /\.github\/AGENTS\.md/u);
  assert.doesNotMatch(readme, /Правила автоматического применения/u);
});

test('canonical documentation preserves active guidance without obsolete workflow gates', async () => {
  const agents = await readFile(join(root, 'AGENTS.md'), 'utf8');

  assert.doesNotMatch(agents, /Перед любой задачей полностью прочитай/u);
  assert.doesNotMatch(agents, /Перед grep, file search, GitHub code search/u);
  assert.doesNotMatch(agents, /PR №13/u);

  const developmentRules = await readFile(join(root, 'data/knowledge-source/corpus/DOCUMENTS/development_rules.txt'), 'utf8');
  assert.match(developmentRules, /Эти правила реализуют active-архитектуру materialization v2 и проверяются единым release gate/u);
  assert.doesNotMatch(developmentRules, /До повышения `code_driven_world_materialization_architecture\.md` в active/u);

  const navigation = await readFile(join(root, 'data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md'), 'utf8');
  assert.match(navigation, /Актуализировано: 2026-08-03/u);
  assert.match(navigation, /## 1\. Приоритет источников\s+1\. `code_driven_world_materialization_architecture\.md`[\s\S]*2\. Профильный норматив[\s\S]*3\. `development_rules\.txt`[\s\S]*4\. DDL, схемы и формальные контракты/u);
  assert.doesNotMatch(navigation, /Профильный документ по конкретной системе имеет высший приоритет/u);
});

test('committed documentation and generated data are reproducible', async () => {
  const result = await checkDocumentationOutputs(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.checked_files, [
    'MODULE_INDEX.md',
    'generated/generated-manifest.json',
    'generated/module-index.json',
    'generated/schema-reference.json',
    'generated/schema-reference.md'
  ]);
});

test('MODULE_INDEX lists every production package exactly once', async () => {
  const index = JSON.parse(await readFile(join(root, 'generated/module-index.json'), 'utf8'));
  const packageDirs = (await readdir(join(root, 'packages'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`)
    .sort();
  assert.deepEqual(index.modules.map((item) => item.path).sort(), packageDirs);
  assert.equal(new Set(index.modules.map((item) => item.name)).size, index.modules.length);
  assert.ok(index.modules.every((item) => item.owns.length > 0));
});

test('schema reference binds contract names and external DDL', async () => {
  const reference = JSON.parse(await readFile(join(root, 'generated/schema-reference.json'), 'utf8'));
  assert.equal(reference.schema_version, 'rus.generated_schema_reference.v1');
  assert.ok(reference.contract_schemas.some((item) => item.schema === 'weather_state'));
  const ddl = reference.external_schemas.find((item) => item.path === 'schemas/party-db/001_party_runtime.sql');
  assert.ok(ddl);
  assert.match(ddl.sha256, /^[a-f0-9]{64}$/u);
  assert.ok(ddl.bytes > 0);
});

test('world-base schema reference expands every column in multi-column ALTER TABLE', async () => {
  const { schema } = await buildWorldBaseSchemaReference({ root });
  const byTable = new Map(schema.tables.map((table) => [table.name, table]));
  const expectedAddedColumns = {
    item_templates: ['category_id', 'world_revision_id', 'source_id'],
    g5_anchor_templates: ['valid_from', 'valid_to', 'confidence'],
    materialization_slot_rules: ['valid_from', 'valid_to', 'applicability', 'confidence']
  };
  for (const [tableName, columnNames] of Object.entries(expectedAddedColumns)) {
    const actual = new Map(byTable.get(tableName).columns.map((column) => [column.name, column.type]));
    for (const columnName of columnNames) {
      assert.equal(actual.has(columnName), true, `${tableName}.${columnName}`);
      assert.doesNotMatch(actual.get(columnName), /\bADD\s+COLUMN\b/iu);
    }
  }
});

test('canonical document registry has unique existing targets and no obsolete root copies', async () => {
  const registry = JSON.parse(await readFile(join(root, 'docs/migration/CANONICAL_PATHS.json'), 'utf8'));
  const targets = registry.documents.map((item) => item.canonical_path);
  assert.equal(new Set(targets).size, targets.length);
  for (const item of registry.documents) {
    assert.equal((await stat(join(root, item.canonical_path))).isFile(), true);
    for (const previous of item.previous_paths) {
      if (previous === item.canonical_path) continue;
      await assert.rejects(stat(join(root, previous)));
    }
  }
});
