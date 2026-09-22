import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import pg from 'pg';
import { runSpatialV3M3DevelopmentV14Activation } from
  '../../scripts/run-spatial-v3-m3-development-v14-activation.mjs';
import {
  activateSpatialV3M3DevelopmentV14,
  validateSpatialV3M3DevelopmentV14Result
} from '../../tools/runtime-catalog-activation/src/spatial-v3-m3-development-v14-activation.js';
import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from '../../tools/runtime-catalog-activation/src/first-playable-v2-activation.js';
import { SPATIAL_V3_M3_DEVELOPMENT_V14_RELEASE as RELEASE } from
  '../../tools/runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import { runPartyRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { createPostgresTestBackend } from
  '../fixtures/postgres-test-backend.js';
import { installLowerDvinaTraceV6World } from
  '../fixtures/lower-dvina-trace-v5-world-fixture.js';

test('approved M3 v14 activates atomically and survives exact replay',
  async (t) => {
    const backend = await createPostgresTestBackend('pr17_m3_v14_activation');
    if (!backend) return t.skip('No supported PostgreSQL test backend');
    let pool = poolFor(backend.worldUrl);
    t.after(async () => {
      await pool?.end();
      await backend.close();
    });
    await installPartyRuntime(pool);
    const managedParty = poolFor(backend.partyUrl);
    await installPartyRuntime(managedParty);
    await managedParty.end();
    await installLowerDvinaTraceV6World(pool);
    const before = await outOfScopeCounts(pool);

    const rejectedBundle = structuredClone(
      await buildFirstPlayableV2ActivationBundle({ worldPool: pool,
        partyPool: pool, repositoryRoot: process.cwd(),
        gitCommitSha: '9b9749f63b0b98fb5246714976b8892c87ff8bb1',
        authorizationRef: 'integration-test-only-rejected-envelope',
        release: RELEASE })
    );
    rejectedBundle.activation_attestation.decision = 'reject_activation';
    await assert.rejects(() => applyFirstPlayableV2ActivationBundle({
      worldPool: pool, partyPool: pool, bundle: rejectedBundle,
      release: RELEASE, activationScope: 'new_development_parties_only',
      transactional: true
    }), { code: 'ATTESTATION_MISMATCH' });
    assert.equal(await count(pool, 'world_base.catalog_baseline_registrations',
      'parent_revision_id', RELEASE.baselineRevision), 0);
    assert.equal(await count(pool, 'world_base.domain_catalog_revisions',
      'catalog_revision_id', RELEASE.domainRevision), 0);

    const first = await runSpatialV3M3DevelopmentV14Activation({
      databaseUrl: backend.worldUrl, partyDatabaseUrl: backend.worldUrl,
      resultPath: process.env.SPATIAL_V3_M3_ACTIVATION_RESULT_PATH ?? null
    });
    assert.equal(first.status,
      'activated_exact_postgresql_readback_verified');
    assert.equal(first.release_id, RELEASE.releaseId);
    assert.equal(first.world_schema_target_fingerprint,
      RELEASE.worldSchemaFingerprint);
    assert.equal(first.compatible_world.world_manifest_sha256,
      RELEASE.worldManifestSha256);
    assert.equal(first.new_development_party_activation_authorized, true);
    for (const field of ['production_authorized',
      'default_runtime_cutover_authorized',
      'existing_party_migration_authorized',
      'old_save_rematerialization_authorized',
      'runtime_item_creation_authorized',
      'functional_allocation_runtime_selection_authorized',
      'equipment_allocation_activation_authorized',
      'actor_world_owner_migration_execution_authorized',
      'actor_party_pin_migration_execution_authorized',
      'actor_base_attributes_runtime_activation_execution_authorized',
      'party_pin_writes_authorized', 'gameplay_writes_authorized',
      'broader_m3_attested']) assert.equal(first[field], false, field);
    assert.equal(await validateSpatialV3M3DevelopmentV14Result({
      worldPool: pool, repositoryRoot: process.cwd(), result: first }), true);
    assert.deepEqual(await outOfScopeCounts(pool), before);

    const repeated = await activateSpatialV3M3DevelopmentV14({ worldPool: pool,
      partyPool: pool, repositoryRoot: process.cwd() });
    assert.deepEqual(repeated, first);
    assert.equal(await count(pool,
      'world_base.runtime_catalog_activation_events',
      'catalog_revision_id', RELEASE.domainRevision), 1);
    const newSameTarget = await buildFirstPlayableV2ActivationBundle({
      worldPool: pool, partyPool: pool, repositoryRoot: process.cwd(),
      gitCommitSha: '9b9749f63b0b98fb5246714976b8892c87ff8bb1',
      authorizationRef: 'integration-test-only-new-same-target-request',
      release: RELEASE
    });
    assert.equal(newSameTarget.activation_request.expected_previous_event_id,
      first.event_id);
    assert.notEqual(newSameTarget.activation_request.activation_request_digest,
      first.request_digest);

    await pool.end();
    pool = null;
    if (backend.supportsServerRestart) await backend.restart();
    else await assert.rejects(() => backend.restart(), {
      code: 'POSTGRES_SERVER_RESTART_UNSUPPORTED'
    });
    pool = poolFor(backend.worldUrl);
    const afterRestart = await activateSpatialV3M3DevelopmentV14({
      worldPool: pool, partyPool: pool, repositoryRoot: process.cwd() });
    assert.deepEqual(afterRestart, first);

    await pool.query(`ALTER TABLE world_base.runtime_catalog_activation_events
      DISABLE TRIGGER runtime_catalog_activation_events_append_only`);
    await pool.query(`UPDATE world_base.runtime_catalog_activation_events
      SET compatible_world_pin_manifest_digest=$1
      WHERE catalog_revision_id=$2`, ['f'.repeat(64), RELEASE.domainRevision]);
    await pool.query(`ALTER TABLE world_base.runtime_catalog_activation_events
      ENABLE TRIGGER runtime_catalog_activation_events_append_only`);
    const countsBeforeCollision = await ledgerCounts(pool);
    await assert.rejects(() => activateSpatialV3M3DevelopmentV14({
      worldPool: pool, partyPool: pool, repositoryRoot: process.cwd()
    }), { code: 'ACTIVATION_EVENT_COLLISION' });
    assert.deepEqual(await ledgerCounts(pool), countsBeforeCollision);
    assert.deepEqual(await outOfScopeCounts(pool), before);
  });

async function installPartyRuntime(pool) {
  const files = (await readdir('schemas/party-db'))
    .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
  const migrationIndex = files.findIndex((file) => file.startsWith('012_'));
  for (const file of files.slice(0, migrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  await runPartyRuntimeCatalogMigration(pool);
}

async function outOfScopeCounts(pool) {
  const row = (await pool.query(`SELECT
    (SELECT count(*)::int FROM party_runtime.parties) AS parties,
    (SELECT count(*)::int FROM party_runtime.party_catalog_pins) AS pins,
    (SELECT count(*)::int FROM party_runtime.commit_idempotency) AS commits,
    (SELECT count(*)::int FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope='actor_base_attributes_v1') AS actor_events`)).rows[0];
  return row;
}

async function ledgerCounts(pool) {
  return (await pool.query(`SELECT
    (SELECT count(*)::int FROM world_base.catalog_baseline_registrations)
      AS baselines,
    (SELECT count(*)::int FROM world_base.domain_catalog_revisions)
      AS revisions,
    (SELECT count(*)::int FROM world_base.catalog_imports) AS imports,
    (SELECT count(*)::int FROM world_base.runtime_catalog_activation_events)
      AS events`)).rows[0];
}

async function count(pool, table, column, value) {
  return Number((await pool.query(
    `SELECT count(*) AS count FROM ${table} WHERE ${column}=$1`, [value]
  )).rows[0].count);
}

function poolFor(databaseUrl) {
  const url = new URL(databaseUrl);
  return new pg.Pool({ host: url.hostname, port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: url.pathname.slice(1),
    max: 3 });
}
