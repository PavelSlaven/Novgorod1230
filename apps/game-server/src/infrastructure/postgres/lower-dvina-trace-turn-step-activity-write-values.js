import { normalizeRationalMinutes } from '@rus/time-events-history';
import { serverError } from '../../errors.js';

export function positiveIntegralMinutes(value) {
  const number = exactIntegralMinutes(value);
  return number != null && number > 0 ? number : null;
}
export function exactMinutes(value) {
  try { return normalizeRationalMinutes(value?.exact_minutes); }
  catch { return null; }
}
export function rationalAsNumber(value) {
  let exact;
  try { exact = normalizeRationalMinutes(value); }
  catch { return null; }
  const result = Number(exact.numerator) / Number(exact.denominator);
  return Number.isFinite(result) && result >= 0 ? result : null;
}
export function dbInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value;
}
function exactIntegralMinutes(value) {
  const exact = value?.exact_minutes;
  if (exact?.denominator !== '1' || typeof exact.numerator !== 'string'
      || !/^(?:0|[1-9]\d*)$/u.test(exact.numerator)) return null;
  const number = Number(exact.numerator);
  return Number.isSafeInteger(number) ? number : null;
}
export function activityContext(activity, order) {
  return { root_turn_id: activity.root_turn_id, step_index: activity.step_index,
    fragment_order: order, duration_class: activity.duration_class,
    effort: activity.effort };
}
export function activityWriteFail(reason, details = {}) {
  throw serverError('TRACE_TURN_STEP_SEMANTIC_ACTIVITY_PERSISTENCE_GAP',
    'Semantic activity cannot use the existing normalized activity owner.',
    { status: 409, details: { reason, ...details } });
}
export function activityReconciliationFail(reason, details = {}) {
  throw serverError('TRACE_TURN_STEP_SEMANTIC_ACTIVITY_RECONCILIATION_FAILED',
    'Semantic activity differs from the temporal owner output.',
    { status: 409, details: { reason, ...details } });
}
export function semanticActivityResultCode(resolution) {
  return resolution.execution.status === 'completed'
    ? 'turn_step_semantic_activity_completed'
    : 'turn_step_semantic_activity_interrupted';
}
