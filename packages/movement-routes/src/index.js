import { deepFreeze } from '@rus/kernel';
import {
  addRationalMinutes,
  compareRationalMinutes,
  normalizeRationalMinutes,
  subtractRationalMinutes
} from '@rus/time-events-history';
export { createMovementPlanner, createRoutePlanActivationValidator } from './spatial-v3.js';
export { planApprovedLocalZoneTransition } from './local-zone-transition.js';
export { planApprovedActorDestinationTransition } from
  './approved-destination-transition.js';

/** Split exact traversal time at policy boundaries without rounding elapsed time. */
export function planExactTraversalIntervals({ total_time, base_minutes, factors = [],
  fixed_time_interval, distance_remaining = { numerator: '1', denominator: '1' } } = {}) {
  let total;
  let formulaTime;
  let interval;
  let remainingDistance;
  try {
    formulaTime = total_time == null ? normalizeRationalMinutes(base_minutes) : null;
    if (total_time == null) {
      if (!Array.isArray(factors) || !factors.length) throw traversalIntervalDurationError();
      for (const factor of factors) formulaTime = multiplyRationalMinutes(formulaTime,
        normalizeRationalMinutes(factor));
    }
    interval = normalizeRationalMinutes(fixed_time_interval);
    remainingDistance = normalizeRationalMinutes(distance_remaining);
    total = total_time == null ? multiplyRationalMinutes(formulaTime, remainingDistance)
      : normalizeRationalMinutes(total_time);
  } catch {
    throw traversalIntervalDurationError();
  }
  if (total.numerator === '0' || interval.numerator === '0'
    || remainingDistance.numerator === '0'
    || compareRationalMinutes(remainingDistance, { numerator: '1', denominator: '1' }) > 0) {
    throw traversalIntervalDurationError();
  }

  const intervals = [];
  let elapsed = { numerator: '0', denominator: '1' };
  let remainingTime = total;
  while (compareRationalMinutes(elapsed, total) < 0) {
    const plannedTime = compareRationalMinutes(remainingTime, interval) <= 0 ? remainingTime : interval;
    const distanceBefore = remainingDistance;
    remainingDistance = multiplyRationalMinutes(distanceBefore,
      divideRationalMinutes(subtractRationalMinutes(remainingTime, plannedTime), remainingTime));
    remainingTime = subtractRationalMinutes(remainingTime, plannedTime);
    elapsed = addRationalMinutes(elapsed, plannedTime);
    const terminal = compareRationalMinutes(elapsed, total) === 0;
    const progressBefore = progressFromRemaining(distanceBefore);
    const progressAfter = terminal ? 1_000_000 : progressFromRemaining(remainingDistance);
    intervals.push(deepFreeze({ interval_ordinal: intervals.length,
      planned_time: plannedTime, cumulative_progress_before_ppm: progressBefore,
      cumulative_progress_after_ppm: progressAfter, distance_remaining_after: remainingDistance }));
  }
  return deepFreeze({ intervals });
}

function multiplyRationalMinutes(left, right) {
  return normalizeRationalMinutes({
    numerator: String(BigInt(left.numerator) * BigInt(right.numerator)),
    denominator: String(BigInt(left.denominator) * BigInt(right.denominator))
  });
}

function divideRationalMinutes(left, right) {
  return normalizeRationalMinutes({
    numerator: String(BigInt(left.numerator) * BigInt(right.denominator)),
    denominator: String(BigInt(left.denominator) * BigInt(right.numerator))
  });
}

function floorPpm(value) {
  return Number((BigInt(value.numerator) * 1_000_000n) / BigInt(value.denominator));
}

function progressFromRemaining(value) {
  return floorPpm({ numerator: String(BigInt(value.denominator) - BigInt(value.numerator)),
    denominator: value.denominator });
}

function traversalIntervalDurationError() {
  return Object.assign(new TypeError('traversal total and fixed interval must be positive rational minutes'), {
    code: 'TRAVERSAL_INTERVAL_DURATION_INVALID'
  });
}

export const TRAVEL_CONDITION_MULTIPLIERS = deepFreeze({ normal:1, poor:1.5, bad:2, severe:3 });
export const TRAVEL_LOAD_MULTIPLIERS = deepFreeze({ light:1, moderate:1.25, heavy:1.5, overloaded:2 });
const BASE_MINUTES = deepFreeze({ inside:5, local:35, nearby:90, regional:240, long:480 });

export function calculateTravelTime(route = {}, actor = {}, conditions = {}) {
  const scale = text(route.scale ?? route.type ?? 'local').toLowerCase();
  const baseGu = finite(route.base_gu);
  const explicitMinutes = finite(route.base_time_minutes ?? route.base_time);
  const baseMinutes = explicitMinutes != null && explicitMinutes > 0
    ? explicitMinutes
    : (baseGu != null && baseGu > 0 ? baseGu * 60 : (BASE_MINUTES[scale] ?? BASE_MINUTES.local));
  const conditionMultiplier = conditions.severe ? 3 : conditions.bad ? 2 : conditions.poor ? 1.5 : 1;
  const loadCategory = text(actor?.items?.load_category ?? actor?.load_category ?? 'light').toLowerCase();
  const loadMultiplier = TRAVEL_LOAD_MULTIPLIERS[loadCategory] ?? 1;
  return deepFreeze({
    route_id: text(route.id) || null,
    base_gu: baseGu,
    base_time_minutes: baseMinutes,
    condition_multiplier: conditionMultiplier,
    load_multiplier: loadMultiplier,
    final_time_minutes: Math.round(baseMinutes * conditionMultiplier * loadMultiplier)
  });
}

export function assessRouteAvailability(route = {}, context = {}) {
  const blockers = [];
  if (!text(route.id)) blockers.push('missing_route_id');
  if (!text(route.from_node_id) || !text(route.to_node_id)) blockers.push('invalid_endpoints');
  if (route.closed === true || route.available === false) blockers.push('route_closed');
  if (route.requires_guide && !context.has_guide) blockers.push('guide_required');
  if (route.requires_boat && !context.has_boat) blockers.push('boat_required');
  if (route.requires_horse && !context.has_horse) blockers.push('horse_required');
  if (route.requires_sled && !context.has_sled) blockers.push('sled_required');
  if (route.requires_permission && !context.has_permission) blockers.push('permission_required');
  const knowledge = text(context.knowledge_level ?? route.known_to_character_default).toLowerCase();
  const exactKnown = ['knows_exact','known','yes','true'].includes(knowledge);
  const orientationRequired = Boolean(route.requires_orientation_check || (!exactKnown && !blockers.length));
  return deepFreeze({ available: blockers.length === 0, blockers, orientation_required: orientationRequired, orientation_difficulty: text(route.orientation_difficulty) || null });
}

export function buildTraversalRequest(route = {}, actor = {}, context = {}) {
  const availability = assessRouteAvailability(route, context);
  return deepFreeze({
    route_id: text(route.id) || null,
    actor_id: text(actor.id) || null,
    from_node_id: text(route.from_node_id) || null,
    to_node_id: text(route.to_node_id) || null,
    availability,
    time_cost: calculateTravelTime(route, actor, context.conditions ?? {}),
    orientation_check_request: availability.orientation_required ? {
      difficulty: availability.orientation_difficulty,
      relevant_attribute: 'attention',
      relevant_skill: 'orientation'
    } : null,
    failure_consequences: Array.isArray(route.failure_consequences) ? structuredClone(route.failure_consequences) : []
  });
}

export function validateTraversalResult(result = {}, request = {}) {
  const errors = [];
  if (text(result.route_id) !== text(request.route_id)) errors.push('route_id mismatch');
  if (!['completed','partial','blocked','failed'].includes(text(result.status))) errors.push('invalid traversal status');
  if (result.status === 'completed' && text(result.position_node_id) !== text(request.to_node_id)) errors.push('completed traversal must end at to_node_id');
  if (!Number.isFinite(Number(result.elapsed_minutes)) || Number(result.elapsed_minutes) < 0) errors.push('elapsed_minutes must be non-negative');
  return { ok: errors.length === 0, errors };
}

function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
