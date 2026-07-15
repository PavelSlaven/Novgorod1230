import test from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentFeatureError, initializeEnvironmentFeatures, updateEnvironmentFeatures } from '../src/index.js';
import { canonicalDigest } from '@rus/materialization';

const records = Object.freeze({
  landmark_rules: [], landmark_profiles: [], landmark_profile_entries: [], landmark_templates: [], landmark_rule_g1_classes: [], landmark_rule_node_types: [], landmark_rule_landscapes: [], landmark_rule_hydrology: [], landmark_rule_land_use: [], landmark_rule_routes: [], cue_templates: [], emission_rules: [],
  trace_templates: [{ id: 'cart-track', world_revision_id: 'revision-1', category_id: 'environment_trace.cart', status: 'approved', public_label_key: 'trace_cart', icon_key: 'trace_cart', recognition_difficulty: 'ordinary', navigation_value: 'none' }],
  trace_creation_rules: [{ id: 'cart-track-rule', world_revision_id: 'revision-1', source_category_id: 'environment_source.cart', status: 'approved', source_kind: 'movement', movement_mode: 'cart', trace_template_id: 'cart-track', decay_profile_id: 'wet-ground-decay' }],
  decay_profiles: [{ id: 'wet-ground-decay', world_revision_id: 'revision-1', status: 'approved', readable_at_or_above: 0.7, faint_at_or_above: 0.2, decay_per_minute: 0.01, precipitation_multiplier: 2, decay_policy: { schema: 'environment_decay_policy_v1', weather_multipliers: { clear: 1, rain: 2, snow: 0.25, mud: 1.5 } } }],
  trace_rule_landscapes: [], trace_rule_hydrology: []
});

function approvedCatalog(overrides = {}) {
  const bundle = { schema_version: 'environment-catalog.v2', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', regional_permissions: ['region-1'], source_refs: ['source:environment-1'], readiness_report: { pass: true }, ...records, ...overrides };
  const { catalog_digest: ignored, ...digestPayload } = bundle;
  return Object.freeze({ ...bundle, catalog_digest: overrides.catalog_digest ?? canonicalDigest(digestPayload) });
}

const catalog = approvedCatalog();
function initializedState() {
  return initializeEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', historical_frame: { season: 'summer' }, g1_id: 'g1-1',
    g1_graph_snapshot: { g1_class: 'rural', placement_candidates: [] }, environment_snapshot: { weather: 'clear', wind: 'west' }, source_snapshot: { active_emitters: [] },
    existing_environment_state: { state_version: 0, applied_update_keys: [], landmarks: [], cues: [], traces: [], baselines: [] }, catalog_bundle: catalog, catalog_digest: catalog.catalog_digest,
    materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', seed_context: { party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', trigger: 'g1_first_activation', occurrence: 0, catalog_digest: catalog.catalog_digest, environment_materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1' }, trigger: 'g1_first_activation', occurrence: 0
  }).environment_state;
}
function update(state, trace_emissions, overrides = {}) {
  const bundle = overrides.catalog_bundle ?? catalog;
  return updateEnvironmentFeatures({
    party_id: 'party-1', world_revision_id: 'revision-1', region_id: 'region-1', historical_period_id: 'period-1', g1_id: 'g1-1', base_state_version: state.state_version,
    current_environment_state: state, elapsed_time: { minutes: 0 }, weather_before: 'clear', weather_after: 'clear', active_emitters: [], trace_emissions, event_emissions: [],
    catalog_bundle: bundle, catalog_digest: bundle.catalog_digest, materializer_version: 'environment_landmarks_v1', rng_algorithm_id: 'mulberry32_v1', idempotency_key: 'turn:trace', ...overrides
  });
}
const emission = Object.freeze({ emission_id: 'move-1', source_category_id: 'environment_source.cart', source_kind: 'movement', source_id: 'group-1', cause_event_id: 'event-1', movement_mode: 'cart', location_binding: 'road-1', created_at: '1230-06-01T10:00:00Z' });

test('cart trace has a causal source and decays from readable to erased without increasing strength', () => {
  const fresh = update(initializedState(), [emission]);
  const faded = update(fresh.environment_state, [], { elapsed_time: { minutes: 100 }, weather_after: 'rain', idempotency_key: 'turn:trace-fade' });
  assert.equal(fresh.created_traces[0].source_id, 'group-1');
  assert.equal(fresh.created_traces[0].source_category_id, 'environment_source.cart');
  assert.equal(faded.environment_state.traces[0].status, 'erased');
  assert.equal(faded.environment_state.traces[0].strength, 0);
});

test('trace creation requires an exact source category and declared landscape scope', () => {
  const state = initializedState();
  assert.throws(() => update(state, [{ ...emission, source_category_id: null }]), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_TRACE_CATEGORY_INVALID');
  const scopedCatalog = approvedCatalog({ trace_rule_landscapes: [{ rule_id: 'cart-track-rule', landscape_template_id: 'landscape-road' }] });
  assert.throws(() => update(state, [emission], { catalog_bundle: scopedCatalog }), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_TRACE_RULE_MISSING');
  const ambiguousCatalog = approvedCatalog({ trace_creation_rules: [...records.trace_creation_rules, { ...records.trace_creation_rules[0], id: 'cart-track-rule-duplicate' }] });
  assert.throws(() => update(state, [emission], { catalog_bundle: ambiguousCatalog }), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_TRACE_RULE_AMBIGUOUS');
});

test('approved decay policy differentiates rain, snow and mud without a weather fallback', () => {
  const fresh = update(initializedState(), [emission]);
  const decay = (weather) => update(fresh.environment_state, [], { elapsed_time: { minutes: 10 }, weather_after: weather, idempotency_key: `turn:weather-${weather}` });
  assert.equal(decay('rain').environment_state.traces[0].strength, 0.8);
  assert.equal(decay('snow').environment_state.traces[0].strength, 0.975);
  assert.equal(decay('mud').environment_state.traces[0].strength, 0.85);
  assert.throws(() => decay('fog'), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_DECAY_POLICY_UNAVAILABLE');
});

test('the same causal trace emission is not materialized twice across turns', () => {
  const first = update(initializedState(), [emission]);
  const repeated = update(first.environment_state, [emission], { idempotency_key: 'turn:trace-repeat' });
  assert.equal(repeated.created_traces.length, 0);
  assert.equal(repeated.environment_state.traces.length, 1);
  assert.equal(repeated.environment_state.traces[0].trace_id, first.environment_state.traces[0].trace_id);
});

test('a reused trace emission id with a different causal source category hard-blocks', () => {
  const first = update(initializedState(), [emission]);
  assert.throws(
    () => update(first.environment_state, [{ ...emission, source_category_id: 'environment_source.other' }], { idempotency_key: 'turn:trace-conflict' }),
    (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_TRACE_RULE_MISSING'
  );
  const alternativeCatalog = approvedCatalog({ trace_creation_rules: [...records.trace_creation_rules, { ...records.trace_creation_rules[0], id: 'other-cart-track-rule', source_category_id: 'environment_source.other' }] });
  assert.throws(
    () => update(first.environment_state, [{ ...emission, source_category_id: 'environment_source.other' }], { catalog_bundle: alternativeCatalog, idempotency_key: 'turn:trace-conflict-accepted-rule' }),
    (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_TRACE_EMISSION_CONFLICT'
  );
});

test('trace lifecycle rejects incomplete approved trace and decay records instead of inventing semantics', () => {
  const state = initializedState();
  const incompleteTemplate = approvedCatalog({ trace_templates: [{ ...records.trace_templates[0], recognition_difficulty: null }] });
  assert.throws(() => update(state, [emission], { catalog_bundle: incompleteTemplate }), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_TRACE_TEMPLATE_INVALID');
  const incompleteDecay = approvedCatalog({ decay_profiles: [{ ...records.decay_profiles[0], precipitation_multiplier: null }] });
  assert.throws(() => update(state, [emission], { catalog_bundle: incompleteDecay }), (error) => error instanceof EnvironmentFeatureError && error.code === 'ENVIRONMENT_DECAY_PROFILE_INVALID');
});
