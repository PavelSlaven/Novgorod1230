import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const stageRoot = join(root, 'packages/new-game/src/stages/stage-26-first-game-screen');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(file));
    else out.push(file);
  }
  return out;
}

test('Stage 26 production files stay below 500 lines and 25 KB', async () => {
  for (const file of await walk(stageRoot)) {
    if (!file.endsWith('.js')) continue;
    const source = await readFile(file, 'utf8');
    assert.ok(source.split('\n').length <= 500, `${relative(root, file)} exceeds 500 lines`);
    assert.ok((await stat(file)).size <= 25 * 1024, `${relative(root, file)} exceeds 25 KB`);
  }
});

test('Stage 26 has no forbidden imports', async () => {
  const forbidden = ['legacy/', 'stage21-', 'stage22-', 'stage23-', 'stage24-', 'stage25-', '@rus/presentation', '@rus/party-store', '@rus/world-base', 'provider.js', '/ui/'];
  for (const file of await walk(stageRoot)) {
    if (!file.endsWith('.js')) continue;
    const source = await readFile(file, 'utf8');
    for (const token of forbidden) assert.equal(source.includes(token), false, `${relative(root, file)} contains ${token}`);
  }
});

test('Stage 26 main public entry point has seven exports', async () => {
  const api = await import('@rus/new-game/stages/stage-26');
  assert.equal(Object.keys(api).length, 7);
});

test('legacy Stage 26 is a small implementation-free facade', async () => {
  const file = join(root, 'legacy/src/world/new-game-pipeline/stages/stage26-first-game-screen.js');
  const source = await readFile(file, 'utf8');
  assert.ok(source.split('\n').length <= 10);
  assert.ok(source.includes("@rus/new-game/stages/stage-26/compat"));
  assert.equal(source.includes('function '), false);
});
