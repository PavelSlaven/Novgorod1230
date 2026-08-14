import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  buildLocalServerEnv,
  classifyLocalDatabaseState,
  prepareLocalDatabaseState,
  validateLocalDockerResources
} from '../../tools/local-play/local-play-contracts.js';
import { runLocalPlay } from '../../tools/local-play/local-play.js';

test('local play rejects a missing DeepSeek key before invoking Docker',
  async () => {
    let dockerCalls = 0;
    await assert.rejects(
      () => runLocalPlay({
        env: {},
        dependencies: {
          docker() { dockerCalls += 1; }
        }
      }),
      { code: 'LOCAL_PLAY_DEEPSEEK_API_KEY_REQUIRED' }
    );
    assert.equal(dockerCalls, 0);
  });

test('database preparation initializes fresh databases exactly once',
  async () => {
    let initializationCalls = 0;
    const pin = { compatible_world_pin_manifest_digest: 'a'.repeat(64) };
    const result = await prepareLocalDatabaseState({
      inventory: inventory(0, 0),
      initializeFresh: async () => { initializationCalls += 1; },
      loadCompatible: async () => pin
    });
    assert.equal(initializationCalls, 1);
    assert.equal(result.mode, 'initialized');
    assert.equal(result.pin, pin);
  });

test('database preparation reuses compatible state without initialization',
  async () => {
    let initializationCalls = 0;
    const pin = { compatible_world_pin_manifest_digest: 'b'.repeat(64) };
    const result = await prepareLocalDatabaseState({
      inventory: inventory(20, 30),
      initializeFresh: async () => { initializationCalls += 1; },
      loadCompatible: async () => pin
    });
    assert.equal(initializationCalls, 0);
    assert.equal(result.mode, 'reused');
    assert.equal(result.pin, pin);
  });

test('database preparation propagates incompatible world and party states',
  async () => {
    for (const code of [
      'SPATIAL_V3_WORLD_RELEASE_PIN_MISMATCH',
      'SPATIAL_V3_PARTY_MIGRATION_REQUIRED'
    ]) {
      await assert.rejects(
        () => prepareLocalDatabaseState({
          inventory: inventory(20, 30),
          initializeFresh: async () => assert.fail('must not initialize'),
          loadCompatible: async () => {
            throw Object.assign(new Error(code), { code });
          }
        }),
        { code }
      );
    }
  });

test('database classifier fails closed for partially initialized state', () => {
  assert.throws(
    () => classifyLocalDatabaseState(inventory(20, 0)),
    { code: 'LOCAL_PLAY_DATABASE_STATE_PARTIAL' }
  );
  assert.throws(
    () => classifyLocalDatabaseState(inventory(0, 20)),
    { code: 'LOCAL_PLAY_DATABASE_STATE_PARTIAL' }
  );
});

test('Docker resource validation rejects an unowned named resource', () => {
  assert.throws(
    () => validateLocalDockerResources({
      container: null,
      volume: { labels: {} }
    }),
    { code: 'LOCAL_PLAY_DOCKER_RESOURCE_CONFLICT' }
  );
  assert.throws(
    () => validateLocalDockerResources({
      container: { labels: {}, image: 'postgres:16-alpine',
        volumeName: 'novgorod1230-local-postgres-data', hostIp: '127.0.0.1' },
      volume: { labels: { 'io.novgorod1230.local-play': 'true' } }
    }),
    { code: 'LOCAL_PLAY_DOCKER_RESOURCE_CONFLICT' }
  );
});

test('server env preserves DeepSeek overrides and injects the loaded pin', () => {
  const digest = 'c'.repeat(64);
  const env = buildLocalServerEnv({
    env: {
      DEEPSEEK_API_KEY: 'key',
      DEEPSEEK_BASE_URL: 'http://127.0.0.1:9999',
      TURN_STEP_PLANNER_MODEL: 'custom-planner',
      RUS_RUNTIME_BINDINGS_MODULE: './stale.js'
    },
    worldUrl: 'postgresql://world',
    partyUrl: 'postgresql://party',
    pinManifestDigest: digest,
    serverPort: 3010
  });
  assert.equal(env.DEEPSEEK_BASE_URL, 'http://127.0.0.1:9999');
  assert.equal(env.TURN_STEP_PLANNER_MODEL, 'custom-planner');
  assert.equal(env.RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST,
    digest);
  assert.equal(env.RUS_COMPOSITION_MODULE,
    'builtin:production-spatial-v3');
  assert.equal(env.RUS_SPATIAL_V3_BINDINGS_MODULE,
    'builtin:spatial-v3-production-v8');
  assert.equal(env.RUS_SERVER_HOST, '127.0.0.1');
  assert.equal(env.RUS_SERVER_PORT, '3010');
  assert.equal('RUS_RUNTIME_BINDINGS_MODULE' in env, false);
  assert.equal(buildLocalServerEnv({
    env: { DEEPSEEK_API_KEY: 'key' },
    worldUrl: 'postgresql://world',
    partyUrl: 'postgresql://party',
    pinManifestDigest: 'd'.repeat(64)
  }).RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST, 'd'.repeat(64));
});

test('local play invokes the injected browser callback after readiness',
  async () => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => {};
    const readyUrls = [];
    const result = runLocalPlay({
      env: { DEEPSEEK_API_KEY: 'test' },
      output: { write() {} },
      dependencies: {
        ensureLocalPostgres: async () => ({
          worldUrl: 'postgresql://world', partyUrl: 'postgresql://party'
        }),
        Pool: FakePool,
        loadActivePin: async () => ({
          compatible_world_pin_manifest_digest: 'e'.repeat(64)
        }),
        assertPartyReadiness: async () => ({ historical_pins: [] }),
        assertWorldReadiness: async () => {},
        spawnServer: () => {
          setImmediate(() => child.emit('exit', 0, null));
          return child;
        },
        fetch: async (url) => responseFor(url),
        onReady: async (url) => {
          readyUrls.push(url);
        }
      }
    });
    await result;
    assert.deepEqual(readyUrls, ['http://127.0.0.1:3000']);
  });

function inventory(worldTables, partyTables) {
  return {
    world: { database: 'pr17_novgorod_local_world',
      user_table_count: worldTables },
    party: { database: 'novgorod_local_party',
      user_table_count: partyTables }
  };
}

class FakePool {
  query() {
    return Promise.resolve({
      rows: [{ database: 'local', user_table_count: 20 }]
    });
  }

  end() { return Promise.resolve(); }
}

function responseFor(url) {
  const health = url.endsWith('/health');
  return {
    ok: true,
    json: async () => health
      ? { data: { release_id: 'spatial-v3-production-v8' } }
      : { data: { scenarios: [{ scenario_id: 'lower_dvina_trace_v1' }] } }
  };
}
