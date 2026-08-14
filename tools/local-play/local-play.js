import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

import pg from 'pg';

import {
  SPATIAL_V3_PRODUCTION_RELEASE,
  assertSpatialV3ProductionReadiness,
  assertSpatialV3WorldReleaseReadiness
} from '../../apps/game-server/src/composition/production-spatial-v3.js';
import {
  loadActiveRuntimeCatalogPin
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-production-readiness.js';
import {
  applyFreshLowerDvinaProductionSetup
} from '../../scripts/lower-dvina-first-playable-production-setup.mjs';
import {
  buildLocalServerEnv,
  prepareLocalDatabaseState,
  validateLocalPlayPrerequisites
} from './local-play-contracts.js';
import { ensureLocalPostgres } from './local-postgres.js';

export async function runLocalPlay({
  env = process.env,
  repositoryRoot = process.cwd(),
  dependencies = {},
  output = process.stdout
} = {}) {
  validateLocalPlayPrerequisites({
    env,
    nodeVersion: dependencies.nodeVersion ?? process.versions.node
  });
  const log = (message) => output.write(`${message}\n`);
  const postgres = await (dependencies.ensureLocalPostgres
    ?? ensureLocalPostgres)({
    ...(dependencies.docker ? { docker: dependencies.docker } : {}), log
  });
  const Pool = dependencies.Pool ?? pg.Pool;
  const worldPool = new Pool({ connectionString: postgres.worldUrl, max: 2 });
  const partyPool = new Pool({ connectionString: postgres.partyUrl, max: 2 });
  let prepared;
  try {
    const inventory = {
      world: await databaseInventory(worldPool),
      party: await databaseInventory(partyPool)
    };
    prepared = await prepareLocalDatabaseState({
      inventory,
      initializeFresh: () => {
        log('Preparing the production world and party databases...');
        return (dependencies.applyFreshSetup
          ?? applyFreshLowerDvinaProductionSetup)({
          worldPool,
          partyPool,
          worldUrl: postgres.worldUrl,
          repositoryRoot,
          gitCommitSha: gitHead(repositoryRoot, dependencies),
          authorizationRef: 'Novgorod1230 local play initial setup'
        });
      },
      loadCompatible: () => loadCompatiblePin({
        worldPool, partyPool, dependencies
      })
    });
  } finally {
    await Promise.all([worldPool.end(), partyPool.end()]);
  }
  log(prepared.mode === 'initialized'
    ? 'Local production databases are ready.'
    : 'Reusing compatible local production databases.');
  const serverPort = readServerPort(env.RUS_SERVER_PORT);
  const serverEnv = buildLocalServerEnv({
    env,
    worldUrl: postgres.worldUrl,
    partyUrl: postgres.partyUrl,
    pinManifestDigest:
      prepared.pin.compatible_world_pin_manifest_digest,
    serverPort
  });
  return runProductionServer({
    repositoryRoot,
    serverEnv,
    serverPort,
    output,
    dependencies
  });
}

async function loadCompatiblePin({ worldPool, partyPool, dependencies }) {
  const pin = await (dependencies.loadActivePin
    ?? loadActiveRuntimeCatalogPin)(
    worldPool, SPATIAL_V3_PRODUCTION_RELEASE.runtime_catalog_scope);
  const party = await (dependencies.assertPartyReadiness
    ?? assertSpatialV3ProductionReadiness)(partyPool, pin);
  await (dependencies.assertWorldReadiness
    ?? assertSpatialV3WorldReleaseReadiness)(
    worldPool, pin, party.historical_pins);
  return pin;
}

async function databaseInventory(pool) {
  const row = (await pool.query(
    `SELECT current_database() AS database,
       (SELECT count(*)::int FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog','information_schema'))
       AS user_table_count`
  )).rows[0];
  return Object.freeze({
    database: row.database,
    user_table_count: Number(row.user_table_count)
  });
}

function gitHead(root, dependencies) {
  if (typeof dependencies.gitHead === 'function') {
    return dependencies.gitHead(root);
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8'
  }).trim();
}

async function runProductionServer({
  repositoryRoot,
  serverEnv,
  serverPort,
  output,
  dependencies
}) {
  const spawnServer = dependencies.spawnServer ?? ((options) => spawn(
    process.execPath,
    ['apps/game-server/src/server.js'],
    { cwd: options.repositoryRoot, env: options.env, stdio: 'inherit' }
  ));
  const child = spawnServer({ repositoryRoot, env: serverEnv });
  const exit = once(child, 'exit');
  let stopping = false;
  const stop = () => {
    stopping = true;
    if (child.exitCode == null && child.signalCode == null) {
      child.kill('SIGTERM');
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const baseUrl = `http://127.0.0.1:${serverPort}`;
    await waitForReady({
      baseUrl,
      child,
      fetchImpl: dependencies.fetch ?? globalThis.fetch
    });
    if (typeof dependencies.onReady === 'function') {
      await dependencies.onReady(baseUrl);
    }
    output.write(`Game is ready: ${baseUrl}\n`);
    const [code, signal] = await exit;
    if (!stopping && code !== 0) {
      fail('LOCAL_PLAY_SERVER_EXITED',
        `Game server exited with ${code ?? signal}.`);
    }
    return Object.freeze({ code: code ?? 0, signal: signal ?? null });
  } catch (error) {
    stop();
    throw error;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

async function waitForReady({ baseUrl, child, fetchImpl }) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode != null || child.signalCode != null) {
      fail('LOCAL_PLAY_SERVER_START_FAILED',
        'Game server exited before it became ready.');
    }
    try {
      const [health, scenarios] = await Promise.all([
        fetchImpl(`${baseUrl}/api/v1/health`),
        fetchImpl(`${baseUrl}/api/v1/scenarios`)
      ]);
      if (health.ok && scenarios.ok) {
        const healthBody = await health.json();
        const scenarioBody = await scenarios.json();
        const ids = scenarioBody.data?.scenarios?.map(
          ({ scenario_id: id }) => id) ?? [];
        if (healthBody.data?.release_id === 'spatial-v3-production-v8'
            && ids.includes('lower_dvina_trace_v1')) return;
      }
    } catch {
      // Startup polling deliberately waits for the production HTTP boundary.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  fail('LOCAL_PLAY_SERVER_NOT_READY',
    'Game server did not become ready at the configured localhost URL.');
}

function readServerPort(value) {
  if (value == null || String(value).trim() === '') return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('LOCAL_PLAY_SERVER_PORT_INVALID', `Invalid RUS_SERVER_PORT: ${value}.`);
  }
  return port;
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
