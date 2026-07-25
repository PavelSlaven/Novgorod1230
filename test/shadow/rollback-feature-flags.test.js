import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { assertModularStartupConfig, featureFlagProfile, readServerConfig } from '../../apps/game-server/src/config.js';

test('spatial v3 is the sole modular route after production cutover', () => {
  const config = readServerConfig({
    RUS_SPATIAL_V3_BINDINGS_MODULE: './spatial-v3-bindings.js',
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: 'e'.repeat(64)
  });
  assert.equal(config.runtimeRoute, 'modular');
  assert.equal(config.cutoverStage, 13);
  assert.equal(config.compositionModule, 'builtin:production-spatial-v3');
  assert.equal(Object.values(featureFlagProfile(config)).every(Boolean), true);
  assert.equal(assertModularStartupConfig(config), config);
});

test('legacy runtime route is rejected after cutover', () => {
  const config = readServerConfig({ RUS_RUNTIME_ROUTE: 'legacy' });
  assert.equal(config.runtimeRoute, 'legacy');
  assert.throws(
    () => assertModularStartupConfig(config),
    (error) => error.code === 'RUNTIME_ROUTE_INACTIVE'
  );
});

test('partial modular profile fails closed', () => {
  const config = readServerConfig({
    RUS_RUNTIME_ROUTE: 'modular',
    RUS_CUTOVER_STAGE: '12',
    RUS_MODULES_ENABLED: 'true',
    RUS_UI_MODULES_ENABLED: 'false',
    RUS_SPATIAL_V3_BINDINGS_MODULE: './spatial-v3-bindings.js'
  });
  assert.throws(() => assertModularStartupConfig(config), (error) => error.code === 'MODULAR_FEATURE_FLAGS_INCOMPLETE');
});

test('server entry has no selectable legacy runtime fallback', async () => {
  const source = await readFile(new URL('../../apps/game-server/src/server.js', import.meta.url), 'utf8');
  assert.match(source, /modular-entry\.js/u);
  assert.doesNotMatch(source, /legacy-entry\.js|runtimeRoute\s*===\s*['"]legacy['"]/u);
});
