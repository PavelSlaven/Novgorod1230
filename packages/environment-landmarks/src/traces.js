import { canonicalDigest, deterministicInstanceId } from '@rus/materialization';
import { EnvironmentFeatureError } from './errors.js';
import { approved, emptyRejections, requiredText, text } from './utils.js';

export function updateTraces({ input, state, catalog, traceEmissions, elapsedMinutes, choices }) {
  const traces = state.traces.map((trace) => ({ ...trace }));
  const created = []; const updated = []; const erased = [];
  for (const emission of traceEmissions) {
    for (const key of ['source_kind', 'source_id', 'cause_event_id', 'location_binding', 'created_at']) if (!text(emission[key])) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_CAUSALITY_INVALID', `Trace emission requires ${key}.`, { emission_id: emission.emission_id });
    const rule = catalog.trace_creation_rules.find((item) => approved(item) && item.source_kind === emission.source_kind && (!item.movement_mode || item.movement_mode === emission.movement_mode));
    if (!rule) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_RULE_MISSING', 'Trace emission has no approved creation rule.', { emission_id: emission.emission_id });
    const template = catalog.trace_templates.find((item) => approved(item) && item.template_id === rule.trace_template_id);
    const profile = catalog.decay_profiles.find((item) => approved(item) && item.profile_id === rule.decay_profile_id);
    if (!template || !profile) throw new EnvironmentFeatureError('ENVIRONMENT_TRACE_CATALOG_REFERENCE_MISSING', 'Trace creation rule has a missing template or decay profile.', { rule_id: rule.rule_id });
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
      template_id: template.template_id, creation_rule_id: rule.rule_id, decay_profile_id: profile.profile_id,
      source_kind: emission.source_kind, source_id: emission.source_id, cause_event_id: emission.cause_event_id, movement_mode: emission.movement_mode ?? null, created_at: emission.created_at,
      location_binding: emission.location_binding, status: 'fresh', strength: 1, age_minutes: 0,
      public_label_key: requiredText(template.public_label_key, 'ENVIRONMENT_TRACE_LABEL_REQUIRED'), icon_key: requiredText(template.icon_key, 'ENVIRONMENT_TRACE_ICON_REQUIRED'),
      recognition_difficulty: requiredText(template.recognition_difficulty, 'ENVIRONMENT_TRACE_TEMPLATE_INVALID'), navigation_value: requiredText(template.navigation_value, 'ENVIRONMENT_TRACE_TEMPLATE_INVALID'), decay_profile: profile
    };
    traces.push(trace); created.push(trace);
    choices.push({ choice_ordinal: choices.length, choice_key: `trace:${emission.emission_id}`, candidate_set_digest: canonicalDigest([rule.rule_id]), candidate_ids: [rule.rule_id], selected_id: rule.rule_id, selected_weight: 1, rng_draw: null, rng_counter: null, rejection_summary: emptyRejections() });
  }
  for (const trace of traces) {
    if (trace.status === 'erased' || created.includes(trace)) continue;
    const profile = trace.decay_profile ?? catalog.decay_profiles.find((item) => item.profile_id === trace.decay_profile_id);
    if (!profile) throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_PROFILE_MISSING', 'Existing trace has no approved decay profile.', { trace_id: trace.trace_id });
    validateDecayProfile(profile);
    const weatherMultiplier = input.weather_after === 'rain' ? Number(profile.precipitation_multiplier) : 1;
    trace.age_minutes += elapsedMinutes;
    trace.strength = Math.max(0, trace.strength - (Number(profile.decay_per_minute) * elapsedMinutes * weatherMultiplier));
    trace.status = trace.strength <= 0 ? 'erased' : trace.strength >= Number(profile.readable_at_or_above) ? 'readable' : 'faint';
    if (trace.status === 'erased') erased.push(trace.trace_id); else updated.push(trace);
  }
  return { traces, created, updated, erased };
}

function sameEmission(trace, emission, rule) {
  return trace.source_kind === emission.source_kind
    && trace.source_id === emission.source_id
    && trace.cause_event_id === emission.cause_event_id
    && trace.location_binding === emission.location_binding
    && trace.created_at === emission.created_at
    && trace.creation_rule_id === rule.rule_id
    && (trace.movement_mode ?? null) === (emission.movement_mode ?? null);
}

function validateTraceTemplate(template) {
  for (const key of ['template_id', 'public_label_key', 'icon_key', 'recognition_difficulty', 'navigation_value']) requiredText(template[key], 'ENVIRONMENT_TRACE_TEMPLATE_INVALID');
}

function validateDecayProfile(profile) {
  requiredText(profile.profile_id, 'ENVIRONMENT_DECAY_PROFILE_INVALID');
  for (const key of ['readable_at_or_above', 'faint_at_or_above', 'decay_per_minute', 'precipitation_multiplier']) {
    if (profile[key] == null || !Number.isFinite(Number(profile[key])) || Number(profile[key]) < 0) throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_PROFILE_INVALID', `Decay profile requires non-negative ${key}.`, { profile_id: profile.profile_id, key });
  }
  if (Number(profile.readable_at_or_above) < Number(profile.faint_at_or_above)) throw new EnvironmentFeatureError('ENVIRONMENT_DECAY_PROFILE_INVALID', 'Readable threshold must not be below faint threshold.', { profile_id: profile.profile_id });
}
