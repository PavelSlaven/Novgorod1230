import assert from 'node:assert/strict';
import test from 'node:test';
import { generateProceduralSceneProfileCatalog } from
  '../../../scripts/generate-procedural-scene-profiles.mjs';

const approved = (id, extra = {}) => ({ id, status: 'approved', ...extra });
const binding = { schema: 'rus.procedural_scene_authoring_binding.v1',
  status: 'approved', binding_id: 'natural-v1', family: 'river_bank',
  required_layers: ['surface','relief','vegetation','environment','water',
    'place_function'], spatial_closure_ref: { scene_template_id: 'scene', version: 1 },
  landscape_template_ref: 'land', water_body_template_ref: 'water',
  land_use_template_refs: [], place_template_ref: 'place',
  item_profile_ref: null, npc_profile_set_ref: null };
const records = { landscape_templates: [approved('land', {
  soil_ground_type: 'sand', relief_type: 'bank', dominant_vegetation: 'grass',
  base_environment: 'river' })], water_body_templates: [approved('water', {
  water_body_type: 'river' })], land_use_templates: [],
place_templates: [approved('place', { place_kind: 'natural_place' })] };
const worldPin = { world_revision_id: 'world-v6',
  world_catalog_digest: 'a'.repeat(64) };

test('generator binds deterministic catalog to exact active event and world pin', () => {
  const input = { bindings: { schema: 'rus.procedural_scene_authoring_bindings.v1',
    status: 'approved', bindings: [binding] }, approvedRecordBundle: {
    schema: 'rus.procedural_scene_approved_record_bundle.v1',
    world_pin: worldPin, activation: { status: 'active', event_id: 'event-v6',
      ...worldPin }, records_by_table: records } };
  assert.deepEqual(generateProceduralSceneProfileCatalog(input),
    generateProceduralSceneProfileCatalog(structuredClone(input)));
  assert.equal(generateProceduralSceneProfileCatalog(input)
    .activation_event_ref, 'event-v6');
});

test('generator refuses candidate-only or mismatched activation metadata', () => {
  const bindings = { schema: 'rus.procedural_scene_authoring_bindings.v1',
    status: 'approved', bindings: [binding] };
  assert.throws(() => generateProceduralSceneProfileCatalog({ bindings,
    approvedRecordBundle: { schema: 'rus.procedural_scene_approved_record_bundle.v1',
      world_pin: worldPin, activation: { status: 'candidate', event_id: 'x',
        ...worldPin }, records_by_table: records } }),
  /PROCEDURAL_SCENE_GENERATOR_INPUT_INVALID/u);
});
