import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import pg from 'pg';
import { createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import {
  RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
} from '@rus/runtime-catalog/runtime-contract';
import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from '../../tools/runtime-catalog-activation/src/first-playable-v2-activation.js';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  buildLowerDvinaV2ImportSql
} from '../../tools/spatial-v3/lower-dvina-v2-importer.mjs';

const docker = (args, options = {}) => spawnSync('docker', args, {
  encoding: 'utf8',
  timeout: options.timeout ?? 90_000,
  input: options.input
});

test('approved Stage 3C rows activate as the exact first-playable domain pin', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required');
    return;
  }
  const suffix = randomUUID().slice(0, 12);
  const worldContainer = `first-playable-world-${suffix}`;
  const partyContainer = `first-playable-party-${suffix}`;
  let worldPool;
  let partyPool;
  t.after(async () => {
    await Promise.all([
      worldPool?.end(),
      partyPool?.end()
    ]);
    docker(['rm', '-f', worldContainer]);
    docker(['rm', '-f', partyContainer]);
  });
  const world = startPostgres({
    name: worldContainer,
    user: 'world_operator',
    database: 'pr17_first_playable'
  });
  const party = startPostgres({
    name: partyContainer,
    user: 'party_operator',
    database: 'first_playable_party'
  });
  assert.equal(world.status, 0, world.stderr);
  assert.equal(party.status, 0, party.stderr);
  await Promise.all([
    waitForPostgres(worldContainer, 'world_operator', 'pr17_first_playable'),
    waitForPostgres(partyContainer, 'party_operator', 'first_playable_party')
  ]);
  const worldPort = publishedPort(worldContainer);
  const partyPort = publishedPort(partyContainer);
  const worldUrl =
    `postgresql://world_operator:local_only@127.0.0.1:${worldPort}`
      + '/pr17_first_playable';
  const partyUrl =
    `postgresql://party_operator:local_only@127.0.0.1:${partyPort}`
      + '/first_playable_party';

  const promoted = spawnSync(
    process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, PR17_TEST_DATABASE_URL: worldUrl }
    }
  );
  assert.equal(promoted.status, 0, promoted.stderr);
  const promotionResult = JSON.parse(promoted.stdout);
  assert.equal(promotionResult.pass, true);
  assert.equal(promotionResult.applied, true);
  assert.equal(promotionResult.activation_performed, false);

  worldPool = new pg.Pool({ connectionString: worldUrl, max: 2 });
  partyPool = new pg.Pool({ connectionString: partyUrl, max: 2 });
  for (const file of ['18.sql', '19.sql']) {
    await worldPool.query(await readFile(`infra/world-base/schema/${file}`, 'utf8'));
  }
  await worldPool.query(await buildLowerDvinaV2ImportSql());
  const partyMigrations = (await readdir('schemas/party-db'))
    .filter((file) => /^\d+.*\.sql$/u.test(file))
    .sort();
  for (const file of partyMigrations) {
    await partyPool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal((await runWorldRuntimeCatalogMigration(worldPool)).status, 'applied');
  assert.equal((await runPartyRuntimeCatalogMigration(partyPool)).status, 'applied');

  const bundle = await buildFirstPlayableV2ActivationBundle({
    worldPool,
    partyPool,
    repositoryRoot: process.cwd(),
    gitCommitSha: 'd4be6a6014b80ceae937b3900dad6cbe7c1e787d',
    authorizationRef: 'first-playable PostgreSQL integration test'
  });
  assert.equal(bundle.equivalence_report.insert_count, 0);
  assert.ok(bundle.equivalence_report.assert_existing_count > 0);
  assert.equal(bundle.equivalence_report.dependency_assertion_count, 9);
  const applied = await applyFirstPlayableV2ActivationBundle({
    worldPool,
    partyPool,
    bundle
  });
  assert.equal(applied.baseline.status, 'registered');
  assert.equal(applied.imported.status, 'applied');
  assert.equal(applied.activated.status, 'activated');
  const repeated = await applyFirstPlayableV2ActivationBundle({
    worldPool,
    partyPool,
    bundle
  });
  assert.equal(repeated.baseline.status, 'already_registered');
  assert.equal(repeated.imported.status, 'already_applied');
  assert.equal(repeated.activated.status, 'already_active');

  const loader = createRuntimeCatalogLoader({
    worldBaseReader: {
      read: (sql, parameters) => worldPool.query(sql, parameters)
    },
    supportedRuntimeContractDigests: [
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
    ]
  });
  const pin = await loader.loadActivePin({
    catalogScope: 'item_container_materialization_v2'
  });
  const catalog = await loader.loadApprovedItemCatalog({ pin });
  assert.equal(catalog.verified, true);
  assert.equal(pin.compatible_world_revision_id,
    'novgorod_spatial_v3_production_v2_candidate_001');
  assert.equal(pin.runtime_contract_digest,
    RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST);
  assert.equal((await partyPool.query(
    'SELECT count(*)::int AS count FROM party_runtime.parties'
  )).rows[0].count, 0);
});

function startPostgres({ name, user, database }) {
  return docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', `POSTGRES_USER=${user}`,
    '-e', `POSTGRES_DB=${database}`,
    'postgres:16-alpine'
  ]);
}

async function waitForPostgres(name, user, database) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (docker(['exec', name, 'pg_isready', '-U', user, '-d', database]).status
        === 0) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      if (docker(['exec', name, 'pg_isready', '-U', user, '-d', database]).status
          === 0) return;
    }
  }
  assert.fail(`${name} did not become ready`);
}

function publishedPort(name) {
  const output = docker(['port', name, '5432']).stdout;
  const port = Number(output.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));
  return port;
}
