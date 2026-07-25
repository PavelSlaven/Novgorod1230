import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPATIAL_V3_PRODUCTION_RELEASE_ID,
  createSpatialV3ProductionCompositionRoot
} from '../../apps/game-server/src/composition/production-spatial-v3.js';
import {
  loadConfiguredComposition
} from '../../apps/game-server/src/runtime/load-composition.js';
import {
  validateSpatialV3RuntimeBindings
} from '../../apps/game-server/src/runtime/load-spatial-v3-bindings.js';
import {
  assertModularStartupConfig,
  readServerConfig
} from '../../apps/game-server/src/config.js';

function fixture() {
  let closed = 0;
  const pool = {
    connect: async () => {
      throw new Error('unit composition must not open a transaction');
    },
    query: async () => ({
      rows: [{
        database_name: 'isolated',
        user_name: 'test',
        ok: 1
      }]
    })
  };
  const pools = {
    worldPool: pool,
    partyPool: pool,
    close: async () => { closed += 1; }
  };
  let received;
  const targetRootFactory = (ports) => {
    received = ports;
    return {
      status: 'target_shadow_only',
      health: () => ({ status: 'ok' }),
      startNewGame: async () => ({ ok: true }),
      acknowledgeOpening: async () => ({ ok: true }),
      submitTurn: async () => ({ ok: true }),
      getPartyScreen: async () => ({ ok: true })
    };
  };
  const bindingsFactory = async ({ release }) => {
    assert.equal(release.release_id, SPATIAL_V3_PRODUCTION_RELEASE_ID);
    return {
      targetCompositionPorts: { port_marker: 'v3-only' },
      commitRecheck: async () => ({ ok: true }),
      acknowledgeOpening: async () => ({ ok: true, owner: 'v3' }),
      getPartyScreen: async () => ({ ok: true, owner: 'v3' })
    };
  };
  return {
    pools,
    targetRootFactory,
    bindingsFactory,
    received: () => received,
    closed: () => closed
  };
}

test('production-v3 root is a sole-owner composition with no v2 fallback identity', async () => {
  const setup = fixture();
  const root = await createSpatialV3ProductionCompositionRoot({
    config: { runMigrations: false },
    pools: setup.pools,
    bindingsFactory: setup.bindingsFactory,
    targetRootFactory: setup.targetRootFactory
  });
  const health = root.health();
  assert.equal(root.status, 'production_sole_owner');
  assert.equal(health.composition, 'spatial_v3_production');
  assert.equal(health.activation, 'sole_owner');
  assert.equal(health.authoritative_reads, 'spatial_v3_only');
  assert.equal(health.authoritative_writes, 'spatial_v3_only');
  assert.equal(health.runtime_fallback, 'forbidden');
  assert.equal(health.release_id, SPATIAL_V3_PRODUCTION_RELEASE_ID);
  assert.equal(setup.received().port_marker, 'v3-only');
  assert.equal(typeof setup.received().committer.commit, 'function');
  assert.equal((await root.getPartyScreen()).owner, 'v3');
  await root.close();
  assert.equal(setup.closed(), 1);
});

test('configured composition loader rejects the prepared v3 root before cutover', async () => {
  await assert.rejects(
    loadConfiguredComposition('builtin:production-spatial-v3'),
    (error) => error.code === 'COMPOSITION_MODULE_INACTIVE'
  );
  await assert.rejects(
    loadConfiguredComposition(
      './apps/game-server/src/composition/production-spatial-v3.js'
    ),
    (error) => error.code === 'COMPOSITION_MODULE_INACTIVE'
  );
});

test('production-v3 binding validation fails closed without every sole-owner port', () => {
  assert.throws(
    () => validateSpatialV3RuntimeBindings({
      targetCompositionPorts: {},
      commitRecheck: async () => ({ ok: true }),
      acknowledgeOpening: async () => ({ ok: true })
    }),
    /getPartyScreen/
  );
});

test('pre-cutover server config does not expose a v3 bindings selector', () => {
  const configured = readServerConfig({
    RUS_COMPOSITION_MODULE: 'builtin:production-spatial-v3'
  });
  assert.throws(
    () => assertModularStartupConfig(configured),
    (error) => error.code === 'COMPOSITION_MODULE_INACTIVE'
  );
  assert.equal('spatialV3BindingsModule' in configured, false);
});
