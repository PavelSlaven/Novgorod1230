import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { createProductionLlmRoleRunner, probeLlmProvider } from
  '../../apps/game-server/src/infrastructure/provider/deepseek.js';
import { loadActiveRuntimeCatalogPin } from
  '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import {
  SPATIAL_V3_PRODUCTION_RELEASE
} from '../../apps/game-server/src/composition/production-spatial-v3.js';
import {
  assertDockerAvailable,
  ensureLocalPostgres,
  localPlayError
} from './local-postgres.js';
import { installActivatedRuntimeCatalog } from './production-setup.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RELEASE_ID = 'spatial-v3-production-v13';
const SCENARIO_ID = 'lower_dvina_trace_v1';

export function validateLocalPlay({ env = process.env, nodeVersion = process.versions.node } = {}) {
  const major = Number(String(nodeVersion).split('.')[0]);
  if (!Number.isInteger(major) || major < 22) {
    throw localPlayError('LOCAL_PLAY_NODE_UNSUPPORTED', 'Local play requires Node.js 22 or newer.');
  }
  if (!String(env.DEEPSEEK_API_KEY ?? '').trim()) {
    throw localPlayError('LOCAL_PLAY_PROVIDER_KEY_MISSING', 'DEEPSEEK_API_KEY is required.');
  }
  const port = Number(env.RUS_SERVER_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw localPlayError('LOCAL_PLAY_PORT_INVALID', 'RUS_SERVER_PORT must be an integer from 1 to 65535.');
  }
  return Object.freeze({ port });
}

export function buildServerEnv({ env = process.env, worldUrl, partyUrl, pinManifestDigest, port }) {
  const childEnv = { ...env };
  delete childEnv.RUS_RUNTIME_BINDINGS_MODULE;
  delete childEnv.RUS_RUN_PARTY_MIGRATIONS;
  return {
    ...childEnv,
    RUS_RUNTIME_ROUTE: 'modular',
    RUS_CUTOVER_STAGE: '13',
    RUS_COMPOSITION_MODULE: 'builtin:production-spatial-v3',
    RUS_SPATIAL_V3_BINDINGS_MODULE: 'builtin:spatial-v3-production-v13',
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: pinManifestDigest,
    RUS_WORLD_DATABASE_URL: worldUrl,
    RUS_PARTY_DATABASE_URL: partyUrl,
    RUS_DATABASE_SSL: 'false',
    RUS_SERVER_HOST: '127.0.0.1',
    RUS_SERVER_PORT: String(port),
    RUS_TURN_DECISION_SECRET: 'novgorod1230-local-play-decision-secret-v1'
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
  checkDocker = assertDockerAvailable,
  providerProbe = probeLlmProvider,
  spawnServer = defaultSpawnServer,
  fetchImpl = fetch,
  sleep = delay,
  isPortAvailable = portAvailable,
  log = console.log
} = {}) {
  const { port } = validateLocalPlay({ env, nodeVersion });
  checkDocker();
  if (!(await isPortAvailable(port))) {
    throw localPlayError('LOCAL_PLAY_PORT_UNAVAILABLE', `Port ${port} is already in use.`);
  }
  let provider;
  try {
    provider = await providerProbe(createProductionLlmRoleRunner({ env }));
  } catch (error) {
    throw providerPreflightError(error);
  }
  if (provider?.ok !== true) {
    throw localPlayError('LOCAL_PLAY_PROVIDER_UNAVAILABLE', 'DeepSeek provider preflight failed.');
  }
  const postgres = await ensurePostgres({ settings: localPostgresSettings });
  const worldPool = createPool({ connectionString: postgres.worldUrl, max: 1 });
  const partyPool = createPool({ connectionString: postgres.partyUrl, max: 1 });
  let pin;
  try {
    if (postgres.state === 'fresh') {
      await setupProduction({ worldPool, partyPool, worldUrl: postgres.worldUrl, repositoryRoot: ROOT });
    }
    pin = await loadPin(worldPool, SPATIAL_V3_PRODUCTION_RELEASE.runtime_catalog_scope);
  } finally {
    await Promise.all([worldPool.end(), partyPool.end()]);
  }
  const pinManifestDigest = pin?.compatible_world_pin_manifest_digest;
  if (!/^[a-f0-9]{64}$/u.test(String(pinManifestDigest ?? ''))) {
    throw localPlayError('LOCAL_PLAY_RUNTIME_PIN_INVALID', 'Active runtime catalog has no compatible pin manifest digest.');
  }
  const child = spawnServer({ env: buildServerEnv({ env, worldUrl: postgres.worldUrl, partyUrl: postgres.partyUrl, pinManifestDigest, port }) });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await assertReadiness({ baseUrl, fetchImpl, sleep, child });
  } catch (error) {
    child.kill?.('SIGTERM');
    throw error;
  }
  log(`Local game ready: ${baseUrl}`);
  return Object.freeze({ child, url: baseUrl, postgres });
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

function providerPreflightError(error) {
  if (error?.code === 'http_401' || error?.code === 'http_403') {
    return localPlayError('LOCAL_PLAY_PROVIDER_UNAUTHORIZED',
      'DeepSeek provider authentication failed.');
  }
  if (error?.code === 'timeout') {
    return localPlayError('LOCAL_PLAY_PROVIDER_TIMEOUT',
      'DeepSeek provider preflight timed out.');
  }
  return localPlayError('LOCAL_PLAY_PROVIDER_UNAVAILABLE',
    'DeepSeek provider preflight failed.');
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

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
