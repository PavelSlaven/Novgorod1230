import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, createRandomSource, deriveSeed } from '@rus/materialization';
import { baselineIdentity, materializeLandmarks, sameBaseline, seedContext } from './baseline.js';
import { readCatalog } from './catalog.js';
import { updateCues } from './cues.js';
import { EnvironmentFeatureError } from './errors.js';
import { buildEnvironmentObservationCandidates } from './observations.js';
import { normalizeState } from './state.js';
import { updateTraces } from './traces.js';
import { issue, numberAtLeast, requiredObject, requiredValue, text, uniqueBy, validateUnique } from './utils.js';

export const ENVIRONMENT_MATERIALIZER_VERSION = 'environment_landmarks_v1';
export const ENVIRONMENT_RNG_VERSION = 'mulberry32_v1';
const LANDMARK_STATUSES = new Set(['active', 'damaged', 'destroyed']);
const CUE_STATUSES = new Set(['active', 'fading', 'expired']);
const TRACE_STATUSES = new Set(['fresh', 'readable', 'faint', 'erased']);

export { EnvironmentFeatureError } from './errors.js';
export { buildEnvironmentObservationCandidates } from './observations.js';

export function initializeEnvironmentFeatures(input) {
  assertInitializationInput(input);
  const catalog = readCatalog(input.catalog_bundle, input);
  const baselineKey = baselineIdentity(input);
  const state = normalizeState(input.existing_environment_state);
  if (state.baselines.some((baseline) => sameBaseline(baseline, baselineKey))) return finalizeResult({ input, state, status: 'baseline_exists', created_landmarks: [], updated_landmarks: [], created_cues: [], updated_cues: [], expired_cue_ids: [], created_traces: [], updated_traces: [], erased_trace_ids: [], choices: [] });
  const expectedSeedContext = seedContext(input);
  if (canonicalDigest(input.seed_context) !== canonicalDigest(expectedSeedContext)) throw new EnvironmentFeatureError('ENVIRONMENT_SEED_CONTEXT_MISMATCH', 'seed_context must bind the environment baseline identity.', { expected_seed_context: expectedSeedContext });
  const seed = deriveSeed(expectedSeedContext);
  const random = createRandomSource({ seed: seed.uint32, version: input.rng_algorithm_id });
  const runId = `environment_${seed.digest.slice(0, 24)}`;
  const choices = [];
  const created = materializeLandmarks({ input, catalog, random, runId, choices });
  const nextState = { ...state, state_version: state.state_version + 1, baselines: [...state.baselines, { ...baselineKey, run_id: runId, seed_digest: seed.digest }], landmarks: [...state.landmarks, ...created] };
  return finalizeResult({ input, state: nextState, status: 'initialized', created_landmarks: created, updated_landmarks: [], created_cues: [], updated_cues: [], expired_cue_ids: [], created_traces: [], updated_traces: [], erased_trace_ids: [], choices, seed, runId });
}

export function updateEnvironmentFeatures(input) {
  assertUpdateInput(input);
  const catalog = readCatalog(input.catalog_bundle, input);
  const state = normalizeState(input.current_environment_state);
  const runId = `environment_update_${canonicalDigest({ party_id: input.party_id, idempotency_key: input.idempotency_key }).slice(0, 24)}`;
  if (state.applied_update_keys.includes(input.idempotency_key)) return finalizeResult({ input, state, status: 'replayed', created_landmarks: [], updated_landmarks: [], created_cues: [], updated_cues: [], expired_cue_ids: [], created_traces: [], updated_traces: [], erased_trace_ids: [], choices: [], runId });
  if (input.base_state_version !== state.state_version) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_VERSION_MISMATCH', 'Environment update base_state_version is stale.', { expected: state.state_version, actual: input.base_state_version });
  const elapsedMinutes = numberAtLeast(input.elapsed_time?.minutes, 0, 'elapsed_time.minutes');
  const activeEmitters = uniqueBy(input.active_emitters ?? [], 'emitter_id', 'ENVIRONMENT_EMITTER_DUPLICATE');
  const traceEmissions = uniqueBy(input.trace_emissions ?? [], 'emission_id', 'ENVIRONMENT_TRACE_EMISSION_DUPLICATE');
  const choices = [];
  const cueResult = updateCues({ input, state, catalog, activeEmitters, elapsedMinutes, choices });
  const traceResult = updateTraces({ input, state: { ...state, cues: cueResult.cues }, catalog, traceEmissions, elapsedMinutes, choices });
  const nextState = { ...state, state_version: state.state_version + 1, applied_update_keys: [...state.applied_update_keys, input.idempotency_key], cues: cueResult.cues, traces: traceResult.traces };
  return finalizeResult({ input, state: nextState, status: 'updated', created_landmarks: [], updated_landmarks: [], created_cues: cueResult.created, updated_cues: cueResult.updated, expired_cue_ids: cueResult.expired, created_traces: traceResult.created, updated_traces: traceResult.updated, erased_trace_ids: traceResult.erased, choices, runId });
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
  for (const candidate of input.public_projection ?? []) if (candidate && typeof candidate === 'object' && ['source_id', 'source_kind', 'location_binding'].some((key) => key in candidate)) errors.push(issue('ENVIRONMENT_PUBLIC_PROJECTION_LEAK', candidate.feature_id ?? 'unknown'));
  return deepFreeze({ pass: errors.length === 0, errors });
}

function finalizeResult({ input, state, status, created_landmarks, updated_landmarks, created_cues, updated_cues, expired_cue_ids, created_traces, updated_traces, erased_trace_ids, choices, seed = null, runId = null }) {
  const validation = validateEnvironmentFeatureState({ environment_state: state });
  if (!validation.pass) throw new EnvironmentFeatureError('ENVIRONMENT_STATE_INVALID', 'Environment feature state failed validation.', validation);
  const observationCandidates = buildEnvironmentObservationCandidates({ environment_state: state });
  const trace = { run_id: runId, materializer_version: input.materializer_version, rng_algorithm_id: input.rng_algorithm_id, catalog_digest: input.catalog_digest, input_digest: canonicalDigest(input), seed_digest: seed?.digest ?? null, choices: structuredClone(choices), result_digest: canonicalDigest({ state, choices }) };
  const proposedChangeSet = { idempotency_key: input.idempotency_key ?? `environment:${input.party_id}:${runId}`, base_state_version: input.base_state_version ?? null, operations: { landmarks: created_landmarks.map((item) => item.landmark_id), cues: [...created_cues, ...updated_cues].map((item) => item.cue_id), traces: [...created_traces, ...updated_traces].map((item) => item.trace_id), expired_cue_ids: [...expired_cue_ids], erased_trace_ids: [...erased_trace_ids] } };
  return deepFreeze({ status, created_landmarks, updated_landmarks, created_cues, updated_cues, expired_cue_ids, created_traces, updated_traces, erased_trace_ids, g5_anchor_projections: [], observation_candidates: observationCandidates, validation_report: validation, materialization_trace: trace, proposed_change_set: proposedChangeSet, environment_state: state });
}

function assertInitializationInput(input) {
  requiredObject(input, 'environment initialization request');
  for (const key of ['party_id', 'world_revision_id', 'region_id', 'historical_period_id', 'historical_frame', 'g1_id', 'g1_graph_snapshot', 'environment_snapshot', 'source_snapshot', 'existing_environment_state', 'catalog_bundle', 'catalog_digest', 'materializer_version', 'rng_algorithm_id', 'seed_context', 'trigger', 'occurrence']) requiredValue(input[key], key);
  if (input.trigger !== 'g1_first_activation') throw new EnvironmentFeatureError('ENVIRONMENT_TRIGGER_INVALID', 'Initialization requires g1_first_activation.');
  if (input.materializer_version !== ENVIRONMENT_MATERIALIZER_VERSION || input.rng_algorithm_id !== ENVIRONMENT_RNG_VERSION) throw new EnvironmentFeatureError('ENVIRONMENT_VERSION_UNSUPPORTED', 'Unsupported environment materializer or RNG version.');
}

function assertUpdateInput(input) {
  requiredObject(input, 'environment update request');
  for (const key of ['party_id', 'world_revision_id', 'region_id', 'historical_period_id', 'g1_id', 'base_state_version', 'current_environment_state', 'elapsed_time', 'weather_before', 'weather_after', 'active_emitters', 'trace_emissions', 'event_emissions', 'catalog_bundle', 'catalog_digest', 'materializer_version', 'rng_algorithm_id', 'idempotency_key']) requiredValue(input[key], key);
  if (input.materializer_version !== ENVIRONMENT_MATERIALIZER_VERSION || input.rng_algorithm_id !== ENVIRONMENT_RNG_VERSION) throw new EnvironmentFeatureError('ENVIRONMENT_VERSION_UNSUPPORTED', 'Unsupported environment materializer or RNG version.');
}
