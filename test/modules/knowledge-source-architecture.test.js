import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}

test('production source has no legacy DOCUMENTS fallback and accesses corpus through knowledge-source', async () => {
  const files = [
    ...await walk(join(root, 'apps')),
    ...await walk(join(root, 'packages'))
  ].filter((file) => ['.js', '.mjs', '.json'].includes(extname(file)));
  const violations = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (/legacy[\\/]DOCUMENTS|DOCUMENTS[\\/]documents-kg/u.test(text)) {
      violations.push(relative(root, file).replaceAll('\\', '/'));
    }
  }
  assert.deepEqual(violations, []);
});
