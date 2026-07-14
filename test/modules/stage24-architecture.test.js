import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../../packages/new-game/src/stages/stage-24-party-db-write-plan/', import.meta.url);

async function files(url) {
  const out = [];
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
    if (entry.isDirectory()) out.push(...await files(child));
    else if (/\.js$/u.test(entry.name)) out.push(child);
  }
  return out;
}

test('Stage 24 files stay within modular size and dependency boundaries', async () => {
  for (const file of await files(root)) {
    const source = await readFile(file, 'utf8');
    assert.ok(source.split('\n').length <= 500, `${file.pathname} exceeds 500 lines`);
    for (const token of ['legacy/', 'stage23-narrator-prose-audit.js', 'stage25-party-commit.js', '@rus/party-store', "from 'pg'", 'provider.js']) {
      assert.equal(source.includes(token), false, `${file.pathname} contains forbidden dependency ${token}`);
    }
  }
});

test('Stage 24 orchestrator and public API remain bounded', async () => {
  const orchestrator = await readFile(new URL('orchestration/run-stage-24.js', root), 'utf8');
  const index = await readFile(new URL('index.js', root), 'utf8');
  assert.ok(orchestrator.split('\n').length <= 250);
  assert.ok((index.match(/\bexport\b/g) ?? []).length <= 8);
});
