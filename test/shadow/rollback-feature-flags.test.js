import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { assertModularStartupConfig, featureFlagProfile, readServerConfig } from '../../apps/game-server/src/config.js';

test('modular is the default route after staged cutover', () => {
  const config = readServerConfig({ RUS_RUNTIME_BINDINGS_MODULE: './runtime-bindings.js' });
  assert.equal(config.runtimeRoute, 'modular');
  assert.equal(config.cutoverStage, 13);
  assert.equal(Object.values(featureFlagProfile(config)).every(Boolean), true);
  assert.equal(assertModularStartupConfig(config), config);
});

test('legacy is available only through explicit rollback route', () => {
  const config = readServerConfig({ RUS_RUNTIME_ROUTE: 'legacy' });
  assert.equal(config.runtimeRoute, 'legacy');
  assert.equal(assertModularStartupConfig(config), config);
});

test('partial modular profile fails closed', () => {
  const config = readServerConfig({
    RUS_RUNTIME_ROUTE: 'modular',
    RUS_CUTOVER_STAGE: '12',
    RUS_MODULES_ENABLED: 'true',
    RUS_UI_MODULES_ENABLED: 'false',
    RUS_RUNTIME_BINDINGS_MODULE: './runtime-bindings.js'
  });
  assert.throws(() => assertModularStartupConfig(config), (error) => error.code === 'MODULAR_FEATURE_FLAGS_INCOMPLETE');
});

test('server entry keeps explicit modular default and legacy rollback routes', async () => {
  const source = await readFile(new URL('../../apps/game-server/src/server.js', import.meta.url), 'utf8');
  assert.match(source, /runtimeRoute\s*===\s*['"]legacy['"]/u);
  assert.match(source, /legacy-entry\.js/u);
  assert.match(source, /modular-entry\.js/u);
});
