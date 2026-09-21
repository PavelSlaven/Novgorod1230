import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import { createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import { RUNTIME_CATALOG_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { loadActiveRuntimeCatalogPin } from
  '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import { activateGate1RuntimeCatalog } from
  '../../tools/runtime-catalog-activation/src/gate1-runtime-activation.js';
import { runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { createPostgresTestBackend } from
  '../fixtures/postgres-test-backend.js';

test('Gate1 registers already-imported rows and activates V5 exactly across restart',
  async (t) => {
    const backend = await createPostgresTestBackend('pr17_gate1_activation');
    if (!backend) return t.skip('No supported PostgreSQL test backend');
    let pool;
    t.after(async () => {
      await pool?.end();
      await backend.close();
    });
    const imported = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode',
        'fixture-bootstrap'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: backend.worldUrl }
      });
    assert.equal(imported.status, 0, imported.stderr);
    pool = new pg.Pool({ connectionString: backend.worldUrl, max: 4 });
    const partyFiles = (await readdir('schemas/party-db'))
      .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
    const migrationIndex = partyFiles.findIndex((file) => file.startsWith('012_'));
    for (const file of partyFiles.slice(0, migrationIndex)) {
      await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    }
    await runPartyRuntimeCatalogMigration(pool);
    for (const file of partyFiles.slice(migrationIndex)) {
      await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    }
    for (let part = 18; part <= 20; part += 1) {
      await pool.query(await readFile(
        `infra/world-base/schema/${String(part).padStart(2, '0')}.sql`, 'utf8'));
    }
    await runWorldRuntimeCatalogMigration(pool);
    const first = await activateGate1RuntimeCatalog({
      worldPool: pool, partyPool: pool, repositoryRoot: process.cwd(),
      worldReleaseId: 'spatial-v3-production-v5'
    });
    assert.equal(first.status, 'activated');
    const pin = await loadActiveRuntimeCatalogPin(pool,
      'item_container_materialization_v2');
    assert.equal(pin.activation_scope, 'new_development_parties_only');
    const catalog = await createRuntimeCatalogLoader({
      worldBaseReader: { read: (sql, parameters) => pool.query(sql, parameters) },
      supportedRuntimeContractDigests: [RUNTIME_CATALOG_CONTRACT_DIGEST]
    }).loadApprovedItemCatalog({ pin });
    assert.equal(catalog.verified, true);
    assert.equal(catalog.import_audit.imported_by,
      'gate1-approved-import-readback-registration');
    assert.equal(catalog.import_audit.target_catalog_digest,
      '1d5fd4cd3c7dd9946d68276011cd3264e6e2ccd12f67486171928e18b56451f5');
    assert.ok(Object.values(catalog.records_by_table).flat().length > 0);

    const managedPartyPool = new pg.Pool({ connectionString: backend.partyUrl,
      max: 1 });
    for (const file of partyFiles.slice(0, migrationIndex)) {
      await managedPartyPool.query(await readFile(`schemas/party-db/${file}`,
        'utf8'));
    }
    await runPartyRuntimeCatalogMigration(managedPartyPool);
    for (const file of partyFiles.slice(migrationIndex)) {
      await managedPartyPool.query(await readFile(`schemas/party-db/${file}`,
        'utf8'));
    }
    await managedPartyPool.end();

    await pool.end();
    pool = null;
    await backend.restart();
    pool = new pg.Pool({ connectionString: backend.worldUrl, max: 4 });
    const repeated = await activateGate1RuntimeCatalog({
      worldPool: pool, partyPool: pool, repositoryRoot: process.cwd(),
      worldReleaseId: 'spatial-v3-production-v5'
    });
    assert.equal(repeated.status, 'already_active');
    const reloaded = await loadActiveRuntimeCatalogPin(pool,
      'item_container_materialization_v2');
    assert.deepEqual(reloaded, pin);

    await pool.end();
    pool = null;
    const adminUrl = new URL(backend.worldUrl);
    adminUrl.pathname = '/postgres';
    const admin = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
    for (const kind of ['request', 'predecessor', 'world_pin']) {
      const database = `${backend.worldDatabase}_${kind}`;
      await admin.query(`CREATE DATABASE ${database}
        TEMPLATE ${backend.worldDatabase}`);
      const driftUrl = new URL(backend.worldUrl);
      driftUrl.pathname = `/${database}`;
      const driftPool = new pg.Pool({ connectionString: driftUrl.toString(),
        max: 4 });
      try {
        await insertActivationDrift(driftPool, kind);
        await assert.rejects(() => activateGate1RuntimeCatalog({
          worldPool: driftPool, partyPool: driftPool,
          repositoryRoot: process.cwd(),
          worldReleaseId: 'spatial-v3-production-v5'
        }), { code: 'ACTIVATION_EVENT_COLLISION' });
      } finally {
        await driftPool.end();
        await admin.query(`DROP DATABASE ${database}`);
      }
    }
    await admin.end();
  });

async function insertActivationDrift(pool, kind) {
  const digest = (suffix) => createHash('sha256')
    .update(`gate1-activation-${kind}-${suffix}`).digest('hex');
  const requestDigest = digest('request');
  const eventDigest = digest('event');
  const eventId = `runtime_catalog_activation_${eventDigest.slice(0, 32)}`;
  const worldPin = kind === 'world_pin'
    ? {
      revision: 'novgorod_spatial_v3_production_v6_candidate_001',
      catalog: '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
      manifest: '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb'
    } : null;
  await pool.query(
    `INSERT INTO world_base.runtime_catalog_activation_events
      (event_id,event_sequence,event_type,catalog_scope,catalog_revision_id,
       catalog_digest,import_id,import_audit_digest,record_registry_digest,
       runtime_contract_digest,compatible_world_revision_id,
       compatible_world_catalog_digest,compatible_world_pin_manifest_digest,
       request_digest,attestation_digest,expected_previous_event_id,
       runtime_release_id,operator_principal,event_digest)
     SELECT $1,event_sequence+1,event_type,catalog_scope,catalog_revision_id,
       catalog_digest,import_id,import_audit_digest,record_registry_digest,
       runtime_contract_digest,COALESCE($4,compatible_world_revision_id),
       COALESCE($5,compatible_world_catalog_digest),
       COALESCE($6,compatible_world_pin_manifest_digest),$2,
       attestation_digest,
       CASE WHEN $7 THEN NULL ELSE event_id END,
       runtime_release_id,operator_principal,$3
     FROM world_base.runtime_catalog_activation_events
     WHERE catalog_scope='item_container_materialization_v2'
     ORDER BY event_sequence DESC LIMIT 1`,
    [eventId, requestDigest, eventDigest, worldPin?.revision ?? null,
      worldPin?.catalog ?? null, worldPin?.manifest ?? null,
      kind === 'predecessor']
  );
}
