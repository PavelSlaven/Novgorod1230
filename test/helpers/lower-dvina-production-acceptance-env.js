import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import pg from 'pg';
import { createSeededRandomSource } from '@rus/checks-rng';
import { canonicalDigest } from '@rus/materialization';

import { createSpatialV3ProductionCompositionRoot } from
  '../../apps/game-server/src/composition/production-spatial-v3.js';
import { createStaticAssetResolver } from
  '../../apps/game-server/src/http/static-assets.js';
import { createGameHttpServer, listen } from
  '../../apps/game-server/src/http/server.js';
import { installActivatedRuntimeCatalog } from
  '../../tools/local-play/production-setup.js';
import { startLocalLlmProviderFixture } from
  './local-llm-provider-fixture.js';

const POSTGRES_IMAGE = 'postgres:16-alpine';

export async function startLowerDvinaProductionAcceptanceEnv({
  llmRespond,
  repositoryRoot = process.cwd()
} = {}) {
  assert.equal(docker(['version']).status, 0, 'Docker is required.');
  const suffix = randomUUID().slice(0, 12);
  const postgresContainer = `phase11-postgres-${suffix}`;
  const llm = await startLocalLlmProviderFixture({ respond: llmRespond });
  let root = null;
  let server = null;
  let worldPool = null;
  let partyPool = null;
  try {
    startPostgres(postgresContainer);
    await waitForPostgres(postgresContainer, 'postgres', 'postgres');
    initializeAcceptanceDatabases(postgresContainer);
    const worldUrl = databaseUrl({
      container: postgresContainer,
      user: 'world_operator',
      database: 'novgorod_world'
    });
    const partyUrl = databaseUrl({
      container: postgresContainer,
      user: 'party_operator',
      database: 'phase11_party'
    });
    worldPool = new pg.Pool({ connectionString: worldUrl, max: 4 });
    partyPool = new pg.Pool({ connectionString: partyUrl, max: 8 });
    const activation = await installActivatedRuntimeCatalog({
      worldPool,
      partyPool,
      worldUrl,
      repositoryRoot,
      authorizationRef: 'Phase 11 isolated production acceptance'
    });
    const env = {
      ...process.env,
      ...llm.env,
      RUS_PARTY_DATABASE_URL: partyUrl,
      RUS_WORLD_DATABASE_URL: worldUrl,
      RUS_TURN_DECISION_SECRET: 'phase-11-local-only-decision-secret',
      RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST:
        activation.pinManifestDigest
    };
    const identityFactory = createAcceptanceIdentityFactory();
    root = await createSpatialV3ProductionCompositionRoot({
      env,
      config: {
        runtimeCatalogPinManifestDigest: activation.pinManifestDigest,
        idFactory: identityFactory.next
      },
      pools: {
        worldPool,
        partyPool,
        close: async () => Promise.all([worldPool.end(), partyPool.end()])
      }
    });
    server = createGameHttpServer({
      root,
      staticAssets: createStaticAssetResolver({
        webRoot: resolve(repositoryRoot, 'apps/game-web'),
        contractsRoot: resolve(repositoryRoot, 'packages/contracts/src')
      }),
      maxBodyBytes: 1024 * 1024,
      developerMode: true
    });
    const address = await listen(server, { host: '127.0.0.1', port: 0 });
    const httpPort = address.port;
    const baseUrl = `http://127.0.0.1:${httpPort}`;
    return Object.freeze({
      get root() { return root; },
      get server() { return server; },
      get worldPool() { return worldPool; },
      get partyPool() { return partyPool; },
      llm,
      env,
      worldUrl,
      partyUrl,
      get baseUrl() { return baseUrl; },
      activation,
      requestIdentity: identityFactory.requestIdentity,
      async restartRoot() {
        await closeServer(server);
        await root.close();
        worldPool = new pg.Pool({ connectionString: worldUrl, max: 4 });
        partyPool = new pg.Pool({ connectionString: partyUrl, max: 8 });
        root = await createSpatialV3ProductionCompositionRoot({
          env,
          config: {
            runtimeCatalogPinManifestDigest: activation.pinManifestDigest,
            idFactory: identityFactory.next
          },
          pools: {
            worldPool,
            partyPool,
            close: async () => Promise.all([
              worldPool.end(), partyPool.end()
            ])
          }
        });
        server = createGameHttpServer({
          root,
          staticAssets: createStaticAssetResolver({
            webRoot: resolve(repositoryRoot, 'apps/game-web'),
            contractsRoot: resolve(repositoryRoot, 'packages/contracts/src')
          }),
          maxBodyBytes: 1024 * 1024,
          developerMode: true
        });
        const restartedAddress = await listen(server, {
          host: '127.0.0.1', port: httpPort
        });
        assert.equal(restartedAddress.port, httpPort);
        return root;
      },
      async close() {
        await closeServer(server);
        await root?.close().catch(() => {});
        await llm.close().catch(() => {});
        docker(['rm', '-f', postgresContainer]);
      }
    });
  } catch (error) {
    await closeServer(server);
    await root?.close().catch(() => {});
    await Promise.all([
      worldPool?.end().catch(() => {}),
      partyPool?.end().catch(() => {}),
      llm.close().catch(() => {})
    ]);
    docker(['rm', '-f', postgresContainer]);
    throw error;
  }
}

function startPostgres(name) {
  const result = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    POSTGRES_IMAGE
  ], { timeout: 90_000 });
  assert.equal(result.status, 0, result.stderr);
}

function initializeAcceptanceDatabases(container) {
  for (const [user, database] of [
    ['world_operator', 'novgorod_world'],
    ['party_operator', 'phase11_party']
  ]) {
    const role = docker([
      'exec', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres',
      '-d', 'postgres', '-c',
      `CREATE ROLE ${user} LOGIN SUPERUSER PASSWORD 'local_only'`
    ]);
    assert.equal(role.status, 0, role.stderr);
    const created = docker([
      'exec', container, 'createdb', '-U', 'postgres', '-O', user, database
    ]);
    assert.equal(created.status, 0, created.stderr);
  }
}

async function waitForPostgres(name, user, database) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const logs = docker(['logs', name]);
    const initialized = `${logs.stdout}\n${logs.stderr}`.includes(
      'PostgreSQL init process complete; ready for start up.');
    if (initialized && docker(
      ['exec', name, 'pg_isready', '-U', user, '-d', database]
    ).status === 0) return;
  }
  throw new Error(`${name} did not become ready.`);
}

function databaseUrl({ container, user, database }) {
  const output = docker(['port', container, '5432']).stdout;
  const port = Number(output.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));
  return `postgresql://${user}:local_only@127.0.0.1:${port}/${database}`;
}

function docker(args, options = {}) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 30_000
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const fallback = setTimeout(resolve, 1_000);
    server.close((error) => {
      clearTimeout(fallback);
      if (error) reject(error); else resolve();
    });
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}

function createAcceptanceIdentityFactory() {
  let ordinal = 0;
  const next = () => `phase11-runtime-${++ordinal}`;
  return Object.freeze({
    next,
    requestIdentity(partyId, label) {
      const requiredRolls = /combat|flight/u.test(label) ? 6 : 1;
      const minimumRoll = /combat/u.test(label) ? 0.8 : 0.75;
      for (let attempt = 0; attempt < 100_000; attempt += 1) {
        const requestId = `phase11-${label}-${attempt}`;
        const seed = canonicalDigest({
          schema: 'rus.lower_dvina_trace_phase_2_rng_identity.v1',
          party_id: partyId,
          request_id: requestId,
          idempotency_key: requestId
        });
        const random = createSeededRandomSource(seed);
        if (Array.from({ length: requiredRolls }, () => random.next())
          .every((value) => value >= minimumRoll)) {
          return Object.freeze({
            request_id: requestId,
            idempotency_key: requestId
          });
        }
      }
      throw new Error(`Unable to select acceptance identity for ${label}.`);
    }
  });
}
