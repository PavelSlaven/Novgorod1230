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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('documentation outputs are deterministic', async () => {
  const first = await buildDocumentationOutputs(root);
  const second = await buildDocumentationOutputs(root);
  assert.deepEqual([...first.entries()], [...second.entries()]);
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

test('documentation tree satisfies seed, generated and dated-artifact policies', async () => {
  const result = await validateDocumentationTree(root);
  assert.equal(result.ok, true, result.errors.join('\n'));
});
