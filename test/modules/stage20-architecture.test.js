import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../../packages/new-game/src/stages/stage-20-visible-context/', import.meta.url);
async function files(url) {
  const out = [];
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
    if (entry.isDirectory()) out.push(...await files(child));
    else if (/\.js$/u.test(entry.name)) out.push(child);
  }
  return out;
}

test('Stage 20 production files remain bounded and isolated', async () => {
  for (const file of await files(root)) {
    const source = await readFile(file, 'utf8');
    assert.ok(source.split('\n').length <= 500, `${file.pathname} exceeds 500 lines`);
    assert.ok(Buffer.byteLength(source) <= 25 * 1024, `${file.pathname} exceeds 25 KB`);
    for (const token of ['legacy/', 'stage-21-', 'stage21-', '@rus/party-store', '@rus/world-base', "from 'pg'", 'provider.js', '/ui/']) {
      assert.equal(source.includes(token), false, `${file.pathname} contains forbidden dependency ${token}`);
    }
  }
});

test('Stage 20 public API is bounded and legacy file is a facade', async () => {
  const api = await import('@rus/new-game/stages/stage-20');
  assert.equal(Object.keys(api).length, 8);
  const legacy = await readFile(new URL('../../legacy/src/world/new-game-pipeline/stages/stage20-visible-context.js', import.meta.url), 'utf8');
  assert.equal(legacy.trim(), "export * from '@rus/new-game/stages/stage-20/compat';");
});
