import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import { runActorBaseAttributesImport } from
  '../../scripts/run-actor-base-attributes-import.mjs';
import { loadActorBaseAttributesImportApproval } from
  '../../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/validate-import-approval.mjs';
import { importApprovedActorBaseAttributes,
  readActorBaseAttributesImport } from
  '../../tools/runtime-catalog-activation/src/actor-base-attributes-import.js';
import { runForwardMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migration.js';
import { ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION,
  runPartyRuntimeCatalogMigration
} from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { SPATIAL_V3_PRODUCTION_V12_RELEASE } from
  '../../tools/runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import { createPostgresTestBackend } from
  '../fixtures/postgres-test-backend.js';
import { installLowerDvinaTraceV6World } from
  '../fixtures/lower-dvina-trace-v5-world-fixture.js';

test('actor attributes import is exact, idempotent, least-privilege and inactive',
  async (t) => {
    const backend = await createPostgresTestBackend(
      'pr17_actor_attributes_import');
    if (!backend) return t.skip('No supported PostgreSQL test backend');
    const worldUrl = new URL(backend.worldUrl);
    const admin = new pg.Pool({ host: worldUrl.hostname,
      port: Number(worldUrl.port), user: decodeURIComponent(worldUrl.username),
      password: decodeURIComponent(worldUrl.password),
      database: worldUrl.pathname.slice(1), max: 2 });
    let importer;
    t.after(async () => {
      await Promise.all([admin.end(), importer?.end()]);
      await backend.close();
    });
    const partyFiles = (await readdir('schemas/party-db'))
      .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
    for (const file of partyFiles.slice(0, 11)) {
      await admin.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    }
    await runPartyRuntimeCatalogMigration(admin);
    await installLowerDvinaTraceV6World(admin);
    await runForwardMigration({ pool: admin,
      migration: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION });
    const privileges = (await admin.query(`SELECT
      has_table_privilege('runtime_catalog_importer',
        'world_base.actor_base_attribute_profiles','INSERT') AS owner_insert,
      has_table_privilege('runtime_catalog_importer',
        'world_base.actor_base_attribute_profiles','UPDATE') AS owner_update,
      has_table_privilege('runtime_catalog_importer',
        'world_base.runtime_catalog_activation_events','INSERT')
        AS activation_insert`)).rows[0];
    assert.deepEqual(privileges, { owner_insert: true, owner_update: false,
      activation_insert: false });

    const roleUrl = new URL(backend.worldUrl);
    roleUrl.searchParams.set('options',
      '-c role=runtime_catalog_importer');
    importer = new pg.Pool({ connectionString: roleUrl.toString(), max: 1 });
    assert.equal((await importer.query('SELECT current_user AS value'))
      .rows[0].value, 'runtime_catalog_importer');
    const approval = await loadActorBaseAttributesImportApproval();
    const rejected = structuredClone(approval);
    rejected.attestation.authority.activation_authorized = true;
    await assert.rejects(() => importApprovedActorBaseAttributes({
      pool: importer, ...rejected
    }), /ACTOR_BASE_ATTRIBUTES_IMPORT_APPROVAL_INVALID/u);
    const assertNoActorWrites = async () => {
      const counts = (await admin.query(`SELECT
        (SELECT count(*) FROM world_base.world_revisions WHERE id=$1)
          AS revisions,
        (SELECT count(*) FROM world_base.actor_base_attribute_profiles
          WHERE catalog_revision_id=$1) AS profiles,
        (SELECT count(*) FROM world_base.catalog_imports
          WHERE catalog_scope=$2) AS imports,
        (SELECT count(*) FROM world_base.runtime_catalog_activation_events
          WHERE catalog_scope=$2) AS activations`,
      [approval.request.target_revision_id,
        approval.request.catalog_scope])).rows[0];
      assert.deepEqual(Object.fromEntries(Object.entries(counts).map(
        ([key, value]) => [key, Number(value)])), {
        revisions: 0, profiles: 0, imports: 0, activations: 0
      });
    };
    await assertNoActorWrites();

    const parentDomain = (await admin.query(
      `SELECT parent_registration_id,compatible_world_pin_manifest_digest
         FROM world_base.domain_catalog_revisions
        WHERE catalog_revision_id=$1 AND catalog_scope=$2`,
      [approval.request.parent_catalog.catalog_revision_id,
        approval.request.parent_catalog.catalog_scope])).rows[0];
    assert.equal(parentDomain.compatible_world_pin_manifest_digest,
      SPATIAL_V3_PRODUCTION_V12_RELEASE.worldManifestSha256);
    assert.notEqual(parentDomain.compatible_world_pin_manifest_digest,
      approval.request.compatible_world.compatible_world_pin_manifest_digest);
    await admin.query(`ALTER TABLE world_base.domain_catalog_revisions
      DISABLE TRIGGER domain_catalog_revisions_append_only`);
    await admin.query(`ALTER TABLE world_base.catalog_baseline_registrations
      DISABLE TRIGGER catalog_baseline_registrations_append_only`);
    await admin.query(`UPDATE world_base.domain_catalog_revisions
      SET compatible_world_pin_manifest_digest=$1
      WHERE catalog_revision_id=$2`, ['0'.repeat(64),
      approval.request.parent_catalog.catalog_revision_id]);
    await admin.query(`UPDATE world_base.catalog_baseline_registrations
      SET compatible_world_pin_manifest_digest=$1
      WHERE registration_id=$2`, ['0'.repeat(64),
      parentDomain.parent_registration_id]);
    await admin.query(`ALTER TABLE world_base.domain_catalog_revisions
      ENABLE TRIGGER domain_catalog_revisions_append_only`);
    await admin.query(`ALTER TABLE world_base.catalog_baseline_registrations
      ENABLE TRIGGER catalog_baseline_registrations_append_only`);
    await assert.rejects(() => importApprovedActorBaseAttributes({
      pool: importer, ...approval
    }), { code: 'ACTOR_BASE_ATTRIBUTES_IMPORT_PARENT_MISMATCH' });
    await assertNoActorWrites();
    await admin.query(`ALTER TABLE world_base.domain_catalog_revisions
      DISABLE TRIGGER domain_catalog_revisions_append_only`);
    await admin.query(`ALTER TABLE world_base.catalog_baseline_registrations
      DISABLE TRIGGER catalog_baseline_registrations_append_only`);
    await admin.query(`UPDATE world_base.domain_catalog_revisions
      SET compatible_world_pin_manifest_digest=$1
      WHERE catalog_revision_id=$2`,
    [parentDomain.compatible_world_pin_manifest_digest,
      approval.request.parent_catalog.catalog_revision_id]);
    await admin.query(`UPDATE world_base.catalog_baseline_registrations
      SET compatible_world_pin_manifest_digest=$1
      WHERE registration_id=$2`,
    [parentDomain.compatible_world_pin_manifest_digest,
      parentDomain.parent_registration_id]);
    await admin.query(`ALTER TABLE world_base.domain_catalog_revisions
      ENABLE TRIGGER domain_catalog_revisions_append_only`);
    await admin.query(`ALTER TABLE world_base.catalog_baseline_registrations
      ENABLE TRIGGER catalog_baseline_registrations_append_only`);

    const first = await runActorBaseAttributesImport({
      databaseUrl: roleUrl.toString(),
      resultPath: process.env.ACTOR_BASE_ATTRIBUTES_RESULT_PATH ?? null
    });
    const repeated = await importApprovedActorBaseAttributes({ pool: importer,
      ...approval });
    assert.deepEqual(repeated, first);
    assert.equal(first.status, 'imported_exact_readback_verified');
    assert.equal(first.activation_event_count, 0);
    assert.equal(first.activation_authorized, false);
    assert.equal(first.runtime_item_creation_authorized, false);
    assert.equal(Number((await admin.query(`SELECT count(*) AS count
      FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope='actor_base_attributes_v1'`)).rows[0].count), 0);

    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE world_base.world_revisions
        SET title='drifted actor profile' WHERE id=$1`,
      [approval.request.target_revision_id]);
      await assert.rejects(() => readActorBaseAttributesImport(client,
        approval), {
        code: 'ACTOR_BASE_ATTRIBUTES_IMPORT_READBACK_MISMATCH'
      });
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await client.query(`ALTER TABLE world_base.catalog_imports
        DISABLE TRIGGER catalog_imports_append_only`);
      await client.query(`UPDATE world_base.catalog_imports
        SET promotion_manifest_digest=$1 WHERE import_id=$2`,
      ['0'.repeat(64), first.import_id]);
      await assert.rejects(() => readActorBaseAttributesImport(client,
        approval), {
        code: 'ACTOR_BASE_ATTRIBUTES_IMPORT_READBACK_MISMATCH'
      });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const afterRollback = await importApprovedActorBaseAttributes({
      pool: importer, ...approval });
    assert.deepEqual(afterRollback, first);
    await admin.query(`ALTER TABLE world_base.catalog_imports
      DISABLE TRIGGER catalog_imports_append_only`);
    await admin.query(`UPDATE world_base.catalog_imports
      SET import_audit_digest=$1 WHERE import_id=$2`,
    ['9'.repeat(64), first.import_id]);
    await admin.query(`ALTER TABLE world_base.catalog_imports
      ENABLE TRIGGER catalog_imports_append_only`);
    await assert.rejects(() => importApprovedActorBaseAttributes({
      pool: importer, ...approval
    }), { code: 'ACTOR_BASE_ATTRIBUTES_IMPORT_CONFLICT' });
  });
