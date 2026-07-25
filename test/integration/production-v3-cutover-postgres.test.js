import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import {
  loadConfiguredComposition
} from '../../apps/game-server/src/runtime/load-composition.js';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  RUNTIME_CATALOG_ACTIVATION_LOCK_KEY
} from '@rus/runtime-catalog/runtime-contract';

const hasDatabase =
  Boolean(process.env.PARTY_DATABASE_URL)
  && Boolean(process.env.WORLD_DATABASE_URL);

test(
  'activated v3 composition starts against isolated PostgreSQL with sole-owner release identity',
  { skip: !hasDatabase },
  async (context) => {
    const worldPool = new pg.Pool({
      connectionString: process.env.WORLD_DATABASE_URL
    });
    const partyPool = new pg.Pool({
      connectionString: process.env.PARTY_DATABASE_URL
    });
    context.after(async () => {
      await Promise.all([worldPool.end(), partyPool.end()]);
    });
    const worldFiles = (
      await readdir(new URL('../../infra/world-base/schema/', import.meta.url))
    ).filter((file) => file.endsWith('.sql')).sort();
    for (const file of worldFiles) {
      await worldPool.query(await readFile(
        new URL(`../../infra/world-base/schema/${file}`, import.meta.url),
        'utf8'
      ));
    }
    await partyPool.query(await readFile(
      new URL('../../schemas/party-db/001_party_runtime.sql', import.meta.url),
      'utf8'
    ));
    await Promise.all([
      runWorldRuntimeCatalogMigration(worldPool),
      runPartyRuntimeCatalogMigration(partyPool)
    ]);
    await seedExactReleasePins(worldPool);

    const compositionOptions = {
      env: {
        ...process.env,
        RUS_PARTY_DATABASE_URL: process.env.PARTY_DATABASE_URL,
        RUS_WORLD_DATABASE_URL: process.env.WORLD_DATABASE_URL,
        RUS_SPATIAL_V3_BINDINGS_MODULE:
          './test/fixtures/runtime-bindings/spatial-v3-production-bindings.js',
        RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST:
          'e'.repeat(64)
      },
      config: {
        spatialV3BindingsModule:
          './test/fixtures/runtime-bindings/spatial-v3-production-bindings.js',
        runtimeCatalogPinManifestDigest: 'e'.repeat(64)
      }
    };
    let signalPartyCommit;
    let allowPartyCommit;
    const partyCommitReached = new Promise((resolve) => {
      signalPartyCommit = resolve;
    });
    const partyCommitGate = new Promise((resolve) => {
      allowPartyCommit = resolve;
    });
    const blockingPartyPool = createCommitBlockingPool(
      partyPool,
      async () => {
        signalPartyCommit();
        await partyCommitGate;
      }
    );
    const rootPromise = loadConfiguredComposition(
      'builtin:production-spatial-v3',
      {
        ...compositionOptions,
        pools: {
          worldPool,
          partyPool: blockingPartyPool,
          close: async () => {}
        }
      }
    );
    await partyCommitReached;
    const activationWriter = await worldPool.connect();
    await activationWriter.query('BEGIN');
    const blockedLock = await activationWriter.query(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
      [RUNTIME_CATALOG_ACTIVATION_LOCK_KEY]
    );
    assert.equal(blockedLock.rows[0].acquired, false);
    allowPartyCommit();
    const root = await rootPromise;
    const releasedLock = await activationWriter.query(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
      [RUNTIME_CATALOG_ACTIVATION_LOCK_KEY]
    );
    assert.equal(releasedLock.rows[0].acquired, true);
    await activationWriter.query('ROLLBACK');
    activationWriter.release();
    context.after(() => root.close());

    const health = root.health();
    assert.equal(root.status, 'production_sole_owner');
    assert.equal(health.status, 'ok');
    assert.equal(health.release_id, 'spatial-v3-production-v1');
    assert.equal(health.composition, 'spatial_v3_production');
    assert.equal(health.activation, 'sole_owner');
    assert.equal(health.authoritative_reads, 'spatial_v3_only');
    assert.equal(health.authoritative_writes, 'spatial_v3_only');
    assert.equal(health.runtime_fallback, 'forbidden');
    assert.equal(health.rollback_source_release_id, 'production-v2');
    assert.equal(health.rollback_runtime_selectable, false);
    assert.equal(health.temporal_contract_id, 'temporal-world-v1.1');
    assert.equal(
      health.world_revision_id,
      'novgorod_spatial_v3_target_contract_approval_001'
    );
    assert.match(health.world_catalog_manifest_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(health.dependency_pin_mode, 'exact_only');
    assert.equal(
      health.runtime_catalog_pin_schema,
      'rus.runtime_catalog_pin.v2'
    );
    assert.equal(
      health.runtime_catalog_resolution,
      'active_for_new_party_persisted_for_existing_party'
    );
    assert.equal(health.party_schema_version, 'party_runtime_v3_target');
    assert.equal(health.migration_count, 10);
    assert.match(health.migration_chain_digest, /^[a-f0-9]{64}$/u);
    assert.equal(
      health.runtime_catalog_pin.activation_event_id,
      'cutover-runtime-activation-v1'
    );
    assert.deepEqual(health.world_readiness, {
      status: 'ready',
      world_revision_id:
        'novgorod_spatial_v3_target_contract_approval_001',
      runtime_catalog_activation_event_id:
        'cutover-runtime-activation-v1',
      historical_activation_count: 0
    });
    assert.deepEqual(health.migration_readiness, {
      party_count: 0,
      incompatible_party_count: 0,
      historical_pin_count: 0,
      status: 'ready'
    });

    await partyPool.query(
      `INSERT INTO party_runtime.parties
         (party_id,schema_version,world_revision_id,world_catalog_digest,
          materializer_version,rng_version,command_catalog_digest,
          profile_bundle_digest)
       VALUES
         ('persisted-historical-party',3,$1,$2,'materializer-v3','rng-v1',
          'commands-v1','profiles-v1')`,
      [
        'novgorod_spatial_v3_target_contract_approval_001',
        '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e'
      ]
    );
    await partyPool.query(
      `INSERT INTO party_runtime.party_catalog_pins
         (party_id,catalog_scope,catalog_revision_id,catalog_digest,
          import_id,import_audit_digest,record_registry_digest,
          runtime_contract_digest,compatible_world_revision_id,
          compatible_world_catalog_digest,
          compatible_world_pin_manifest_digest,activation_event_id)
       VALUES
         ('persisted-historical-party','item_container_materialization_v2',
          'cutover-runtime-catalog-v1',$1,'cutover-runtime-import-v1',$2,
          $3,$4,'novgorod_spatial_v3_target_contract_approval_001',$5,$6,
          'cutover-runtime-activation-v0')`,
      [
        'a'.repeat(64),
        'b'.repeat(64),
        'c'.repeat(64),
        'd'.repeat(64),
        '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e',
        'e'.repeat(64)
      ]
    );
    const historicalRoot = await loadConfiguredComposition(
      'builtin:production-spatial-v3',
      compositionOptions
    );
    context.after(() => historicalRoot.close());
    const historicalHealth = historicalRoot.health();
    assert.equal(historicalHealth.migration_readiness.party_count, 1);
    assert.equal(
      historicalHealth.migration_readiness.historical_pin_count,
      1
    );
    assert.equal(
      historicalHealth.world_readiness
        .runtime_catalog_activation_event_id,
      'cutover-runtime-activation-v1'
    );
    assert.equal(
      historicalHealth.world_readiness.historical_activation_count,
      1
    );

    await seedMismatchedApprovedTuple(worldPool);
    await assert.rejects(
      loadConfiguredComposition(
        'builtin:production-spatial-v3',
        compositionOptions
      ),
      (error) =>
        error.code === 'SPATIAL_V3_WORLD_RELEASE_PIN_MISMATCH'
    );
  }
);

function createCommitBlockingPool(pool, beforeCommit) {
  return {
    query: (sql, params) => pool.query(sql, params),
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (sql, params) => {
          if (sql === 'COMMIT') await beforeCommit();
          return client.query(sql, params);
        },
        release: () => client.release()
      };
    }
  };
}

async function seedExactReleasePins(worldPool) {
  const releaseRevision =
    'novgorod_spatial_v3_target_contract_approval_001';
  const releaseDigest =
    '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e';
  const catalogRevision = 'cutover-runtime-catalog-v1';
  const catalogDigest = 'a'.repeat(64);
  const importId = 'cutover-runtime-import-v1';
  const importAuditDigest = 'b'.repeat(64);
  const registryDigest = 'c'.repeat(64);
  const runtimeDigest = 'd'.repeat(64);
  const pinManifestDigest = 'e'.repeat(64);
  await worldPool.query(
    `INSERT INTO world_base.source_records(id,status)
     VALUES ('cutover-release-source','approved')`
  );
  await worldPool.query(
    `INSERT INTO world_base.spatial_v3_world_revisions
       (id,catalog_digest,status,provenance_ref)
     VALUES ($1,$2,'approved','cutover-release-source')`,
    [releaseRevision, releaseDigest]
  );
  await worldPool.query(
    `INSERT INTO world_base.world_revisions
       (id,title,catalog_digest,status,approved_at)
     VALUES
       ($1,'Spatial v3 release compatibility',$2,'approved',now()),
       ($3,'Cutover runtime catalog',$4,'approved',now())`,
    [releaseRevision, releaseDigest, catalogRevision, catalogDigest]
  );
  await worldPool.query(
    `INSERT INTO world_base.catalog_baseline_registrations
       (registration_id,parent_revision_id,parent_catalog_digest,
        parent_snapshot_manifest_digest,schema_fingerprint,
        record_registry_digest,compatible_world_revision_id,
        compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,
        registration_request_digest,registration_attestation_digest,
        registered_by)
     VALUES
       ('cutover-baseline-v1',$1,$2,$3,$4,$5,$1,$2,$6,$7,$8,'test')`,
    [
      releaseRevision,
      releaseDigest,
      '1'.repeat(64),
      '2'.repeat(64),
      registryDigest,
      pinManifestDigest,
      '3'.repeat(64),
      '4'.repeat(64)
    ]
  );
  await worldPool.query(
    `INSERT INTO world_base.domain_catalog_revisions
       (catalog_revision_id,catalog_scope,parent_registration_id,
        target_catalog_digest,compatible_world_revision_id,
        compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,record_registry_digest,
        runtime_contract_digest,status)
     VALUES
       ($1,'item_container_materialization_v2','cutover-baseline-v1',
        $2,$3,$4,$5,$6,$7,'approved')`,
    [
      catalogRevision,
      catalogDigest,
      releaseRevision,
      releaseDigest,
      pinManifestDigest,
      registryDigest,
      runtimeDigest
    ]
  );
  await worldPool.query(
    `INSERT INTO world_base.catalog_imports
       (id,world_revision_id,manifest_schema_version,manifest_digest,
        approval_status,deletion_mode,provenance,validation_report,imported_at,
        catalog_scope,parent_revision_id,parent_catalog_digest,
        parent_snapshot_manifest_digest,compatible_world_revision_id,
        compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,target_catalog_digest,
        record_registry_digest,promotion_manifest_digest,
        approval_request_digest,approval_attestation_digest,
        schema_migration_digest,tables_digest,records_digest,
        dependency_assertions_semantic_digest,
        dependency_assertions_audit_digest,import_audit_digest,imported_by)
     VALUES
       ($1,$2,'test-v1',$3,'approved','none','{}','{}',now(),
        'item_container_materialization_v2',$4,$5,$6,$4,$5,$7,$8,$9,
        $10,$11,$12,$13,$14,$15,$16,$17,$18,'test')`,
    [
      importId,
      catalogRevision,
      '5'.repeat(64),
      releaseRevision,
      releaseDigest,
      '1'.repeat(64),
      pinManifestDigest,
      catalogDigest,
      registryDigest,
      '6'.repeat(64),
      '7'.repeat(64),
      '8'.repeat(64),
      '9'.repeat(64),
      '0'.repeat(64),
      'f'.repeat(64),
      '1'.repeat(64),
      '2'.repeat(64),
      importAuditDigest
    ]
  );
  await worldPool.query(
    `INSERT INTO world_base.runtime_catalog_activation_events
       (event_id,event_sequence,event_type,catalog_scope,
        catalog_revision_id,catalog_digest,import_id,import_audit_digest,
        record_registry_digest,runtime_contract_digest,
        compatible_world_revision_id,compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,request_digest,
        attestation_digest,runtime_release_id,operator_principal,event_digest)
     VALUES
       ('cutover-runtime-activation-v0',1,'activate',
        'item_container_materialization_v2',$1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,'test',$13)`,
    [
      catalogRevision,
      catalogDigest,
      importId,
      importAuditDigest,
      registryDigest,
      runtimeDigest,
      releaseRevision,
      releaseDigest,
      pinManifestDigest,
      '7'.repeat(64),
      '8'.repeat(64),
      '5'.repeat(64),
      '9'.repeat(64)
    ]
  );
  await worldPool.query(
    `INSERT INTO world_base.runtime_catalog_activation_events
       (event_id,event_sequence,event_type,catalog_scope,
        catalog_revision_id,catalog_digest,import_id,import_audit_digest,
        record_registry_digest,runtime_contract_digest,
        compatible_world_revision_id,compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,request_digest,
        attestation_digest,expected_previous_event_id,runtime_release_id,
        operator_principal,event_digest)
     VALUES
       ('cutover-runtime-activation-v1',2,'activate',
        'item_container_materialization_v2',$1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,'cutover-runtime-activation-v0',$12,'test',$13)`,
    [
      catalogRevision,
      catalogDigest,
      importId,
      importAuditDigest,
      registryDigest,
      runtimeDigest,
      releaseRevision,
      releaseDigest,
      pinManifestDigest,
      '3'.repeat(64),
      '4'.repeat(64),
      '5'.repeat(64),
      '6'.repeat(64)
    ]
  );
}

async function seedMismatchedApprovedTuple(worldPool) {
  await worldPool.query(
    `INSERT INTO world_base.runtime_catalog_activation_events
       (event_id,event_sequence,event_type,catalog_scope,
        catalog_revision_id,catalog_digest,import_id,import_audit_digest,
        record_registry_digest,runtime_contract_digest,
        compatible_world_revision_id,compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,request_digest,
        attestation_digest,expected_previous_event_id,runtime_release_id,
        operator_principal,event_digest)
     VALUES
       ('cutover-runtime-activation-corrupt',3,'activate',
        'item_container_materialization_v2','cutover-runtime-catalog-v1',$1,
        'cutover-runtime-import-v1',$2,$3,$4,
        'novgorod_spatial_v3_target_contract_approval_001',$5,$6,$7,$8,
        'cutover-runtime-activation-v1',$9,'test',$10)`,
    [
      'a'.repeat(64),
      'b'.repeat(64),
      'f'.repeat(64),
      'd'.repeat(64),
      '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e',
      'e'.repeat(64),
      'a'.repeat(64),
      'b'.repeat(64),
      'c'.repeat(64),
      'd'.repeat(64)
    ]
  );
}
