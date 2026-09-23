import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import { createSpatialV3TargetProductionRelease, SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from
  '../../../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { assertTargetCatalogActivationReadiness, assertPartyReleaseReadiness } from
  '../../../apps/game-server/src/infrastructure/postgres/spatial-v3-production-readiness.js';
import { loadActiveActorBaseAttributesBinding } from
  '../../../apps/game-server/src/infrastructure/postgres/actor-base-attributes-profile-loader.js';
import { activateGate1RuntimeCatalog } from '../src/gate1-runtime-activation.js';
import { runActorBaseAttributesImport } from '../../../scripts/run-actor-base-attributes-import.mjs';
import { runActorBaseAttributesRuntimeActivation } from
  '../../../scripts/run-actor-base-attributes-runtime-activation.mjs';
import { runForwardMigration } from '../src/forward-migration.js';
import { ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION, ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION,
  runPartyRuntimeCatalogMigration, runWorldRuntimeCatalogMigration } from '../src/forward-migrations.js';
import { prepareSpatialV3TargetItemCatalog, buildSpatialV3TargetItemImport } from
  '../src/first-playable-v2-activation.js';
import { registerCatalogBaseline, importApprovedCatalog, activateApprovedCatalog } from
  '../src/operator-executors.js';
import { digestEnvelope, buildActivationPartyPreflight, buildActivationRequest } from
  '../src/artifact-contracts.js';
import { buildActorBaseAttributesSuccessorImportRequest,
  buildActorBaseAttributesSuccessorActivationRequest } from '../src/actor-base-attributes-successor.js';
import { importApprovedActorBaseAttributes, readActorBaseAttributesImport } from
  '../src/actor-base-attributes-import.js';
import { activateActorBaseAttributes, validateActorBaseAttributesActivationResult } from
  '../src/actor-base-attributes-activation.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const subject = '821a1e10230fcedd6c846599868bf55521ad0233';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
// These attestations exist only in this isolated test. They never authorize deployment.
const fixtureApproval = (payload) => {
  const value = { ...payload, attested_by: 'isolated-postgres-test-fixture' };
  return { ...value, attestation_digest: digestEnvelope(value) };
};

test('target item and actor successors preserve v6 parties through real PostgreSQL import, activation and replay',
  async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    const name = `m2c-catalog-successor-${process.pid}`;
    let pool, importer, activator;
    t.after(async () => {
      await Promise.all([pool?.end(), importer?.end(), activator?.end()]);
      docker(['rm', '-fv', name]);
    });
    assert.equal(docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name,
      '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_USER=postgres',
      '-e', 'POSTGRES_DB=pr17_target_successor_test', 'postgres:16-alpine']).status, 0);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (docker(['exec', name, 'pg_isready', '-U', 'postgres']).status === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
    const options = { host: '127.0.0.1', port, user: 'postgres', password: 'test',
      database: 'pr17_target_successor_test', max: 2 };
    const url = `postgresql://postgres:test@127.0.0.1:${port}/pr17_target_successor_test`;
    pool = new pg.Pool(options);
    const partyFiles = (await readdir('schemas/party-db'))
      .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
    for (const file of partyFiles.slice(0, 11)) {
      await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    }
    await runPartyRuntimeCatalogMigration(pool);
    const bootstrap = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'fixture-bootstrap'],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 180_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: url } });
    assert.equal(bootstrap.status, 0, bootstrap.stderr);
    for (let part = 18; part <= 20; part += 1) {
      await pool.query(await readFile(`infra/world-base/schema/${part}.sql`, 'utf8'));
    }
    await runWorldRuntimeCatalogMigration(pool);
    await activateGate1RuntimeCatalog({ worldPool: pool, partyPool: pool,
      repositoryRoot: process.cwd(), worldReleaseId: 'spatial-v3-production-v6' });
    await runForwardMigration({ pool, migration: ACTOR_BASE_ATTRIBUTES_WORLD_MIGRATION });
    await runForwardMigration({ pool, migration: ACTOR_BASE_ATTRIBUTES_PARTY_MIGRATION });
    await runActorBaseAttributesImport({ databaseUrl: url });
    await runActorBaseAttributesRuntimeActivation({ databaseUrl: url });
    importer = new pg.Pool({ ...options, options: '-c role=runtime_catalog_importer' });
    activator = new pg.Pool({ ...options, options: '-c role=runtime_catalog_activator' });
    await pool.query(`INSERT INTO party_runtime.parties
      (party_id,schema_version,world_revision_id,world_catalog_digest,
       materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
      VALUES ('historical',3,'novgorod_spatial_v3_production_v6_candidate_001',
        '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
        'historical','historical','historical','historical');
      INSERT INTO party_runtime.party_catalog_pins
        (party_id,catalog_scope,catalog_revision_id,catalog_digest,import_id,
         import_audit_digest,record_registry_digest,runtime_contract_digest,
         compatible_world_revision_id,compatible_world_catalog_digest,
         compatible_world_pin_manifest_digest,activation_event_id)
      SELECT 'historical',catalog_scope,catalog_revision_id,catalog_digest,import_id,
        import_audit_digest,record_registry_digest,runtime_contract_digest,
        compatible_world_revision_id,compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,event_id
      FROM world_base.runtime_catalog_activation_events`);
    const saved = await historicalSnapshot(pool);
    const worlds = await json('data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_world_revisions.json');
    await pool.query(`INSERT INTO world_base.world_revisions
      (id,title,catalog_digest,status) VALUES($1,'Approved target test fixture',$2,'approved')`,
    [worlds[0].id, worlds[0].catalog_digest]);
    const sources = await json('data/world-catalogs/novgorod/spatial-v3/datasets/source_records.json');
    const provenance = sources.find((row) => row.id === worlds[0].provenance_ref);
    assert.ok(provenance);
    await pool.query(`INSERT INTO world_base.source_records
      (id,title,source_type,file_reference,summary,limitations,status,confidence)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    ['id','title','source_type','file_reference','summary','limitations','status','confidence']
      .map((field) => provenance[field]));
    await pool.query(`INSERT INTO world_base.spatial_v3_world_revisions
      (id,parent_revision_id,catalog_digest,status,provenance_ref)
      VALUES($1,NULL,$2,'approved',$3)`,
    [worlds[0].id, worlds[0].catalog_digest, worlds[0].provenance_ref]);

    const preparation = await prepareSpatialV3TargetItemCatalog({ worldPool: pool,
      repositoryRoot: process.cwd(), gitCommitSha: subject });
    assert.equal(preparation.baseline_attestation, null);
    assert.throws(() => buildSpatialV3TargetItemImport({ preparation,
      baselineAttestation: null, overlayAttestation: null }));
    const base = preparation.baseline_request;
    const compatible = preparation.compatibility_manifest;
    const baselineAttestation = fixtureApproval({
      schema: 'rus.baseline_registration_attestation.v2',
      registration_request_digest: base.registration_request_digest,
      parent_tuple: { parent_revision_id: base.parent_revision_id,
        parent_catalog_digest: base.parent_catalog_digest,
        parent_snapshot_manifest_digest: base.parent_snapshot_manifest_digest },
      compatible_world_tuple: {
        compatible_world_revision_id: compatible.compatible_world_revision_id,
        compatible_world_catalog_digest: compatible.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest: compatible.compatible_world_pin_manifest_digest },
      decision: 'approve_register_baseline', action: 'register_baseline' });
    const overlayAttestation = fixtureApproval({
      schema: 'rus.item_container_overlay_approval_attestation.v2',
      approval_request_digest: preparation.approval_request.approval_request_digest,
      decision: 'approve_overlay_import', activation_authorized: false });
    await registerCatalogBaseline({ pool, request: base, attestation: baselineAttestation,
      baselineManifest: preparation.baseline_manifest,
      compatibilityManifest: compatible,
      runtimeConfigurationTuple: preparation.runtime_configuration_tuple });
    const item = buildSpatialV3TargetItemImport({ preparation, baselineAttestation, overlayAttestation });
    const applyItem = () => importApprovedCatalog({ pool, ledger: item.ledger,
      domainRevision: item.domain_revision, approvalAttestation: item.approval_attestation });
    assert.equal((await applyItem()).status, 'applied');
    assert.equal((await applyItem()).status, 'already_applied');
    const r = item.ledger.root;
    const pin = { schema: 'rus.runtime_catalog_pin.v2', catalog_scope: r.catalog_scope,
      catalog_revision_id: r.target_revision_id, catalog_digest: r.target_catalog_digest,
      activation_event_id: 'pre-activation-readback', import_id: r.import_id,
      import_audit_digest: r.import_audit_digest, record_registry_digest: r.record_registry_digest,
      runtime_contract_digest: item.domain_revision.runtime_contract_digest,
      compatible_world_revision_id: r.compatible_world_revision_id,
      compatible_world_catalog_digest: r.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest: r.compatible_world_pin_manifest_digest };
    const catalog = await createRuntimeCatalogLoader({
      worldBaseReader: { read: (sql, values) => pool.query(sql, values) },
      supportedRuntimeContractDigests: [pin.runtime_contract_digest]
    }).loadApprovedItemCatalog({ pin });
    assert.equal(catalog.verified, true);
    const latestItem = await latest(pool, r.catalog_scope);
    const itemPreflight = buildActivationPartyPreflight({ activationScope: 'new_production_parties_only',
      partyCount: 1, pinnedPartyCount: 1, missingDomainPinCount: 0,
      inflightStage24Stage25Count: 0, runtimeReleaseId: digestEnvelope('spatial-v3-production-v17'),
      runtimeContractDigest: pin.runtime_contract_digest });
    const { schema: ignoredSchema, catalog_scope: ignoredScope, ...activationFields } = r;
    const activationRequest = buildActivationRequest({ partyPreflight: itemPreflight,
      fields: { ...activationFields, runtime_contract_digest: pin.runtime_contract_digest,
        runtime_release_id: itemPreflight.runtime_release_id,
        activation_scope: 'new_production_parties_only',
        expected_previous_event_id: latestItem.event_id } });
    const itemAttestation = fixtureApproval({ schema: 'rus.runtime_catalog_activation_attestation.v2',
      activation_request_digest: activationRequest.activation_request_digest,
      catalog_scope: r.catalog_scope, target_revision_id: r.target_revision_id,
      target_catalog_digest: r.target_catalog_digest, import_id: r.import_id,
      import_audit_digest: r.import_audit_digest, runtime_contract_digest: pin.runtime_contract_digest,
      runtime_release_id: itemPreflight.runtime_release_id, decision: 'approve_activation' });
    const activateItem = () => activateApprovedCatalog({ worldPool: pool, partyPool: pool,
      request: activationRequest, attestation: itemAttestation });
    assert.equal((await activateItem()).status, 'activated');
    assert.equal((await activateItem()).status, 'already_active');

    const importRequest = buildActorBaseAttributesSuccessorImportRequest({ subjectCommit: subject,
      parentCatalog: { catalog_scope: pin.catalog_scope, catalog_revision_id: pin.catalog_revision_id,
        catalog_digest: pin.catalog_digest, import_readback_ref: 'isolated-test:item-readback',
        import_readback_digest: digestEnvelope({ verified: catalog.verified, pin }),
        compatible_world_pin_manifest_digest: pin.compatible_world_pin_manifest_digest } });
    const importAttestation = successorApproval(importRequest, 'import');
    await assert.rejects(importApprovedActorBaseAttributes({ pool: importer,
      request: importRequest, attestation: null }));
    const importApproval = { request: importRequest, attestation: importAttestation };
    const importResult = await importApprovedActorBaseAttributes({ pool: importer, ...importApproval });
    assert.deepEqual(await readActorBaseAttributesImport(importer, importApproval), importResult);
    assert.deepEqual(await importApprovedActorBaseAttributes({ pool: importer, ...importApproval }), importResult);
    const actorPrevious = await latest(pool, 'actor_base_attributes_v1');
    const request = buildActorBaseAttributesSuccessorActivationRequest({
      importRequest, importResult, previousEvent: actorPrevious,
      partyPreflight: { party_count: 1, pinned_party_count: 1, missing_domain_pin_count: 0, inflight_count: 0 } });
    const attestation = successorApproval(request, 'activation');
    const args = { readPool: importer, activationPool: activator, partyPool: pool,
      request, attestation, importApproval, importResult };
    const first = await activateActorBaseAttributes(args);
    assert.equal(first.event_sequence, actorPrevious.event_sequence + 1);
    assert.equal(first.production_authorized, true);
    assert.equal(validateActorBaseAttributesActivationResult({ result: first, request, attestation }), true);
    assert.deepEqual(await activateActorBaseAttributes(args), first);
    const targetInputs = { worldPool: pool,
      itemApproval: { request: activationRequest, attestation: itemAttestation },
      actorApproval: { request, attestation } };
    const candidate = { ...SPATIAL_V3_TARGET_PRODUCTION_RELEASE,
      compatible_world_pin_manifest_digest: pin.compatible_world_pin_manifest_digest };
    const targetReadback = await assertTargetCatalogActivationReadiness(pool, {
      ...targetInputs, release: candidate });
    assert.equal(targetReadback.actor_binding.pin.activation_event_id, first.event_id);
    await assert.rejects(createSpatialV3TargetProductionRelease(targetInputs),
      { code: 'SPATIAL_V3_TARGET_START_BINDING_REQUIRED' });
    const historicalReadiness = await assertPartyReleaseReadiness(pool, candidate);
    assert.equal(historicalReadiness.party_count, 1);
    assert.equal(historicalReadiness.historical_pin_count, 1);
    const partyClient = await pool.connect();
    try {
      await partyClient.query('BEGIN');
      await partyClient.query(`UPDATE party_runtime.parties
        SET world_catalog_digest=$1 WHERE party_id='historical'`, ['0'.repeat(64)]);
      await assert.rejects(assertPartyReleaseReadiness(partyClient, candidate),
        { code: 'SPATIAL_V3_PARTY_MIGRATION_REQUIRED' });
    } finally { await partyClient.query('ROLLBACK'); partyClient.release(); }
    await assert.rejects(createSpatialV3TargetProductionRelease({ worldPool: pool,
      itemApproval: { request: activationRequest, attestation: itemAttestation } }),
    { code: 'SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED' });
    const historicalActorPin = saved.pins.find((row) => row.catalog_scope === 'actor_base_attributes_v1');
    const { party_id: ignoredParty, pinned_at: ignoredPinned, ...historicalPinFields } = historicalActorPin;
    const historicalActorBinding = await loadActiveActorBaseAttributesBinding(pool, {
      expectedPin: { schema: 'rus.runtime_catalog_pin.v2', ...historicalPinFields }
    });
    assert.equal(historicalActorBinding.pin.catalog_revision_id, historicalActorPin.catalog_revision_id);
    await assert.rejects(activateActorBaseAttributes({ ...args,
      request: { ...request, expected_previous_event: { event_id: 'stale', event_sequence: 1 } } }));
    assert.deepEqual(await historicalSnapshot(pool), saved);
    assert.equal((await latest(pool, 'item_container_materialization_v2')).catalog_revision_id,
      'item_container_spatial_v3_target_001');
    assert.equal((await latest(pool, 'actor_base_attributes_v1')).catalog_revision_id,
      'actor_base_attributes_spatial_v3_target_001');
  });

function successorApproval(request, operation) {
  const importing = operation === 'import';
  return fixtureApproval({ schema: importing
    ? 'rus.actor_base_attributes_successor_import_attestation.v1'
    : 'rus.actor_base_attributes_successor_activation_attestation.v1',
  request_digest: request.request_digest,
  decision: importing ? 'approve_exact_actor_base_attributes_successor_import'
    : 'approve_exact_actor_base_attributes_new_production_activation',
  reviewed_repository_head: subject, independence_basis: 'Test-only approval fixture',
  database_mutated: false, authority: { import_authorized: importing,
    activation_authorized: !importing, production_authorized: !importing,
    existing_party_migration_authorized: false, old_save_rematerialization_authorized: false } });
}

async function latest(pool, scope) {
  const row = (await pool.query(`SELECT * FROM world_base.runtime_catalog_activation_events
    WHERE catalog_scope=$1 ORDER BY event_sequence DESC LIMIT 1`, [scope])).rows[0];
  return { ...row, event_sequence: Number(row.event_sequence) };
}

async function historicalSnapshot(pool) {
  return {
    parties: (await pool.query('SELECT * FROM party_runtime.parties ORDER BY party_id')).rows,
    pins: (await pool.query('SELECT * FROM party_runtime.party_catalog_pins ORDER BY catalog_scope')).rows,
    v6: (await pool.query(`SELECT * FROM world_base.world_revisions
      WHERE id='novgorod_spatial_v3_production_v6_candidate_001'`)).rows
  };
}
