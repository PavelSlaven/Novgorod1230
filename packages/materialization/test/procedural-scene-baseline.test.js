import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeProceduralSceneBaseline } from '../src/index.js';

const profile = (family = 'river_bank') => ({
  schema: 'rus.procedural_scene_baseline_profile.v1', version: 1,
  status: 'approved', profile_id: `${family}_v1`, family,
  required_components: [
    { component_id: 'surface', layer: 'surface', kind: 'group', required: true,
      descriptor: 'влажный песчаный берег' },
    { component_id: 'water', layer: 'water', kind: 'ambient_source', required: true,
      descriptor: 'текущая речная вода', quantity_unit: 'portion' },
    { component_id: 'driftwood', layer: 'natural_material', kind: 'finite_source',
      required: true, descriptor: 'вынесенные водой ветви',
      quantity_unit: 'piece', initial_quantity: 3 }
  ],
  optional_components: [
    { component_id: 'reeds', layer: 'wet_vegetation', kind: 'finite_source',
      required: false, descriptor: 'полоса камыша', quantity_unit: 'bundle',
      initial_quantity: 4, presence_weight: 1, absence_weight: 1, excludes: [] },
    { component_id: 'stones', layer: 'natural_material', kind: 'finite_source',
      required: false, descriptor: 'речные камни', quantity_unit: 'piece',
      initial_quantity: 5, presence_weight: 1, absence_weight: 1, excludes: [] }
  ]
});
const run = (seed = 'same', p = profile()) => materializeProceduralSceneBaseline({
  party_id: `party:${seed}`, scope_ref: { entity_kind: 'g6', entity_id: 'shore' },
  profile: p, seed_context: { party_id: `party:${seed}`,
    profile_id: p.profile_id, scope_ref: { entity_kind: 'g6', entity_id: 'shore' },
    rng_algorithm_id: 'mulberry32_v1' }
});

test('procedural scene baseline keeps required layers and replays exact seed', () => {
  const left = run(), right = run();
  assert.deepEqual(left, right);
  assert.deepEqual(left.components.filter(({ required }) => required)
    .map(({ component_id }) => component_id), ['driftwood', 'surface', 'water']);
  assert.equal(left.rng_draw_count, 2);
});

test('same owner supports natural, worksite and human-place families', () => {
  for (const family of ['river_bank', 'fishing_worksite', 'household_yard']) {
    const result = run('seed', profile(family));
    assert.equal(result.family, family);
    assert.ok(result.components.some(({ layer }) => layer === 'surface'));
  }
});

test('profile rejects missing finite mechanics and unknown exclusions', () => {
  const broken = profile();
  delete broken.required_components[2].initial_quantity;
  assert.throws(() => run('broken', broken),
    { code: 'PROCEDURAL_SCENE_BASELINE_PROFILE_INVALID' });
  const forged = profile();
  forged.optional_components[0].excludes = ['unknown'];
  assert.throws(() => run('forged', forged),
    { code: 'PROCEDURAL_SCENE_BASELINE_PROFILE_INVALID' });
});
