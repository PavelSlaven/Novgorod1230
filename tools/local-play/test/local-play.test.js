import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { assertReadiness, buildServerEnv, startLocalPlay,
  localGitProvenance, validateLocalPlay } from '../local-play.js';

const digest = 'a'.repeat(64);
const managed = { hardware: { supported: true, reasons: [], facts: {} },
  giga: { python: 'managed-python', hfHome: 'managed-hf',
    modelPath: 'managed-giga-model' },
  llm: { identity: { model: 'gemma' } }, close: async () => {} };
const git = { head: 'b'.repeat(40), branch: 'codex/test' };

test('buildServerEnv fixes production and managed-runtime settings', () => {
  const env = buildServerEnv({ env: { RUS_RUNTIME_BINDINGS_MODULE: 'old',
    RUS_RUN_PARTY_MIGRATIONS: '1', KEEP: 'yes' }, worldUrl: 'world',
  partyUrl: 'party', pinManifestDigest: digest, port: 3001,
  managedRuntime: managed, git });
  assert.equal(env.RUS_CUTOVER_STAGE, '13');
  assert.equal(env.RUS_SPATIAL_V3_BINDINGS_MODULE,
    'builtin:spatial-v3-production-v16');
  assert.equal(env.RUS_RUNTIME_BINDINGS_MODULE, undefined);
  assert.equal(env.RUS_WORLD_KNOWLEDGE_PYTHON, 'managed-python');
  assert.equal(env.RUS_WORLD_KNOWLEDGE_MODEL_PATH, 'managed-giga-model');
  assert.equal(env.HF_HUB_OFFLINE, '1');
  assert.equal(JSON.parse(env.RUS_LOCAL_LLM_RUNTIME_STATUS).ready, true);
  assert.equal(env.RUS_GIT_HEAD, git.head);
  assert.equal(env.RUS_GIT_BRANCH, git.branch);
});

test('launcher replaces ambient Git provenance and keeps detached branch empty', () => {
  const env = buildServerEnv({ env: { RUS_GIT_HEAD: 'ambient', RUS_GIT_BRANCH: 'ambient',
    RUS_GIT_PR: '99', RUS_BUILD_ID: 'build' }, worldUrl: 'world', partyUrl: 'party',
  pinManifestDigest: digest, port: 3001, managedRuntime: managed,
  git: { head: 'c'.repeat(40), branch: null } });
  assert.equal(env.RUS_GIT_HEAD, 'c'.repeat(40));
  assert.equal(env.RUS_GIT_BRANCH, undefined);
  assert.equal(env.RUS_GIT_PR, undefined);
  assert.equal(env.RUS_BUILD_ID, undefined);
});

test('launcher passes only the exact open-PR provenance to the child', () => {
  const env = buildServerEnv({ env: { RUS_GIT_PR: 'ambient' }, worldUrl: 'world',
    partyUrl: 'party', pinManifestDigest: digest, port: 3001, managedRuntime: managed,
    git: { head: 'c'.repeat(40), branch: 'codex/test', pr: 96 } });
  assert.equal(env.RUS_GIT_PR, '96');
});

test('Git provenance accepts only an open PR at exact HEAD', async () => {
  const head = 'd'.repeat(40);
  const exec = async (command, args) => command === 'git'
    ? { stdout: `${args[0] === 'rev-parse' ? head : 'codex/test'}\n` }
    : { stdout: JSON.stringify([{ number: 96, headRefOid: head }]) };
  assert.deepEqual(await localGitProvenance({ exec }), {
    head, branch: 'codex/test', pr: 96
  });
  const noPr = async (command, args) => command === 'git'
    ? { stdout: `${args[0] === 'rev-parse' ? head : 'codex/test'}\n` } : { stdout: '[]' };
  assert.deepEqual(await localGitProvenance({ exec: noPr }), {
    head, branch: 'codex/test', pr: null
  });
  const mismatch = async (command, args) => command === 'git'
    ? { stdout: `${args[0] === 'rev-parse' ? head : 'codex/test'}\n` }
    : { stdout: JSON.stringify([{ number: 96, headRefOid: 'e'.repeat(40) }]) };
  await assert.rejects(localGitProvenance({ exec: mismatch }),
    { code: 'LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE' });
  await assert.rejects(localGitProvenance({ exec: async () => { throw new Error('gh unavailable'); } }),
    { code: 'LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE' });
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

test('readiness allows startup qualification to exceed thirty seconds', async () => {
  let calls = 0;
  await assertReadiness({ baseUrl: 'http://test', sleep: async () => {},
    fetchImpl: async (url) => {
      calls += 1;
      if (calls <= 120) throw new Error('not listening yet');
      return response(url.endsWith('/health') ? health() : {
        scenarios: [{ scenario_id: 'lower_dvina_trace_v1', available: true }]
      });
    } });
  assert.equal(calls, 122);
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

test('Git provenance failure stops launcher before provisioning and spawn', async () => {
  let provisioned = false; let spawned = false;
  await assert.rejects(startLocalPlay({ env: {}, readGit: async () => ({ head: 'bad' }),
    isPortAvailable: async () => true,
    provisionRuntime: async () => { provisioned = true; },
    spawnServer: () => { spawned = true; } }),
  { code: 'LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE' });
  assert.equal(provisioned, false);
  assert.equal(spawned, false);
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
    readGit: async () => git,
    loadLlmSettings: async () => null,
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
    readGit: async () => git,
    loadLlmSettings: async () => null,
    isPortAvailable: async () => true,
    provisionRuntime: async ({ startLlm }) => {
      assert.equal(startLlm, true); throw stop;
  } }), stop);
});

test('an explicit external acceptance provider skips the owned Gemma process', async () => {
  const stop = Object.assign(new Error('stop'), { code: 'STOP' });
  await assert.rejects(startLocalPlay({ env: {}, startManagedLlm: false,
    readGit: async () => git,
    loadLlmSettings: async () => null,
    isPortAvailable: async () => true,
    provisionRuntime: async ({ startLlm }) => {
      assert.equal(startLlm, false); throw stop;
  } }), stop);
});

test('saved custom provider skips managed Gemma before provisioning', async () => {
  const stop = Object.assign(new Error('stop'), { code: 'STOP' });
  await assert.rejects(startLocalPlay({ env: {},
    readGit: async () => git,
    isPortAvailable: async () => true,
    loadLlmSettings: async () => ({ settings: { mode: 'custom' } }),
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
  release_id: 'spatial-v3-production-v16', activation: 'sole_owner',
  authoritative_reads: 'spatial_v3_only',
  authoritative_writes: 'spatial_v3_only', runtime_fallback: 'forbidden',
  production_activation: true, runtime_selectable_in_canonical_production: true }; }
