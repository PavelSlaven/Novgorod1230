export const DC = {
  trivial: 5,
  ordinary: 10,
  risky: 15,
  dangerous: 20,
  limit: 25,
  nearlyImpossible: 30
};

export const DC_MIN = 5;
export const DC_MAX = 30;

export function clampDifficulty(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DC.ordinary;
  return Math.max(DC_MIN, Math.min(DC_MAX, Math.round(numeric)));
}

export function evaluateCheckOutcome(roll, total, dc) {
  const safeRoll = Number(roll);
  const safeTotal = Number(total);
  const safeDc = Number(dc);
  const margin = safeTotal - safeDc;

  let band;
  if (margin >= 10) band = 'clean_success';
  else if (margin >= 0) band = 'success';
  else if (margin >= -4) band = 'success_with_cost';
  else if (margin >= -9) band = 'failure_with_consequence';
  else band = 'severe_failure';

  const success = margin >= 0;
  const costRequired = margin < 0 && margin >= -4;
  const severeFailure = margin <= -10;
  const degree = band === 'success_with_cost' ? 'partial' : (success ? 'success' : 'failure');
  const rollNote = safeRoll === 1 ? 'natural_1' : (safeRoll === 20 ? 'natural_20' : null);

  return outcomeRecord(margin, band, success, costRequired, severeFailure, degree, rollNote);
}

function outcomeRecord(margin, band, success, costRequired, severeFailure, degree, rollNote = null) {
  return {
    margin,
    band,
    success,
    cost_required: costRequired,
    severe_failure: severeFailure,
    degree,
    roll_note: rollNote
  };
}

export const TRAVEL_CONDITION_MULTIPLIERS = {
  normal: 1,
  poor: 1.5,
  bad: 2,
  severe: 3
};

export const TRAVEL_LOAD_MULTIPLIERS = {
  light: 1,
  moderate: 1.25,
  heavy: 1.5,
  overloaded: 2
};

export const ROUTE_BASE_MINUTES = {
  inside: 5,
  local: 35,
  nearby: 90,
  regional: 240,
  long: 480
};

export function travelLoadMultiplier(loadCategory) {
  const key = String(loadCategory ?? 'light').toLowerCase();
  return TRAVEL_LOAD_MULTIPLIERS[key] ?? TRAVEL_LOAD_MULTIPLIERS.light;
}

export function travelConditionMultiplier(conditions = {}) {
  const candidates = [
    conditions.severe ? TRAVEL_CONDITION_MULTIPLIERS.severe : 0,
    conditions.bad ? TRAVEL_CONDITION_MULTIPLIERS.bad : 0,
    conditions.poor ? TRAVEL_CONDITION_MULTIPLIERS.poor : 0,
    TRAVEL_CONDITION_MULTIPLIERS.normal
  ];
  return Math.max(...candidates);
}

export function calculateTravelTime(route = {}, actor = {}, conditions = {}) {
  const scale = String(route?.scale ?? route?.type ?? 'local').toLowerCase();
  const explicitBase = Number(route?.base_time);
  const baseTime = Number.isFinite(explicitBase) && explicitBase > 0
    ? explicitBase
    : (ROUTE_BASE_MINUTES[scale] ?? ROUTE_BASE_MINUTES.local);
  const conditionMultiplier = travelConditionMultiplier(conditions);
  const loadCategory = actor?.items?.load_category ?? null;
  const loadMultiplier = travelLoadMultiplier(loadCategory);
  const finalTime = Math.round(baseTime * conditionMultiplier * loadMultiplier);

  return {
    route_id: route?.id ?? null,
    base_time: baseTime,
    condition_multiplier: conditionMultiplier,
    load_multiplier: loadMultiplier,
    final_time: finalTime
  };
}

export const PROGRESS_BANDS = ['near', 'half_day', 'day', 'several_days', 'region_edge', 'neighbor_region'];

export function progressBandFromSteps(steps = 0) {
  if (steps <= 1) return 'near';
  if (steps <= 3) return 'half_day';
  if (steps <= 5) return 'day';
  if (steps <= 8) return 'several_days';
  if (steps <= 11) return 'region_edge';
  return 'neighbor_region';
}
