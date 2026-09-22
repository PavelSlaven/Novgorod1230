import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import { canonicalDigest } from '@rus/materialization';
import { canonicalStringify, computeCanonicalRecordDigest,
  computeImportAuditDigest, computeRecordsDigest, computeTablePayloadDigest,
  computeTablesDigest, projectCanonicalRecord } from '@rus/runtime-catalog';
import { ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY,
  ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { loadActiveActorBaseAttributesProfile } from
  '../../apps/game-server/src/infrastructure/postgres/actor-base-attributes-profile-loader.js';
import { runActorBaseAttributesOwnerMigrations,
  runPartyRuntimeCatalogMigration, runWorldRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { createPostgresTestBackend } from
  '../fixtures/postgres-test-backend.js';

const sha = (character) => character.repeat(64);

test('actor profile loader verifies exact import envelope and membership',
  async (t) => {
    const backend = await createPostgresTestBackend('actor_attributes_loader');
    if (!backend) return t.skip('No supported PostgreSQL test backend');
    const world = new pg.Pool({ connectionString: backend.worldUrl, max: 1 });
    const party = new pg.Pool({ connectionString: backend.partyUrl, max: 1 });
    let client;
    t.after(async () => {
      client?.release();
      await Promise.all([world.end(), party.end()]);
      await backend.close();
    });
    const worldFiles = (await readdir('infra/world-base/schema'))
      .filter((file) => file.endsWith('.sql')).sort();
    for (const file of worldFiles.slice(0, 20)) {
      await world.query(await readFile(`infra/world-base/schema/${file}`,
        'utf8'));
    }
    const partyFiles = (await readdir('schemas/party-db'))
      .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
    for (const file of partyFiles.slice(0, 11)) {
      await party.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    }
    await runWorldRuntimeCatalogMigration(world);
    await runPartyRuntimeCatalogMigration(party);
    await runActorBaseAttributesOwnerMigrations({ worldPool: world,
      partyPool: party });

    const request = JSON.parse(await readFile(
      'data/world-catalogs/novgorod/procedural-scene-v2/'
        + 'actor-base-attributes-v1/runtime-import-v1/request.json', 'utf8'));
    const owner = request.owner_rows[0].row;
    const entry = ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY.entries[0];
    const canonicalPayload = projectCanonicalRecord({
      registryEntry: entry,
      row: owner
    });
    const record = {
      import_id: 'actor-attributes-import-1',
      table_name: entry.table_name,
      record_key: canonicalStringify(canonicalPayload.record_key),
      operation_kind: 'insert',
      canonical_payload: canonicalPayload,
      record_digest: computeCanonicalRecordDigest(canonicalPayload),
      ordinal: 0
    };
    const table = {
      import_id: record.import_id,
      table_name: entry.table_name,
      payload_digest: computeTablePayloadDigest([record]),
      record_count: 1,
      dependency_order: entry.dependency_order,
      insert_count: 1,
      assert_existing_count: 0
    };
    const rootPayload = {
      import_id: record.import_id,
      catalog_scope: 'actor_base_attributes_v1',
      parent_revision_id: 'actor-base-parent',
      parent_catalog_digest: sha('1'),
      parent_snapshot_manifest_digest: sha('2'),
      compatible_world_revision_id: 'actor-base-parent',
      compatible_world_catalog_digest: sha('1'),
      compatible_world_pin_manifest_digest: sha('3'),
      target_revision_id: owner.catalog_revision_id,
      target_catalog_digest: request.target_catalog_digest,
      record_registry_digest: ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
      promotion_manifest_digest: sha('4'),
      approval_request_digest: request.request_digest,
      approval_attestation_digest: sha('5'),
      schema_migration_digest: sha('6'),
      tables_digest: computeTablesDigest([table]),
      records_digest: computeRecordsDigest([record]),
      dependency_assertions_semantic_digest: sha('7'),
      dependency_assertions_audit_digest: sha('8'),
      imported_by: 'test'
    };
    const root = { ...rootPayload,
      import_audit_digest: computeImportAuditDigest(rootPayload) };
    client = await world.connect();
    await client.query(`INSERT INTO world_base.world_revisions
      (id,parent_revision_id,title,catalog_digest,status,approved_at) VALUES
      ('actor-base-parent',NULL,'Parent',$1,'approved',now()),
      ($2,'actor-base-parent','Actor attributes',$3,'approved',now())`,
    [root.parent_catalog_digest, owner.catalog_revision_id,
      request.target_catalog_digest]);
    await client.query(`INSERT INTO world_base.catalog_baseline_registrations
      (registration_id,parent_revision_id,parent_catalog_digest,
       parent_snapshot_manifest_digest,schema_fingerprint,
       record_registry_digest,compatible_world_revision_id,
       compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
       registration_request_digest,registration_attestation_digest,registered_by)
      VALUES ('actor-base-registration','actor-base-parent',$1,$2,$3,$4,
       'actor-base-parent',$1,$5,$6,$7,'test')`,
    [root.parent_catalog_digest, root.parent_snapshot_manifest_digest,
      sha('9'), ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
      root.compatible_world_pin_manifest_digest, sha('a'), sha('b')]);
    await client.query(`INSERT INTO world_base.domain_catalog_revisions
      (catalog_revision_id,catalog_scope,parent_registration_id,
       target_catalog_digest,compatible_world_revision_id,
       compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
       record_registry_digest,runtime_contract_digest,status)
      VALUES ($1,'actor_base_attributes_v1','actor-base-registration',$2,
       'actor-base-parent',$3,$4,$5,$6,'approved')`,
    [owner.catalog_revision_id, root.target_catalog_digest,
      root.compatible_world_catalog_digest,
      root.compatible_world_pin_manifest_digest,
      root.record_registry_digest, ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST]);
    await client.query(`INSERT INTO world_base.catalog_imports
      (id,world_revision_id,manifest_schema_version,manifest_digest,
       approval_status,deletion_mode,provenance,validation_report,imported_at,
       catalog_scope,parent_revision_id,parent_catalog_digest,
       parent_snapshot_manifest_digest,compatible_world_revision_id,
       compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
       target_catalog_digest,record_registry_digest,promotion_manifest_digest,
       approval_request_digest,approval_attestation_digest,
       schema_migration_digest,tables_digest,records_digest,
       dependency_assertions_semantic_digest,
       dependency_assertions_audit_digest,import_audit_digest,imported_by)
      VALUES ($1,$2,'rus.catalog_import_audit.v2',$3,'approved','none','{}',
       '{}',now(),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
       $19,$20,$21,$22)`, [root.import_id, root.target_revision_id,
      root.promotion_manifest_digest, root.catalog_scope,
      root.parent_revision_id, root.parent_catalog_digest,
      root.parent_snapshot_manifest_digest, root.compatible_world_revision_id,
      root.compatible_world_catalog_digest,
      root.compatible_world_pin_manifest_digest, root.target_catalog_digest,
      root.record_registry_digest, root.promotion_manifest_digest,
      root.approval_request_digest, root.approval_attestation_digest,
      root.schema_migration_digest, root.tables_digest, root.records_digest,
      root.dependency_assertions_semantic_digest,
      root.dependency_assertions_audit_digest, root.import_audit_digest,
      root.imported_by]);
    await client.query(`INSERT INTO world_base.catalog_import_tables
      (import_id,table_name,payload_digest,record_count,dependency_order,
       insert_count,assert_existing_count) VALUES ($1,$2,$3,1,$4,1,0)`,
    [record.import_id, table.table_name, table.payload_digest,
      table.dependency_order]);
    await client.query(`INSERT INTO world_base.catalog_import_records
      (import_id,table_name,record_key,operation_kind,canonical_payload,
       record_digest,ordinal) VALUES ($1,$2,$3,'insert',$4::jsonb,$5,0)`,
    [record.import_id, record.table_name, record.record_key,
      JSON.stringify(record.canonical_payload), record.record_digest]);
    await client.query(`INSERT INTO world_base.actor_base_attribute_profiles
      (catalog_revision_id,profile_id,profile_digest,profile_payload,status)
      VALUES ($1,$2,$3,$4::jsonb,'approved')`,
    [owner.catalog_revision_id, owner.profile_id, owner.profile_digest,
      JSON.stringify(owner.profile_payload)]);
    const activationEnvelope = {
      schema: 'rus.runtime_catalog_activation_event.v2',
      event_sequence: 1,
      event_type: 'activate',
      catalog_scope: 'actor_base_attributes_v1',
      catalog_revision_id: owner.catalog_revision_id,
      catalog_digest: root.target_catalog_digest,
      import_id: root.import_id,
      import_audit_digest: root.import_audit_digest,
      record_registry_digest: root.record_registry_digest,
      runtime_contract_digest: ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST,
      compatible_world_revision_id: 'actor-base-parent',
      compatible_world_catalog_digest: root.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        root.compatible_world_pin_manifest_digest,
      request_digest: sha('c'),
      attestation_digest: sha('d'),
      expected_previous_event_id: null,
      runtime_release_id: sha('e'),
      operator_principal: 'test'
    };
    const activationDigest = canonicalDigest(activationEnvelope);
    const activationEventId =
      `runtime_catalog_activation_${activationDigest.slice(0, 32)}`;
    await client.query(`INSERT INTO world_base.runtime_catalog_activation_events
      (event_id,event_sequence,event_type,catalog_scope,catalog_revision_id,
       catalog_digest,import_id,import_audit_digest,record_registry_digest,
       runtime_contract_digest,compatible_world_revision_id,
       compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
       request_digest,attestation_digest,expected_previous_event_id,
       runtime_release_id,operator_principal,event_digest)
      VALUES ($1,1,'activate','actor_base_attributes_v1',$2,
       $3,$4,$5,$6,$7,'actor-base-parent',$8,$9,$10,$11,NULL,$12,'test',$13)`,
    [activationEventId, owner.catalog_revision_id, root.target_catalog_digest,
      root.import_id, root.import_audit_digest, root.record_registry_digest,
      ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST,
      root.compatible_world_catalog_digest,
      root.compatible_world_pin_manifest_digest, sha('c'), sha('d'), sha('e'),
      activationDigest]);

    const loaded = await loadActiveActorBaseAttributesProfile(client);
    assert.equal(loaded.profile_digest, owner.profile_digest);

    await client.query('BEGIN');
    await client.query('SAVEPOINT extra_owner');
    const extraProfile = { ...owner.profile_payload,
      profile_id: 'late-self-consistent-profile' };
    await client.query(`INSERT INTO world_base.actor_base_attribute_profiles
      (catalog_revision_id,profile_id,profile_digest,profile_payload,status)
      VALUES ($1,$2,$3,$4::jsonb,'approved')`, [owner.catalog_revision_id,
      extraProfile.profile_id, canonicalDigest(extraProfile),
      JSON.stringify(extraProfile)]);
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(client),
      { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await client.query('ROLLBACK TO SAVEPOINT extra_owner');

    await client.query('SAVEPOINT late_membership');
    const extraPayload = projectCanonicalRecord({ registryEntry: entry,
      row: { ...owner, profile_id: extraProfile.profile_id,
        profile_digest: canonicalDigest(extraProfile),
        profile_payload: extraProfile } });
    await client.query(`INSERT INTO world_base.catalog_import_records
      (import_id,table_name,record_key,operation_kind,canonical_payload,
       record_digest,ordinal) VALUES ($1,$2,$3,'insert',$4::jsonb,$5,1)`,
    [record.import_id, record.table_name,
      canonicalStringify(extraPayload.record_key), JSON.stringify(extraPayload),
      computeCanonicalRecordDigest(extraPayload)]);
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(client),
      { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await client.query('ROLLBACK TO SAVEPOINT late_membership');

    await client.query('SAVEPOINT tuple_drift');
    await client.query(`INSERT INTO world_base.runtime_catalog_activation_events
      (event_id,event_sequence,event_type,catalog_scope,catalog_revision_id,
       catalog_digest,import_id,import_audit_digest,record_registry_digest,
       runtime_contract_digest,compatible_world_revision_id,
       compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
       request_digest,attestation_digest,expected_previous_event_id,
       runtime_release_id,operator_principal,event_digest)
      SELECT 'actor-activation-drift',2,event_type,catalog_scope,
       catalog_revision_id,catalog_digest,import_id,import_audit_digest,
       record_registry_digest,runtime_contract_digest,
       compatible_world_revision_id,$1,compatible_world_pin_manifest_digest,
       $2,$3,event_id,$4,operator_principal,$5
      FROM world_base.runtime_catalog_activation_events
      WHERE event_id=$6`,
    [sha('0'), sha('1'), sha('2'), sha('3'), sha('4'), activationEventId]);
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(client),
      { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await client.query('ROLLBACK TO SAVEPOINT tuple_drift');

    await client.query('SAVEPOINT root_tamper');
    await client.query(`ALTER TABLE world_base.catalog_imports
      DISABLE TRIGGER catalog_imports_append_only`);
    await client.query(`UPDATE world_base.catalog_imports
      SET promotion_manifest_digest=$1 WHERE import_id=$2`,
    [sha('0'), root.import_id]);
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(client),
      { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await client.query('ROLLBACK TO SAVEPOINT root_tamper');
    await client.query('ROLLBACK');
  });
