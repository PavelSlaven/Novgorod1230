import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = 'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v5';
const read = async (file) => JSON.parse(await readFile(`${root}/${file}`, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const digest = (value) => sha256(Buffer.from(JSON.stringify(canonical(value))));

test('v5 wreck-shore and fishing-camp closures are sealed, inactive and reciprocal', async () => {
  const manifest = await read('manifest.json');
  const unsealed = structuredClone(manifest);
  delete unsealed.canonical_output_digest;
  assert.equal(manifest.canonical_output_digest, digest(unsealed));
  assert.equal(manifest.world_revision_id, 'novgorod_spatial_v3_production_v5_candidate_001');
  assert.equal(manifest.parent_revision_id, 'novgorod_spatial_v3_production_v4_candidate_001');
  assert.equal(manifest.production_activation, false);

  const datasets = new Map(await Promise.all(manifest.datasets.map(async (entry) => [
    entry.table, await read(entry.file)
  ])));
  for (const entry of manifest.datasets) {
    assert.equal(entry.sha256, sha256(await readFile(`${root}/${entry.file}`)));
  }
  const catalogEntries = manifest.datasets.filter(({ table }) => ![
    'world_revisions', 'spatial_v3_world_revisions'
  ].includes(table)).map(({ table, file, sha256: hash }) => ({ table, file, sha256: hash }));
  assert.equal(manifest.catalog_digest, digest(catalogEntries));

  const scene = datasets.get('spatial_v3_scene_templates');
  assert.equal(scene.length, 2);
  const fishingCamp = scene.find(({ id }) => id === 'trace_ld_v1_tpl_fishing_camp');
  const wreckShore = scene.find(({ id }) => id === 'trace_ld_v1_tpl_wreck_shore');
  assert.ok(fishingCamp);
  assert.ok(wreckShore);
  const scenePayload = structuredClone(fishingCamp);
  delete scenePayload.canonical_digest;
  assert.equal(fishingCamp.canonical_digest, digest(scenePayload));
  const wreckPayload = structuredClone(wreckShore);
  delete wreckPayload.canonical_digest;
  assert.equal(wreckShore.canonical_digest, digest(wreckPayload));
  assert.deepEqual(datasets.get('spatial_v3_g6_template_slots'), [{
    scene_template_id: 'trace_ld_v1_tpl_wreck_shore', scene_template_version: 1,
    scene_slot_key: 'open_shore', physical_class_id: 'spatial.g6.open',
    primary_scene_role_id: 'open_shore', vertical_context_id: 'surface',
    overhead_cover_id: 'none', intra_g6_visibility_mode: 'default_clear',
    default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform',
    enclosing_structure_slot_key: null
  }, {
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp', scene_template_version: 1,
    scene_slot_key: 'working_camp', physical_class_id: 'spatial.g6.open',
    primary_scene_role_id: 'working_camp', vertical_context_id: 'surface',
    overhead_cover_id: 'none', intra_g6_visibility_mode: 'default_clear',
    default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform',
    enclosing_structure_slot_key: null
  }, {
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp', scene_template_version: 1,
    scene_slot_key: 's1_open_one_space', physical_class_id: 'spatial.g6.semi_enclosed',
    primary_scene_role_id: 'ordinary_local', vertical_context_id: 'surface',
    overhead_cover_id: 'partial', intra_g6_visibility_mode: 'default_clear',
    default_visibility_distance_band: 'near', acoustic_uniformity: 'uniform',
    enclosing_structure_slot_key: null
  }]);
  assert.deepEqual(datasets.get('spatial_v3_scene_position_templates'), [{
    scene_template_id: 'trace_ld_v1_tpl_wreck_shore', scene_template_version: 1,
    position_slot_key: 'open_shore', g6_scene_slot_key: 'open_shore',
    instance_count: 1, position_type_id: 'scene_position', capacity: 7,
    access_class_id: 'trace_ld_v1_access_wreck_shore'
  }, {
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp', scene_template_version: 1,
    position_slot_key: 'working_camp', g6_scene_slot_key: 'working_camp',
    instance_count: 1, position_type_id: 'scene_position', capacity: 7,
    access_class_id: 'trace_ld_v1_access_fishing_camp'
  }, {
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp', scene_template_version: 1,
    position_slot_key: 's1_open_one_space.interior', g6_scene_slot_key: 's1_open_one_space',
    instance_count: 1, position_type_id: 'scene_position.central', capacity: 5,
    access_class_id: 'default'
  }]);
  assert.deepEqual(datasets.get('spatial_v3_scene_endpoint_slots'), [{
    scene_template_id: 'trace_ld_v1_tpl_wreck_shore', scene_template_version: 1,
    slot_key: 'departure', endpoint_role: 'departure',
    required_position_slot_key: 'open_shore', required_position_instance_ordinal: 0
  }]);
  assert.deepEqual(datasets.get('spatial_v3_scene_movement_edge_templates'), [{
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp', scene_template_version: 1,
    edge_slot_key: 's1_open_one_space.out', from_position_slot_key: 'working_camp',
    to_position_slot_key: 's1_open_one_space.interior', passage_type_id: 'passage.local',
    transition_environment_profile_id: 'topological_default', transition_environment_profile_version: 1,
    movement_orientation_profile_id: 'topological_default', movement_orientation_profile_version: 1,
    cost_kind: 'action', action_units: 1, baseline_movement_method_id: null,
    movement_method_cost_profile_id: null, movement_method_cost_profile_version: null,
    base_minutes: null, dynamic_recheck_policy_id: null, dynamic_recheck_policy_version: null,
    capacity: 1, portal_template_id: null, portal_template_version: null,
    availability_condition_set_id: null, availability_condition_set_version: null,
    reverse_edge_slot_key: 's1_open_one_space.back'
  }, {
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp', scene_template_version: 1,
    edge_slot_key: 's1_open_one_space.back', from_position_slot_key: 's1_open_one_space.interior',
    to_position_slot_key: 'working_camp', passage_type_id: 'passage.local',
    transition_environment_profile_id: 'topological_default', transition_environment_profile_version: 1,
    movement_orientation_profile_id: 'topological_default', movement_orientation_profile_version: 1,
    cost_kind: 'action', action_units: 1, baseline_movement_method_id: null,
    movement_method_cost_profile_id: null, movement_method_cost_profile_version: null,
    base_minutes: null, dynamic_recheck_policy_id: null, dynamic_recheck_policy_version: null,
    capacity: 1, portal_template_id: null, portal_template_version: null,
    availability_condition_set_id: null, availability_condition_set_version: null,
    reverse_edge_slot_key: 's1_open_one_space.out'
  }]);
  for (const table of ['spatial_v3_scene_movement_edge_templates', 'spatial_v3_visibility_link_templates']) {
    const rows = datasets.get(table);
    assert.equal(rows.length, 2);
    const endpoints = new Set(rows.flatMap((row) => [
      row.from_position_slot_key, row.to_position_slot_key
    ]));
    assert.deepEqual([...endpoints].sort(), ['s1_open_one_space.interior', 'working_camp']);
    for (const row of rows) {
      const reverse = rows.find((candidate) => candidate[table.includes('movement') ? 'edge_slot_key' : 'link_slot_key'] === row[table.includes('movement') ? 'reverse_edge_slot_key' : 'reverse_link_slot_key']);
      assert.ok(reverse);
      assert.equal(reverse.from_position_slot_key, row.to_position_slot_key);
      assert.equal(reverse.to_position_slot_key, row.from_position_slot_key);
    }
  }
});
