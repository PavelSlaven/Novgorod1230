import { canonicalDigest, deterministicInstanceId } from '@rus/materialization';
import { EnvironmentFeatureError } from './errors.js';
import { approved, emptyRejections, requiredText, text } from './utils.js';

export function updateTraces({ input, state, catalog, traceEmissions, elapsedMinutes, choices }) {
  const traces = state.traces.map((trace) => ({ ...trace }));
  const created = []; const updated = []; const erased = [];
  for (const emission of traceEmissions) {
    for (const key of ['source_kind', 'source_id', 'cause_event_id', 'location_binding', 'created_at']) if (!text(emission[key])) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_CAUSALITY_INVALID', `Trace emission requires ${key}.`, { emission_id: emission.emission_id });
    if (!text(emission.source_category_id)) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_CATEGORY_INVALID', 'Trace emission requires an approved source category.', { emission_id: emission.emission_id });
    const rule = catalog.trace_creation_rules.find((item) => appliesTraceRule(item, emission, input, catalog));
    if (!rule) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_RULE_MISSING', 'Trace emission has no approved creation rule.', { emission_id: emission.emission_id });
    const template = catalog.trace_templates.find((item) => approved(item) && item.id === rule.trace_template_id && scoped(item, input));
    const profile = catalog.decay_profiles.find((item) => approved(item) && item.id === rule.decay_profile_id && item.world_revision_id === input.world_revision_id);
    if (!template || !profile) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_CATALOG_REFERENCE_MISSING', 'Trace creation rule has a missing template or decay profile.', { rule_id: rule.id });
    validateTraceTemplate(template);
    validateDecayProfile(profile);
    const traceId = deterministicInstanceId(input.party_id, 'environment_trace_emission', emission.emission_id, 0);
    const existing = traces.find((item) => item.trace_id === traceId || item.emission_id === emission.emission_id);
    if (existing) {
      if (!sameEmission(existing, emission, rule)) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_EMISSION_CONFLICT', 'A trace emission id cannot be reused with a different causal payload.', { emission_id: emission.emission_id, trace_id: existing.trace_id });
      continue;
    }
    const trace = {
      trace_id: traceId, emission_id: emission.emission_id,
      template_id: template.id, creation_rule_id: rule.id, decay_profile_id: profile.id,
      source_category_id: emission.source_category_id, source_kind: emission.source_kind, source_id: emission.source_id, cause_event_id: emission.cause_event_id, movement_mode: emission.movement_mode ?? null, created_at: emission.created_at,
      location_binding: emission.location_binding, status: 'fresh', strength: 1, age_minutes: 0,
      public_label_key: requiredText(template.public_label_key, 'ENVIRONMENT_TRACE_LABEL_REQUIRED'), icon_key: requiredText(template.icon_key, 'ENVIRONMENT_TRACE_ICON_REQUIRED'),
      recognition_difficulty: requiredText(template.recognition_difficulty, 'ENVIRONMENT_TRACE_TEMPLATE_INVALID'), navigation_value: requiredText(template.navigation_value, 'ENVIRONMENT_TRACE_TEMPLATE_INVALID'), decay_profile: profile
    };
    traces.push(trace); created.push(trace);
    choices.push({ choice_ordinal: choices.length, choice_key: `trace:${emission.emission_id}`, candidate_set_digest: canonicalDigest([rule.id]), candidate_ids: [rule.id], selected_id: rule.id, selected_weight: 1, rng_draw: null, rng_counter: null, rejection_summary: emptyRejections() });
  }
  for (const trace of traces) {
    if (trace.status === 'erased' || created.includes(trace)) continue;
    const profile = trace.decay_profile ?? catalog.decay_profiles.find((item) => item.id === trace.decay_profile_id && approved(item) && item.world_revision_id === input.world_revision_id);
    if (!profile) throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_PROFILE_MISSING', 'Existing trace has no approved decay profile.', { trace_id: trace.trace_id });
    validateDecayProfile(profile);
    const weatherMultiplier = weatherDecayMultiplier(profile, input.weather_after);
    trace.age_minutes += elapsedMinutes;
    trace.strength = Math.max(0, trace.strength - (Number(profile.decay_per_minute) * elapsedMinutes * weatherMultiplier));
    trace.status = trace.strength <= 0 ? 'erased' : trace.strength >= Number(profile.readable_at_or_above) ? 'readable' : 'faint';
    if (trace.status === 'erased') erased.push(trace.trace_id); else updated.push(trace);
  }
  return { traces, created, updated, erased };
}

function sameEmission(trace, emission, rule) {
  return trace.source_category_id === emission.source_category_id
    && trace.source_kind === emission.source_kind
    && trace.source_id === emission.source_id
    && trace.cause_event_id === emission.cause_event_id
    && trace.location_binding === emission.location_binding
    && trace.created_at === emission.created_at
    && trace.creation_rule_id === rule.id
    && (trace.movement_mode ?? null) === (emission.movement_mode ?? null);
}

function validateTraceTemplate(template) {
  for (const key of ['id', 'category_id', 'public_label_key', 'icon_key', 'recognition_difficulty', 'navigation_value']) requiredText(template[key], 'ENVIRONMENT_TRACE_TEMPLATE_INVALID');
}

function validateDecayProfile(profile) {
  requiredText(profile.id, 'ENVIRONMENT_DECAY_PROFILE_INVALID');
  for (const key of ['readable_at_or_above', 'faint_at_or_above', 'decay_per_minute', 'precipitation_multiplier']) {
    if (profile[key] == null || !Number.isFinite(Number(profile[key])) || Number(profile[key]) < 0) throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_PROFILE_INVALID', `Decay profile requires non-negative ${key}.`, { profile_id: profile.id, key });
  }
  if (Number(profile.readable_at_or_above) < Number(profile.faint_at_or_above)) throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_PROFILE_INVALID', 'Readable threshold must not be below faint threshold.', { profile_id: profile.id });
  const policy = profile.decay_policy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || policy.schema !== 'environment_decay_policy_v1' || !policy.weather_multipliers || typeof policy.weather_multipliers !== 'object' || Array.isArray(policy.weather_multipliers)) {
    throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_POLICY_INVALID', 'Decay profile requires a versioned weather multiplier policy.', { profile_id: profile.id });
  }
}

function weatherDecayMultiplier(profile, weather) {
  const key = text(weather);
  const multiplier = Number(profile.decay_policy.weather_multipliers[key]);
  if (!key || !Number.isFinite(multiplier) || multiplier < 0) throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_POLICY_UNAVAILABLE', 'Decay policy has no applicable weather multiplier.', { profile_id: profile.id, weather });
  return multiplier;
}

function appliesTraceRule(rule, emission, input, catalog) {
  if (!approved(rule) || !text(rule.id) || !text(rule.source_category_id) || !text(rule.trace_template_id) || !text(rule.decay_profile_id)) return false;
  if (rule.world_revision_id !== input.world_revision_id || (rule.region_id != null && rule.region_id !== input.region_id)) return false;
  if (rule.source_category_id !== emission.source_category_id || rule.source_kind !== emission.source_kind || (rule.movement_mode != null && rule.movement_mode !== emission.movement_mode)) return false;
  if (rule.season != null) {
    const season = text(input.historical_frame?.season);
    if (!season) throw new EnvironmentFeatureError('ENVIRONMENT_SCOPE_INPUT_INCOMPLETE', 'Season-scoped trace rule requires historical_frame.season.', { rule_id: rule.id });
    if (rule.season !== season) return false;
  }
  return relationMatches(catalog.trace_rule_landscapes, rule.id, 'landscape_template_id', emission.landscape_template_id)
    && relationMatches(catalog.trace_rule_hydrology, rule.id, 'water_body_template_id', emission.water_body_template_id);
}
function scoped(record, input) { return record.world_revision_id === input.world_revision_id && (record.region_id == null || record.region_id === input.region_id); }
function relationMatches(records, ruleId, field, actual) { const values = records.filter((item) => item.rule_id === ruleId).map((item) => requiredText(item[field], 'ENVIRONMENT_TRACE_SCOPE_BINDING_INVALID')); return values.length === 0 || (text(actual) && values.includes(actual)); }
