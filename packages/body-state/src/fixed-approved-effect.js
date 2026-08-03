import { deepFreeze } from '@rus/kernel';

const BODY_METRICS = ['health', 'satiety', 'energy'];

/** Applies one approved fixed event without owning clock or persistence. */
export function applyApprovedFixedBodyEffect(input = {}) {
  const profile = input.body_effect_profile;
  const context = input.selected_context;
  if (!plain(profile) || !exactKeys(profile, [
    'schema', 'profile_ref', 'profile_pin', 'status', 'applicability',
    'exact_deltas', 'condition_outcomes', 'selection_policy',
    'rng_consumption'
  ]) || profile.schema !== 'rus.body_state.fixed_approved_effect.v1'
      || !text(profile.profile_ref) || !plain(profile.profile_pin)
      || profile.status !== 'approved'
      || profile.selection_policy !== 'fixed_approved_effect'
      || profile.rng_consumption !== 'forbidden'
      || !sameJson(profile.applicability, context)
      || !fixedDeltas(profile.exact_deltas)
      || !Array.isArray(profile.condition_outcomes)) {
    return hardBlock('event_effect_gap',
      'an exact approved fixed body effect and matching context are required');
  }
  const current = input.body_state;
  if (!plain(current)
      || BODY_METRICS.some((metric) => !Number.isFinite(current[metric]))) {
    return hardBlock('event_rule_gap',
      'explicit health, satiety and energy are required');
  }
  const conditions = normalizeConditions(current.active_conditions);
  const transitioned = applyConditions(
    conditions, profile.condition_outcomes, profile.profile_ref);
  if (!transitioned.ok) return transitioned;
  const delta = profile.exact_deltas;
  const stateAfter = {
    ...structuredClone(current),
    ...Object.fromEntries(BODY_METRICS.map((metric) => [
      metric, clamp(current[metric] + delta[metric])
    ])),
    active_conditions: transitioned.conditions
  };
  return deepFreeze({
    ok: true,
    owner: '@rus/body-state',
    applied: true,
    proposal: {
      schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
      profile_ref: profile.profile_ref,
      profile_pin: structuredClone(profile.profile_pin),
      selected_context: structuredClone(context),
      exact_deltas: structuredClone(delta),
      condition_transitions: structuredClone(profile.condition_outcomes),
      selection_policy: profile.selection_policy,
      rng_consumption: profile.rng_consumption
    },
    state_after: stateAfter
  });
}

function applyConditions(activeConditions, outcomes, profileRef) {
  const next = structuredClone(activeConditions);
  for (const outcome of outcomes) {
    if (!plain(outcome) || !exactKeys(outcome, ['from', 'to', 'outcome'])
        || !text(outcome.from) || !text(outcome.to)) {
      return hardBlock('event_rule_gap', 'fixed condition outcome is invalid');
    }
    const matches = next.filter(({ id }) => id === outcome.from);
    if (matches.length !== 1) {
      return hardBlock('event_rule_gap',
        `condition ${outcome.from} does not select exactly one state`);
    }
    matches[0].id = outcome.to;
    matches[0].effect = text(outcome.outcome) || matches[0].effect;
    matches[0].cause = profileRef;
  }
  return { ok: true, conditions: next };
}

function normalizeConditions(value) {
  return Array.isArray(value)
    ? value.filter(plain).map((condition) => structuredClone(condition))
    : [];
}

function fixedDeltas(value) {
  return plain(value) && exactKeys(value, BODY_METRICS)
    && BODY_METRICS.every((metric) => Number.isSafeInteger(value[metric]));
}

function clamp(value) { return Math.max(0, Math.min(100, value)); }
function hardBlock(code, message) {
  return deepFreeze({ ok: false, status: 'hard_block',
    error: deepFreeze({ code, message }) });
}
function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}
function sameJson(left, right) {
  return JSON.stringify(normalizeJson(left))
    === JSON.stringify(normalizeJson(right));
}
function normalizeJson(value) {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, normalizeJson(value[key])]));
  return value;
}
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function text(value) {
  return typeof value === 'string' && value.trim() === value ? value : '';
}
