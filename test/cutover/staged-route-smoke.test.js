import test from 'node:test';
import assert from 'node:assert/strict';
import { readServerConfig, featureFlagProfile, assertModularStartupConfig } from '../../apps/game-server/src/config.js';

const EXPECTED_BY_STEP = Object.freeze([
  'modulesEnabled', 'llmRuntimeModulesEnabled', 'dataModulesEnabled', 'partyStoreModulesEnabled',
  'newGameWave2426Enabled', 'newGameWave2023Enabled', 'newGameAllStagesEnabled', 'newGameModulesEnabled',
  'turnModulesEnabled', 'presentationModulesEnabled', 'gameServerModulesEnabled', 'modularUiEnabled', 'toolsModulesEnabled'
]);

test('completed cutover profile keeps every modular flag enabled', () => {
  const config = readServerConfig({
    ...process.env,
    RUS_CUTOVER_STAGE: '13',
    RUS_SPATIAL_V3_BINDINGS_MODULE:
      './test/fixtures/runtime-bindings/spatial-v3-production-bindings.js',
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: 'e'.repeat(64)
  });
  const stage = 13;
  const profile = featureFlagProfile(config);
  for (let index = 0; index < EXPECTED_BY_STEP.length; index += 1) {
    assert.equal(profile[EXPECTED_BY_STEP[index]], index < stage, `${EXPECTED_BY_STEP[index]} at cutover step ${stage}`);
  }
  assert.equal(config.runtimeRoute, 'modular');
  assert.equal(assertModularStartupConfig(config), config);
});
