import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import pg from 'pg';
import {
  applyOrdinaryAggregateTransition,
  applyPresenceRulesFirstArrival,
  canonicalDigest,
  createOrdinaryAggregate,
} from '@rus/materialization';
import {
  createRuntimeCatalogWorldBaseReader,
  loadCategoryParentMap,
  loadPresenceRulesForPlaceFamilies,
} from '@rus/runtime-catalog';
import { mergePlaceFamilyPresenceRules } from '@rus/materialization';
import { buildImportWithReadbackSql, buildTransactionalImportSql } from
  '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { createOrdinaryMaterializationFirstEntryProvisioner } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import {
  createTargetPresenceRulesFirstArrivalResolver,
  resolvePresenceRulesFirstArrivalForSite,
} from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';
import { createSpatialV3WorldBaseReader } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
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
  catalog_revision_id: 'presence_pg_test_pin',
  catalog_digest: 'a'.repeat(64),
  compatible_world_revision_id: REV,
  compatible_world_catalog_digest: CATALOG_DIGEST,
  compatible_world_pin_manifest_digest: 'b'.repeat(64),
};

const spatialWorldPin = { world_revision_id: REV, catalog_digest: CATALOG_DIGEST };
const worldPin = { world_revision_id: REV, world_catalog_digest: CATALOG_DIGEST };

const approvedTarget = async () => ({
  ok: true, materialization_authorized: false, p28_activation: 'not_authorized', errors: [],
});

let presencePgFixture = { nodeId: 'presence_pg_fixture_node', pfId: 'pf_presence_pg_fixture' };

async function prepareApprovedWaveCopy(baseDir) {
  await cp(join(process.cwd(), waveRootRel), baseDir, { recursive: true });
  const manifestFile = join(baseDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.status = 'approved';
  await writeFile(manifestFile, JSON.stringify(manifest));
  return { manifestFile, approvalPath: join(baseDir, 'approval.json') };
}

async function startPool(name) {
  assert.equal(docker(['run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=wave', '-e', 'POSTGRES_USER=wave', '-e', 'POSTGRES_DB=wave', 'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'wave']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'wave', password: 'wave', database: 'wave' });
  const schema = await readFile('infra/world-base/schema.sql', 'utf8');
  for (const [, part] of schema.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)) {
    await pool.query(await readFile(`infra/world-base/schema/${part}`, 'utf8'));
  }
  await pool.query(await buildTransactionalImportSql({ root: process.cwd(), manifestPath: expansion }));
  const dir = await mkdtemp(join(tmpdir(), 'm2c-wave-presence-pg-'));
  const { manifestFile, approvalPath } = await prepareApprovedWaveCopy(dir);
  await pool.query(await buildImportWithReadbackSql({
    root: process.cwd(), manifestPath: manifestFile, m2cWaveApprovalPath: approvalPath,
  }));
  await rm(dir, { recursive: true, force: true });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(await readFile(new URL(
    '../../tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql', import.meta.url), 'utf8'));
  await insertPresenceFixture(pool);
  // region-ids (data): wave fauna rows still use legacy `novgorod_land`; engine matches G0 id only.
  await pool.query(
    `UPDATE world_base.presence_rules
        SET region_id = 'region_novgorod_land'
      WHERE world_revision_id = $1 AND region_id = 'novgorod_land'`,
    [REV],
  );
  return pool;
}

function gatedWorldReader(pool) {
  const sqlReader = createRuntimeCatalogWorldBaseReader((sql, params) => pool.query(sql, params));
  return {
    read: async (sql, params) => {
      if (typeof sql !== 'string') {
        return createSpatialV3WorldBaseReader({ query: (q, p) => pool.query(q, p) }).read(sql, params);
      }
      if (/runtime_catalog_activation_events/u.test(sql)) {
        return { rows: [{
          event_type: 'activate',
          catalog_revision_id: runtimeCatalogPin.catalog_revision_id,
          catalog_digest: runtimeCatalogPin.catalog_digest,
          compatible_world_revision_id: REV,
          compatible_world_catalog_digest: CATALOG_DIGEST,
        }] };
      }
      if (/FROM world_base\.world_revisions/u.test(sql) && !/spatial_v3/u.test(sql)) {
        return { rows: [{ id: REV, catalog_digest: CATALOG_DIGEST, status: 'approved' }] };
      }
      if (/spatial_v3_world_revisions/u.test(sql)) {
        return { rows: [{ id: REV, catalog_digest: CATALOG_DIGEST, status: 'approved' }] };
      }
      return sqlReader.read(sql, params);
    },
  };
}

async function insertCategory(pool, { id, parentId = null }) {
  await pool.query(`INSERT INTO world_base.universal_categories(
      id,domain,parent_category_id,stable_code,facet,preferred_label,definition,
      scope_note,inclusion_rules,exclusion_rules,title,status)
    VALUES ($1,'items',$2,$1,'object_type',$1,'def','note','in','ex',$1,'approved')
    ON CONFLICT (id) DO NOTHING`, [id, parentId]);
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
    await pool.query(`INSERT INTO world_base.spatial_v3_node_classes(
        node_id,node_version,category_id,class_ordinal)
      VALUES ($1,1,'cat_pg_g4_fixture',0)
      ON CONFLICT DO NOTHING`, [nodeId]);
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
  await insertCategory(pool, { id: 'cat_pg_parent_fixture' });
  await insertCategory(pool, { id: 'cat_pg_child_fixture', parentId: 'cat_pg_parent_fixture' });
  await insertCategory(pool, { id: 'cat_pg_unseen_xyz_fixture' });
  const rules = [
    ['pr_pg_empty', 'category', 'cat_pg_empty_fixture', 0, 3],
    ['pr_pg_parent', 'category', 'cat_pg_parent_fixture', 1_000_000, 1],
    ['pr_pg_child', 'category', 'cat_pg_child_fixture', 1_000_000, 1],
    ['pr_pg_unseen', 'category', 'cat_pg_unseen_xyz_fixture', 1_000_000, 1],
    ['pr_pg_season', 'category', 'cat_pg_season_fixture', 1_000_000, 1],
  ];
  await insertCategory(pool, { id: 'cat_pg_empty_fixture' });
  await insertCategory(pool, { id: 'cat_pg_season_fixture' });
  for (const [ruleId, subjectKind, subjectRef, ppm, limit] of rules) {
    const refresh = ruleId === 'pr_pg_season' ? 'by_year_season' : 'none';
    const seasons = ruleId === 'pr_pg_season' ? ['summer'] : ['all'];
    await pool.query(`INSERT INTO world_base.presence_rules(
        rule_id,rule_version,world_revision_id,scope_kind,scope_ref,subject_kind,subject_ref,
        category_id,presence_probability_ppm,count_limit,allowed_seasons,refresh_class,confidence,status)
      VALUES ($1,1,$2,'place_family',$3,$4,$5,$5,$6,$7,$8,$9,'high','approved')
      ON CONFLICT (rule_id,rule_version) DO NOTHING`,
    [ruleId, REV, pfId, subjectKind, subjectRef, ppm, limit, seasons, refresh]);
  }
  presencePgFixture = { nodeId, pfId };
}

async function loadFixtureRules(pool, season = 'summer') {
  const reader = gatedWorldReader(pool);
  const primary = await loadPresenceRulesForPlaceFamilies({
    worldBaseReader: reader, spatialWorldPin, worldPin, runtimeCatalogPin,
    placeFamilyIds: [presencePgFixture.pfId],
  });
  return mergePlaceFamilyPresenceRules({
    primaryRules: primary, secondaryRules: [], season, regionId: 'region_novgorod_land',
  });
}

function seedAggregate(scopeId) {
  const scope = { entity_kind: 'g6', entity_id: scopeId };
  const initial = createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 32 });
  return applyOrdinaryAggregateTransition({
    aggregate: initial,
    transition: {
      kind: 'seed', request_identity: 'seed', expected_state_version: 0,
      density_band: 'ordinary', identity_budget: 8, background_groups: [],
    },
  });
}

async function provisionPartyStart(pool, partyId) {
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: gatedWorldReader(pool),
    spatialWorldPin, worldPin, runtimeCatalogPin,
    readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 1230 }),
  });
  const provisioner = createOrdinaryMaterializationFirstEntryProvisioner({
    profile,
    includeContextBoundCapabilities: false,
    partyStartPresenceOnly: true,
    resolvePresenceRulesFirstArrival: resolver,
  });
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,2,$2,$3,'mat','rng','cmd','prof') ON CONFLICT DO NOTHING`,
  [partyId, REV, CATALOG_DIGEST]);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,expected_state_version_set,
     committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ($1,$2,'new_game','x','[]','x','x',0,0) ON CONFLICT DO NOTHING`,
  [`cs:${partyId}`, partyId]);
  const siteId = `g5:${partyId}`;
  const g6Id = `g6:${partyId}`;
  const posId = `pos:${partyId}`;
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,'canonical',$4,
      jsonb_build_object('entity_id', $4::text, 'authoring_version', '1'),
      'active',1,$3,$3) ON CONFLICT DO NOTHING`,
  [siteId, partyId, `cs:${partyId}`, presencePgFixture.nodeId]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,
     materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,'g5_site',$3,'canonical_template','{"entity_id":"st","authoring_version":"1"}'::jsonb,
      'trace','mat','dig','active',1,$4,$4) ON CONFLICT DO NOTHING`,
  [`baseline:${partyId}`, partyId, siteId, `cs:${partyId}`]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,
     physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,
     intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,
     status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'{"entity_id":"st","authoring_version":"1"}'::jsonb,'main','g5_site',$4,
      'open','primary','surface','none','default_clear','short','uniform','active',1,$5,$5)
    ON CONFLICT DO NOTHING`,
  [g6Id, partyId, `baseline:${partyId}`, siteId, `cs:${partyId}`]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,
     capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'work','focus',0,1,'default','active',1,$4,$4) ON CONFLICT DO NOTHING`,
  [posId, partyId, g6Id, `cs:${partyId}`]);
  const client = await pool.connect();
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
    return { first, second };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function presenceRows(aggregatePayload) {
  return (aggregatePayload?.presence_resolutions ?? [])
    .filter((row) => Object.hasOwn(row, 'subject_kind'));
}

test('PostgreSQL presence first arrival: wave import, activation, idempotent party start', {
  timeout: 600_000,
}, async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `presence-first-arrival-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  pool = await startPool(name);

  const { first, second } = await provisionPartyStart(pool, 'party-presence-a');
  assert.equal(first.provisioned, true);
  assert.equal(second.provisioned, false);
  const row = (await pool.query(`SELECT aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates
    WHERE party_id='party-presence-a' AND scope_id='g6:party-presence-a'`)).rows[0];
  const resolutions = presenceRows(row.aggregate_payload);
  assert.ok(resolutions.length >= 4);
  const empty = resolutions.find((r) => r.subject_ref === 'cat_pg_empty_fixture');
  assert.equal(empty?.count, 0);
  const child = resolutions.find((r) => r.subject_ref === 'cat_pg_child_fixture');
  assert.equal(child, undefined, 'LW-071: child skipped when parent resolved');
  assert.ok(resolutions.some((r) => r.subject_ref === 'cat_pg_unseen_xyz_fixture'));
  const digestA = canonicalDigest(resolutions);

  const reloadRow = (await pool.query(`SELECT aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates
    WHERE party_id='party-presence-a' AND scope_id='g6:party-presence-a'`)).rows[0];
  const replayAggregate = structuredClone(reloadRow.aggregate_payload);
  const rules = await loadFixtureRules(pool);
  const parentById = await loadCategoryParentMap({
    worldBaseReader: gatedWorldReader(pool),
    spatialWorldPin, worldPin, runtimeCatalogPin,
    categoryIds: ['cat_pg_child_fixture', 'cat_pg_parent_fixture', 'cat_pg_unseen_xyz_fixture'],
  });
  const afterReplay = applyPresenceRulesFirstArrival({
    aggregate: replayAggregate,
    partyId: 'party-presence-a',
    scopeInstanceRef: 'g5:party-presence-a',
    rules,
    parentById,
    periodNumber: 1230,
    requestIdentityPrefix: 'presence-first-arrival:g5:party-presence-a',
  });
  assert.equal(canonicalDigest(presenceRows(afterReplay)), digestA);

  await provisionPartyStart(pool, 'party-presence-b');
  const rowB = (await pool.query(`SELECT aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates
    WHERE party_id='party-presence-b' AND scope_id='g6:party-presence-b'`)).rows[0];
  const digestB = canonicalDigest(presenceRows(rowB.aggregate_payload));
  assert.notEqual(digestA, digestB, 'different party_id changes presence RNG outcomes');

  const context = await resolvePresenceRulesFirstArrivalForSite({
    worldBaseReader: gatedWorldReader(pool),
    spatialWorldPin, worldPin, runtimeCatalogPin,
    regionId: 'region_novgorod_land',
    season: 'summer',
    periodNumber: 1230,
    spatialNodeId: presencePgFixture.nodeId, spatialNodeVersion: 1,
    partyId: 'party-presence-a', siteId: 'g5:party-presence-a',
  });
  assert.ok(context?.rules?.length, 'seasonal fixture rules must resolve for pinned G4 node');
  let seasonal = seedAggregate('g6-seasonal');
  seasonal = applyPresenceRulesFirstArrival({ aggregate: seasonal, ...context, periodNumber: 2 });
  const seasonalAgain = applyPresenceRulesFirstArrival({ aggregate: seasonal, ...context, periodNumber: 2 });
  assert.equal(presenceRows(seasonalAgain).length, presenceRows(seasonal).length);
  const period3 = applyPresenceRulesFirstArrival({ aggregate: seasonal, ...context, periodNumber: 3 });
  assert.ok(presenceRows(period3).length > presenceRows(seasonal).length);
});
