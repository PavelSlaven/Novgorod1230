import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
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
import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from '../../tools/runtime-catalog-activation/src/first-playable-v2-activation.js';
import {
  applyLowerDvinaBoundaryV3ActivationBundle,
  buildLowerDvinaBoundaryV3ActivationBundle
} from '../../tools/runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { buildLowerDvinaBoundaryV1ImportSql } from
  '../../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';
import { buildLowerDvinaV2ImportSql } from
  '../../tools/spatial-v3/lower-dvina-v2-importer.mjs';
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
      database: 'pr17_phase11_world'
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
      repositoryRoot
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
        webRoot: resolve(repositoryRoot, 'apps/game-web')
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
            webRoot: resolve(repositoryRoot, 'apps/game-web')
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

async function installActivatedRuntimeCatalog({
  worldPool,
  partyPool,
  worldUrl,
  repositoryRoot
}) {
  const lifecycle = spawnSync(
    process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, PR17_TEST_DATABASE_URL: worldUrl }
    }
  );
  assert.equal(lifecycle.status, 0, lifecycle.stderr);
  const lifecycleResult = JSON.parse(lifecycle.stdout);
  assert.equal(lifecycleResult.pass, true);
  for (const file of ['18.sql', '19.sql', '20.sql']) {
    await worldPool.query(await readFile(
      resolve(repositoryRoot, 'infra/world-base/schema', file),
      'utf8'
    ));
  }
  await worldPool.query(await buildLowerDvinaV2ImportSql({
    root: repositoryRoot
  }));
  const partyMigrations = (await readdir(resolve(
    repositoryRoot,
    'schemas/party-db'
  ))).filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
  const catalogIndex = partyMigrations.findIndex((file) =>
    file.startsWith('012_'));
  assert.equal(catalogIndex, 11);
  for (const file of partyMigrations.slice(0, catalogIndex)) {
    await partyPool.query(await readFile(
      resolve(repositoryRoot, 'schemas/party-db', file),
      'utf8'
    ));
  }
  await Promise.all([
    runWorldRuntimeCatalogMigration(worldPool),
    runPartyRuntimeCatalogMigration(partyPool)
  ]);
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }).trim();
  const v2Bundle = await buildFirstPlayableV2ActivationBundle({
    worldPool,
    partyPool,
    repositoryRoot,
    gitCommitSha: commitSha,
    authorizationRef: 'Phase 11 isolated production acceptance'
  });
  await applyFirstPlayableV2ActivationBundle({
    worldPool,
    partyPool,
    bundle: v2Bundle
  });
  await worldPool.query(await buildLowerDvinaBoundaryV1ImportSql({
    root: repositoryRoot
  }));
  const v3Bundle = await buildLowerDvinaBoundaryV3ActivationBundle({
    worldPool,
    partyPool,
    repositoryRoot,
    gitCommitSha: commitSha,
    authorizationRef: 'Phase 11 isolated production acceptance'
  });
  await applyLowerDvinaBoundaryV3ActivationBundle({
    worldPool,
    partyPool,
    bundle: v3Bundle
  });
  return Object.freeze({
    pinManifestDigest:
      v3Bundle.compatibility_manifest.compatible_world_pin_manifest_digest,
    v2Bundle,
    v3Bundle
  });
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
    ['world_operator', 'pr17_phase11_world'],
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (docker(['exec', name, 'pg_isready', '-U', user, '-d', database])
      .status === 0) return;
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
  return new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
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
