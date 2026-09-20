import assert from 'node:assert/strict';
import test from 'node:test';
import { compileProceduralSceneProfile } from '../src/index.js';

const approved = (id, extra = {}) => ({ id, status: 'approved', ...extra });
const binding = (requiredLayers) => ({
  schema: 'rus.procedural_scene_authoring_binding.v1', status: 'approved',
  binding_id: 'river-work-v1', family: 'fishing_worksite',
  required_layers: requiredLayers,
  spatial_closure_ref: { scene_template_id: 'scene:fishing', version: 1 },
  landscape_template_ref: 'land:bank', water_body_template_ref: 'water:river',
  land_use_template_refs: ['land-use:fishing'],
  place_template_ref: 'place:fishing', item_profile_ref: 'items:fishing',
  npc_profile_set_ref: 'npcs:fishing'
});
const tables = () => ({
  landscape_templates: [approved('land:bank', { soil_ground_type: 'alluvial_sand',
    relief_type: 'low_bank', dominant_vegetation: 'riparian_grass',
    base_environment: 'river_bank' })],
  water_body_templates: [approved('water:river', { water_body_type: 'small_river' })],
  land_use_templates: [approved('land-use:fishing', { land_use_kind: 'inland_fishing' })],
  place_templates: [approved('place:fishing', { place_kind: 'water_work_site' })],
  item_profile_sets: [approved('items:fishing')],
  item_profile_entries: [{ id: 'entry:net', profile_id: 'items:fishing',
    item_template_id: 'item:net', min_quantity: 1, max_quantity: 2,
    required: true, weight: 55 }],
  item_templates: [approved('item:net', { category_id: 'category:net' })],
  universal_categories: [approved('category:net', { stable_code: 'fishing_net' })],
  region_npc_profile_sets: [approved('npcs:fishing', {
    demographic_profile_id: 'demographic:regional',
    appearance_profile_id: 'appearance:regional',
    equipment_profile_id: 'equipment:fisher', behavior_profile_id: 'behavior:work',
    relationship_profile_id: 'relationship:crew', activity_profile_id: 'activity:fishing',
    schedule_profile_id: 'schedule:day' })]
});
const pin = { world_revision_id: 'world:v6', world_catalog_digest: 'a'.repeat(64) };

test('compiler derives typed executable profile only from owner records', () => {
  const required = ['surface','relief','vegetation','environment','water',
    'work_zone','place_function','tool','npc'];
  const result = compileProceduralSceneProfile({ binding: binding(required),
    records_by_table: tables(), world_pin: pin });
  assert.deepEqual(result.required_layers, [...required].sort());
  assert.equal(result.optional_presence_policy, null);
  assert.equal(result.gameplay_materialization_llm_calls, 0);
  assert.ok(result.components.every(({ owner_ref }) => owner_ref?.table));
  assert.ok(result.components.some(({ layer, item_template_ref }) =>
    layer === 'tool' && item_template_ref === 'item:net'));
});

test('compiler rejects sand-only river bank and missing functional tool', () => {
  const sparse = tables();
  delete sparse.landscape_templates[0].dominant_vegetation;
  assert.throws(() => compileProceduralSceneProfile({
    binding: binding(['surface','vegetation','water']),
    records_by_table: sparse, world_pin: pin }), (error) =>
    error.code === 'PROCEDURAL_SCENE_PROFILE_DATA_GAP'
      && error.details.missing_layers.includes('vegetation'));
  const optionalTool = tables();
  optionalTool.item_profile_entries[0].required = false;
  assert.throws(() => compileProceduralSceneProfile({
    binding: binding(['surface','water','tool']),
    records_by_table: optionalTool, world_pin: pin }),
  { code: 'PROCEDURAL_SCENE_PROFILE_DATA_GAP' });
});

test('compiler rejects candidate records not activated as approved', () => {
  const inactive = tables();
  inactive.landscape_templates[0].status = 'draft';
  assert.throws(() => compileProceduralSceneProfile({ binding: binding(['surface']),
    records_by_table: inactive, world_pin: pin }),
  { code: 'PROCEDURAL_SCENE_PROFILE_DATA_GAP' });
});
