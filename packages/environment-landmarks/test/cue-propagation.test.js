import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDigest } from '@rus/materialization';
import { EnvironmentFeatureError, initializeEnvironmentFeatures, updateEnvironmentFeatures } from '../src/index.js';

const records = Object.freeze({
  landmark_rules: [{ id: 'ridge-rule', profile_id: 'ridge-profile', world_revision_id: 'revision-1', region_id: 'region-1', status: 'approved', min_count: 1, max_count: 1, required: true, weight: 1 }],
  landmark_profiles: [{ id: 'ridge-profile', world_revision_id: 'revision-1', region_id: 'region-1', status: 'approved' }],
  landmark_profile_entries: [{ profile_id: 'ridge-profile', template_id: 'ridge-tree', weight: 1, required: true }],
  landmark_templates: [{ id: 'ridge-tree', world_revision_id: 'revision-1', region_id: 'region-1', status: 'approved', category_id: 'environment_landmark.tree', public_label_key: 'tree', icon_key: 'tree', navigation_value: 'high', distinctiveness: 'high', recognition_difficulty: 'ordinary' }],
  landmark_rule_g1_classes: [{ rule_id: 'ridge-rule', g1_class: 'rural' }], landmark_rule_node_types: [{ rule_id: 'ridge-rule', node_type: 'ridge' }], landmark_rule_landscapes: [{ rule_id: 'ridge-rule', landscape_template_id: 'landscape-ridge' }], landmark_rule_hydrology: [], landmark_rule_land_use: [], landmark_rule_routes: [],
  cue_templates: [{ template_id: 'smoke-cue', status: 'approved', sense: 'sight', public_label_key: 'smoke', icon_key: 'smoke', base_intensity: 1, recognition_difficulty: 'ordinary', navigation_value: 'none', fading_duration_minutes: 30, expiry_duration_minutes: 60, propagation_policy: { schema: 'environment_cue_propagation_v1', wind_effects: { west: { intensity_multiplier: 1.2, drift_band: 'eastward' }, east: { intensity_multiplier: 0.8, drift_band: 'westward' } } } }],
  emission_rules: [{ rule_id: 'hearth-smoke-rule', status: 'approved', source_type: 'hearth', cue_template_id: 'smoke-cue' }],
  trace_templates: [], trace_creation_rules: [], decay_profiles: []
});
const digestPayload = { schema_version: 'environment-catalog.v2', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', regional_permissions: ['region-1'], ...records };
const catalog = Object.freeze({ ...digestPayload, catalog_digest: canonicalDigest(digestPayload) });
const emitter = Object.freeze({ emitter_id: 'camp-hearth-1', source_type: 'hearth', source_kind: 'camp', source_id: 'hidden-camp-1', location_binding: 'g4-ridge', bearing_band: 'north', distance_band: 'near', strength_band: 'moderate' });

function initialized() {
  return initializeEnvironmentFeatures({ party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', historical_frame: { season: 'summer' }, g1_id: 'g1-1', g1_graph_snapshot: { g1_class: 'rural', placement_candidates: [{ binding_id: 'g4-ridge', binding_type: 'g4_node', node_type: 'ridge', landscape_template_id: 'landscape-ridge', weight: 1 }] }, environment_snapshot: { weather: 'clear', wind: 'west' }, source_snapshot: { active_emitters: [] }, existing_environment_state: { state_version: 0, applied_update_keys: [], landmarks: [], cues: [], traces: [], baselines: [] }, catalog_bundle: catalog, catalog_digest: catalog.catalog_digest, materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', seed_context: { party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', trigger: 'g1_first_activation', occurrence: 0, catalog_digest: catalog.catalog_digest, environment_materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1' }, trigger: 'g1_first_activation', occurrence: 0 });
}

function update(state, baseStateVersion, activeEmitters, idempotencyKey) {
  return updateEnvironmentFeatures({ party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: baseStateVersion, current_environment_state: state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear', active_emitters: activeEmitters, trace_emissions: [], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest, materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: idempotencyKey });
}

test('wind changes approved cue propagation without changing its causal source identity', () => {
  const west = update(initialized().environment_state, 1, [{ ...emitter, propagation_wind: 'west' }], 'turn:wind-west');
  const east = update(west.environment_state, 2, [{ ...emitter, propagation_wind: 'east' }], 'turn:wind-east');
  assert.equal(west.environment_state.cues[0].source_id, 'hidden-camp-1');
  assert.equal(east.environment_state.cues[0].source_id, 'hidden-camp-1');
  assert.equal(west.environment_state.cues[0].intensity, 1.2);
  assert.equal(east.environment_state.cues[0].intensity, 0.8);
  assert.equal(west.environment_state.cues[0].propagation_drift_band, 'eastward');
  assert.equal(east.environment_state.cues[0].propagation_drift_band, 'westward');
});

test('cue propagation blocks absent or inapplicable approved wind policy', () => {
  const state = initialized().environment_state;
  assert.throws(() => update(state, 1, [emitter], 'turn:wind-invalid'), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_EMITTER_PROPAGATION_INVALID');
  assert.throws(() => update(state, 1, [{ ...emitter, propagation_wind: 'north' }], 'turn:wind-missing-policy'), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_CUE_PROPAGATION_UNAVAILABLE');
});
