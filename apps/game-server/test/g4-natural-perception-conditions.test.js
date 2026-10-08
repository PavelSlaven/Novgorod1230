import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApprovedG4NaturalPlacementCatalog } from '@rus/runtime-catalog';
import { resolveG4NaturalPerceptionConditions } from '../src/runtime/g4-natural-perception-conditions.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';

async function fixture() {
  const value = await approvedNaturalPerceptionFixture();
  return { ...value, args: { verifiedCatalog: value.input.verifiedCatalog, pin: value.input.pin,
    naturalProfile: value.naturalProfile, sceneClosure: value.sceneClosure, current: value.currentSourceState,
    snapshot: { location: { party_id: 'party:1', owner_id: 'player:1', scene_position_id: 'position:inside' },
      g6: value.input.currentFacts.scene.g6, positions: value.input.currentFacts.scene.positions } } };
}

test('approved placement applies current Temporal conditions and causal sound state', async () => {
  const { args } = await fixture();
  assert.equal(loadApprovedG4NaturalPlacementCatalog(args).placements.length, 160);
  const day = resolveG4NaturalPerceptionConditions(args);
  assert.equal(day.visible_scene, 'Окрестности.');
  assert.equal(day.layer_admissions.find((row) => row.layer === 'water_body').visual_conditions.lighting, 'clear');
  args.current.current_environment.light_state = 'night';
  args.current.current_environment.weather_state.visibility = 'normal_or_reduced';
  args.current.source_observations.find((row) => row.layer === 'audible_context').current_water_source_state = 'frozen';
  const night = resolveG4NaturalPerceptionConditions(args);
  assert.equal(night.layer_admissions.find((row) => row.layer === 'water_body').visual_conditions.lighting, 'none');
  assert.equal(night.layer_admissions.find((row) => row.layer === 'water_body').visual_conditions.weather, 'partial');
  assert.equal(night.layer_admissions.find((row) => row.layer === 'audible_context').source_state, 'absent');
});

test('placement never fabricates current source, faculties, occlusion, sound or template pins', async () => {
  for (const mutate of [
    (v) => { v.current.source_observations = []; },
    (v) => { delete v.current.visual_capability; },
    (v) => { delete v.current.source_observations[0].dynamic_occlusion; },
    (v) => { v.current.source_observations.find((row) => row.layer === 'audible_context').current_water_source_state = 'unknown'; },
    (v) => { v.sceneClosure.header.canonical_digest = 'f'.repeat(64); },
    (v) => { v.current.current_environment.calendar_record_ref.version = 2; },
    (v) => { v.snapshot.g6[0].overhead_cover_id = 'roof'; },
    (v) => { v.current.position_id = 'other'; }
  ]) {
    const { args } = await fixture(); mutate(args);
    assert.throws(() => resolveG4NaturalPerceptionConditions(args), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  }
});

test('altered compiled placement or missing membership is rejected before projection', async () => {
  for (const mutate of [
    (v) => { v.verifiedCatalog.records_by_table.procedural_scene_compiled_records.pop(); },
    (v) => { v.verifiedCatalog.records_by_table.procedural_scene_compiled_records.at(-1).payload.placements[0].visual_layers = []; }
  ]) {
    const { args } = await fixture(); mutate(args);
    assert.throws(() => loadApprovedG4NaturalPlacementCatalog(args), { code: 'G4_NATURAL_PLACEMENT_CATALOG_INVALID' });
  }
});
