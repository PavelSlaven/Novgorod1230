const CONTROL_FACTORS = new Set([
  'moderate_supported_wind',
  'moderate_cross_current',
  'craft_control_degraded'
]);
const ORIENTATION_FACTORS = new Set([
  'reduced_but_navigable_visibility',
  'landmark_confidence_reduced'
]);
const AVAILABILITY_POLICY_ID =
  'availability.lower_dvina_late_summer_daylight_v1';
const ALLOWED_AVAILABILITY = Object.freeze({
  season_mode: new Set(['late_summer_open_water']),
  water_surface_state: new Set(['open_water']),
  wind_band: new Set(['calm', 'light', 'moderate_supported']),
  visibility_band: new Set([
    'clear',
    'light_haze',
    'reduced_but_navigable'
  ]),
  craft_state: new Set(['serviceable']),
  load_state: new Set(['within_approved_capacity']),
  controller_state: new Set(['approved_boatman_in_control'])
});
const ALLOWED_RISK_STATE = Object.freeze({
  current_band: new Set(['calm', 'moderate_cross']),
  craft_control_state: new Set(['stable', 'degraded']),
  landmark_confidence: new Set(['sufficient', 'reduced'])
});

export function resolveLowerDvinaBoundaryContext(snapshot) {
  if (snapshot == null || typeof snapshot !== 'object') {
    return { ok: false, code: 'boundary_condition_snapshot_missing' };
  }
  const policyRef = snapshot.availability_policy_ref;
  if (policyRef?.entity_kind !== 'traversal_availability_policy'
      || policyRef.entity_id !== AVAILABILITY_POLICY_ID
      || policyRef.version !== 1) {
    return { ok: false, code: 'boundary_availability_pin_mismatch' };
  }
  if (snapshot.daylight_state !== 'daylight') {
    return { ok: false, code: 'boundary_daylight_required' };
  }
  for (const [dimension, allowed] of Object.entries(
    ALLOWED_AVAILABILITY
  )) {
    if (!allowed.has(snapshot[dimension])) {
      return {
        ok: false,
        code: 'boundary_availability_value_unsupported',
        dimension
      };
    }
  }
  for (const [dimension, allowed] of Object.entries(
    ALLOWED_RISK_STATE
  )) {
    if (!allowed.has(snapshot[dimension])) {
      return {
        ok: false,
        code: 'boundary_risk_state_unsupported',
        dimension
      };
    }
  }
  const adverseFactors = [];
  if (snapshot.wind_band === 'moderate_supported') {
    adverseFactors.push('moderate_supported_wind');
  }
  if (snapshot.current_band === 'moderate_cross') {
    adverseFactors.push('moderate_cross_current');
  }
  if (snapshot.craft_control_state === 'degraded') {
    adverseFactors.push('craft_control_degraded');
  }
  if (snapshot.visibility_band === 'reduced_but_navigable') {
    adverseFactors.push('reduced_but_navigable_visibility');
  }
  if (snapshot.landmark_confidence === 'reduced') {
    adverseFactors.push('landmark_confidence_reduced');
  }
  const check = resolveLowerDvinaBoundaryCheck({ adverseFactors });
  if (!check.ok) return check;
  return {
    ok: true,
    availability_policy_ref: structuredClone(policyRef),
    adverse_factors: adverseFactors,
    check: check.check
  };
}

export function selectLowerDvinaBoundaryContext(
  timeline,
  elapsedMinutes
) {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return { ok: false, code: 'boundary_condition_timeline_missing' };
  }
  let selected = null;
  let previousMinute = -1;
  for (const entry of timeline) {
    const effectiveMinute = entry?.effective_after_minutes;
    if (!Number.isInteger(effectiveMinute)
        || effectiveMinute < 0
        || effectiveMinute <= previousMinute) {
      return { ok: false, code: 'boundary_condition_timeline_invalid' };
    }
    previousMinute = effectiveMinute;
    if (effectiveMinute <= elapsedMinutes) selected = entry.snapshot;
  }
  if (selected == null) {
    return { ok: false, code: 'boundary_condition_snapshot_missing' };
  }
  return resolveLowerDvinaBoundaryContext(selected);
}

export function resolveLowerDvinaBoundaryCheck({
  adverseFactors = []
} = {}) {
  const factors = [...new Set(adverseFactors)];
  if (factors.length === 0) return { ok: true, check: null };
  if (factors.length > 2 || factors.some((factor) =>
    !CONTROL_FACTORS.has(factor) && !ORIENTATION_FACTORS.has(factor))) {
    return {
      ok: false,
      code: 'boundary_check_factor_set_unsupported'
    };
  }
  const hasControl = factors.some((factor) => CONTROL_FACTORS.has(factor));
  const hasOrientation = factors.some((factor) =>
    ORIENTATION_FACTORS.has(factor));
  if (hasControl && hasOrientation) {
    return {
      ok: false,
      code: 'boundary_check_domains_ambiguous'
    };
  }
  return {
    ok: true,
    check: {
      policy_id: hasControl
        ? 'check.lower_dvina_boat_control_v1'
        : 'check.lower_dvina_orientation_v1',
      characteristic_id: hasControl ? 'dexterity' : 'attention',
      modifier_skill_id: hasControl
        ? 'travel_transport'
        : 'observation',
      target: factors.length === 1 ? 10 : 12,
      factors
    }
  };
}

export function applyLowerDvinaBoundaryFailure({
  progressPpm,
  elapsedMinutes,
  unresolvedFailureCount = 0
}) {
  if (progressPpm <= 0) {
    return {
      state: 'blocked_before_progress',
      progressPpm: 0,
      elapsedMinutes: 0,
      energyDelta: 0,
      conditionCandidate: null
    };
  }
  return {
    state: unresolvedFailureCount > 0
      ? 'stranded_in_transit'
      : 'paused_in_transit',
    progressPpm,
    elapsedMinutes: elapsedMinutes + 5,
    energyDelta: -2,
    conditionCandidate: 'wet'
  };
}
