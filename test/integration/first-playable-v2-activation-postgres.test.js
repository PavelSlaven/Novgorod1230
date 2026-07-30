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
  applyLowerDvinaBoundaryV3ActivationBundle,
  buildLowerDvinaBoundaryV3ActivationBundle
} from '../../tools/runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  buildProductionCutoverPhaseEvent,
  deleteAuthorizedProductionParties,
  evaluateLowerDvinaV3ProductionCutover,
  recordProductionCutoverPhase
} from '../../tools/runtime-catalog-activation/src/lower-dvina-v3-production-cutover.js';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  buildLowerDvinaV2ImportSql
} from '../../tools/spatial-v3/lower-dvina-v2-importer.mjs';
import {
  buildLowerDvinaBoundaryV1ImportSql
} from '../../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';

const docker = (args, options = {}) => spawnSync('docker', args, {
  encoding: 'utf8',
  timeout: options.timeout ?? 90_000,
  input: options.input
});

test('approved Stage 3C rows activate for v2 and advance by CAS to the exact boundary v3 pin', async (t) => {
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
  for (const file of ['18.sql', '19.sql', '20.sql']) {
    await worldPool.query(await readFile(`infra/world-base/schema/${file}`, 'utf8'));
  }
  await worldPool.query(await buildLowerDvinaV2ImportSql());
  const partyMigrations = (await readdir('schemas/party-db'))
    .filter((file) => /^\d+.*\.sql$/u.test(file))
    .sort();
  const catalogMigrationIndex = partyMigrations.findIndex((file) =>
    file.startsWith('012_')
  );
  assert.equal(catalogMigrationIndex, 11);
  for (const file of partyMigrations.slice(0, catalogMigrationIndex)) {
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
  const obsoletePartyId = 'party:authorized-obsolete-v2';
  await seedObsoleteV2Party({
    partyPool,
    partyId: obsoletePartyId,
    pin
  });
  await worldPool.query(await readFile(
    'infra/operator-control/001_lower_dvina_v3_cutover_events.sql',
    'utf8'
  ));
  const cutoverRequest = {
    request_digest: 'f'.repeat(64),
    release_id: 'spatial-v3-production-v3',
    world_revision_id:
      'novgorod_spatial_v3_production_v3_candidate_001',
    world_catalog_digest:
      '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
    expected_previous_event_id: applied.activated.event_id,
    expected_party_ids: [obsoletePartyId],
    authorization_ref: 'integration test exact party cleanup',
    expected_party_database: 'first_playable_party',
    expected_party_principal: 'party_operator'
  };
  const preparedEvent = buildProductionCutoverPhaseEvent({
    request: cutoverRequest,
    phase: 'prepared'
  });
  assert.equal((await recordProductionCutoverPhase({
    worldPool,
    event: preparedEvent
  })).status, 'recorded');
  const cleanup = await deleteAuthorizedProductionParties({
    partyPool,
    expectedPartyIds: [obsoletePartyId]
  });
  assert.deepEqual(cleanup, {
    status: 'deleted',
    party_ids: [obsoletePartyId],
    deleted_party_count: 1,
    deleted_materialization_run_catalog_pin_count: 1,
    deleted_catalog_pin_count: 1,
    deleted_coverage_artifact_count: 0,
    remaining_party_count: 0
  });
  const persistedPhases = (await worldPool.query(
    `SELECT request_digest,phase,release_id,world_revision_id,
            world_catalog_digest,expected_previous_event_id,
            expected_party_ids,expected_party_set_digest,
            authorization_digest,party_database,party_principal,
            party_cleanup_result_digest,event_digest
       FROM operator_control.lower_dvina_v3_cutover_events
      ORDER BY phase`
  )).rows;
  const resumed = evaluateLowerDvinaV3ProductionCutover({
    world: {
      database: 'pr17_first_playable',
      active_event: {
        event_id: applied.activated.event_id,
        compatible_world_revision_id:
          pin.compatible_world_revision_id,
        compatible_world_catalog_digest:
          pin.compatible_world_catalog_digest
      },
      cutover_events: persistedPhases
    },
    party: {
      database: 'first_playable_party',
      parties: [],
      inflight_count: 0
    },
    expectedWorldDatabase: 'pr17_first_playable',
    expectedPartyDatabase: 'first_playable_party',
    expectedPreviousEventId: applied.activated.event_id,
    expectedPartyIds: [obsoletePartyId],
    requestDigest: cutoverRequest.request_digest,
    expectedPreparedEvent: preparedEvent
  });
  assert.equal(resumed.status, 'resume_after_cleanup');
  assert.equal(evaluateLowerDvinaV3ProductionCutover({
    ...resumed,
    world: resumed.world,
    party: resumed.party,
    expectedWorldDatabase: 'pr17_first_playable',
    expectedPartyDatabase: 'first_playable_party',
    expectedPreviousEventId: applied.activated.event_id,
    expectedPartyIds: [obsoletePartyId],
    requestDigest: 'e'.repeat(64),
    expectedPreparedEvent: buildProductionCutoverPhaseEvent({
      request: {
        ...cutoverRequest,
        request_digest: 'e'.repeat(64)
      },
      phase: 'prepared'
    })
  }).status, 'blocked');
  assert.equal((await recordProductionCutoverPhase({
    worldPool,
    event: buildProductionCutoverPhaseEvent({
      request: cutoverRequest,
      phase: 'party_cleanup_committed',
      partyCleanupResult: cleanup
    })
  })).status, 'recorded');
  await worldPool.query(await buildLowerDvinaBoundaryV1ImportSql());
  const v3Bundle = await buildLowerDvinaBoundaryV3ActivationBundle({
    worldPool,
    partyPool,
    repositoryRoot: process.cwd(),
    gitCommitSha: '0a196b3293cc8c87ea52ec55b7bc493b21b03d19',
    authorizationRef: 'lower-Dvina boundary PostgreSQL integration test'
  });
  assert.equal(
    v3Bundle.activation_request.expected_previous_event_id,
    applied.activated.event_id
  );
  const v3Applied = await applyLowerDvinaBoundaryV3ActivationBundle({
    worldPool,
    partyPool,
    bundle: v3Bundle
  });
  assert.equal(v3Applied.baseline.status, 'registered');
  assert.equal(v3Applied.imported.status, 'applied');
  assert.equal(v3Applied.activated.status, 'activated');
  const v3Pin = await loader.loadActivePin({
    catalogScope: 'item_container_materialization_v2'
  });
  assert.equal(
    v3Pin.compatible_world_revision_id,
    'novgorod_spatial_v3_production_v3_candidate_001'
  );
  assert.equal(
    v3Pin.compatible_world_catalog_digest,
    '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e'
  );
  for (const file of partyMigrations.slice(catalogMigrationIndex)) {
    await partyPool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal((await partyPool.query(
    'SELECT count(*)::int AS count FROM party_runtime.parties'
  )).rows[0].count, 0);
});

async function seedObsoleteV2Party({ partyPool, partyId, pin }) {
  await partyPool.query(
    `INSERT INTO party_runtime.parties
       (party_id,schema_version,world_revision_id,world_catalog_digest,
        materializer_version,rng_version,command_catalog_digest,
        profile_bundle_digest,status)
     VALUES ($1,3,$2,$3,'first-playable-materializer@1',
             'request-bound-sha256@1','commands','profiles','active')`,
    [
      partyId,
      pin.compatible_world_revision_id,
      pin.compatible_world_catalog_digest
    ]
  );
  await partyPool.query(
    `INSERT INTO party_runtime.party_materialization_runs
       (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,
        catalog_digest,materializer_version,rng_version,result_digest,
        idempotency_key,status)
     VALUES ($1,'run-obsolete','g4-obsolete','baseline','seed','input',$2,
             'first-playable-materializer@1','request-bound-sha256@1',
             'result','materialization:obsolete','committed')`,
    [partyId, pin.catalog_digest]
  );
  await partyPool.query(
    `INSERT INTO party_runtime.party_catalog_pins
       (party_id,catalog_scope,catalog_revision_id,catalog_digest,
        import_id,import_audit_digest,record_registry_digest,
        runtime_contract_digest,compatible_world_revision_id,
        compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,activation_event_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      partyId,
      pin.catalog_scope,
      pin.catalog_revision_id,
      pin.catalog_digest,
      pin.import_id,
      pin.import_audit_digest,
      pin.record_registry_digest,
      pin.runtime_contract_digest,
      pin.compatible_world_revision_id,
      pin.compatible_world_catalog_digest,
      pin.compatible_world_pin_manifest_digest,
      pin.activation_event_id
    ]
  );
  await partyPool.query(
    `INSERT INTO party_runtime.party_materialization_run_catalog_pins
       (party_id,run_id,catalog_scope,catalog_revision_id,catalog_digest,
        import_id,import_audit_digest,record_registry_digest,
        runtime_contract_digest,activation_event_id)
     VALUES ($1,'run-obsolete',$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      partyId,
      pin.catalog_scope,
      pin.catalog_revision_id,
      pin.catalog_digest,
      pin.import_id,
      pin.import_audit_digest,
      pin.record_registry_digest,
      pin.runtime_contract_digest,
      pin.activation_event_id
    ]
  );
}

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
