import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production setup always runs Stage 3c in local-play mode', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url), 'utf8');
  assert.match(source, /\['scripts\/run-pr17-item-container-stage3c\.mjs', '--mode', 'local-play'\]/u);
  assert.doesNotMatch(source, /stage3cModeForWorldUrl/u);
});

test('local bootstrap reports the M3 gap without manufacturing authority', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url),
    'utf8');
  assert.match(source, /LOCAL_PLAY_RUNTIME_CAPABILITIES_V1/u);
  assert.doesNotMatch(source, /installProceduralFinalDevelopmentCatalog/u);
  assert.doesNotMatch(source, /migrateExisting|rematerializeExisting/u);
});

test('local bootstrap completes canonical schema before exact migration and activation', async () => {
  const source = await readFile(new URL('../production-setup.js', import.meta.url),
    'utf8');
  const schemaInstall = source.indexOf("['18.sql', '19.sql', '20.sql', '21.sql']");
  const migration = source.indexOf('runWorldRuntimeCatalogMigration(worldPool)');
  const activation = source.indexOf('buildFirstPlayableV2ActivationBundle({');
  assert.ok(schemaInstall >= 0);
  assert.ok(schemaInstall < migration);
  assert.ok(migration < activation);
  assert.doesNotMatch(source, /FIRST_PLAYABLE_V3_RELEASE/u);
});
