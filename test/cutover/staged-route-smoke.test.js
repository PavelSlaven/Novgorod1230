import test from 'node:test';
import assert from 'node:assert/strict';
import { readServerConfig, featureFlagProfile, assertModularStartupConfig } from '../../apps/game-server/src/config.js';

const EXPECTED_BY_STEP = Object.freeze([
  'modulesEnabled', 'llmRuntimeModulesEnabled', 'dataModulesEnabled', 'partyStoreModulesEnabled',
  'newGameWave2426Enabled', 'newGameWave2023Enabled', 'newGameAllStagesEnabled', 'newGameModulesEnabled',
  'turnModulesEnabled', 'presentationModulesEnabled', 'gameServerModulesEnabled', 'modularUiEnabled', 'toolsModulesEnabled'
]);

test('staged cutover profile enables the expected cumulative flags', () => {
  const config = readServerConfig({ RUS_RUNTIME_BINDINGS_MODULE: './test/fixtures/runtime-bindings/production-bindings.js', ...process.env });
  const stage = Number(process.env.RUS_CUTOVER_STAGE ?? 13);
  const profile = featureFlagProfile(config);
  for (let index = 0; index < EXPECTED_BY_STEP.length; index += 1) {
    assert.equal(profile[EXPECTED_BY_STEP[index]], index < stage, `${EXPECTED_BY_STEP[index]} at cutover step ${stage}`);
  }
  assert.equal(config.runtimeRoute, stage >= 12 ? 'modular' : 'legacy');
  if (stage >= 12) assert.equal(assertModularStartupConfig(config), config);
});
