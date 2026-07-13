import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const facade = new URL('../../legacy/src/world/new-game-pipeline/stages/stage26-first-game-screen.js', import.meta.url);
const compat = new URL('../../packages/new-game/src/stages/stage-26-first-game-screen/compat.js', import.meta.url);

test('legacy Stage 26 delegates only to the modular compatibility entry point', async () => {
  const source = await readFile(facade, 'utf8');
  assert.equal(source.includes("@rus/new-game/stages/stage-26/compat"), true);
  assert.equal(source.includes('stage22-narrator-prose.js'), false);
  assert.equal(source.includes('stage23-narrator-prose-audit.js'), false);
  assert.equal(source.includes('stage25-party-commit.js'), false);
  assert.equal(source.includes('function '), false);
});

test('modular Stage 26 consumes canonical contracts through internal boundaries', async () => {
  const source = await readFile(compat, 'utf8');
  assert.equal(source.includes('./policy/constants.js'), true);
  assert.equal(source.includes('./compatibility.js'), true);
});
