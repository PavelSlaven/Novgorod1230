import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { assertReadiness, buildServerEnv, startLocalPlay,
  validateLocalPlay } from '../local-play.js';

const digest = 'a'.repeat(64);
const managed = { hardware: { supported: true, reasons: [], facts: {} },
  giga: { python: 'managed-python', hfHome: 'managed-hf',
    modelPath: 'managed-giga-model' },
  llm: { identity: { model: 'gemma' } }, close: async () => {} };

test('buildServerEnv fixes production and managed-runtime settings', () => {
  const env = buildServerEnv({ env: { RUS_RUNTIME_BINDINGS_MODULE: 'old',
    RUS_RUN_PARTY_MIGRATIONS: '1', KEEP: 'yes' }, worldUrl: 'world',
  partyUrl: 'party', pinManifestDigest: digest, port: 3001,
  managedRuntime: managed });
  assert.equal(env.RUS_CUTOVER_STAGE, '13');
  assert.equal(env.RUS_RUNTIME_BINDINGS_MODULE, undefined);
  assert.equal(env.RUS_WORLD_KNOWLEDGE_PYTHON, 'managed-python');
  assert.equal(env.RUS_WORLD_KNOWLEDGE_MODEL_PATH, 'managed-giga-model');
  assert.equal(env.HF_HUB_OFFLINE, '1');
  assert.equal(JSON.parse(env.RUS_LOCAL_LLM_RUNTIME_STATUS).ready, true);
});

test('readiness rejects wrong release and unavailable scenario', async () => {
  await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1,
    fetchImpl: async () => response({ status: 'ok' }) }),
  { code: 'LOCAL_PLAY_READINESS_FAILED' });
  let calls = 0;
  await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1,
    fetchImpl: async () => response(calls++ ? { scenarios: [] } : health()) }),
  { code: 'LOCAL_PLAY_SCENARIO_UNAVAILABLE' });
});

test('validation and occupied port fail before provisioning', async () => {
  assert.throws(() => validateLocalPlay({ env: { RUS_SERVER_PORT: '0' },
    nodeVersion: '22.0.0' }), { code: 'LOCAL_PLAY_PORT_INVALID' });
  let provisioned = false;
  await assert.rejects(startLocalPlay({ env: {},
    isPortAvailable: async () => false,
    provisionRuntime: async () => { provisioned = true; } }),
  { code: 'LOCAL_PLAY_PORT_UNAVAILABLE' });
  assert.equal(provisioned, false);
});

test('local play provisions, applies managed Gemma, and owns shutdown', async () => {
  const child = new EventEmitter(); child.exitCode = null;
  child.kill = () => { child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0)); };
  const closed = [];
  let applied = false;
  const runtime = { ...managed, close: async () => closed.push('runtime') };
  const postgres = { worldUrl: 'world', partyUrl: 'party', state: 'existing',
    close: async () => closed.push('postgres') };
  const result = await startLocalPlay({ env: {},
    provisionRuntime: async ({ startLlm }) => {
      assert.equal(startLlm, true); return runtime;
    }, ensurePostgres: async () => postgres,
    createPool: () => ({ end: async () => {} }),
    loadPin: async () => ({ compatible_world_pin_manifest_digest: digest }),
    spawnServer: () => child, isPortAvailable: async () => true,
    fetchImpl: async (url, options = {}) => {
      if (options.method === 'PUT') { applied = true; return response({ settings: {} }); }
      return response(url.endsWith('/health') ? health()
        : url.endsWith('/llm-settings') ? { mode: 'local' } : {
        scenarios: [{ scenario_id: 'lower_dvina_trace_v1', available: true }]
      });
    }, log: () => {} });
  assert.equal(applied, true);
  await result.close();
  assert.deepEqual(closed.sort(), ['postgres', 'runtime']);
});

test('launcher always makes managed Gemma available on supported hardware', async () => {
  const stop = Object.assign(new Error('stop'), { code: 'STOP' });
  await assert.rejects(startLocalPlay({ env: {},
    isPortAvailable: async () => true,
    provisionRuntime: async ({ startLlm }) => {
      assert.equal(startLlm, true); throw stop;
  } }), stop);
});

test('an explicit external acceptance provider skips the owned Gemma process', async () => {
  const stop = Object.assign(new Error('stop'), { code: 'STOP' });
  await assert.rejects(startLocalPlay({ env: {}, startManagedLlm: false,
    isPortAvailable: async () => true,
    provisionRuntime: async ({ startLlm }) => {
      assert.equal(startLlm, false); throw stop;
    } }), stop);
});

test('readiness reports server exit', async () => {
  await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1,
    child: { exitCode: 1 } }), { code: 'LOCAL_PLAY_SERVER_EXITED' });
});

function response(data) { return { ok: true, status: 200,
  json: async () => ({ ok: true, data }) }; }
function health() { return { status: 'ok',
  release_id: 'spatial-v3-production-v15', activation: 'sole_owner',
  authoritative_reads: 'spatial_v3_only',
  authoritative_writes: 'spatial_v3_only', runtime_fallback: 'forbidden',
  production_activation: true, runtime_selectable_in_canonical_production: true }; }
