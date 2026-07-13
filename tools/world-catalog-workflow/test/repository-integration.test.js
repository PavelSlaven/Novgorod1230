import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDocumentationTree as validateBaseDocumentationTree } from '../../docs-tools/src/documentation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('root package, lock and generated module index register the workflow tool', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const index = JSON.parse(await readFile(join(root, 'generated/module-index.json'), 'utf8'));
  assert.equal(pkg.scripts['test:world-catalog'], 'node --test tools/world-catalog-workflow/test/*.test.js');
  assert.equal(lock.packages['tools/world-catalog-workflow'].name, '@rus/world-catalog-workflow');
  assert.equal(lock.packages['node_modules/@rus/world-catalog-workflow'].link, true);
  assert.ok(index.tools.some((item) => item.name === '@rus/world-catalog-workflow'));
});

test('schema reference declares all world-catalog schemas', async () => {
  const reference = JSON.parse(await readFile(join(root, 'generated/schema-reference.json'), 'utf8'));
  const declared = new Set(reference.external_schemas.map((item) => item.path));
  for (const name of await readdir(join(root, 'schemas/world-catalogs'))) {
    if (name.endsWith('.json')) assert.ok(declared.has(`schemas/world-catalogs/${name}`), name);
  }
});

test('active world catalogs are governed by their source registry, not the legacy runtime manifest', async () => {
  const legacy = JSON.parse(await readFile(join(root, 'data/LEGACY_RUNTIME_DATA.json'), 'utf8'));
  assert.equal(legacy.paths.some((path) => path.startsWith('data/world-catalogs/')), false);

  const registry = JSON.parse(await readFile(join(root, 'data/world-catalogs/novgorod/source-registry.json'), 'utf8'));
  assert.equal(registry.schema_version, 'rus.world_catalog_source_registry.v1');
  assert.equal(registry.region_id, 'region_novgorod_land');
  assert.ok(Array.isArray(registry.sources) && registry.sources.length > 0);
  assert.ok(registry.sources.every((source) => source.schema_version === 'rus.world_catalog_source.v1'));
  assert.ok(registry.sources.every((source) => /^[a-f0-9]{64}$/u.test(source.source_manifest_digest)));
});

test('base documentation validator does not classify active world catalogs as legacy runtime data', async () => {
  const validation = await validateBaseDocumentationTree(root);
  const falsePositives = validation.errors.filter((error) => String(error).startsWith('data/world-catalogs/')
    && String(error).endsWith(': legacy runtime data is not declared in manifest'));
  assert.deepEqual(falsePositives, []);
});

test('workflow, schemas and world-catalog files produce a stable deterministic checksum set', async () => {
  const first = await checksumSet();
  const second = await checksumSet();
  assert.deepEqual(first, second);
  assert.ok(first.length > 0);
  assert.equal(new Set(first.map((item) => item.path)).size, first.length);
  assert.ok(first.every((item) => /^[a-f0-9]{64}$/u.test(item.sha256)));
});

async function checksumSet() {
  const result = [];
  for (const base of ['tools/world-catalog-workflow', 'schemas/world-catalogs', 'data/world-catalogs/novgorod']) {
    for (const path of await walk(join(root, base))) {
      result.push({
        path: relative(root, path).replaceAll('\\', '/'),
        sha256: sha256(await readFile(path))
      });
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function walk(dir) {
  const result = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
