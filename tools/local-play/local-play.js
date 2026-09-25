import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { loadActiveRuntimeCatalogPin } from
  '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import {
  SPATIAL_V3_PRODUCTION_RELEASE
} from '../../apps/game-server/src/composition/production-spatial-v3.js';
import {
  ensureLocalPostgres,
  localV17ApprovalsPath,
  localPlayError
} from './local-postgres.js';
import { provisionManagedRuntime } from './managed-runtime.js';
import { installActivatedRuntimeCatalog,
  installM3DevelopmentV14NewPartyRuntime } from './production-setup.js';
import { LOCAL_PLAY_RUNTIME_CAPABILITIES_V1 } from './runtime-capabilities.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RELEASES = Object.freeze({
  16: { releaseId: 'spatial-v3-production-v16', scenarioId: 'lower_dvina_trace_v1' },
  17: { releaseId: 'spatial-v3-production-v17', scenarioId: 'novgorod_pine_ridge_approach_v1' }
});
const execFileAsync = promisify(execFile);

export function validateLocalPlay({ env = process.env, nodeVersion = process.versions.node } = {}) {
  const major = Number(String(nodeVersion).split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    throw localPlayError('LOCAL_PLAY_NODE_UNSUPPORTED', 'Local play requires Node.js 22 or newer.');
  }
  const port = Number(env.RUS_SERVER_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw localPlayError('LOCAL_PLAY_PORT_INVALID', 'RUS_SERVER_PORT must be an integer from 1 to 65535.');
  }
  return Object.freeze({ port });
}

export function buildServerEnv({ env = process.env, worldUrl, partyUrl,
  pinManifestDigest, port, managedRuntime, git, releaseVersion = 16,
  approvalsPath }) {
  const childEnv = { ...env };
  delete childEnv.RUS_RUNTIME_BINDINGS_MODULE;
  delete childEnv.RUS_RUN_PARTY_MIGRATIONS;
  delete childEnv.RUS_GIT_HEAD;
  delete childEnv.RUS_GIT_BRANCH;
  delete childEnv.RUS_GIT_PR;
  delete childEnv.RUS_BUILD_ID;
  return {
    ...childEnv,
    RUS_RUNTIME_ROUTE: 'modular',
    RUS_CUTOVER_STAGE: '13',
    RUS_COMPOSITION_MODULE: 'builtin:production-spatial-v3',
    RUS_SPATIAL_V3_BINDINGS_MODULE: `builtin:${RELEASES[releaseVersion].releaseId}`,
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: pinManifestDigest,
    ...(releaseVersion === 17 ? {
      RUS_SPATIAL_V3_TARGET_ACTIVATION_APPROVALS_PATH: approvalsPath
    } : {}),
    RUS_WORLD_DATABASE_URL: worldUrl,
    RUS_PARTY_DATABASE_URL: partyUrl,
    RUS_DATABASE_SSL: 'false',
    RUS_SERVER_HOST: '127.0.0.1',
    RUS_SERVER_PORT: String(port),
    RUS_GIT_HEAD: git.head,
    ...(git.branch == null ? {} : { RUS_GIT_BRANCH: git.branch }),
    ...(git.pr == null ? {} : { RUS_GIT_PR: String(git.pr) }),
    RUS_TURN_DECISION_SECRET: 'novgorod1230-local-play-decision-secret-v1',
    RUS_WORLD_KNOWLEDGE_PYTHON: managedRuntime.giga.python,
    ...(managedRuntime.giga.modelPath
      ? { RUS_WORLD_KNOWLEDGE_MODEL_PATH: managedRuntime.giga.modelPath } : {}),
    ...(managedRuntime.giga.hfHome ? { HF_HOME: managedRuntime.giga.hfHome } : {}),
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1'
  };
}

export async function assertReadiness({ baseUrl, fetchImpl = fetch, sleep = delay, child,
  attempts = 480, releaseVersion = 16 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child?.exitCode != null) {
      throw localPlayError('LOCAL_PLAY_SERVER_EXITED', `Game server exited with code ${child.exitCode}.`);
    }
    try {
      const health = await readSuccess(fetchImpl, `${baseUrl}/api/v1/health`);
      assertHealth(health, releaseVersion);
      const scenarios = await readSuccess(fetchImpl, `${baseUrl}/api/v1/scenarios`);
      if (!Array.isArray(scenarios.scenarios)
        || !scenarios.scenarios.some((scenario) => scenario?.scenario_id === RELEASES[releaseVersion].scenarioId && scenario.available === true)) {
        throw localPlayError('LOCAL_PLAY_SCENARIO_UNAVAILABLE', `${RELEASES[releaseVersion].scenarioId} is not available.`);
      }
      return Object.freeze({ health, scenarios });
    } catch (error) {
      if (error?.code === 'LOCAL_PLAY_SCENARIO_UNAVAILABLE') throw error;
      lastError = error;
      if (attempt + 1 < attempts) await sleep(250);
    }
  }
  throw localPlayError('LOCAL_PLAY_READINESS_FAILED', `Game server did not become ready: ${lastError?.message ?? 'unknown error'}`);
}

export async function startLocalPlay({
  env = process.env,
  nodeVersion,
  ensurePostgres = ensureLocalPostgres,
  localPostgresSettings,
  setupProduction = installActivatedRuntimeCatalog,
  setupM3Development = installM3DevelopmentV14NewPartyRuntime,
  loadPin = loadActiveRuntimeCatalogPin,
  createPool = (options) => new pg.Pool(options),
  provisionRuntime = provisionManagedRuntime,
  spawnServer = defaultSpawnServer,
  fetchImpl = fetch,
  sleep = delay,
  isPortAvailable = portAvailable,
  readGit = localGitProvenance,
  log = console.log
} = {}) {
  const { port } = validateLocalPlay({ env, nodeVersion });
  let git;
  try { git = await readGit(); }
  catch (error) {
    if (error?.code === 'LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE') throw error;
    throw localPlayError('LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE',
      'Local Git provenance is unavailable.');
  }
  if (!/^[a-f0-9]{40}$/iu.test(String(git?.head ?? ''))
      || (git?.branch != null && !String(git.branch).trim())) {
    throw localPlayError('LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE',
      'Local Git provenance is unavailable.');
  }
  if (!(await isPortAvailable(port))) {
    throw localPlayError('LOCAL_PLAY_PORT_UNAVAILABLE', `Port ${port} is already in use.`);
  }
  const managedRuntime = await provisionRuntime({ repositoryRoot: ROOT,
    env, fetchImpl, log });
  let postgres;
  try { postgres = await ensurePostgres({ settings: localPostgresSettings }); }
  catch (error) { await managedRuntime.close(); throw error; }
  const worldPool = createPool({ connectionString: postgres.worldUrl, max: 1 });
  const partyPool = createPool({ connectionString: postgres.partyUrl, max: 1 });
  let pin;
  const releaseVersion = postgres.releaseVersion ?? 16;
  let runtimeCapabilities = LOCAL_PLAY_RUNTIME_CAPABILITIES_V1;
  const m3DevelopmentRequested = env.RUS_RUNTIME_SETUP ===
    'spatial-v3-m3-development-v14';
  try {
    try {
      if (releaseVersion === 17 && (postgres.state !== 'existing' || m3DevelopmentRequested)) {
        throw localPlayError('LOCAL_PLAY_V17_NOT_READY',
          'Local v17 requires completed bootstrap and cannot run v16 setup.');
      }
      if (releaseVersion === 16 && (postgres.state === 'fresh' || m3DevelopmentRequested)) {
        const setup = await (m3DevelopmentRequested
          ? setupM3Development : setupProduction)({ worldPool, partyPool,
          worldUrl: postgres.worldUrl, partyUrl: postgres.partyUrl,
          repositoryRoot: ROOT });
        runtimeCapabilities = setup.runtimeCapabilities;
      }
      pin = await loadPin(worldPool,
        SPATIAL_V3_PRODUCTION_RELEASE.runtime_catalog_scope);
    } finally { await Promise.all([worldPool.end(), partyPool.end()]); }
  } catch (error) {
    await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    throw error;
  }
  if (runtimeCapabilities?.schema !== LOCAL_PLAY_RUNTIME_CAPABILITIES_V1.schema) {
    await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    throw localPlayError('LOCAL_PLAY_CAPABILITY_CONTRACT_INVALID',
      'Production setup returned an invalid runtime capability contract.');
  }
  const pinManifestDigest = pin?.compatible_world_pin_manifest_digest;
  if (!/^[a-f0-9]{64}$/u.test(String(pinManifestDigest ?? ''))) {
    await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    throw localPlayError('LOCAL_PLAY_RUNTIME_PIN_INVALID', 'Active runtime catalog has no compatible pin manifest digest.');
  }
  if (pin.catalog_revision_id === 'procedural_scene_final_candidate_v1_001'
      && pin.activation_scope !== 'new_development_parties_only') {
    await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    throw localPlayError('LOCAL_PLAY_RUNTIME_PIN_INVALID',
      'Final procedural catalog is not development-scoped.');
  }
  const approvalsPath = releaseVersion === 17
    ? (env.RUS_SPATIAL_V3_TARGET_ACTIVATION_APPROVALS_PATH || localV17ApprovalsPath(env))
    : undefined;
  if (releaseVersion === 17) {
    try {
      const approvals = JSON.parse(await readFile(approvalsPath, 'utf8'));
      if (!approvals.itemApproval?.request || !approvals.itemApproval?.attestation
          || !approvals.actorApproval?.request || !approvals.actorApproval?.attestation)
        throw new Error('Incomplete activation approvals');
      if (approvals.itemApproval.request.compatible_world_pin_manifest_digest !== pinManifestDigest)
        throw new Error('Activation approvals do not match active pin');
    } catch (error) {
      await Promise.allSettled([managedRuntime.close(), postgres.close()]);
      throw localPlayError('LOCAL_PLAY_V17_APPROVALS_INVALID',
        `Local v17 activation approvals are missing or invalid: ${error.message}`);
    }
  }
  const child = spawnServer({ env: buildServerEnv({ env,
    worldUrl: postgres.worldUrl, partyUrl: postgres.partyUrl,
    pinManifestDigest, port, managedRuntime, git, releaseVersion, approvalsPath }) });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await assertReadiness({ baseUrl, fetchImpl, sleep, child, releaseVersion });
    await readSuccess(fetchImpl, `${baseUrl}/api/v1/llm-settings`);
  } catch (error) {
    child.kill?.('SIGTERM');
    await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    throw error;
  }
  log(`Local game ready: ${baseUrl}`);
  log(`Runtime capabilities: m2_runtime=${runtimeCapabilities.capabilities
    .m2_runtime.status}; m3_procedural_equipment=${runtimeCapabilities
    .capabilities.m3_procedural_equipment.status} (${runtimeCapabilities
    .capabilities.m3_procedural_equipment.code})`);
  let closed = false;
  return Object.freeze({ child, url: baseUrl, postgres, managedRuntime,
    runtimeCapabilities,
    async close(signal = 'SIGTERM') {
      if (closed) return; closed = true;
      if (child.exitCode == null) child.kill(signal);
      if (child.exitCode == null) await waitForExit(child, 10_000);
      if (child.exitCode == null) child.kill('SIGKILL');
      await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    } });
}

export async function localGitProvenance({ exec = execFileAsync } = {}) {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--verify', 'HEAD^{commit}'],
      { cwd: ROOT, windowsHide: true });
    const head = stdout.trim();
    if (!/^[a-f0-9]{40}$/iu.test(head)) throw new Error('invalid HEAD');
    let branch;
    try {
      branch = (await exec('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        { cwd: ROOT, windowsHide: true })).stdout.trim();
      if (!branch) throw new Error('invalid branch');
    } catch (error) {
      if (error?.code === 1) return { head, branch: null, pr: null };
      throw error;
    }
    const pr = await openPullRequest({ exec, branch, head });
    return { head, branch, pr };
  } catch {
    throw localPlayError('LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE',
      'Local Git provenance is unavailable.');
  }
}

async function openPullRequest({ exec, branch, head }) {
  const { stdout } = await exec('gh', ['pr', 'list', '--head', branch, '--state', 'open',
    '--json', 'number,headRefOid', '--limit', '1'], { cwd: ROOT, windowsHide: true });
  const records = JSON.parse(stdout);
  if (!Array.isArray(records) || records.length === 0) return null;
  const record = records[0];
  if (!Number.isSafeInteger(record?.number) || record.headRefOid !== head) {
    throw new Error('open PR does not match HEAD');
  }
  return record.number;
}

function assertHealth(health, releaseVersion) {
  const expected = {
    status: 'ok', release_id: RELEASES[releaseVersion].releaseId, activation: 'sole_owner',
    authoritative_reads: 'spatial_v3_only', authoritative_writes: 'spatial_v3_only',
    runtime_fallback: 'forbidden', production_activation: true,
    runtime_selectable_in_canonical_production: true
  };
  if (!health || Object.entries(expected).some(([key, value]) => health[key] !== value)) {
    throw localPlayError('LOCAL_PLAY_READINESS_INVALID', 'Game server health does not match active production release.');
  }
}

async function readSuccess(fetchImpl, url) {
  const response = await fetchImpl(url);
  const payload = await response.json();
  if (!response.ok || payload?.ok !== true || !payload.data || typeof payload.data !== 'object') {
    throw localPlayError('LOCAL_PLAY_READINESS_INVALID', 'Game server returned an invalid readiness envelope.');
  }
  return payload.data;
}

function defaultSpawnServer({ env }) {
  return spawn(process.execPath, ['apps/game-server/src/server.js'], { cwd: ROOT, env, stdio: 'inherit' });
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
