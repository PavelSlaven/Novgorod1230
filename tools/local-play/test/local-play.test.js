import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assertReadiness, buildServerEnv, startLocalPlay,
  localGitProvenance, validateLocalPlay } from '../local-play.js';

const digest = 'a'.repeat(64);
const managed = { giga: { python: 'managed-python', hfHome: 'managed-hf',
  modelPath: 'managed-giga-model' }, close: async () => {} };
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
  assert.equal(env.RUS_LOCAL_LLM_RUNTIME_STATUS, undefined);
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

test('v17 uses matching binding, approvals and scenario', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'local-v17-play-'));
  const approvalsPath = join(directory, 'approvals.json');
  await writeFile(approvalsPath, JSON.stringify({ itemApproval: {
    request: { compatible_world_pin_manifest_digest: digest }, attestation: { ok: true }
  }, actorApproval: { request: { ok: true }, attestation: { ok: true } } }));
  try {
    const child = new EventEmitter(); child.exitCode = null;
    child.kill = () => { child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0)); };
    let spawnedEnv;
    const result = await startLocalPlay({ env: {
      RUS_SPATIAL_V3_TARGET_ACTIVATION_APPROVALS_PATH: approvalsPath },
    readGit: async () => git, isPortAvailable: async () => true,
    provisionRuntime: async () => managed,
    ensurePostgres: async () => ({ worldUrl: 'world-v17', partyUrl: 'party-v17',
      state: 'existing', releaseVersion: 17, close: async () => {} }),
    createPool: () => ({ end: async () => {} }),
    loadPin: async () => ({ compatible_world_pin_manifest_digest: digest }),
    setupProduction: async () => { throw new Error('v16 setup called'); },
    setupM3Development: async () => { throw new Error('M3 setup called'); },
    spawnServer: ({ env }) => { spawnedEnv = env; return child; },
    fetchImpl: async (url) => response(url.endsWith('/health')
      ? health(17) : url.endsWith('/scenarios')
        ? { scenarios: [{ scenario_id: 'novgorod_pine_ridge_approach_v1', available: true }] }
        : { mode: 'unconfigured' }), log: () => {} });
    assert.equal(spawnedEnv.RUS_SPATIAL_V3_BINDINGS_MODULE,
      'builtin:spatial-v3-production-v17');
    assert.equal(spawnedEnv.RUS_SPATIAL_V3_TARGET_ACTIVATION_APPROVALS_PATH,
      approvalsPath);
    await result.close();
    await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1,
      releaseVersion: 17, fetchImpl: async (url) => response(url.endsWith('/health')
        ? health(17) : { scenarios: [{ scenario_id: 'lower_dvina_trace_v1', available: true }] }) }),
    { code: 'LOCAL_PLAY_SCENARIO_UNAVAILABLE' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('v17 rejects absent, corrupt, or mismatched approvals before spawn', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'local-v17-approval-test-'));
  const path = join(directory, 'approvals.json');
  let spawned = false;
  const launch = () => startLocalPlay({ env: {
    RUS_SPATIAL_V3_TARGET_ACTIVATION_APPROVALS_PATH: path },
    readGit: async () => git, isPortAvailable: async () => true,
    provisionRuntime: async () => managed,
    ensurePostgres: async () => ({ worldUrl: 'world', partyUrl: 'party',
      state: 'existing', releaseVersion: 17, close: async () => {} }),
    createPool: () => ({ end: async () => {} }),
    loadPin: async () => ({ compatible_world_pin_manifest_digest: digest }),
    spawnServer: () => { spawned = true; } });
  try {
    await assert.rejects(launch(), { code: 'LOCAL_PLAY_V17_APPROVALS_INVALID' });
    await writeFile(path, '{bad');
    await assert.rejects(launch(), { code: 'LOCAL_PLAY_V17_APPROVALS_INVALID' });
    await writeFile(path, JSON.stringify({ itemApproval: { request: {
      compatible_world_pin_manifest_digest: 'b'.repeat(64) }, attestation: {} },
    actorApproval: { request: {}, attestation: {} } }));
    await assert.rejects(launch(), { code: 'LOCAL_PLAY_V17_APPROVALS_INVALID' });
    assert.equal(spawned, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('validation and occupied port fail before provisioning', async () => {
  assert.throws(() => validateLocalPlay({ env: { RUS_SERVER_PORT: '0' },
    nodeVersion: '22.0.0' }), { code: 'LOCAL_PLAY_PORT_INVALID' });
  let provisioned = false;
  await assert.rejects(startLocalPlay({ env: {},
    readGit: async () => git,
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

test('local play provisions Giga only and owns shutdown', async () => {
  const child = new EventEmitter(); child.exitCode = null;
  child.kill = () => { child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0)); };
  const closed = [];
  const runtime = { ...managed, close: async () => closed.push('runtime') };
  const postgres = { worldUrl: 'world', partyUrl: 'party', state: 'existing',
    close: async () => closed.push('postgres') };
  const logs = [];
  const result = await startLocalPlay({ env: {},
    readGit: async () => git,
    provisionRuntime: async (options) => {
      assert.equal('startLlm' in options, false); return runtime;
    }, ensurePostgres: async () => postgres,
    createPool: () => ({ end: async () => {} }),
    loadPin: async () => ({ compatible_world_pin_manifest_digest: digest }),
    spawnServer: () => child, isPortAvailable: async () => true,
    fetchImpl: async (url, options = {}) => {
      return response(url.endsWith('/health') ? health()
        : url.endsWith('/llm-settings') ? { mode: 'unconfigured' } : {
        scenarios: [{ scenario_id: 'lower_dvina_trace_v1', available: true }]
      });
    }, log: (message) => logs.push(message) });
  assert.equal(result.runtimeCapabilities.capabilities.m2_runtime.status,
    'available');
  assert.equal(result.runtimeCapabilities.capabilities
    .m3_procedural_equipment.status, 'blocked_data_gap');
  assert.ok(logs.some((message) => message.includes(
    'm3_procedural_equipment=blocked_data_gap')));
  await result.close();
  assert.deepEqual(closed.sort(), ['postgres', 'runtime']);
});

test('M3 v14 setup runs only behind the explicit new-development option',
  async () => {
    const stop = Object.assign(new Error('stop'), { code: 'STOP' });
    let productionCalls = 0; let developmentCalls = 0;
    await assert.rejects(startLocalPlay({ env: {
      RUS_RUNTIME_SETUP: 'spatial-v3-m3-development-v14'
    }, readGit: async () => git, isPortAvailable: async () => true,
    provisionRuntime: async () => managed,
    ensurePostgres: async () => ({ worldUrl: 'world', partyUrl: 'party',
      state: 'existing', close: async () => {} }),
    createPool: () => ({ end: async () => {} }),
    setupProduction: async () => { productionCalls += 1; throw stop; },
    setupM3Development: async ({ worldUrl, partyUrl }) => {
      developmentCalls += 1;
      assert.equal(worldUrl, 'world'); assert.equal(partyUrl, 'party');
      throw stop;
    }
  }), stop);
    assert.equal(productionCalls, 0);
    assert.equal(developmentCalls, 1);
  });

test('missing provider settings never request gameplay-model provisioning', async () => {
  const stop = Object.assign(new Error('stop'), { code: 'STOP' });
  await assert.rejects(startLocalPlay({ env: {},
    readGit: async () => git,
    isPortAvailable: async () => true,
    provisionRuntime: async (options) => {
      assert.equal('startLlm' in options, false); throw stop;
  } }), stop);
});

test('launcher has no managed gameplay-model switch', async () => {
  const stop = Object.assign(new Error('stop'), { code: 'STOP' });
  await assert.rejects(startLocalPlay({ env: {},
    readGit: async () => git,
    isPortAvailable: async () => true,
    provisionRuntime: async (options) => {
      assert.equal('startLlm' in options, false); throw stop;
  } }), stop);
});

test('saved exact custom provider starts without managed gameplay artifacts', async () => {
  const stop = Object.assign(new Error('stop'), { code: 'STOP' });
  await assert.rejects(startLocalPlay({ env: {},
    readGit: async () => git,
    isPortAvailable: async () => true,
    provisionRuntime: async (options) => {
      assert.equal('startLlm' in options, false); throw stop;
    } }), stop);
});

test('legacy local provider settings never restore managed gameplay artifacts', async () => {
  const stop = Object.assign(new Error('stop'), { code: 'STOP' });
  await assert.rejects(startLocalPlay({ env: {}, readGit: async () => git,
    isPortAvailable: async () => true,
    provisionRuntime: async (options) => {
      assert.equal('startLlm' in options, false); throw stop;
    } }), stop);
});

test('readiness reports server exit', async () => {
  await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1,
    child: { exitCode: 1 } }), { code: 'LOCAL_PLAY_SERVER_EXITED' });
});

function response(data) { return { ok: true, status: 200,
  json: async () => ({ ok: true, data }) }; }
function health(version = 16) { return { status: 'ok',
  release_id: `spatial-v3-production-v${version}`, activation: 'sole_owner',
  authoritative_reads: 'spatial_v3_only',
  authoritative_writes: 'spatial_v3_only', runtime_fallback: 'forbidden',
  production_activation: true, runtime_selectable_in_canonical_production: true }; }
