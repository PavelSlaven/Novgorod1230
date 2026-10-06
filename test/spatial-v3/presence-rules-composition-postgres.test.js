import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import pg from 'pg';
import {
  applyPresenceRulesFirstArrival,
  canonicalDigest,
  isO1PresenceRecord,
} from '@rus/materialization';
import {
  createRuntimeCatalogWorldBaseReader,
  loadG0RegionIdForSpatialNode,
  loadPresenceRulesForPlaceFamilies,
} from '@rus/runtime-catalog';
import { createOrdinaryMaterializationFirstEntryProvisioner } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import {
  createTargetPresenceRulesFirstArrivalResolver,
  resolvePresenceRulesFirstArrivalForSite,
} from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { buildImportWithReadbackSql, buildTransactionalImportSql } from
  '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 180_000 });
const REV = 'novgorod_spatial_v3_target_contract_approval_001';
const CATALOG_DIGEST = '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e';
const expansion = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json';
const waveRootRel = 'data/world-catalogs/novgorod/m2c-npc-wave/v1';
const profile = JSON.parse(await readFile(
  new URL('../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m22-content/ordinary-materialization-profile.json', import.meta.url),
  'utf8'));

const runtimeCatalogPin = {
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'presence_composition_catalog_rev',
  catalog_digest: 'a'.repeat(64),
  compatible_world_revision_id: REV,
  compatible_world_catalog_digest: CATALOG_DIGEST,
  compatible_world_pin_manifest_digest: 'b'.repeat(64),
};
const spatialWorldPin = { world_revision_id: REV, catalog_digest: CATALOG_DIGEST };
const worldPin = { world_revision_id: REV, world_catalog_digest: CATALOG_DIGEST };

async function prepareApprovedWaveCopy(baseDir) {
  await cp(join(process.cwd(), waveRootRel), baseDir, { recursive: true });
  const manifestFile = join(baseDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.status = 'approved';
  await writeFile(manifestFile, JSON.stringify(manifest));
  return { manifestFile, approvalPath: join(baseDir, 'approval.json') };
}

async function loadWorldSchema(pool) {
  const schema = await readFile('infra/world-base/schema.sql', 'utf8');
  for (const [, part] of schema.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)) {
    await pool.query(await readFile(`infra/world-base/schema/${part}`, 'utf8'));
  }
  await pool.query(await readFile(
    new URL('../../tools/runtime-catalog-activation/migrations/world/001_runtime_catalog_activation.sql', import.meta.url),
    'utf8',
  ));
}

async function seedRuntimeCatalogActivation(pool) {
  const catalogRevision = runtimeCatalogPin.catalog_revision_id;
  const importId = 'presence-composition-import';
  const importAuditDigest = 'c'.repeat(64);
  const registryDigest = 'd'.repeat(64);
  const runtimeDigest = 'e'.repeat(64);
  const pinManifestDigest = runtimeCatalogPin.compatible_world_pin_manifest_digest;
  await pool.query(
    `INSERT INTO world_base.world_revisions (id,title,catalog_digest,status,approved_at)
     VALUES ($1,'Spatial v3 target closure',$2,'approved',now())
     ON CONFLICT (id) DO NOTHING`,
    [REV, CATALOG_DIGEST],
  );
  await pool.query(
    `INSERT INTO world_base.world_revisions (id,title,catalog_digest,status,approved_at)
     VALUES ($1,'Presence composition catalog',$2,'approved',now())
     ON CONFLICT (id) DO NOTHING`,
    [catalogRevision, runtimeCatalogPin.catalog_digest],
  );
  await pool.query(
    `INSERT INTO world_base.catalog_baseline_registrations
       (registration_id,parent_revision_id,parent_catalog_digest,
        parent_snapshot_manifest_digest,schema_fingerprint,
        record_registry_digest,compatible_world_revision_id,
        compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,
        registration_request_digest,registration_attestation_digest,
        registered_by)
     VALUES
       ('presence-composition-baseline',$1,$2,$3,$4,$5,$1,$2,$6,$7,$8,'composition-test')
     ON CONFLICT DO NOTHING`,
    [REV, CATALOG_DIGEST, '1'.repeat(64), '2'.repeat(64), registryDigest, pinManifestDigest, '3'.repeat(64), '4'.repeat(64)],
  );
  await pool.query(
    `INSERT INTO world_base.domain_catalog_revisions
       (catalog_revision_id,catalog_scope,parent_registration_id,
        target_catalog_digest,compatible_world_revision_id,
        compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,record_registry_digest,
        runtime_contract_digest,status)
     VALUES
       ($1,'item_container_materialization_v2','presence-composition-baseline',
        $2,$3,$4,$5,$6,$7,'approved')
     ON CONFLICT DO NOTHING`,
    [catalogRevision, runtimeCatalogPin.catalog_digest, REV, CATALOG_DIGEST, pinManifestDigest, registryDigest, runtimeDigest],
  );
  await pool.query(
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
        $10,$11,$12,$13,$14,$15,$16,$17,$18,'composition-test')
     ON CONFLICT DO NOTHING`,
    [importId, catalogRevision, '5'.repeat(64), REV, CATALOG_DIGEST, '1'.repeat(64), pinManifestDigest,
      runtimeCatalogPin.catalog_digest, registryDigest, '6'.repeat(64), '7'.repeat(64), '8'.repeat(64),
      '9'.repeat(64), '0'.repeat(64), 'f'.repeat(64), '1'.repeat(64), '2'.repeat(64), importAuditDigest],
  );
  await pool.query(
    `INSERT INTO world_base.runtime_catalog_activation_events
       (event_id,event_sequence,event_type,catalog_scope,
        catalog_revision_id,catalog_digest,import_id,import_audit_digest,
        record_registry_digest,runtime_contract_digest,
        compatible_world_revision_id,compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,request_digest,
        attestation_digest,runtime_release_id,operator_principal,event_digest)
     VALUES
       ('presence-composition-activation',1,'activate',
        'item_container_materialization_v2',$1,$2,$3,$4,$5,$6,$7,$8,$9,
        $10,$11,$12,'composition-test',$13)
     ON CONFLICT DO NOTHING`,
    [catalogRevision, runtimeCatalogPin.catalog_digest, importId, importAuditDigest, registryDigest,
      runtimeDigest, REV, CATALOG_DIGEST, pinManifestDigest, '7'.repeat(64), '8'.repeat(64), '9'.repeat(64), '0'.repeat(64)],
  );
}

async function insertPresenceFixture(pool) {
  const imported = await pool.query(
    `SELECT n.id AS node_id, b.place_family_id
       FROM world_base.spatial_v3_nodes n
       JOIN world_base.spatial_node_place_family_bindings b
         ON b.node_id = n.id AND b.node_version = n.version
        AND b.world_revision_id = n.world_revision_id
        AND b.binding_role = 'primary' AND b.status = 'approved'
      WHERE n.world_revision_id = $1 AND n.spatial_level = 'G4' AND n.status = 'approved'
      LIMIT 1`,
    [REV],
  );
  const nodeId = imported.rows[0]?.node_id ?? 'presence_pg_fixture_node';
  const pfId = imported.rows[0]?.place_family_id ?? 'pf_presence_pg_fixture';
  if (!imported.rows[0]) {
    await pool.query(`INSERT INTO world_base.source_records(id,status)
      VALUES ('p12-source','approved') ON CONFLICT DO NOTHING`);
    await pool.query(`INSERT INTO world_base.universal_categories(
        id,domain,stable_code,facet,preferred_label,definition,
        scope_note,inclusion_rules,exclusion_rules,title,status)
      VALUES ('cat_pg_g4_fixture','spatial','cat_pg_g4_fixture','class','G4','d','n','i','e','t','approved')
      ON CONFLICT (id) DO NOTHING`);
    await pool.query(`INSERT INTO world_base.spatial_v3_authoring_versions(
        entity_kind,entity_id,version,world_revision_id,canonical_digest,status,provenance_ref)
      VALUES ('spatial_node',$1,1,$2,$3,'approved','p12-source')
      ON CONFLICT DO NOTHING`, [nodeId, REV, 'b'.repeat(64)]);
    await pool.query(`INSERT INTO world_base.spatial_v3_nodes(
        id,version,world_revision_id,spatial_level,primary_class_id,evidence_status,
        traversal_model,status,provenance_ref,canonical_digest)
      VALUES ($1,1,$2,'G4','cat_pg_g4_fixture','reviewed','through_area','approved','p12-source',$3)
      ON CONFLICT DO NOTHING`,
    [nodeId, REV, 'b'.repeat(64)]);
    await pool.query(`INSERT INTO world_base.spatial_v3_node_parents(
        child_id,child_version,parent_id,parent_version,world_revision_id)
      VALUES ($1,1,'region_novgorod_land',1,$2)
      ON CONFLICT DO NOTHING`, [nodeId, REV]);
    await pool.query(`INSERT INTO world_base.place_families(id,version,world_revision_id,status,confidence,payload)
      VALUES ($1,1,$2,'approved','high','{}'::jsonb) ON CONFLICT DO NOTHING`, [pfId, REV]);
    await pool.query(`INSERT INTO world_base.spatial_node_place_family_bindings(
        world_revision_id,node_id,node_version,place_family_id,place_family_version,binding_role,status,confidence)
      VALUES ($1,$2,1,$3,1,'primary','approved','high') ON CONFLICT DO NOTHING`,
    [REV, nodeId, pfId]);
  }
  await pool.query(`INSERT INTO world_base.universal_categories(
      id,domain,stable_code,facet,preferred_label,definition,
      scope_note,inclusion_rules,exclusion_rules,title,status)
    VALUES ('cat_pg_empty_fixture','items','cat_pg_empty_fixture','object_type','x','d','n','i','e','t','approved')
    ON CONFLICT (id) DO NOTHING`);
  await pool.query(`INSERT INTO world_base.presence_rules(
      rule_id,rule_version,world_revision_id,scope_kind,scope_ref,subject_kind,subject_ref,
      category_id,presence_probability_ppm,count_limit,allowed_seasons,refresh_class,confidence,status)
    VALUES ('pr_pg_empty',1,$1,'place_family',$2,'category','cat_pg_empty_fixture',
      'cat_pg_empty_fixture',0,3,ARRAY['all'],'none','high','approved')
    ON CONFLICT (rule_id,rule_version) DO NOTHING`, [REV, pfId]);
  return { nodeId, pfId };
}

let compositionFixture = { nodeId: 'presence_pg_fixture_node', pfId: 'pf_presence_pg_fixture' };

async function setupWorldPool(pool) {
  await loadWorldSchema(pool);
  await pool.query(await buildTransactionalImportSql({ root: process.cwd(), manifestPath: expansion }));
  const dir = await mkdtemp(join(tmpdir(), 'm2c-wave-composition-pg-'));
  try {
    const { manifestFile, approvalPath } = await prepareApprovedWaveCopy(dir);
    await pool.query(await buildImportWithReadbackSql({
      root: process.cwd(), manifestPath: manifestFile, m2cWaveApprovalPath: approvalPath,
    }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(await readFile(new URL(
    '../../tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql', import.meta.url), 'utf8'));
  await seedRuntimeCatalogActivation(pool);
  compositionFixture = await insertPresenceFixture(pool);
  await pool.query(
    `UPDATE world_base.presence_rules
        SET region_id = 'region_novgorod_land'
      WHERE world_revision_id = $1 AND region_id = 'novgorod_land'`,
    [REV],
  );
}

async function setupPartyPool(pool) {
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(await readFile(new URL(
    '../../tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql', import.meta.url), 'utf8'));
}

async function startDualPools(containerName) {
  const admin = new pg.Pool({
    host: '127.0.0.1', port: await containerPort(containerName),
    user: 'wave', password: 'wave', database: 'wave', max: 4,
  });
  await admin.query('CREATE DATABASE presence_world');
  await admin.query('CREATE DATABASE presence_party');
  await admin.end();
  const port = await containerPort(containerName);
  const worldPool = new pg.Pool({ host: '127.0.0.1', port, user: 'wave', password: 'wave', database: 'presence_world', max: 6 });
  const partyPool = new pg.Pool({ host: '127.0.0.1', port, user: 'wave', password: 'wave', database: 'presence_party', max: 6 });
  await setupWorldPool(worldPool);
  await setupPartyPool(partyPool);
  return { worldPool, partyPool };
}

async function containerPort(name) {
  return Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
}

function o1PresenceRefs(aggregatePayload) {
  return (aggregatePayload?.presence_resolutions ?? [])
    .filter(isO1PresenceRecord)
    .map((record) => record.resolution_ref);
}

function presenceRuleRows(aggregatePayload) {
  return (aggregatePayload?.presence_resolutions ?? [])
    .filter((record) => Object.hasOwn(record, 'subject_kind'));
}

async function loadG6Aggregate(partyPool, partyId) {
  return (await partyPool.query(
    `SELECT aggregate_payload, state_version FROM party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id = $1 AND scope_id = $2`,
    [partyId, `g6:${partyId}`],
  )).rows[0];
}

async function provisionPartyStart({
  worldPool, partyPool, partyId, spatialNodeId, origin = 'canonical',
}) {
  const worldBaseReader = createRuntimeCatalogWorldBaseReader((sql, params) => worldPool.query(sql, params));
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader,
    spatialWorldPin, worldPin, runtimeCatalogPin,
    readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 1230 }),
  });
  const provisioner = createOrdinaryMaterializationFirstEntryProvisioner({
    profile,
    includeContextBoundCapabilities: false,
    partyStartPresenceOnly: true,
    resolvePresenceRulesFirstArrival: resolver,
  });
  await partyPool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,2,$2,$3,'mat','rng','cmd','prof') ON CONFLICT DO NOTHING`,
  [partyId, REV, CATALOG_DIGEST]);
  await partyPool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,expected_state_version_set,
     committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ($1,$2,'new_game','x','[]','x','x',0,0) ON CONFLICT DO NOTHING`,
  [`cs:${partyId}`, partyId]);
  const siteId = `g5:${partyId}`;
  const g6Id = `g6:${partyId}`;
  const posId = `pos:${partyId}`;
  if (origin === 'canonical') {
    await partyPool.query(`INSERT INTO party_runtime.party_g5_sites
      (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,$2,'canonical',$4,
        jsonb_build_object('entity_id',$4::text,'authoring_version','1'),
        'active',1,$3,$3) ON CONFLICT DO NOTHING`,
    [siteId, partyId, `cs:${partyId}`, spatialNodeId]);
    await partyPool.query(`INSERT INTO party_runtime.party_scene_baselines
      (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,
       materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,$2,'g5_site',$3,'canonical_template','{"entity_id":"st","authoring_version":"1"}'::jsonb,
        'trace','mat','dig','active',1,$4,$4) ON CONFLICT DO NOTHING`,
    [`baseline:${partyId}`, partyId, siteId, `cs:${partyId}`]);
  } else {
    await partyPool.query(`INSERT INTO party_runtime.party_g5_sites
      (id,party_id,origin,parent_g4_id,generated_template_ref,expansion_slot_ref,source_frontier_id,
       generation_ordinal,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,$2,'generated',$4,'{"entity_id":"tpl-presence","authoring_version":"1"}'::jsonb,
        '{"entity_id":"slot-presence","authoring_version":"1"}'::jsonb,'frontier-presence',0,
        'active',1,$3,$3) ON CONFLICT DO NOTHING`,
    [siteId, partyId, `cs:${partyId}`, spatialNodeId]);
    await partyPool.query(`INSERT INTO party_runtime.party_scene_baselines
      (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,
       materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,$2,'g5_site',$3,'generated_template','{"entity_id":"st-gen","authoring_version":"1"}'::jsonb,
        'trace','mat','dig','active',1,$4,$4) ON CONFLICT DO NOTHING`,
    [`baseline:${partyId}`, partyId, siteId, `cs:${partyId}`]);
  }
  await partyPool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,
     physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,
     intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,
     status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'{"entity_id":"st","authoring_version":"1"}'::jsonb,'main','g5_site',$4,
      'open','primary','surface','none','default_clear','short','uniform','active',1,$5,$5)
    ON CONFLICT DO NOTHING`,
  [g6Id, partyId, `baseline:${partyId}`, siteId, `cs:${partyId}`]);
  await partyPool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,
     capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'work','focus',0,1,'default','active',1,$4,$4) ON CONFLICT DO NOTHING`,
  [posId, partyId, g6Id, `cs:${partyId}`]);
  const client = await partyPool.connect();
  try {
    await client.query('BEGIN');
    const first = await provisioner.provision({
      transaction: client, partyId, changeSetId: `cs:${partyId}`,
      firstEntryBinding: { g6_instance_id: g6Id, position_id: posId },
    });
    const second = await provisioner.provision({
      transaction: client, partyId, changeSetId: `cs:${partyId}`,
      firstEntryBinding: { g6_instance_id: g6Id, position_id: posId },
    });
    await client.query('COMMIT');
    return { first, second, worldBaseReader };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

test('PostgreSQL presence composition: world and party DBs, real activation, no gated reader', {
  timeout: 900_000,
}, async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `presence-composition-${process.pid}`;
  assert.equal(docker(['run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=wave', '-e', 'POSTGRES_USER=wave', '-e', 'POSTGRES_DB=wave', 'postgres:16-alpine']).status, 0);
  let worldPool;
  let partyPool;
  t.after(async () => {
    await worldPool?.end();
    await partyPool?.end();
    docker(['rm', '-fv', name]);
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'wave']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  ({ worldPool, partyPool } = await startDualPools(name));
  const worldBaseReader = createRuntimeCatalogWorldBaseReader((sql, params) => worldPool.query(sql, params));

  await t.test('canonical G5 first entry: presence rules without O1 rows', async () => {
    const { first, second } = await provisionPartyStart({
      worldPool, partyPool, partyId: 'party-composition-canonical',
      spatialNodeId: compositionFixture.nodeId, origin: 'canonical',
    });
    assert.equal(first.provisioned, true);
    assert.equal(second.provisioned, false);
    const row = await loadG6Aggregate(partyPool, 'party-composition-canonical');
    assert.ok(presenceRuleRows(row.aggregate_payload).length > 0);
    assert.equal(o1PresenceRefs(row.aggregate_payload).length, 0);
  });

  await t.test('generated G5 first entry: presence rules on frontier host', async () => {
    const { first } = await provisionPartyStart({
      worldPool, partyPool, partyId: 'party-composition-generated',
      spatialNodeId: compositionFixture.nodeId, origin: 'generated',
    });
    assert.equal(first.provisioned, true);
    const site = (await partyPool.query(
      `SELECT origin FROM party_runtime.party_g5_sites WHERE party_id = $1`,
      ['party-composition-generated'],
    )).rows[0];
    assert.equal(site.origin, 'generated');
    const row = await loadG6Aggregate(partyPool, 'party-composition-generated');
    assert.ok(presenceRuleRows(row.aggregate_payload).length > 0);
  });

  await t.test('same aggregate: enablement projection excludes presence-rule rows', async () => {
    const row = await loadG6Aggregate(partyPool, 'party-composition-canonical');
    const working = structuredClone(row.aggregate_payload);
    assert.ok(presenceRuleRows(working).length > 0);
    assert.deepEqual(o1PresenceRefs(working), []);
    assert.equal(Number(row.state_version), working.state_version);
  });

  await t.test('replay applyPresenceRulesFirstArrival preserves presence digest', async () => {
    const row = await loadG6Aggregate(partyPool, 'party-composition-canonical');
    const digestBefore = canonicalDigest(presenceRuleRows(row.aggregate_payload));
    const context = await resolvePresenceRulesFirstArrivalForSite({
      worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
      spatialNodeId: compositionFixture.nodeId, spatialNodeVersion: 1,
      partyId: 'party-composition-canonical', siteId: 'g5:party-composition-canonical',
      regionId: 'region_novgorod_land',
      season: 'summer',
      periodNumber: 1230,
    });
    assert.ok(context);
    const afterReplay = applyPresenceRulesFirstArrival({
      aggregate: structuredClone(row.aggregate_payload),
      ...context,
    });
    assert.equal(
      canonicalDigest(presenceRuleRows(afterReplay)),
      digestBefore,
    );
  });

  await t.test('runtime-catalog gate: G0 region and presence_rules load', async () => {
    const regionId = await loadG0RegionIdForSpatialNode({
      worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
      nodeId: compositionFixture.nodeId, nodeVersion: 1,
    });
    assert.equal(regionId, 'region_novgorod_land');
    const rules = await loadPresenceRulesForPlaceFamilies({
      worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
      placeFamilyIds: [compositionFixture.pfId],
    });
    assert.ok(rules.some((rule) => rule.subject_ref === 'cat_pg_empty_fixture'));
  });
});
