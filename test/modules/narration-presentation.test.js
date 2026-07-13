import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createNarrationService, runNarrationFlow } from '@rus/narration';
import {
  createFirstGameScreenReadModel,
  createTurnScreenReadModel,
  validateTurnScreen
} from '@rus/presentation';

test('narration and presentation publish canonical production APIs', () => {
  assert.equal(typeof runNarrationFlow, 'function');
  assert.equal(typeof createNarrationService, 'function');
  assert.equal(typeof createFirstGameScreenReadModel, 'function');
  assert.equal(typeof createTurnScreenReadModel, 'function');
  assert.equal(typeof validateTurnScreen, 'function');
});

test('turn imports narration and presentation only through package public APIs', async () => {
  const narrationStage = await readFile('packages/turn/src/stages/narration.js', 'utf8');
  const screenStage = await readFile('packages/turn/src/stages/screen-projection.js', 'utf8');
  assert.match(narrationStage, /narrator\.run/u);
  assert.match(screenStage, /from '@rus\/presentation'/u);
  assert.doesNotMatch(narrationStage, /packages\/narration\/src/u);
  assert.doesNotMatch(screenStage, /packages\/presentation\/src/u);
});

test('narration and presentation production sources contain no legacy provider or database imports', async () => {
  for (const file of [
    'packages/narration/src/flow.js',
    'packages/narration/src/ports.js',
    'packages/presentation/src/read-models/screens.js',
    'packages/presentation/src/read-models/panels.js'
  ]) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /legacy\//u);
    assert.doesNotMatch(source, /provider\.js/u);
    assert.doesNotMatch(source, /from ['"]pg['"]/u);
    assert.doesNotMatch(source, /@rus\/llm-runtime/u);
  }
});
