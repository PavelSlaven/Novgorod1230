import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production setup always runs Stage 3c in local-play mode', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url), 'utf8');
  assert.match(source, /\['scripts\/run-pr17-item-container-stage3c\.mjs', '--mode', 'local-play'\]/u);
  assert.doesNotMatch(source, /stage3cModeForWorldUrl/u);
});

test('local bootstrap cuts over only new development parties', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url),
    'utf8');
  assert.match(source, /installProceduralFinalDevelopmentCatalog/u);
  assert.match(source, /new-development-parties-only/u);
  assert.doesNotMatch(source, /migrateExisting|rematerializeExisting/u);
});
