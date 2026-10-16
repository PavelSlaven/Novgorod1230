import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSpatialV3PlaceLabel } from '../src/spatial-v3-projection.js';
import { loadApprovedPlaceLabels } from '../../../data/world-catalogs/novgorod/m2c-place-labels/approved-labels.mjs';

test('approved place labels resolve only by exact canonical G5 ref', () => {
  const labels = loadApprovedPlaceLabels();
  assert.ok(labels instanceof Map);
  const expected = [
    ['cg5v3__gn_nov_g4_xp017_yp026_r2_dry_pine_ridge_south_approach', 1, 'На подходе к лесной гряде'],
    ['cg5v3__gn_nov_g4_xp017_yp026_r2_south_entry_reach_upstream_approach', 1, 'У речного берега'],
    ['cg5v3__gn_nov_g4_xp017_yp026_r2_reed_backwater_entrance', 1, 'У заболоченной заводи'],
    ['cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_resource_edge_river_edge', 1, 'На лесном берегу протока'],
    ['cg5v3__gn_nov_g4_xp017_yp026_r2_zaostrovye_settlement_center_river_approach', 1, 'На протоке у селения'],
    ['cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_work_storage', 1, 'На хозяйственном дворе'],
    ['cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_household_cluster', 1, 'Среди дворов'],
  ];
  for (const [id, version, label] of expected) {
    assert.equal(selectSpatialV3PlaceLabel({ id, version }, labels), label);
  }
  assert.equal(selectSpatialV3PlaceLabel({ id: expected[0][0], version: 2 }, labels), null);
  assert.equal(selectSpatialV3PlaceLabel({ id: 'unknown', version: 1 }, labels), null);
});

test('natural profile/template labels are fallback and exact G5 labels take precedence', () => {
  const labels = new Map([
    ['natural:g4@1|template@1', { display_label: 'Wrong G4 label' }],
    ['natural:natural-profile@2|template@1', { display_label: 'У лесного ручья' }],
    ['g5@1', { display_label: 'У старой переправы' }],
  ]);
  const naturalPlaceRef = { g4_ref: { id: 'g4', version: 1 },
    natural_profile_ref: { id: 'natural-profile', version: 2 },
    scene_template_ref: { id: 'template', version: 1 } };
  assert.equal(selectSpatialV3PlaceLabel(null, labels, naturalPlaceRef), 'У лесного ручья');
  assert.equal(selectSpatialV3PlaceLabel({ id: 'g5', version: 1 }, labels, naturalPlaceRef),
    'У старой переправы');
  assert.equal(selectSpatialV3PlaceLabel({ id: 'unlabelled-g5', version: 1 }, labels,
    naturalPlaceRef), 'У лесного ручья');
  assert.equal(selectSpatialV3PlaceLabel(null, labels, { g4_ref: { id: 'g4', version: 1 },
    scene_template_ref: { id: 'template', version: 1 } }), null);
});

test('natural scene title uses the same approved label and keeps existing fallback', async () => {
  const { projectSpatialV3NaturalScene } = await import('../src/spatial-v3-projection.js');
  const { naturalSceneFixture } = await import('./natural-scene-fixture.js');
  const labels = loadApprovedPlaceLabels();
  const input = naturalSceneFixture();
  input.scene.natural_profile_ref = { ...input.natural_baseline.profile_ref };
  labels.set('natural:natural@1|template@1', { display_label: 'У тихой заводи' });
  input.scene.approved_place_labels = labels;
  assert.equal(projectSpatialV3NaturalScene(input).visible_context.visible_scene, 'У тихой заводи');
  input.scene.canonical_g5_ref = { id: 'cg5v3__gn_nov_g4_xp017_yp026_r2_dry_pine_ridge_south_approach', version: 1 };
  const result = projectSpatialV3NaturalScene(input);
  assert.equal(result.ok, true);
  assert.equal(result.visible_context.visible_scene, 'На подходе к лесной гряде');
  input.scene.approved_place_labels = new Map();
  assert.equal(projectSpatialV3NaturalScene(input).visible_context.visible_scene, 'Берег');
});
