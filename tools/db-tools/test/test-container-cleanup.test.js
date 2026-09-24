import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../test/', import.meta.url));

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(p));
    else if (/\.(c|m)?js$/.test(e.name)) out.push(p);
  }
  return out;
}

// GS §26: postgres-образ создаёт anonymous volume; `docker rm -f` без `-v` оставляет его навсегда.
test('test containers are removed together with their anonymous volumes', async () => {
  const offenders = [];
  for (const file of await jsFiles(root)) {
    const src = await readFile(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/['"]rm['"]\s*,\s*['"](-f|--force)['"]/.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'use docker rm -fv so anonymous volumes are removed');
});
