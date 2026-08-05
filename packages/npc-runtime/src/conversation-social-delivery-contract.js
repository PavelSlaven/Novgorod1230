import { exactKeys, freeze, stableId, uniqueStableIds } from './internal.js';

export const CHECK_OUTCOMES = Object.freeze([
  'clean_success',
  'success',
  'success_with_cost',
  'failure_with_consequence',
  'severe_failure'
]);

export const DELIVERY_QUALITY_BY_OUTCOME = Object.freeze({
  clean_success: 'compelling',
  success: 'credible',
  success_with_cost: 'credible_with_visible_cost',
  failure_with_consequence: 'unconvincing',
  severe_failure: 'transparently_manipulative'
});

const DELIVERY_QUALITIES = new Set(
  Object.values(DELIVERY_QUALITY_BY_OUTCOME)
);

export function validateSocialDeliveryResult(value) {
  return exactKeys(value, [
    'schema',
    'check_resolution_id',
    'outcome_band',
    'delivery_quality',
    'observable_effects'
  ])
    && value.schema === 'social_delivery_result_v1'
    && stableId(value.check_resolution_id)
    && CHECK_OUTCOMES.includes(value.outcome_band)
    && DELIVERY_QUALITIES.has(value.delivery_quality)
    && value.delivery_quality === DELIVERY_QUALITY_BY_OUTCOME[value.outcome_band]
    && uniqueStableIds(value.observable_effects);
}

export function buildSocialDeliveryResult(value) {
  if (!validateSocialDeliveryResult(value)) {
    throw new TypeError(
      'social_delivery_result_v1 must be an exact JSON-safe contract'
    );
  }
  return freeze(value);
}
