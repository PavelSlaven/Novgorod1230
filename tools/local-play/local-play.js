import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { loadActiveRuntimeCatalogPin } from
  '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import {
  SPATIAL_V3_PRODUCTION_RELEASE
} from '../../apps/game-server/src/composition/production-spatial-v3.js';
import {
  ensureLocalPostgres,
  localPlayError
} from './local-postgres.js';
import { provisionManagedRuntime } from './managed-runtime.js';
import { installActivatedRuntimeCatalog } from './production-setup.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RELEASE_ID = 'spatial-v3-production-v15';
const SCENARIO_ID = 'lower_dvina_trace_v1';

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
  pinManifestDigest, port, managedRuntime }) {
  const childEnv = { ...env };
  delete childEnv.RUS_RUNTIME_BINDINGS_MODULE;
  delete childEnv.RUS_RUN_PARTY_MIGRATIONS;
  return {
    ...childEnv,
    RUS_RUNTIME_ROUTE: 'modular',
    RUS_CUTOVER_STAGE: '13',
    RUS_COMPOSITION_MODULE: 'builtin:production-spatial-v3',
    RUS_SPATIAL_V3_BINDINGS_MODULE: 'builtin:spatial-v3-production-v15',
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: pinManifestDigest,
    RUS_WORLD_DATABASE_URL: worldUrl,
    RUS_PARTY_DATABASE_URL: partyUrl,
    RUS_DATABASE_SSL: 'false',
    RUS_SERVER_HOST: '127.0.0.1',
    RUS_SERVER_PORT: String(port),
    RUS_TURN_DECISION_SECRET: 'novgorod1230-local-play-decision-secret-v1',
    RUS_WORLD_KNOWLEDGE_PYTHON: managedRuntime.giga.python,
    ...(managedRuntime.giga.modelPath
      ? { RUS_WORLD_KNOWLEDGE_MODEL_PATH: managedRuntime.giga.modelPath } : {}),
    ...(managedRuntime.giga.hfHome ? { HF_HOME: managedRuntime.giga.hfHome } : {}),
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1',
    RUS_LOCAL_LLM_RUNTIME_STATUS: JSON.stringify(runtimeStatus(managedRuntime))
  };
}

export async function assertReadiness({ baseUrl, fetchImpl = fetch, sleep = delay, child, attempts = 120 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child?.exitCode != null) {
      throw localPlayError('LOCAL_PLAY_SERVER_EXITED', `Game server exited with code ${child.exitCode}.`);
    }
    try {
      const health = await readSuccess(fetchImpl, `${baseUrl}/api/v1/health`);
      assertHealth(health);
      const scenarios = await readSuccess(fetchImpl, `${baseUrl}/api/v1/scenarios`);
      if (!Array.isArray(scenarios.scenarios)
        || !scenarios.scenarios.some((scenario) => scenario?.scenario_id === SCENARIO_ID && scenario.available === true)) {
        throw localPlayError('LOCAL_PLAY_SCENARIO_UNAVAILABLE', `${SCENARIO_ID} is not available.`);
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
  loadPin = loadActiveRuntimeCatalogPin,
  createPool = (options) => new pg.Pool(options),
  provisionRuntime = provisionManagedRuntime,
  spawnServer = defaultSpawnServer,
  fetchImpl = fetch,
  sleep = delay,
  isPortAvailable = portAvailable,
  log = console.log
} = {}) {
  const { port } = validateLocalPlay({ env, nodeVersion });
  if (!(await isPortAvailable(port))) {
    throw localPlayError('LOCAL_PLAY_PORT_UNAVAILABLE', `Port ${port} is already in use.`);
  }
  const managedRuntime = await provisionRuntime({ repositoryRoot: ROOT,
    env, fetchImpl, log, startLlm: true });
  let postgres;
  try { postgres = await ensurePostgres({ settings: localPostgresSettings }); }
  catch (error) { await managedRuntime.close(); throw error; }
  const worldPool = createPool({ connectionString: postgres.worldUrl, max: 1 });
  const partyPool = createPool({ connectionString: postgres.partyUrl, max: 1 });
  let pin;
  try {
    try {
      if (postgres.state === 'fresh') await setupProduction({ worldPool,
        partyPool, worldUrl: postgres.worldUrl, repositoryRoot: ROOT });
      pin = await loadPin(worldPool,
        SPATIAL_V3_PRODUCTION_RELEASE.runtime_catalog_scope);
    } finally { await Promise.all([worldPool.end(), partyPool.end()]); }
  } catch (error) {
    await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    throw error;
  }
  const pinManifestDigest = pin?.compatible_world_pin_manifest_digest;
  if (!/^[a-f0-9]{64}$/u.test(String(pinManifestDigest ?? ''))) {
    await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    throw localPlayError('LOCAL_PLAY_RUNTIME_PIN_INVALID', 'Active runtime catalog has no compatible pin manifest digest.');
  }
  const child = spawnServer({ env: buildServerEnv({ env,
    worldUrl: postgres.worldUrl, partyUrl: postgres.partyUrl,
    pinManifestDigest, port, managedRuntime }) });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await assertReadiness({ baseUrl, fetchImpl, sleep, child });
    const settings = await readSuccess(fetchImpl,
      `${baseUrl}/api/v1/llm-settings`);
    if (managedRuntime.llm && settings.mode === 'local') {
      await applyManagedLocalProvider(fetchImpl, baseUrl);
    }
  } catch (error) {
    child.kill?.('SIGTERM');
    await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    throw error;
  }
  if (!managedRuntime.hardware.supported) {
    log(`Локальная Gemma недоступна: ${managedRuntime.hardware.reasons.join(' ')} Открой настройки LLM и выбери внешний OpenAI-compatible provider.`);
  }
  log(`Local game ready: ${baseUrl}`);
  let closed = false;
  return Object.freeze({ child, url: baseUrl, postgres, managedRuntime,
    async close(signal = 'SIGTERM') {
      if (closed) return; closed = true;
      if (child.exitCode == null) child.kill(signal);
      if (child.exitCode == null) await waitForExit(child, 10_000);
      if (child.exitCode == null) child.kill('SIGKILL');
      await Promise.allSettled([managedRuntime.close(), postgres.close()]);
    } });
}

function assertHealth(health) {
  const expected = {
    status: 'ok', release_id: RELEASE_ID, activation: 'sole_owner',
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

async function applyManagedLocalProvider(fetchImpl, baseUrl) {
  const response = await fetchImpl(`${baseUrl}/api/v1/llm-settings`, {
    method: 'PUT', headers: { 'content-type': 'application/json',
      accept: 'application/json' }, body: JSON.stringify({ mode: 'local' })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) throw localPlayError(
    'LOCAL_PLAY_PROVIDER_UNAVAILABLE',
    `Локальная Gemma не прошла readiness: ${payload?.error?.code ?? `HTTP ${response.status}`}.`);
}

function runtimeStatus(runtime) {
  return runtime.llm ? { ready: true, ...runtime.llm.identity }
    : { ready: false, reasons: runtime.hardware.reasons,
        hardware: runtime.hardware.facts };
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
