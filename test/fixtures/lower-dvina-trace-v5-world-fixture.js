import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSpatialV3WorldBaseReader } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';

const root = 'data/world-catalogs/novgorod/spatial-v3/candidates';
const v5Path = `${root}/spatial-v3-production-v5`;
const lineagePaths = [
  `${root}/spatial-v3-production-v2/manifest.json`,
  `${root}/spatial-v3-production-v3/manifest.json`,
  `${root}/spatial-v3-production-v4/manifest.json`
];
const closureColumns = Object.freeze({
  spatial_v3_g6_template_slots: ['scene_slot_key', 'physical_class_id',
    'primary_scene_role_id', 'vertical_context_id', 'overhead_cover_id',
    'intra_g6_visibility_mode', 'default_visibility_distance_band',
    'acoustic_uniformity'],
  spatial_v3_scene_position_templates: ['position_slot_key',
    'g6_scene_slot_key', 'position_type_id', 'capacity', 'access_class_id'],
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

export const lowerDvinaTraceV5World = Object.freeze({
  revision: 'novgorod_spatial_v3_production_v5_candidate_001',
  digest: 'e616cdd4b7a09db06b7adb7b3faf2a82e0840d6aa286ad65ebbd97e0b86260ad',
  manifest: '6dcc825732bc745d3eb74ab586f8a0964ad3ede86bcda2adebe3a591902ef85c'
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
  })
]);

const pick = (row, columns) => Object.fromEntries(
  columns.map((column) => [column, row[column]])
);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

export async function installLowerDvinaTraceV5World(pool) {
  const manifest = await readJson(`${v5Path}/manifest.json`);
  assert.deepEqual({ revision: manifest.world_revision_id,
    digest: manifest.catalog_digest }, {
    revision: lowerDvinaTraceV5World.revision,
    digest: lowerDvinaTraceV5World.digest
  });
  const datasets = Object.fromEntries(await Promise.all(manifest.datasets.map(
    async ({ table, file }) => [table, await readJson(`${v5Path}/${file}`)]
  )));
  const lineage = await Promise.all(lineagePaths.map(readJson));
  await pool.query('CREATE SCHEMA IF NOT EXISTS world_base');
  await pool.query(`CREATE TABLE world_base.spatial_v3_world_revisions (
    id text PRIMARY KEY, parent_revision_id text REFERENCES
      world_base.spatial_v3_world_revisions(id), catalog_digest text NOT NULL,
    status text NOT NULL)`);
  await pool.query(`CREATE TABLE world_base.spatial_v3_scene_templates (
    id text NOT NULL, version integer NOT NULL, world_revision_id text NOT NULL,
    regional_template_id text NOT NULL, regional_template_version integer NOT NULL,
    status text NOT NULL, provenance_ref text NOT NULL, canonical_digest text NOT NULL,
    PRIMARY KEY(id, version))`);
  await pool.query(`CREATE TABLE world_base.spatial_v3_nodes (
    id text NOT NULL, version integer NOT NULL, world_revision_id text NOT NULL,
    spatial_level text NOT NULL, primary_class_id text NOT NULL, status text NOT NULL,
    canonical_digest text NOT NULL, PRIMARY KEY(id, version))`);
  await pool.query(`CREATE TABLE world_base.spatial_v3_node_parents (
    child_id text NOT NULL, child_version integer NOT NULL, parent_id text NOT NULL,
    parent_version integer NOT NULL, world_revision_id text NOT NULL)`);
  await pool.query(`CREATE TABLE world_base.spatial_v3_scene_materialization_profiles (
    id text NOT NULL, version integer NOT NULL, world_revision_id text NOT NULL,
    source_kind text NOT NULL, source_entity_id text NOT NULL,
    source_entity_version integer NOT NULL, status text NOT NULL,
    canonical_digest text NOT NULL, PRIMARY KEY(id, version))`);
  await pool.query(`CREATE TABLE world_base.spatial_v3_scene_materialization_candidates (
    profile_id text NOT NULL, profile_version integer NOT NULL,
    scene_template_id text NOT NULL, scene_template_version integer NOT NULL)`);
  for (const [table, columns] of Object.entries(closureColumns)) {
    await pool.query(`CREATE TABLE world_base.${table} (
      scene_template_id text NOT NULL, scene_template_version integer NOT NULL,
      ${columns.map((column) => `${column} text`).join(', ')},
      instance_count text, enclosing_structure_slot_key text,
      stable_asymmetry_evidence_ref text)`);
  }
  await pool.query(`CREATE TABLE world_base.spatial_v3_scene_endpoint_slots (
    scene_template_id text NOT NULL, scene_template_version integer NOT NULL,
    ${endpointColumns.map((column) => `${column} text`).join(', ')})`);
  await pool.query(`ALTER TABLE world_base.spatial_v3_scene_position_templates
    ALTER COLUMN capacity TYPE integer USING capacity::integer`);
  for (const table of ['spatial_v3_scene_movement_edge_templates']) {
    for (const column of ['transition_environment_profile_version',
      'movement_orientation_profile_version', 'action_units',
      'movement_method_cost_profile_version', 'base_minutes',
      'dynamic_recheck_policy_version', 'capacity', 'portal_template_version',
      'availability_condition_set_version']) {
      await pool.query(`ALTER TABLE world_base.${table} ALTER COLUMN ${column}
        TYPE integer USING NULLIF(${column}, '')::integer`);
    }
  }
  for (const table of ['spatial_v3_visibility_link_templates']) {
    for (const column of ['portal_template_version',
      'condition_profile_version']) {
      await pool.query(`ALTER TABLE world_base.${table} ALTER COLUMN ${column}
        TYPE integer USING NULLIF(${column}, '')::integer`);
    }
  }
  await pool.query(`INSERT INTO world_base.spatial_v3_world_revisions
    (id,parent_revision_id,catalog_digest,status) VALUES($1,NULL,$2,'approved')`,
  ['novgorod_spatial_v3_target_contract_approval_001',
    '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e']);
  for (const revision of [...lineage, datasets.spatial_v3_world_revisions[0]]) {
    await pool.query(`INSERT INTO world_base.spatial_v3_world_revisions
      (id,parent_revision_id,catalog_digest,status) VALUES($1,$2,$3,$4)`,
    [revision.id ?? revision.world_revision_id, revision.parent_revision_id, revision.catalog_digest,
      revision.status]);
  }
  for (const table of ['spatial_v3_nodes', 'spatial_v3_node_parents',
    'spatial_v3_scene_materialization_profiles',
    'spatial_v3_scene_materialization_candidates', 'spatial_v3_scene_templates',
    ...Object.keys(closureColumns), 'spatial_v3_scene_endpoint_slots']) {
    for (const row of datasets[table]) {
      const available = table === 'spatial_v3_nodes'
        ? ['id', 'version', 'world_revision_id', 'spatial_level',
          'primary_class_id', 'status', 'canonical_digest']
        : table === 'spatial_v3_scene_materialization_profiles'
          ? ['id', 'version', 'world_revision_id', 'source_kind',
            'source_entity_id', 'source_entity_version', 'status',
            'canonical_digest']
          : table === 'spatial_v3_scene_materialization_candidates'
            ? ['profile_id', 'profile_version', 'scene_template_id',
              'scene_template_version'] : Object.keys(row);
      const columns = available.filter((column) => Object.hasOwn(row, column));
      await pool.query(`INSERT INTO world_base.${table} (${columns.join(',')})
        VALUES(${columns.map((_, index) => `$${index + 1}`).join(',')})`,
      columns.map((column) => row[column]));
    }
  }
  const reader = createSpatialV3WorldBaseReader({ query: (sql, params) => pool.query(sql, params) });
  for (const scene of datasets.spatial_v3_scene_templates) {
    const closure = await reader.readPinnedSceneTemplateClosure({ id: scene.id,
      version: scene.version, world_revision_id: lowerDvinaTraceV5World.revision });
    assert.equal(closure.ok, true);
    assert.deepEqual(closure.value.header, pick(scene, ['id', 'version',
      'world_revision_id', 'regional_template_id', 'regional_template_version',
      'status', 'canonical_digest']));
    const rows = (table) => datasets[table].filter(({ scene_template_id }) =>
      scene_template_id === scene.id).map((row) => pick(row, closureColumns[table]));
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
}
