import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('legacy data manifest declares every staging world-catalog file', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'data/LEGACY_RUNTIME_DATA.json'), 'utf8'));
  const declared = new Set(manifest.paths);
  for (const path of await walk(join(root, 'data/world-catalogs'))) {
    assert.ok(declared.has(relative(root, path).replaceAll('\\', '/')), path);
  }
});

test('FILES.sha256 matches workflow, schemas and world-catalog staging files', async () => {
  const lines = (await readFile(join(root, 'FILES.sha256'), 'utf8')).trim().split(/\r?\n/u);
  const declared = new Map(lines.map((line) => { const [hash, path] = line.split(/\s{2}/u); return [path.replace(/^\.\//u, ''), hash]; }));
  for (const base of ['tools/world-catalog-workflow', 'schemas/world-catalogs', 'data/world-catalogs/novgorod']) {
    for (const path of await walk(join(root, base))) {
      const rel = relative(root, path).replaceAll('\\', '/');
      assert.equal(declared.get(rel), sha256(await readFile(path)), rel);
    }
  }
});

async function walk(dir) {
  const result = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
