import { deepFreeze } from '@rus/kernel';
import {
  canonicalDigest,
  createRandomSource,
  deriveSeed,
  deterministicInstanceId,
  MaterializationError
} from '@rus/materialization';

export const ENVIRONMENT_MATERIALIZER_VERSION = 'environment_landmarks_v1';
export const ENVIRONMENT_RNG_VERSION = 'mulberry32_v1';
const LANDMARK_STATUSES = new Set(['active', 'damaged', 'destroyed']);
const CUE_STATUSES = new Set(['active', 'fading', 'expired']);
const TRACE_STATUSES = new Set(['fresh', 'readable', 'faint', 'erased']);

export class EnvironmentFeatureError extends MaterializationError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'EnvironmentFeatureError';
  }
}

export function initializeEnvironmentFeatures(input) {
  assertInitializationInput(input);
  const catalog = readCatalog(input.catalog_bundle, input);
  const baselineKey = baselineIdentity(input);
  const state = normalizeState(input.existing_environment_state);
  if (state.baselines.some((baseline) => sameBaseline(baseline, baselineKey))) {
    return finalizeResult({
      input, state, status: 'baseline_exists', created_landmarks: [], updated_landmarks: [],
      created_cues: [], updated_cues: [], expired_cue_ids: [], created_traces: [], updated_traces: [], erased_trace_ids: [], choices: []
    });
  }
  const expectedSeedContext = seedContext(input);
  if (canonicalDigest(input.seed_context) !== canonicalDigest(expectedSeedContext)) {
    throw new EnvironmentFeatureError('ENVIRONMENT_SEED_CONTEXT_MISMATCH', 'seed_context must bind the environment baseline identity.', { expected_seed_context: expectedSeedContext });
  }
  const seed = deriveSeed(expectedSeedContext);
  const random = createRandomSource({ seed: seed.uint32, version: input.rng_algorithm_id });
  const runId = `environment_${seed.digest.slice(0, 24)}`;
  const choices = [];
  const created = materializeLandmarks({ input, catalog, random, runId, choices });
  const nextState = {
    ...state,
    state_version: state.state_version + 1,
    baselines: [...state.baselines, { ...baselineKey, run_id: runId, seed_digest: seed.digest }],
    landmarks: [...state.landmarks, ...created]
  };
  return finalizeResult({
    input, state: nextState, status: 'initialized', created_landmarks: created, updated_landmarks: [],
    created_cues: [], updated_cues: [], expired_cue_ids: [], created_traces: [], updated_traces: [], erased_trace_ids: [], choices,
    seed, runId
  });
}

export function updateEnvironmentFeatures(input) {
  assertUpdateInput(input);
  const catalog = readCatalog(input.catalog_bundle, input);
  const state = normalizeState(input.current_environment_state);
  if (state.applied_update_keys.includes(input.idempotency_key)) {
    return finalizeResult({
      input, state, status: 'replayed', created_landmarks: [], updated_landmarks: [],
      created_cues: [], updated_cues: [], expired_cue_ids: [], created_traces: [], updated_traces: [], erased_trace_ids: [], choices: [],
      runId: `environment_update_${canonicalDigest({ party_id: input.party_id, idempotency_key: input.idempotency_key }).slice(0, 24)}`
    });
  }
  if (input.base_state_version !== state.state_version) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_VERSION_MISMATCH', 'Environment update base_state_version is stale.', { expected: state.state_version, actual: input.base_state_version });
  const elapsedMinutes = numberAtLeast(input.elapsed_time?.minutes, 0, 'elapsed_time.minutes');
  const activeEmitters = uniqueBy(input.active_emitters ?? [], 'emitter_id', 'ENVIRONMENT_EMITTER_DUPLICATE');
  const traceEmissions = uniqueBy(input.trace_emissions ?? [], 'emission_id', 'ENVIRONMENT_TRACE_EMISSION_DUPLICATE');
  const choices = [];
  const cueResult = updateCues({ input, state, catalog, activeEmitters, elapsedMinutes, choices });
  const traceResult = updateTraces({ input, state: { ...state, cues: cueResult.cues }, catalog, traceEmissions, elapsedMinutes, choices });
  const nextState = { ...state, state_version: state.state_version + 1, applied_update_keys: [...state.applied_update_keys, input.idempotency_key], cues: cueResult.cues, traces: traceResult.traces };
  return finalizeResult({
    input, state: nextState, status: 'updated', created_landmarks: [], updated_landmarks: [],
    created_cues: cueResult.created, updated_cues: cueResult.updated, expired_cue_ids: cueResult.expired,
    created_traces: traceResult.created, updated_traces: traceResult.updated, erased_trace_ids: traceResult.erased, choices,
    runId: `environment_update_${canonicalDigest({ party_id: input.party_id, idempotency_key: input.idempotency_key }).slice(0, 24)}`
  });
}

export function buildEnvironmentObservationCandidates(input = {}) {
  const state = normalizeState(input.environment_state);
  const candidates = [
    ...state.landmarks.filter((item) => item.status !== 'destroyed').map((item) => observation(item, 'landmark')),
    ...state.cues.filter((item) => item.status !== 'expired').map((item) => observation(item, 'cue')),
    ...state.traces.filter((item) => item.status !== 'erased').map((item) => observation(item, 'trace'))
  ].sort((left, right) => left.feature_id.localeCompare(right.feature_id));
  return deepFreeze(candidates);
}

export function validateEnvironmentCatalogBundle(input = {}) {
  try {
    const catalog = readCatalog(input.catalog_bundle, input);
    return deepFreeze({ pass: true, catalog_digest: catalog.catalog_digest, errors: [] });
  } catch (error) {
    return deepFreeze({ pass: false, catalog_digest: null, errors: [issue(error.code ?? 'ENVIRONMENT_CATALOG_INVALID', error.message)] });
  }
}

export function validateEnvironmentFeatureState(input = {}) {
  const errors = [];
  let state;
  try { state = normalizeState(input.environment_state ?? input); } catch (error) { return deepFreeze({ pass: false, errors: [issue(error.code ?? 'ENVIRONMENT_STATE_INVALID', error.message)] }); }
  validateUnique(state.landmarks, 'landmark_id', 'ENVIRONMENT_LANDMARK_DUPLICATE', errors);
  validateUnique(state.cues, 'cue_id', 'ENVIRONMENT_CUE_DUPLICATE', errors);
  validateUnique(state.traces, 'trace_id', 'ENVIRONMENT_TRACE_DUPLICATE', errors);
  for (const landmark of state.landmarks) if (!LANDMARK_STATUSES.has(landmark.status)) errors.push(issue('ENVIRONMENT_LANDMARK_STATUS_INVALID', landmark.landmark_id));
  for (const cue of state.cues) if (!CUE_STATUSES.has(cue.status) || !text(cue.source_id)) errors.push(issue('ENVIRONMENT_CUE_INVALID', cue.cue_id));
  for (const trace of state.traces) if (!TRACE_STATUSES.has(trace.status) || !text(trace.source_id) || !text(trace.cause_event_id) || !text(trace.created_at)) errors.push(issue('ENVIRONMENT_TRACE_CAUSALITY_INVALID', trace.trace_id));
  const observations = input.public_projection ?? [];
  for (const candidate of observations) if (candidate && typeof candidate === 'object' && ['source_id', 'source_kind', 'location_binding'].some((key) => key in candidate)) errors.push(issue('ENVIRONMENT_PUBLIC_PROJECTION_LEAK', candidate.feature_id ?? 'unknown'));
  return deepFreeze({ pass: errors.length === 0, errors });
}

function materializeLandmarks({ input, catalog, random, runId, choices }) {
  const placements = [...(input.g1_graph_snapshot.placement_candidates ?? [])].sort((left, right) => text(left.binding_id).localeCompare(text(right.binding_id)));
  const output = [];
  for (const rule of [...catalog.landmark_rules].sort(byId('rule_id'))) {
    if (!approved(rule)) continue;
    const templates = catalog.landmark_templates.filter((template) => approved(template) && rule.template_ids?.includes(template.template_id));
    const placementCandidates = placements.filter((placement) => !Array.isArray(rule.placement_types) || rule.placement_types.includes(placement.binding_type));
    if ((templates.length === 0 || placementCandidates.length === 0) && required(rule)) {
      throw new EnvironmentFeatureError('ENVIRONMENT_REQUIRED_CANDIDATE_SET_EMPTY', 'Required landmark rule has no approved template or placement candidate.', { rule_id: rule.rule_id, template_count: templates.length, placement_count: placementCandidates.length });
    }
    const count = chooseCount(rule, Math.min(templates.length, placementCandidates.length), random);
    const templateDigest = canonicalDigest(templates.map((template) => template.template_id).sort());
    const placementDigest = canonicalDigest(placementCandidates.map((placement) => placement.binding_id));
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      const templateDraw = random.nextUint32();
      const placementDraw = random.nextUint32();
      const template = weighted(templates, templateDraw);
      const placement = weighted(placementCandidates, placementDraw);
      const landmarkId = deterministicInstanceId(input.party_id, runId, 'environment_landmark', rule.rule_id, ordinal);
      output.push({
        landmark_id: landmarkId, template_id: template.template_id, category_id: template.category_id, rule_id: rule.rule_id,
        location_binding: placement.binding_id, placement_type: placement.binding_type, status: 'active',
        navigation_value: template.navigation_value, distinctiveness: template.distinctiveness, recognition_difficulty: template.recognition_difficulty,
        public_label_key: requiredText(template.public_label_key, 'ENVIRONMENT_LANDMARK_LABEL_REQUIRED'), icon_key: requiredText(template.icon_key, 'ENVIRONMENT_LANDMARK_ICON_REQUIRED')
      });
      choices.push(choice(choices.length, `${rule.rule_id}:${ordinal}:template`, templateDigest, templates.map((item) => item.template_id), template, templateDraw, random.drawCount));
      choices.push(choice(choices.length, `${rule.rule_id}:${ordinal}:placement`, placementDigest, placementCandidates.map((item) => item.binding_id), placement, placementDraw, random.drawCount, 'binding_id'));
    }
  }
  return output;
}

function updateCues({ input, state, catalog, activeEmitters, elapsedMinutes, choices }) {
  const cues = state.cues.map((cue) => ({ ...cue }));
  const created = []; const updated = []; const expired = []; const activeKeys = new Set();
  for (const emitter of activeEmitters) {
    if (!text(emitter.source_id) || !text(emitter.source_kind) || !text(emitter.location_binding)) throw new EnvironmentFeatureError('ENVIRONMENT_EMITTER_SOURCE_INVALID', 'Active emitter requires source and location bindings.', { emitter_id: emitter.emitter_id });
    const rules = catalog.emission_rules.filter((rule) => approved(rule) && rule.source_type === emitter.source_type);
    if (rules.length === 0) continue;
    for (const rule of rules.sort(byId('rule_id'))) {
      const template = catalog.cue_templates.find((item) => approved(item) && item.template_id === rule.cue_template_id);
      if (!template) throw new EnvironmentFeatureError('ENVIRONMENT_EMISSION_RULE_TEMPLATE_MISSING', 'Approved emission rule references a missing cue template.', { rule_id: rule.rule_id });
      validateCueTemplate(template);
      const identity = `${emitter.emitter_id}:${rule.rule_id}`;
      activeKeys.add(identity);
      let cue = cues.find((item) => item.identity_key === identity);
      if (!cue) {
        cue = {
          cue_id: deterministicInstanceId(input.party_id, input.idempotency_key, 'environment_cue', identity, 0), identity_key: identity,
          template_id: template.template_id, emission_rule_id: rule.rule_id, source_kind: emitter.source_kind, source_id: emitter.source_id,
          location_binding: emitter.location_binding, status: 'active', age_minutes: 0, intensity: Number(template.base_intensity),
          sense: requiredText(template.sense, 'ENVIRONMENT_CUE_SENSE_REQUIRED'), public_label_key: requiredText(template.public_label_key, 'ENVIRONMENT_CUE_LABEL_REQUIRED'), icon_key: requiredText(template.icon_key, 'ENVIRONMENT_CUE_ICON_REQUIRED'),
          bearing_band: emitter.bearing_band ?? 'unknown', distance_band: emitter.distance_band ?? 'unknown', strength_band: emitter.strength_band ?? 'moderate',
          recognition_difficulty: template.recognition_difficulty, navigation_value: template.navigation_value, fading_duration_minutes: Number(template.fading_duration_minutes), expiry_duration_minutes: Number(template.expiry_duration_minutes)
        };
        cues.push(cue); created.push(cue);
      } else { cue.status = 'active'; cue.age_minutes = 0; cue.intensity = Number(template.base_intensity); updated.push(cue); }
      choices.push({ choice_ordinal: choices.length, choice_key: `cue:${identity}`, candidate_set_digest: canonicalDigest([rule.rule_id]), candidate_ids: [rule.rule_id], selected_id: rule.rule_id, selected_weight: 1, rng_draw: null, rng_counter: null, rejection_summary: emptyRejections() });
    }
  }
  for (const cue of cues) {
    if (cue.status === 'expired' || activeKeys.has(cue.identity_key)) continue;
    cue.age_minutes += elapsedMinutes;
    if (cue.age_minutes >= cue.expiry_duration_minutes) { cue.status = 'expired'; expired.push(cue.cue_id); }
    else { cue.status = 'fading'; updated.push(cue); }
  }
  return { cues, created, updated, expired };
}

function validateCueTemplate(template) {
  for (const key of ['template_id', 'sense', 'public_label_key', 'icon_key', 'recognition_difficulty', 'navigation_value']) requiredText(template[key], 'ENVIRONMENT_CUE_TEMPLATE_INVALID');
  for (const key of ['base_intensity', 'fading_duration_minutes', 'expiry_duration_minutes']) {
    if (template[key] == null || !Number.isFinite(Number(template[key])) || Number(template[key]) < 0) throw new EnvironmentFeatureError('ENVIRONMENT_CUE_TEMPLATE_INVALID', `Cue template requires non-negative ${key}.`, { template_id: template.template_id, key });
  }
  if (Number(template.expiry_duration_minutes) < Number(template.fading_duration_minutes)) throw new EnvironmentFeatureError('ENVIRONMENT_CUE_TEMPLATE_INVALID', 'Cue expiry duration must not precede fading duration.', { template_id: template.template_id });
}

function updateTraces({ input, state, catalog, traceEmissions, elapsedMinutes, choices }) {
  const traces = state.traces.map((trace) => ({ ...trace }));
  const created = []; const updated = []; const erased = [];
  for (const emission of traceEmissions) {
    for (const key of ['source_kind', 'source_id', 'cause_event_id', 'location_binding', 'created_at']) if (!text(emission[key])) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_CAUSALITY_INVALID', `Trace emission requires ${key}.`, { emission_id: emission.emission_id });
    const rule = catalog.trace_creation_rules.find((item) => approved(item) && item.source_kind === emission.source_kind && (!item.movement_mode || item.movement_mode === emission.movement_mode));
    if (!rule) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_RULE_MISSING', 'Trace emission has no approved creation rule.', { emission_id: emission.emission_id });
    const template = catalog.trace_templates.find((item) => approved(item) && item.template_id === rule.trace_template_id);
    const profile = catalog.decay_profiles.find((item) => approved(item) && item.profile_id === rule.decay_profile_id);
    if (!template || !profile) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_CATALOG_REFERENCE_MISSING', 'Trace creation rule has a missing template or decay profile.', { rule_id: rule.rule_id });
    const trace = {
      trace_id: deterministicInstanceId(input.party_id, input.idempotency_key, 'environment_trace', emission.emission_id, 0),
      template_id: template.template_id, creation_rule_id: rule.rule_id, decay_profile_id: profile.profile_id,
      source_kind: emission.source_kind, source_id: emission.source_id, cause_event_id: emission.cause_event_id, created_at: emission.created_at,
      location_binding: emission.location_binding, status: 'fresh', strength: 1, age_minutes: 0,
      public_label_key: requiredText(template.public_label_key, 'ENVIRONMENT_TRACE_LABEL_REQUIRED'), icon_key: requiredText(template.icon_key, 'ENVIRONMENT_TRACE_ICON_REQUIRED'),
      recognition_difficulty: template.recognition_difficulty ?? 'ordinary', navigation_value: template.navigation_value ?? 'none', decay_profile: profile
    };
    traces.push(trace); created.push(trace);
    choices.push({ choice_ordinal: choices.length, choice_key: `trace:${emission.emission_id}`, candidate_set_digest: canonicalDigest([rule.rule_id]), candidate_ids: [rule.rule_id], selected_id: rule.rule_id, selected_weight: 1, rng_draw: null, rng_counter: null, rejection_summary: emptyRejections() });
  }
  for (const trace of traces) {
    if (trace.status === 'erased' || created.includes(trace)) continue;
    const profile = trace.decay_profile ?? catalog.decay_profiles.find((item) => item.profile_id === trace.decay_profile_id);
    if (!profile) throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_PROFILE_MISSING', 'Existing trace has no approved decay profile.', { trace_id: trace.trace_id });
    const weatherMultiplier = input.weather_after === 'rain' ? finiteOr(profile.precipitation_multiplier, 1) : 1;
    trace.age_minutes += elapsedMinutes;
    trace.strength = Math.max(0, trace.strength - (finiteOr(profile.decay_per_minute, 0) * elapsedMinutes * weatherMultiplier));
    trace.status = trace.strength <= 0 ? 'erased' : trace.strength >= finiteOr(profile.readable_at_or_above, 0.7) ? 'readable' : trace.strength >= finiteOr(profile.faint_at_or_above, 0.2) ? 'faint' : 'faint';
    if (trace.status === 'erased') erased.push(trace.trace_id); else updated.push(trace);
  }
  return { traces, created, updated, erased };
}

function finalizeResult({ input, state, status, created_landmarks, updated_landmarks, created_cues, updated_cues, expired_cue_ids, created_traces, updated_traces, erased_trace_ids, choices, seed = null, runId = null }) {
  const validation = validateEnvironmentFeatureState({ environment_state: state });
  if (!validation.pass) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_INVALID', 'Environment feature state failed validation.', validation);
  const observation_candidates = buildEnvironmentObservationCandidates({ environment_state: state });
  const trace = {
    run_id: runId, materializer_version: input.materializer_version, rng_algorithm_id: input.rng_algorithm_id,
    catalog_digest: input.catalog_digest, input_digest: canonicalDigest(input), seed_digest: seed?.digest ?? null,
    choices: structuredClone(choices), result_digest: canonicalDigest({ state, choices })
  };
  const proposed_change_set = {
    idempotency_key: input.idempotency_key ?? `environment:${input.party_id}:${runId}`,
    base_state_version: input.base_state_version ?? null,
    operations: {
      landmarks: created_landmarks.map((item) => item.landmark_id), cues: [...created_cues, ...updated_cues].map((item) => item.cue_id), traces: [...created_traces, ...updated_traces].map((item) => item.trace_id),
      expired_cue_ids: [...expired_cue_ids], erased_trace_ids: [...erased_trace_ids]
    }
  };
  return deepFreeze({ status, created_landmarks, updated_landmarks, created_cues, updated_cues, expired_cue_ids, created_traces, updated_traces, erased_trace_ids, g5_anchor_projections: [], observation_candidates, validation_report: validation, materialization_trace: trace, proposed_change_set, environment_state: state });
}

function observation(feature, kind) {
  return { feature_id: feature[`${kind}_id`] ?? feature.landmark_id, feature_kind: kind, sense: feature.sense ?? 'sight', bearing_band: feature.bearing_band ?? 'local', distance_band: feature.distance_band ?? 'local', strength_band: feature.strength_band ?? strengthBand(feature.strength), visibility_conditions: feature.visibility_conditions ?? 'environment_dependent', recognition_difficulty: feature.recognition_difficulty ?? 'ordinary', navigation_value: feature.navigation_value ?? 'none', public_label_key: feature.public_label_key, icon_key: feature.icon_key };
}
function assertInitializationInput(input) {
  requiredObject(input, 'environment initialization request');
  for (const key of ['party_id','world_revision_id','region_id','historical_period_id','historical_frame','g1_id','g1_graph_snapshot','environment_snapshot','source_snapshot','existing_environment_state','catalog_bundle','catalog_digest','materializer_version','rng_algorithm_id','seed_context','trigger','occurrence']) requiredValue(input[key], key);
  if (input.trigger !== 'g1_first_activation') throw new EnvironmentFeatureError('ENVIRONMENT_TRIGGER_INVALID', 'Initialization requires g1_first_activation.');
  if (input.materializer_version !== ENVIRONMENT_MATERIALIZER_VERSION || input.rng_algorithm_id !== ENVIRONMENT_RNG_VERSION) throw new EnvironmentFeatureError('ENVIRONMENT_VERSION_UNSUPPORTED', 'Unsupported environment materializer or RNG version.');
}
function assertUpdateInput(input) {
  requiredObject(input, 'environment update request');
  for (const key of ['party_id','world_revision_id','region_id','historical_period_id','g1_id','base_state_version','current_environment_state','elapsed_time','weather_before','weather_after','active_emitters','trace_emissions','event_emissions','catalog_bundle','catalog_digest','materializer_version','rng_algorithm_id','idempotency_key']) requiredValue(input[key], key);
  if (input.materializer_version !== ENVIRONMENT_MATERIALIZER_VERSION || input.rng_algorithm_id !== ENVIRONMENT_RNG_VERSION) throw new EnvironmentFeatureError('ENVIRONMENT_VERSION_UNSUPPORTED', 'Unsupported environment materializer or RNG version.');
}
function readCatalog(bundle, input) {
  requiredObject(bundle, 'catalog_bundle');
  for (const key of ['schema_version','world_revision_id','region_id','historical_period_id','catalog_digest','regional_permissions']) requiredValue(bundle[key], `catalog_bundle.${key}`);
  if (bundle.schema_version !== 'environment-catalog.v1') throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_INVALID', 'Unsupported environment catalog schema version.', { schema_version: bundle.schema_version });
  for (const key of ['landmark_rules','landmark_templates','cue_templates','emission_rules','trace_templates','trace_creation_rules','decay_profiles','regional_permissions']) if (!Array.isArray(bundle[key])) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_INVALID', `catalog_bundle.${key} must be an array.`);
  const { catalog_digest, ...digestPayload } = bundle;
  if (canonicalDigest(digestPayload) !== catalog_digest || input.catalog_digest !== catalog_digest) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_DIGEST_MISMATCH', 'Catalog digest does not bind this environment request.', { expected: catalog_digest, actual: input.catalog_digest });
  if (bundle.world_revision_id !== input.world_revision_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_WORLD_REVISION_MISMATCH', 'Catalog world revision does not match the request.', { expected: bundle.world_revision_id, actual: input.world_revision_id });
  if (bundle.region_id !== input.region_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_REGION_MISMATCH', 'Catalog region does not match the request.', { expected: bundle.region_id, actual: input.region_id });
  if (bundle.historical_period_id !== input.historical_period_id) throw new EnvironmentFeatureError('ENVIRONMENT_CATALOG_PERIOD_MISMATCH', 'Catalog period does not match the request.', { expected: bundle.historical_period_id, actual: input.historical_period_id });
  if (!bundle.regional_permissions.includes(input.region_id)) throw new EnvironmentFeatureError('ENVIRONMENT_REGIONAL_PERMISSION_MISSING', 'Catalog has no regional permission for this request.', { region_id: input.region_id });
  return bundle;
}
function normalizeState(value) {
  requiredObject(value, 'environment_state');
  if (!Number.isInteger(value.state_version) || value.state_version < 0) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_INVALID', 'environment_state.state_version must be a non-negative integer.');
  const state = { state_version: value.state_version };
  for (const key of ['baselines','landmarks','cues','traces','applied_update_keys']) {
    if (!Array.isArray(value[key])) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_INVALID', `environment_state.${key} must be an array.`);
    state[key] = structuredClone(value[key]);
  }
  if (new Set(state.applied_update_keys).size !== state.applied_update_keys.length || state.applied_update_keys.some((key) => !text(key))) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_INVALID', 'environment_state.applied_update_keys must be unique non-empty strings.');
  return state;
}
function baselineIdentity(input) { return { party_id: input.party_id, world_revision_id: input.world_revision_id, g1_id: input.g1_id, materializer_version: input.materializer_version }; }
function sameBaseline(left, right) { return ['party_id','world_revision_id','g1_id','materializer_version'].every((key) => left[key] === right[key]); }
function seedContext(input) { return { party_id: input.party_id, world_revision_id: input.world_revision_id, region_id: input.region_id, historical_period_id: input.historical_period_id, g1_id: input.g1_id, trigger: input.trigger, occurrence: input.occurrence, catalog_digest: input.catalog_digest, environment_materializer_version: input.materializer_version, rng_algorithm_id: input.rng_algorithm_id }; }
function chooseCount(rule, available, random) { const min = numberAtLeast(rule.min_count ?? 0, 0, 'rule.min_count'); const max = numberAtLeast(rule.max_count ?? min, min, 'rule.max_count'); if (min > available) { if (required(rule)) throw new EnvironmentFeatureError('ENVIRONMENT_REQUIRED_CANDIDATE_SET_EMPTY', 'Required landmark count exceeds candidates.', { rule_id: rule.rule_id, available, minimum: min }); return 0; } return min + (max > min ? random.nextUint32() % (Math.min(max, available) - min + 1) : 0); }
function weighted(items, draw) { const total = items.reduce((sum, item) => sum + finiteOr(item.weight, 1), 0); let cursor = draw % total; for (const item of items) { cursor -= finiteOr(item.weight, 1); if (cursor < 0) return item; } return items.at(-1); }
function choice(ordinal, choiceKey, digest, ids, selected, draw, counter, selectedKey = 'template_id') { return { choice_ordinal: ordinal, choice_key: choiceKey, candidate_set_digest: digest, candidate_ids: ids, selected_id: selected[selectedKey], selected_weight: finiteOr(selected.weight, 1), rng_draw: draw, rng_counter: counter, rejection_summary: emptyRejections() }; }
function emptyRejections() { return { rejected_count: 0, missing_count: 0, unapproved_count: 0, wrong_domain_count: 0 }; }
function uniqueBy(items, key, code) { if (!Array.isArray(items)) throw new EnvironmentFeatureError(code, `${key} collection must be an array.`); const ids = new Set(); for (const item of items) { const id = text(item?.[key]); if (!id || ids.has(id)) throw new EnvironmentFeatureError(code, `${key} must be non-empty and unique.`, { key, value: id }); ids.add(id); } return items; }
function validateUnique(items, key, code, errors) { const ids = new Set(); for (const item of items) { const id = text(item?.[key]); if (!id || ids.has(id)) errors.push(issue(code, id || 'missing')); ids.add(id); } }
function issue(code, detail) { return { code, detail }; }
function required(rule) { return rule.required === true || Number(rule.min_count) > 0; }
function approved(record) { return record?.status === 'approved'; }
function byId(key) { return (left, right) => text(left[key]).localeCompare(text(right[key])); }
function requiredObject(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EnvironmentFeatureError('ENVIRONMENT_INPUT_INVALID', `${name} must be an object.`); }
function requiredValue(value, key) { if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) throw new EnvironmentFeatureError('ENVIRONMENT_INPUT_INVALID', `${key} is required.`); }
function requiredText(value, code) { const result = text(value); if (!result) throw new EnvironmentFeatureError(code, 'Approved template requires a public field.'); return result; }
function numberAtLeast(value, minimum, key) { const number = Number(value); if (!Number.isFinite(number) || number < minimum) throw new EnvironmentFeatureError('ENVIRONMENT_INPUT_INVALID', `${key} must be a number >= ${minimum}.`); return number; }
function finiteOr(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function strengthBand(value) { return value >= 0.7 ? 'strong' : value >= 0.2 ? 'weak' : 'faint'; }
function text(value) { return String(value ?? '').trim(); }
