import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as publicApi from '@rus/new-game/stages/stage-25';

const root = fileURLToPath(new URL('../../', import.meta.url));
const stageRoot = join(root, 'packages/new-game/src/stages/stage-25-party-commit');

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}

test('Stage 25 production files remain bounded and isolated', async () => {
  const files = (await walk(stageRoot)).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.ok(source.split('\n').length <= 500, `${file} exceeds 500 lines`);
    for (const forbidden of ['legacy/', 'stage24-party-db-write-plan.js', 'stage26-first-game-screen.js', 'provider.js', '/ui/', 'from \'pg\'', 'from "pg"']) {
      assert.equal(source.includes(forbidden), false, `${file} contains forbidden dependency ${forbidden}`);
    }
  }
});

test('Stage 25 public API is intentionally narrow', () => {
  assert.deepEqual(Object.keys(publicApi).sort(), [
    'buildStage25Approval',
    'buildStage25CommitInput',
    'buildStage25CommitPreflight',
    'runStage25PartyCommit',
    'stage25Definition',
    'validateStage25CommitInput',
    'validateStage25Result'
  ]);
});

test('legacy Stage 25 is a compatibility facade', async () => {
  const source = await readFile(join(root, 'legacy/src/world/new-game-pipeline/stages/stage25-party-commit.js'), 'utf8');
  assert.ok(source.includes('@rus/new-game/stages/stage-25/compat'));
  assert.equal(source.includes('function '), false);
  assert.ok(source.split('\n').length <= 3);
});
