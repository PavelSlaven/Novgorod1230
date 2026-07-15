import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EnvironmentFeatureError,
  buildEnvironmentObservationCandidates,
  initializeEnvironmentFeatures,
  updateEnvironmentFeatures,
  validateEnvironmentCatalogBundle
} from '../src/index.js';
import { canonicalDigest } from '@rus/materialization';

const catalogRecords = Object.freeze({
  landmark_rules: [{
    rule_id: 'ridge-landmark-rule', status: 'approved', min_count: 1, max_count: 1,
    template_ids: ['split-pine'], placement_types: ['g4_node'], required: true
  }],
  landmark_templates: [{
    template_id: 'split-pine', status: 'approved', category_id: 'environment_landmark.tree',
    public_label_key: 'landmark_tree', icon_key: 'landmark_tree', navigation_value: 'high',
    distinctiveness: 'high', recognition_difficulty: 'ordinary'
  }],
  cue_templates: [{
    template_id: 'smoke-cue', status: 'approved', sense: 'sight', public_label_key: 'cue_smoke',
    icon_key: 'cue_smoke', base_intensity: 1, recognition_difficulty: 'ordinary', navigation_value: 'none', fading_duration_minutes: 30, expiry_duration_minutes: 60
  }],
  emission_rules: [{
    rule_id: 'hearth-smoke-rule', status: 'approved', source_type: 'hearth', cue_template_id: 'smoke-cue'
  }],
  trace_templates: [{ template_id: 'cart-track', status: 'approved', public_label_key: 'trace_cart', icon_key: 'trace_cart', recognition_difficulty: 'ordinary', navigation_value: 'none' }],
  trace_creation_rules: [{
    rule_id: 'cart-track-rule', status: 'approved', source_kind: 'movement', movement_mode: 'cart',
    trace_template_id: 'cart-track', decay_profile_id: 'wet-ground-decay'
  }],
  decay_profiles: [{
    profile_id: 'wet-ground-decay', status: 'approved', readable_at_or_above: 0.7,
    faint_at_or_above: 0.2, decay_per_minute: 0.01, precipitation_multiplier: 2
  }]
});

function approvedCatalog(overrides = {}) {
  const bundle = {
    schema_version: 'environment-catalog.v1',
    world_revision_id: 'revision-1',
    region_id: 'region-1',
    historical_period_id: 'period-1',
    regional_permissions: ['region-1'],
    ...catalogRecords,
    ...overrides
  };
  const { catalog_digest: ignored, ...digestPayload } = bundle;
  return Object.freeze({ ...bundle, catalog_digest: overrides.catalog_digest ?? canonicalDigest(digestPayload) });
}

const catalog = approvedCatalog();

function initializationInput(overrides = {}) {
  const seedContext = {
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', trigger: 'g1_first_activation',
    occurrence: 0, catalog_digest: catalog.catalog_digest, environment_materializer_version: 'environment_landmarks_v1',
    rng_algorithm_id: 'mulberry32_v1'
  };
  return {
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', historical_frame: { season: 'summer' }, g1_id: 'g1-1',
    g1_graph_snapshot: { placement_candidates: [{ binding_id: 'g4-ridge', binding_type: 'g4_node', landscape_type: 'dry_ridge' }] },
    environment_snapshot: { weather: 'clear', wind: 'west' }, source_snapshot: { active_emitters: [] },
    existing_environment_state: { state_version: 0, applied_update_keys: [], landmarks: [], cues: [], traces: [], baselines: [] }, catalog_bundle: catalog,
    catalog_digest: catalog.catalog_digest, materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1',
    seed_context: seedContext, trigger: 'g1_first_activation', occurrence: 0, ...overrides
  };
}

test('environment landmarks materializes a deterministic baseline once and never rematerializes it', () => {
  const first = initializeEnvironmentFeatures(initializationInput());
  const repeated = initializeEnvironmentFeatures(initializationInput({
    existing_environment_state: first.environment_state
  }));
  assert.equal(first.created_landmarks.length, 1);
  assert.equal(first.created_landmarks[0].template_id, 'split-pine');
  assert.equal(repeated.created_landmarks.length, 0);
  assert.deepEqual(repeated.environment_state.landmarks, first.environment_state.landmarks);
});

test('baseline initialization never starts cue or trace lifecycle implicitly', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput({
    source_snapshot: {
      active_emitters: [{ emitter_id: 'camp-hearth-1', source_type: 'hearth', source_kind: 'camp', source_id: 'hidden-camp-1', location_binding: 'g4-ridge' }],
      initial_trace_emissions: [],
      event_emissions: []
    }
  }));
  assert.deepEqual(initialized.created_cues, []);
  assert.deepEqual(initialized.created_traces, []);
  assert.deepEqual(initialized.environment_state.cues, []);
  assert.deepEqual(initialized.environment_state.traces, []);
});

test('environment baseline rejects an unbound catalog digest, world revision, region, period or permission', () => {
  assert.throws(() => initializeEnvironmentFeatures(initializationInput({ catalog_digest: '0'.repeat(64) })), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_CATALOG_DIGEST_MISMATCH');
  assert.throws(() => initializeEnvironmentFeatures(initializationInput({ world_revision_id: 'revision:wrong' })), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_CATALOG_WORLD_REVISION_MISMATCH');
  assert.throws(() => initializeEnvironmentFeatures(initializationInput({ region_id: 'region:wrong' })), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_CATALOG_REGION_MISMATCH');
  assert.throws(() => initializeEnvironmentFeatures(initializationInput({ historical_period_id: 'period:wrong' })), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_CATALOG_PERIOD_MISMATCH');
  const withoutPermission = approvedCatalog({ regional_permissions: [] });
  assert.throws(() => initializeEnvironmentFeatures(initializationInput({ catalog_bundle: withoutPermission, catalog_digest: withoutPermission.catalog_digest })), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_REGIONAL_PERMISSION_MISSING');
  assert.equal(validateEnvironmentCatalogBundle(initializationInput()).pass, true);
  assert.equal(validateEnvironmentCatalogBundle(initializationInput({ catalog_digest: '0'.repeat(64) })).errors[0].code, 'ENVIRONMENT_CATALOG_DIGEST_MISMATCH');
});

test('environment update rejects stale versions and replays an idempotency key without a second mutation', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput());
  const update = {
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 1,
    current_environment_state: initialized.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [], trace_emissions: [], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:versioned'
  };
  const first = updateEnvironmentFeatures(update);
  assert.equal(first.environment_state.state_version, 2);
  const replay = updateEnvironmentFeatures({ ...update, current_environment_state: first.environment_state });
  assert.equal(replay.status, 'replayed');
  assert.equal(replay.environment_state.state_version, 2);
  assert.throws(() => updateEnvironmentFeatures({ ...update, idempotency_key: 'turn:stale', current_environment_state: first.environment_state }), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_STATE_VERSION_MISMATCH');
});

test('environment cue lifecycle rejects an incomplete approved template instead of using defaults', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput());
  const incompleteCatalog = approvedCatalog({ cue_templates: [{ ...catalogRecords.cue_templates[0], base_intensity: null }] });
  assert.throws(() => updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 1,
    current_environment_state: initialized.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [{ emitter_id: 'camp-hearth-1', source_type: 'hearth', source_kind: 'camp', source_id: 'hidden-camp-1', location_binding: 'g4-ridge', bearing_band: 'north', distance_band: 'near', strength_band: 'moderate' }],
    trace_emissions: [], event_emissions: [], catalog_bundle: incompleteCatalog, catalog_digest: incompleteCatalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:incomplete-cue'
  }), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_CUE_TEMPLATE_INVALID');
});

test('environment cue lifecycle blocks an emitter without formal observation bands', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput());
  assert.throws(() => updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 1,
    current_environment_state: initialized.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [{ emitter_id: 'camp-hearth-1', source_type: 'hearth', source_kind: 'camp', source_id: 'hidden-camp-1', location_binding: 'g4-ridge' }],
    trace_emissions: [], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:missing-observation'
  }), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_EMITTER_OBSERVATION_INVALID');
});

test('environment cues require an active approved source and never disclose it in observation candidates', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput());
  const result = updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 1,
    current_environment_state: initialized.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [{ emitter_id: 'camp-hearth-1', source_type: 'hearth', source_kind: 'camp', source_id: 'hidden-camp-1', location_binding: 'g4-ridge', bearing_band: 'north', distance_band: 'near', strength_band: 'moderate' }],
    trace_emissions: [], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn-1'
  });
  const observations = buildEnvironmentObservationCandidates({ environment_state: result.environment_state, environment_snapshot: { weather: 'clear', wind: 'west' } });
  assert.equal(result.created_cues.length, 1);
  assert.equal(observations.length, 2);
  assert.equal(JSON.stringify(observations).includes('hidden-camp-1'), false);
});

test('cart trace has a causal source and decays from readable to erased without increasing strength', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput());
  const fresh = updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 1,
    current_environment_state: initialized.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [], trace_emissions: [{ emission_id: 'move-1', source_kind: 'movement', source_id: 'group-1', cause_event_id: 'event-1', movement_mode: 'cart', location_binding: 'road-1', created_at: '1230-06-01T10:00:00Z' }],
    event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest, materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn-1'
  });
  const faded = updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 2,
    current_environment_state: fresh.environment_state, elapsed_time: { minutes: 100 }, weather_before: 'clear', weather_after: 'rain',
    active_emitters: [], trace_emissions: [], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn-2'
  });
  assert.equal(fresh.created_traces[0].source_id, 'group-1');
  assert.equal(fresh.created_traces[0].strength, 1);
  assert.equal(faded.environment_state.traces[0].status, 'erased');
  assert.equal(faded.environment_state.traces[0].strength, 0);
});

test('the same causal trace emission is not materialized twice across turns', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput());
  const emission = { emission_id: 'move-once', source_kind: 'movement', source_id: 'group-1', cause_event_id: 'event-1', movement_mode: 'cart', location_binding: 'road-1', created_at: '1230-06-01T10:00:00Z' };
  const first = updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 1,
    current_environment_state: initialized.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [], trace_emissions: [emission], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:trace-first'
  });
  const repeated = updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 2,
    current_environment_state: first.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [], trace_emissions: [emission], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:trace-repeat'
  });
  assert.equal(repeated.created_traces.length, 0);
  assert.equal(repeated.environment_state.traces.length, 1);
  assert.equal(repeated.environment_state.traces[0].trace_id, first.environment_state.traces[0].trace_id);
});

test('a reused trace emission id with a different causal payload hard-blocks', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput());
  const first = updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 1,
    current_environment_state: initialized.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [], trace_emissions: [{ emission_id: 'move-conflict', source_kind: 'movement', source_id: 'group-1', cause_event_id: 'event-1', movement_mode: 'cart', location_binding: 'road-1', created_at: '1230-06-01T10:00:00Z' }], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:trace-conflict-first'
  });
  assert.throws(() => updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 2,
    current_environment_state: first.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [], trace_emissions: [{ emission_id: 'move-conflict', source_kind: 'movement', source_id: 'other-group', cause_event_id: 'event-2', movement_mode: 'cart', location_binding: 'road-1', created_at: '1230-06-01T10:00:00Z' }], event_emissions: [], catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:trace-conflict-repeat'
  }), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_TRACE_EMISSION_CONFLICT');
});

test('trace lifecycle rejects incomplete approved trace and decay records instead of inventing semantics', () => {
  const initialized = initializeEnvironmentFeatures(initializationInput());
  const update = {
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: 1,
    current_environment_state: initialized.environment_state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear',
    active_emitters: [], trace_emissions: [{ emission_id: 'move-incomplete', source_kind: 'movement', source_id: 'group-1', cause_event_id: 'event-1', movement_mode: 'cart', location_binding: 'road-1', created_at: '1230-06-01T10:00:00Z' }],
    event_emissions: [], materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:incomplete-trace'
  };
  const incompleteTemplate = approvedCatalog({ trace_templates: [{ ...catalogRecords.trace_templates[0], recognition_difficulty: null }] });
  assert.throws(
    () => updateEnvironmentFeatures({ ...update, catalog_bundle: incompleteTemplate, catalog_digest: incompleteTemplate.catalog_digest }),
    (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_TRACE_TEMPLATE_INVALID'
  );
  const incompleteDecay = approvedCatalog({ decay_profiles: [{ ...catalogRecords.decay_profiles[0], precipitation_multiplier: null }] });
  assert.throws(
    () => updateEnvironmentFeatures({ ...update, catalog_bundle: incompleteDecay, catalog_digest: incompleteDecay.catalog_digest }),
    (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_DECAY_PROFILE_INVALID'
  );
});
