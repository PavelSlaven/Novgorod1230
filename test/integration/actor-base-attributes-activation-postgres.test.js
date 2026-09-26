import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import { loadActiveActorBaseAttributesProfile } from
  '../../apps/game-server/src/infrastructure/postgres/actor-base-attributes-profile-loader.js';
import { runActorBaseAttributesImport } from
  '../../scripts/run-actor-base-attributes-import.mjs';
import { runActorBaseAttributesRuntimeActivation } from
  '../../scripts/run-actor-base-attributes-runtime-activation.mjs';
import { loadActorBaseAttributesImportApproval } from
  '../../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/validate-import-approval.mjs';
import { activateActorBaseAttributes,
  validateActorBaseAttributesActivationResult } from
  '../../tools/runtime-catalog-activation/src/actor-base-attributes-activation.js';
import { runForwardMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migration.js';
import { ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION,
  runPartyRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { createPostgresTestBackend } from
  '../fixtures/postgres-test-backend.js';
import { installLowerDvinaTraceV6World } from
  '../fixtures/lower-dvina-trace-v5-world-fixture.js';

const ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1';

test('actor profile activation is exact, idempotent and new-party-only',
  async (t) => {
    const backend = await createPostgresTestBackend(
      'pr17_actor_attributes_activation');
    if (!backend) return t.skip('No supported PostgreSQL test backend');
    const worldUrl = new URL(backend.worldUrl);
    const admin = new pg.Pool({ host: worldUrl.hostname,
      port: Number(worldUrl.port), user: decodeURIComponent(worldUrl.username),
      password: decodeURIComponent(worldUrl.password),
      database: worldUrl.pathname.slice(1), max: 2 });
    const readPool = new pg.Pool({ connectionString: roleUrl(backend.worldUrl,
      'runtime_catalog_importer'), max: 1 });
    const activationPool = new pg.Pool({ connectionString:
      roleUrl(backend.worldUrl, 'runtime_catalog_activator'), max: 1 });
    t.after(async () => {
      await Promise.all([admin.end(), readPool.end(), activationPool.end()]);
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
    await runActorBaseAttributesImport({ databaseUrl: backend.worldUrl });

    await assert.rejects(() => loadActiveActorBaseAttributesProfile(admin), {
      code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP'
    });
    const privileges = (await admin.query(`SELECT
      has_table_privilege('runtime_catalog_activator',
        'world_base.runtime_catalog_activation_events','INSERT')
        AS event_insert,
      has_table_privilege('runtime_catalog_activator',
        'world_base.runtime_catalog_activation_events','UPDATE')
        AS event_update,
      has_table_privilege('runtime_catalog_activator',
        'world_base.actor_base_attribute_profiles','INSERT')
        AS profile_insert,
      has_table_privilege('runtime_catalog_importer',
        'world_base.runtime_catalog_activation_events','INSERT')
        AS importer_event_insert`)).rows[0];
    assert.deepEqual(privileges, { event_insert: true, event_update: false,
      profile_insert: false, importer_event_insert: false });

    const [request, attestation, importResult, importApproval] =
      await Promise.all([
        json(`${ROOT}/runtime-activation-v1/request.json`),
        json(`${ROOT}/runtime-activation-v1/`
          + 'runtime-activation-approval-attestation.json'),
        json(`${ROOT}/runtime-import-v1/import-readback-result.json`),
        loadActorBaseAttributesImportApproval()
      ]);
    const rejected = structuredClone(attestation);
    rejected.authority.equipment_allocation_activation_authorized = true;
    await assert.rejects(() => activateActorBaseAttributes({ readPool,
      activationPool, request, attestation: rejected, importApproval,
      importResult }),
    /ACTOR_BASE_ATTRIBUTES_RUNTIME_ACTIVATION_ATTESTATION_INVALID/u);
    assert.equal(await activationCount(admin), 0);

    const first = await runActorBaseAttributesRuntimeActivation({
      databaseUrl: backend.worldUrl,
      resultPath: process.env.ACTOR_BASE_ATTRIBUTES_ACTIVATION_RESULT_PATH
        ?? null
    });
    assert.equal(validateActorBaseAttributesActivationResult({ result: first,
      request, attestation }), true);
    const repeated = await runActorBaseAttributesRuntimeActivation({
      databaseUrl: backend.worldUrl });
    assert.deepEqual(repeated, first);
    assert.equal(await activationCount(admin), 1);
    const active = await loadActiveActorBaseAttributesProfile(admin);
    assert.equal(active.catalog_revision_id,
      request.target_binding.target_revision_id);
    assert.equal(active.profile_id, request.target_binding.profile_id);
    assert.equal(active.profile_digest, request.target_binding.profile_digest);
    assert.equal(Number((await admin.query(`SELECT count(*) AS count
      FROM party_runtime.party_catalog_pins
      WHERE catalog_scope='actor_base_attributes_v1'`)).rows[0].count), 0);

    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`ALTER TABLE
        world_base.runtime_catalog_activation_events DISABLE TRIGGER
        runtime_catalog_activation_events_append_only`);
      await client.query(`UPDATE world_base.runtime_catalog_activation_events
        SET request_digest=$1 WHERE catalog_scope='actor_base_attributes_v1'`,
      ['0'.repeat(64)]);
      await assert.rejects(() => loadActiveActorBaseAttributesProfile(client),
        { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    assert.deepEqual(await runActorBaseAttributesRuntimeActivation({
      databaseUrl: backend.worldUrl }), first);

    await admin.query(`ALTER TABLE
      world_base.runtime_catalog_activation_events DISABLE TRIGGER
      runtime_catalog_activation_events_append_only`);
    await admin.query(`UPDATE world_base.runtime_catalog_activation_events
      SET compatible_world_pin_manifest_digest=$1
      WHERE catalog_scope='actor_base_attributes_v1'`, ['f'.repeat(64)]);
    await admin.query(`ALTER TABLE
      world_base.runtime_catalog_activation_events ENABLE TRIGGER
      runtime_catalog_activation_events_append_only`);
    await assert.rejects(() => runActorBaseAttributesRuntimeActivation({
      databaseUrl: backend.worldUrl
    }), { code: 'ACTOR_BASE_ATTRIBUTES_ACTIVATION_EVENT_COLLISION' });
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(admin), {
      code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID'
    });
    assert.equal(await activationCount(admin), 1);
  });

function roleUrl(databaseUrl, role) {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c role=${role}`);
  return url.toString();
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function activationCount(pool) {
  return Number((await pool.query(`SELECT count(*) AS count
    FROM world_base.runtime_catalog_activation_events
    WHERE catalog_scope='actor_base_attributes_v1'`)).rows[0].count);
}
