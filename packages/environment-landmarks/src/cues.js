import { canonicalDigest, deterministicInstanceId } from '@rus/materialization';
import { EnvironmentFeatureError } from './errors.js';
import { approved, emptyRejections, requiredText, text } from './utils.js';

export function updateCues({ input, state, catalog, activeEmitters, elapsedMinutes, choices }) {
  const cues = state.cues.map((cue) => ({ ...cue }));
  const created = []; const updated = []; const expired = []; const activeKeys = new Set();
  for (const emitter of activeEmitters) {
    if (!text(emitter.source_id) || !text(emitter.source_kind) || !text(emitter.location_binding)) throw new EnvironmentFeatureError('ENVIRONMENT_EMITTER_SOURCE_INVALID', 'Active emitter requires source and location bindings.', { emitter_id: emitter.emitter_id });
    const rules = catalog.emission_rules.filter((rule) => approved(rule) && rule.source_type === emitter.source_type);
    if (rules.length === 0) continue;
    for (const rule of rules.sort((left, right) => left.rule_id.localeCompare(right.rule_id))) {
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
    if (cue.age_minutes >= cue.expiry_duration_minutes) { cue.status = 'expired'; expired.push(cue.cue_id); } else { cue.status = 'fading'; updated.push(cue); }
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
