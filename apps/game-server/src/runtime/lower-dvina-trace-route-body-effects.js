import { applyBodyStateChange } from '@rus/body-state';
import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

export function createTraceRouteBodyEffect({ phase2BodyEffect, phase3Contracts, phase4Contracts }) {
  return Object.freeze({
    apply(input) {
      const effect = input.consequence?.phase3_kind === 'movement'
        ? phase3Contracts?.routeBodyEffect
        : input.consequence?.phase4_kind === 'movement'
          ? phase4Contracts?.routeBodyEffect : null;
      return effect == null ? phase2BodyEffect.apply(input)
        : applyApprovedTraceRouteBodyEffect({ ...input, effect });
    }
  });
}

export function applyApprovedTraceRouteBodyEffect({ effect, ...input }) {
  const elapsed = input.time_update?.exact_elapsed?.exact_minutes;
  if (!valid(effect) || elapsed?.numerator !== String(effect.elapsed_minutes) || elapsed?.denominator !== '1') throw fail('TRACE_ROUTE_BODY_PROFILE_MISMATCH');
  const delta = effect.exact_deltas;
  const metrics = applyBodyStateChange(input.committed_state.body_state, {
    restore: Object.fromEntries(Object.entries(delta).map(([key, value]) => [key, Math.max(value, 0)])),
    harm: { health: Math.max(-delta.health, 0) },
    spend: { satiety: Math.max(-delta.satiety, 0), energy: Math.max(-delta.energy, 0) }
  });
  const conditions = structuredClone(input.committed_state.body_state.active_conditions ?? []);
  for (const outcome of effect.condition_outcomes) {
    const matches = conditions.filter(({ id }) => id === outcome.from);
    if (matches.length !== 1 || typeof outcome.to !== 'string') throw fail('TRACE_ROUTE_BODY_CONDITION_STATE_MISMATCH');
    const condition = matches[0];
    condition.id = outcome.to;
    condition.condition_profile_ref = { ...condition.condition_profile_ref, state: outcome.to, last_effect_ref: effect.effect_profile_id };
    condition.condition_outcome = outcome.outcome;
  }
  return { owner: '@rus/body-state', applied: true, proposal: {
    profile_ref: effect.effect_profile_id, profile_digest: canonicalDigest(effect),
    activity_attempt_id: input.consequence.activity_attempt_id,
    exact_elapsed: input.time_update.exact_elapsed, exact_deltas: structuredClone(delta),
    selection_policy: effect.selection_policy, rng_consumption: effect.rng_consumption,
    condition_transitions: structuredClone(effect.condition_outcomes)
  }, state_after: { ...metrics, active_conditions: conditions } };
}

function valid(effect) {
  return ['fixed_approved_effect', 'code_owned_within_approved_bounds']
    .includes(effect?.selection_policy) && effect?.rng_consumption === 'forbidden'
    && Number.isSafeInteger(effect.elapsed_minutes) && effect.elapsed_minutes > 0
    && ['health', 'satiety', 'energy'].every((key) => Number.isSafeInteger(effect?.exact_deltas?.[key]))
    && Array.isArray(effect.condition_outcomes);
}

function fail(code) { return serverError(code, 'Approved route body effect cannot be applied.', { status: 409 }); }
