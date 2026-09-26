import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createSpatialV3WorldBaseReader } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { runWorldRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { activateGate1RuntimeCatalog } from
  '../../tools/runtime-catalog-activation/src/gate1-runtime-activation.js';
import { loadActiveRuntimeCatalogPin } from
  '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import { createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import { RUNTIME_CATALOG_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';

const root = 'data/world-catalogs/novgorod/spatial-v3/candidates';
const v5Path = `${root}/spatial-v3-production-v5`;
const v6Path = `${root}/spatial-v3-production-v6`;
const lineagePaths = [
  `${root}/spatial-v3-production-v2/datasets/spatial_v3_world_revisions.json`,
  `${root}/spatial-v3-production-v3/datasets/spatial_v3_world_revisions.json`,
  `${root}/spatial-v3-production-v4/datasets/spatial_v3_world_revisions.json`
];
const sourceRecordPaths = [2, 3, 4, 5, 6].map((version) =>
  `${root}/spatial-v3-production-v${version}/datasets/source_records.json`);
const categoryPaths = [2, 3, 4, 5, 6].map((version) =>
  `${root}/spatial-v3-production-v${version}/datasets/universal_categories.json`);
const regionalBasisPath =
  `${root}/spatial-v3-production-v3/datasets/spatial_v3_regional_scene_template_bases.json`;
const regionalBasisAuthoringPath =
  `${root}/spatial-v3-production-v3/datasets/spatial_v3_authoring_versions.json`;
const selectionRulePath =
  `${root}/spatial-v3-production-v3/datasets/spatial_v3_scene_selection_rules.json`;
const applicabilityRulePath =
  `${root}/spatial-v3-production-v3/datasets/spatial_v3_scene_applicability_rules.json`;
const closureColumns = Object.freeze({
  spatial_v3_g6_template_slots: ['scene_slot_key', 'physical_class_id',
    'primary_scene_role_id', 'vertical_context_id', 'overhead_cover_id',
    'intra_g6_visibility_mode', 'default_visibility_distance_band',
    'acoustic_uniformity', 'enclosing_structure_slot_key'],
  spatial_v3_scene_position_templates: ['position_slot_key',
    'g6_scene_slot_key', 'instance_count', 'position_type_id', 'capacity',
    'access_class_id'],
  spatial_v3_scene_movement_edge_templates: ['edge_slot_key',
    'from_position_slot_key', 'to_position_slot_key', 'reverse_edge_slot_key',
    'passage_type_id', 'transition_environment_profile_id',
    'transition_environment_profile_version', 'movement_orientation_profile_id',
    'movement_orientation_profile_version', 'cost_kind', 'action_units',
    'baseline_movement_method_id', 'movement_method_cost_profile_id',
    'movement_method_cost_profile_version', 'base_minutes',
    'dynamic_recheck_policy_id', 'dynamic_recheck_policy_version', 'capacity',
    'portal_template_id', 'portal_template_version',
    'availability_condition_set_id', 'availability_condition_set_version'],
  spatial_v3_visibility_link_templates: ['link_slot_key',
    'from_position_slot_key', 'to_position_slot_key', 'reverse_link_slot_key',
    'quality', 'distance_band', 'portal_template_id', 'portal_template_version',
    'condition_profile_id', 'condition_profile_version']
});
const endpointColumns = ['slot_key', 'endpoint_role',
  'required_position_slot_key', 'required_position_instance_ordinal'];
const runtimeCatalogBootstraps = new WeakMap();

export const lowerDvinaTraceV5World = Object.freeze({
  revision: 'novgorod_spatial_v3_production_v5_candidate_001',
  digest: 'e616cdd4b7a09db06b7adb7b3faf2a82e0840d6aa286ad65ebbd97e0b86260ad',
  manifest: '6dcc825732bc745d3eb74ab586f8a0964ad3ede86bcda2adebe3a591902ef85c'
});

export const lowerDvinaTraceV6World = Object.freeze({
  revision: 'novgorod_spatial_v3_production_v6_candidate_001',
  digest: '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
  manifest: '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb'
});

export const lowerDvinaTraceCanonicalG5SceneBindings = Object.freeze([
  Object.freeze({
    id: 'trace_ld_v1_g5_wreck_shore', version: 1,
    world_revision_id: lowerDvinaTraceV5World.revision, spatial_level: 'G5',
    primary_class_id: 'spatial.g5.parcel', status: 'approved',
    canonical_digest: 'b7ace289584fad2c96417fbb005a445bd578fb1d4531fc73ffd58a95393f2888',
    parent_id: 'g4v3__gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace',
    parent_version: 4, materialization_profile_id: 'trace_ld_v1_smp_wreck_shore',
    materialization_profile_version: 1,
    materialization_profile_digest: '4ba7f7eb4876457e252bb2489be1862de3e4a4b7dccaf8872b739bec98329e3d',
    scene_template_id: 'trace_ld_v1_tpl_wreck_shore', scene_template_version: 1
  }),
  Object.freeze({
    id: 'trace_ld_v1_g5_fishing_camp', version: 1,
    world_revision_id: lowerDvinaTraceV5World.revision, spatial_level: 'G5',
    primary_class_id: 'spatial.g5.compound', status: 'approved',
    canonical_digest: '0e5d543516e2055c7dd5a0879addef8293cfc2f76107cdf3c338beabc24fb621',
    parent_id: 'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach',
    parent_version: 4, materialization_profile_id: 'trace_ld_v1_smp_fishing_camp',
    materialization_profile_version: 1,
    materialization_profile_digest: '7c679edfd07ddb67bcef759df023cf2fd2ec1d476c89b0c59ae8e22db100a7de',
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp', scene_template_version: 1
  }),
  Object.freeze({
    id: 'trace_ld_v1_g5_old_drying_shed', version: 1,
    world_revision_id: lowerDvinaTraceV5World.revision, spatial_level: 'G5',
    primary_class_id: 'spatial.g5.structure', status: 'approved',
    canonical_digest: '1e2f53a47a9c77bc3e5bb8cc1fc5935413fc945b8f6ae2d4d26f99d26aa5b983',
    parent_id: 'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_resource_edge',
    parent_version: 4, materialization_profile_id: 'trace_ld_v1_smp_old_drying_shed',
    materialization_profile_version: 1,
    materialization_profile_digest: 'd3e6388b01e5c2546b7a7f62033bbd4f8433abbb3c1d5a3ee3bc2d3f3284648c',
    scene_template_id: 'trace_ld_v1_tpl_old_drying_shed', scene_template_version: 1
  })
]);

const pick = (row, columns) => Object.fromEntries(
  columns.map((column) => [column, row[column]])
);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function installLowerDvinaTraceWorld(pool, {
  path, world, lineagePaths: paths, categoryPathCount
}) {
  await ensureRuntimeCatalogSchema(pool, world);
  const manifest = await readJson(`${path}/manifest.json`);
  assert.deepEqual({ revision: manifest.world_revision_id,
    digest: manifest.catalog_digest }, {
    revision: world.revision,
    digest: world.digest
  });
  const datasets = Object.fromEntries(await Promise.all(manifest.datasets.map(
    async ({ table, file }) => [table, await readJson(`${path}/${file}`)]
  )));
  const [lineage, sourceRecordSets, categorySets, regionalBases,
    regionalBasisAuthoring, selectionRules, applicabilityRules] = await Promise.all([
    Promise.all(paths.map(readJson)),
    Promise.all(sourceRecordPaths.map(readJson)),
    Promise.all(categoryPaths.slice(0, categoryPathCount).map(readJson)),
    readJson(regionalBasisPath),
    readJson(regionalBasisAuthoringPath),
    readJson(selectionRulePath),
    readJson(applicabilityRulePath)
  ]);
  const sourceRecords = [...new Map(sourceRecordSets.flat()
    .map((record) => [record.id, record])).values()];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const record of sourceRecords) await insert(client,
      'source_records', record);
    for (const revision of [...lineage.flat(),
      ...datasets.spatial_v3_world_revisions]) await insert(client,
      'spatial_v3_world_revisions', revision);
    for (const category of categorySets.flat()) await insert(client,
      'universal_categories', category);
    for (const version of regionalBasisAuthoring.filter(({ entity_kind }) =>
      ['regional_scene_template_basis', 'scene_selection_rule',
        'scene_applicability_rule']
        .includes(entity_kind))) await insert(client,
      'spatial_v3_authoring_versions', version);
    for (const basis of regionalBases) await insert(client,
      'spatial_v3_regional_scene_template_bases', basis);
    for (const rule of selectionRules) await insert(client,
      'spatial_v3_scene_selection_rules', rule);
    for (const rule of applicabilityRules) await insert(client,
      'spatial_v3_scene_applicability_rules', rule);
    for (const table of ['spatial_v3_authoring_versions', 'spatial_v3_nodes',
      'spatial_v3_node_classes', 'spatial_v3_node_parents',
      'spatial_v3_g1_grid_cells', 'spatial_v3_scene_templates',
      'spatial_v3_scene_materialization_profiles',
      'spatial_v3_scene_materialization_candidates',
      ...Object.keys(closureColumns), 'spatial_v3_scene_endpoint_slots']) {
      for (const row of datasets[table]) {
        const columns = Object.keys(row);
        await client.query(`INSERT INTO world_base.${table} (${columns.join(',')})
          VALUES(${columns.map((_, index) => `$${index + 1}`).join(',')})`,
        columns.map((column) => row[column]));
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const reader = createSpatialV3WorldBaseReader({ query: (sql, params) => pool.query(sql, params) });
  for (const scene of datasets.spatial_v3_scene_templates) {
    const closure = await reader.readPinnedSceneTemplateClosure({ id: scene.id,
      version: scene.version, world_revision_id: world.revision });
    assert.equal(closure.ok, true);
    assert.deepEqual(closure.value.header, pick(scene, ['id', 'version',
      'world_revision_id', 'regional_template_id', 'regional_template_version',
      'status', 'canonical_digest']));
    const rows = (table) => datasets[table].filter(({ scene_template_id }) =>
      scene_template_id === scene.id).map((row) => pick(row, closureColumns[table]))
      .sort((left, right) => String(left[closureColumns[table][0]])
        .localeCompare(String(right[closureColumns[table][0]])));
    assert.deepEqual({ g6_slots: closure.value.g6_slots,
      position_slots: closure.value.position_slots,
      movement_edges: closure.value.movement_edges,
      visibility_links: closure.value.visibility_links }, {
      g6_slots: rows('spatial_v3_g6_template_slots'),
      position_slots: rows('spatial_v3_scene_position_templates'),
      movement_edges: rows('spatial_v3_scene_movement_edge_templates'),
      visibility_links: rows('spatial_v3_visibility_link_templates')
    });
  }
  const runtimeCatalogPin = await loadActiveRuntimeCatalogPin(pool,
    'item_container_materialization_v2');
  const verifiedItemCatalog = await createRuntimeCatalogLoader({
    worldBaseReader: { read: (sql, parameters) => pool.query(sql, parameters) },
    supportedRuntimeContractDigests: [RUNTIME_CATALOG_CONTRACT_DIGEST]
  }).loadApprovedItemCatalog({ pin: runtimeCatalogPin });
  return Object.freeze({ runtimeCatalogPin, verifiedItemCatalog });
}

async function insert(pool, table, row) {
  const columns = Object.keys(row);
  const inserted = await pool.query(
    `INSERT INTO world_base.${table} (${columns.join(',')})
       VALUES(${columns.map((_, index) => `$${index + 1}`).join(',')})
       ON CONFLICT DO NOTHING`,
    columns.map((column) => row[column])
  );
  if (inserted.rowCount === 1) return;
  const keyColumns = table === 'spatial_v3_authoring_versions'
    ? ['entity_kind', 'entity_id', 'version'] : ['id'];
  const existing = (await pool.query(
    `SELECT to_jsonb(row) AS value FROM world_base.${table} AS row
      WHERE ${keyColumns.map((column, index) =>
        `${column}=$${index + 1}`).join(' AND ')}`,
    keyColumns.map((column) => row[column])
  )).rows;
  if (existing.length !== 1 || columns.some((column) =>
    JSON.stringify(existing[0].value[column]) !== JSON.stringify(row[column]))) {
    throw new Error(`Canonical ${table} row conflicts: ${row.id}`);
  }
}

async function ensureRuntimeCatalogSchema(pool, world) {
  const pending = runtimeCatalogBootstraps.get(pool);
  if (pending) return pending;
  const bootstrap = (async () => {
    const state = (await pool.query(`SELECT
      to_regclass('world_base.domain_catalog_revisions') IS NOT NULL AS catalog,
      to_regclass('world_base.spatial_v3_world_revisions') IS NOT NULL AS spatial`
    )).rows[0];
    if (!state.catalog && !state.spatial) {
      const options = pool.options;
      const url = new URL('postgresql://localhost');
      url.hostname = options.host;
      url.port = String(options.port);
      url.username = options.user;
      url.password = options.password;
      url.pathname = `/${options.database}`;
      const imported = spawnSync(process.execPath,
        ['scripts/run-pr17-item-container-stage3c.mjs', '--mode',
          'fixture-bootstrap'], {
          cwd: process.cwd(),
          env: { ...process.env, PR17_TEST_DATABASE_URL: url.toString() },
          encoding: 'utf8',
          timeout: 180_000
        });
      if (imported.status !== 0) {
        throw new Error(`Canonical Gate1 bootstrap failed: ${imported.stderr}`);
      }
      for (let part = 18; part <= 20; part += 1) {
        await pool.query(await readFile(
          `infra/world-base/schema/${String(part).padStart(2, '0')}.sql`,
          'utf8'
        ));
      }
    }
    await runWorldRuntimeCatalogMigration(pool);
    await activateGate1RuntimeCatalog({
      worldPool: pool,
      partyPool: pool,
      repositoryRoot: process.cwd(),
      worldReleaseId: world === lowerDvinaTraceV6World
        ? 'spatial-v3-production-v6' : 'spatial-v3-production-v5'
    });
  })();
  runtimeCatalogBootstraps.set(pool, bootstrap);
  try {
    return await bootstrap;
  } catch (error) {
    runtimeCatalogBootstraps.delete(pool);
    throw error;
  }
}

export async function installLowerDvinaTraceV5World(pool) {
  return installLowerDvinaTraceWorld(pool, {
    path: v5Path,
    world: lowerDvinaTraceV5World,
    lineagePaths,
    categoryPathCount: 4
  });
}

export async function installLowerDvinaTraceV6World(pool) {
  return installLowerDvinaTraceWorld(pool, {
    path: v6Path,
    world: lowerDvinaTraceV6World,
    lineagePaths,
    categoryPathCount: 5
  });
}
