import { deepFreeze } from '@rus/kernel';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  addElapsedTime,
  compareGameTimestamp,
  compareRationalMinutes,
  divideRationalMinutes,
  multiplyRationalMinutes,
  normalizeGameTimestamp,
  normalizeRationalMinutes,
  subtractRationalMinutes
} from '@rus/time-events-history';

export const BODY_METRICS = deepFreeze(['health', 'satiety', 'energy']);
const INTERRUPTION_EFFECTS = new Set(['background', 'emergency', 'hard_interrupt', 'interaction', 'notice', 'strand']);

export function clampBodyMetric(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric));
}

export function normalizeBodyState(state = {}) {
  const metrics = {};
  for (const key of BODY_METRICS) metrics[key] = clampBodyMetric(state[key]);
  return deepFreeze({
    ...metrics,
    active_conditions: normalizeConditions(state.active_conditions ?? state.conditions),
    body_parts: plainObject(state.body_parts) ? structuredClone(state.body_parts) : {},
    prose: text(state.prose) || null
  });
}

export function applyBodyStateChange(state = {}, change = {}) {
  const current = normalizeBodyState(state);
  const next = structuredClone(current);
  for (const key of BODY_METRICS) {
    const before = current[key];
    if (before == null) continue;
    const restore = finite(change?.restore?.[key]) ?? 0;
    const spend = finite(change?.spend?.[key]) ?? 0;
    const harm = finite(change?.harm?.[key]) ?? 0;
    next[key] = clampBodyMetric(before + restore - spend - harm);
  }
  if (Array.isArray(change.add_conditions)) {
    const byId = new Map(next.active_conditions.map((entry) => [entry.id, entry]));
    for (const condition of normalizeConditions(change.add_conditions)) byId.set(condition.id, condition);
    next.active_conditions = [...byId.values()];
  }
  if (Array.isArray(change.remove_condition_ids)) {
    const remove = new Set(change.remove_condition_ids.map(text));
    next.active_conditions = next.active_conditions.filter((entry) => !remove.has(entry.id));
  }
  return deepFreeze(next);
}

export { applyApprovedFixedBodyEffect } from './fixed-approved-effect.js';

export function stateModifier(state = {}, relevantMetrics = BODY_METRICS) {
  const normalized = normalizeBodyState(state);
  let modifier = 0;
  for (const key of relevantMetrics) {
    const value = normalized[key];
    if (value == null) continue;
    if (value === 0) modifier = Math.min(modifier, -4);
    else if (value <= 20) modifier = Math.min(modifier, -2);
    else if (value <= 49) modifier = Math.min(modifier, -1);
  }
  for (const condition of normalized.active_conditions) {
    const value = finite(condition.modifier);
    if (value != null) modifier = Math.min(modifier, value);
  }
  return Math.max(-4, Math.min(0, modifier));
}

export function validateBodyState(state = {}) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, errors: ['body state must be an object'] };
  for (const key of BODY_METRICS) {
    if (state[key] == null) continue;
    const value = Number(state[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) errors.push(`${key} must be between 0 and 100`);
  }
  for (const condition of normalizeConditions(state.active_conditions ?? state.conditions)) {
    if (!condition.id) errors.push('active condition id is required');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Produces an immutable, persistence-free body delta from an approved pinned
 * profile. Rates and results use exact decimal-string rational DTOs.
 */
export function calculateBodyTimeEffectProposal(input) {
  const prepared = prepareBodyTimeEffectInput(input, { requireThresholds: false, requireElapsed: true });
  if (!prepared.ok) return prepared;

  const metricChanges = prepared.effects.map((effect) => deepFreeze({
    metric: effect.metric,
    direction: effect.direction,
    amount: multiplyRationalMinutes(effect.rate_per_exact_minute, prepared.exactElapsed)
  }));
  return deepFreeze({
    ok: true,
    body_change_proposal: deepFreeze({
      proposal_kind: 'body_time_effect',
      profile_ref: prepared.profileRef,
      time_effect_policy_ref: prepared.policyRef,
      exact_elapsed: prepared.exactElapsed,
      metric_changes: metricChanges
    }),
    validation_report: prepared.validationReport,
    trace: prepared.trace
  });
}

/**
 * Returns the first approved threshold reached in (window_start, window_end].
 * A null candidate is a valid result: no supplied threshold is reached there.
 */
export function predictNearestBodyThreshold(input) {
  const prepared = prepareBodyTimeEffectInput(input, { requireThresholds: true, requireElapsed: false });
  if (!prepared.ok) return prepared;

  let windowStart;
  let windowEnd;
  try {
    windowStart = normalizeGameTimestamp(input?.window_start);
    windowEnd = normalizeGameTimestamp(input?.window_end);
  } catch (error) {
    return hardBlock('body_effect_rule_gap', error.message);
  }
  if (compareGameTimestamp(windowEnd, windowStart) < 0) {
    return hardBlock('body_effect_rule_gap', 'body threshold window cannot be negative');
  }

  const candidates = [];
  for (const threshold of prepared.thresholds) {
    const effect = prepared.effectsByMetric.get(threshold.metric);
    if (!effect || effect.direction !== threshold.direction) {
      return hardBlock('body_effect_rule_gap', `threshold ${threshold.threshold_id} has no matching body effect rule`);
    }
    const stateValue = prepared.stateByMetric.get(threshold.metric);
    if (!stateValue) return hardBlock('body_effect_rule_gap', `body state is missing metric ${threshold.metric}`);
    const elapsedToThreshold = elapsedUntilThreshold(stateValue, threshold.value, effect.direction, effect.rate_per_exact_minute);
    if (elapsedToThreshold === null) continue;
    const scheduledAt = addElapsedTime(windowStart, { exact_minutes: elapsedToThreshold });
    if (compareGameTimestamp(scheduledAt, windowEnd) <= 0) {
      candidates.push({ threshold, elapsedToThreshold, scheduledAt });
    }
  }
  candidates.sort((left, right) => compareRationalMinutes(left.elapsedToThreshold, right.elapsedToThreshold)
    || left.threshold.threshold_id.localeCompare(right.threshold.threshold_id));
  if (candidates.length === 0) return deepFreeze({
    ok: true,
    threshold_candidate: null,
    validation_report: prepared.validationReport,
    trace: { owner: '@rus/body-state', interval: '(from,to]' }
  });

  const nearest = candidates[0];
  const preconditionsDigest = computeSpatialV3CanonicalDigest({
    observed_at: windowStart,
    body_state_ref: prepared.bodyStateRef,
    scope_ref: prepared.scopeRef,
    body_state: prepared.stateSnapshot,
    active_conditions: prepared.activeConditions,
    environment_snapshot_digest: prepared.environmentDigest,
    profile_digest: prepared.profileDigest,
    dependency_pins_digest: prepared.pinsDigest
  });
  const thresholdCandidate = deepFreeze({
    boundary_id: `body-threshold:${prepared.bodyStateRef.entity_id}:${nearest.threshold.threshold_id}`,
    boundary_kind: 'body_threshold',
    scheduled_at: nearest.scheduledAt,
    source_ref: prepared.provenanceRef,
    primary_subject_ref: prepared.bodyStateRef,
    scope_ref: prepared.scopeRef,
    rule_ref: prepared.profileRef,
    policy_ref: prepared.boundaryPolicyRef,
    preconditions_digest: preconditionsDigest,
    resolution_class: 'physical_hazard_access',
    interrupt_effect: prepared.interruptEffect,
    visibility_policy_ref: prepared.visibilityPolicyRef,
    idempotency_key: `body-threshold:${prepared.bodyStateRef.entity_id}:${nearest.threshold.threshold_id}:${preconditionsDigest}`,
    subject_refs: [prepared.bodyStateRef],
    causal_parent_refs: []
  });
  if (!contractValid('temporal_boundary_candidate', thresholdCandidate)) {
    return hardBlock('generated_schema_mismatch', 'body threshold provider produced a non-formal boundary candidate');
  }
  return deepFreeze({
    ok: true,
    threshold_candidate: thresholdCandidate,
    validation_report: prepared.validationReport,
    trace: { owner: '@rus/body-state', interval: '(from,to]' }
  });
}

function prepareBodyTimeEffectInput(input, { requireThresholds, requireElapsed }) {
  if (!plainObject(input)) return hardBlock('event_effect_gap', 'body time effect input must be an object');
  const profile = input.body_effect_profile;
  if (!plainObject(profile)
    || !exactKeys(profile, [
      'profile_ref',
      'time_effect_policy_ref',
      'boundary_policy_ref',
      'visibility_policy_ref',
      'interrupt_effect',
      'status',
      'provenance_ref',
      'applicability',
      'effects',
      'thresholds',
      'canonical_digest'
    ])
    || profile.status !== 'approved'
    || !contractValid('versioned_ref', profile.profile_ref)
    || !contractValid('versioned_ref', profile.time_effect_policy_ref)
    || !contractValid('versioned_ref', profile.boundary_policy_ref)
    || !contractValid('versioned_ref', profile.visibility_policy_ref)
    || !INTERRUPTION_EFFECTS.has(profile.interrupt_effect)
    || !contractValid('entity_ref', profile.provenance_ref)
    || !sealedRecord(profile)) {
    return hardBlock('event_effect_gap', 'approved digest-bound body effect profile is required');
  }
  if (!Array.isArray(profile.effects) || profile.effects.length === 0) {
    return hardBlock('event_effect_gap', 'body effect profile must contain effects');
  }
  if (requireThresholds && (!Array.isArray(profile.thresholds) || profile.thresholds.length === 0)) {
    return hardBlock('event_effect_gap', 'body effect profile must contain thresholds');
  }

  let exactElapsed = null;
  if (requireElapsed) {
    if (!Object.hasOwn(input, 'exact_elapsed')) return hardBlock('event_rule_gap', 'exact_elapsed is required');
    try {
      exactElapsed = normalizeRationalMinutes(input.exact_elapsed);
    } catch (error) {
      return hardBlock('event_rule_gap', error.message);
    }
    if (exactElapsed.numerator === '0') return hardBlock('time_elapsed_invalid', 'body time effects require positive exact elapsed');
  }
  const state = input.body_state;
  if (!plainObject(state) || !exactKeys(state, BODY_METRICS)) {
    return hardBlock('event_rule_gap', 'explicit closed body state is required');
  }
  const context = validateBodyTimeContext(input, profile);
  if (!context.ok) return context;

  const effectsByMetric = new Map();
  for (const rawEffect of profile.effects) {
    const effect = normalizeEffect(rawEffect);
    if (!effect) return hardBlock('event_rule_gap', 'body effect rule is invalid');
    if (effectsByMetric.has(effect.metric)) return hardBlock('event_rule_gap', `body effect rule for ${effect.metric} is ambiguous`);
    effectsByMetric.set(effect.metric, effect);
  }
  const stateByMetric = new Map();
  for (const metric of effectsByMetric.keys()) {
    const value = normalizeMetricValue(state[metric]);
    if (!value) return hardBlock('event_rule_gap', `body state is missing exact metric ${metric}`);
    stateByMetric.set(metric, value);
  }

  const thresholds = [];
  for (const rawThreshold of profile.thresholds ?? []) {
    const threshold = normalizeThreshold(rawThreshold);
    if (!threshold) return hardBlock('event_rule_gap', 'body threshold rule is invalid');
    thresholds.push(threshold);
  }
  const thresholdIds = new Set();
  for (const threshold of thresholds) {
    if (thresholdIds.has(threshold.threshold_id)) return hardBlock('event_rule_gap', `body threshold ${threshold.threshold_id} is ambiguous`);
    thresholdIds.add(threshold.threshold_id);
  }

  return {
    ok: true,
    exactElapsed,
    effects: [...effectsByMetric.values()].sort((left, right) => left.metric.localeCompare(right.metric)),
    effectsByMetric,
    profileRef: deepFreeze(structuredClone(profile.profile_ref)),
    policyRef: deepFreeze(structuredClone(profile.time_effect_policy_ref)),
    boundaryPolicyRef: deepFreeze(structuredClone(profile.boundary_policy_ref)),
    visibilityPolicyRef: deepFreeze(structuredClone(profile.visibility_policy_ref)),
    interruptEffect: profile.interrupt_effect,
    provenanceRef: deepFreeze(structuredClone(profile.provenance_ref)),
    profileDigest: profile.canonical_digest,
    bodyStateRef: context.bodyStateRef,
    scopeRef: context.scopeRef,
    environmentDigest: context.environmentDigest,
    pinsDigest: context.pinsDigest,
    activeConditions: context.activeConditions,
    stateSnapshot: deepFreeze([...stateByMetric.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([metric, value]) => deepFreeze({ metric, value }))),
    stateByMetric,
    thresholds,
    validationReport: deepFreeze({ ok: true, profile_digest: profile.canonical_digest }),
    trace: deepFreeze({
      owner: '@rus/body-state',
      profile_ref: structuredClone(profile.profile_ref),
      time_effect_policy_ref: structuredClone(profile.time_effect_policy_ref),
      environment_state_ref: structuredClone(context.environmentStateRef)
    })
  };
}

function validateBodyTimeContext(input, profile) {
  if (!contractValid('entity_ref', input.body_state_ref)
    || input.body_state_ref.entity_kind !== 'body_state'
    || !contractValid('entity_ref', input.scope_ref)) {
    return hardBlock('event_rule_gap', 'explicit body-state subject and scope refs are required');
  }
  const environment = input.environment_snapshot;
  if (!plainObject(environment)
    || !exactKeys(environment, ['state_ref', 'body_factor_ids', 'canonical_digest'])
    || !contractValid('entity_ref', environment.state_ref)
    || environment.state_ref.entity_kind !== 'environment_overlay_state'
    || !Array.isArray(environment.body_factor_ids)
    || environment.body_factor_ids.some((value) => text(value) === '')
    || !sealedRecord(environment)) {
    return hardBlock('event_effect_gap', 'explicit digest-bound environment snapshot is required');
  }
  if (!Array.isArray(input.active_conditions)
    || input.active_conditions.some((value) => text(value) === '')
    || new Set(input.active_conditions).size !== input.active_conditions.length) {
    return hardBlock('event_rule_gap', 'active_conditions must be an explicit unique stable-id set');
  }
  if (!contractValid('dependency_pin_set', input.body_time_effect_policy_pins)
    || !versionedRefPinned(input.body_time_effect_policy_pins, 'profile', profile.profile_ref)
    || !versionedRefPinned(input.body_time_effect_policy_pins, 'dynamic_environment_rule_set', profile.time_effect_policy_ref)
    || !versionedRefPinned(input.body_time_effect_policy_pins, 'condition_rule', profile.boundary_policy_ref)
    || !versionedRefPinned(input.body_time_effect_policy_pins, 'condition', profile.visibility_policy_ref)) {
    return hardBlock('event_effect_gap', 'body profile, time-effect, boundary and visibility policies require matching dependency pins');
  }
  const applicability = profile.applicability;
  if (!plainObject(applicability)
    || !exactKeys(applicability, ['environment_state_ids', 'required_condition_ids', 'forbidden_condition_ids'])
    || !stableIdSet(applicability.environment_state_ids)
    || !stableIdSet(applicability.required_condition_ids)
    || !stableIdSet(applicability.forbidden_condition_ids)) {
    return hardBlock('event_rule_gap', 'body effect applicability rules are invalid');
  }
  const environmentId = environment.state_ref.entity_id;
  const conditions = new Set(input.active_conditions);
  if (!applicability.environment_state_ids.includes(environmentId)
    || applicability.required_condition_ids.some((value) => !conditions.has(value))
    || applicability.forbidden_condition_ids.some((value) => conditions.has(value))) {
    return hardBlock('event_rule_gap', 'body effect profile is not applicable to the supplied environment and conditions');
  }
  return {
    ok: true,
    bodyStateRef: deepFreeze(structuredClone(input.body_state_ref)),
    scopeRef: deepFreeze(structuredClone(input.scope_ref)),
    environmentStateRef: deepFreeze(structuredClone(environment.state_ref)),
    environmentDigest: environment.canonical_digest,
    pinsDigest: input.body_time_effect_policy_pins.canonical_digest,
    activeConditions: deepFreeze([...input.active_conditions].sort((left, right) => left.localeCompare(right)))
  };
}

function versionedRefPinned(pinSet, dependencyRole, reference) {
  return pinSet.pins.some((pin) => pin.dependency_role === dependencyRole
    && pin.entity_ref.entity_kind === reference.entity_ref.entity_kind
    && pin.entity_ref.entity_id === reference.entity_ref.entity_id
    && pin.version_pin.pin_kind === 'authoring_version'
    && pin.version_pin.authoring_version === reference.authoring_version);
}

function stableIdSet(values) {
  return Array.isArray(values)
    && values.every((value) => text(value) !== '')
    && new Set(values).size === values.length;
}

function normalizeEffect(value) {
  if (!plainObject(value) || !BODY_METRICS.includes(value.metric) || !['increase', 'decrease'].includes(value.direction)) return null;
  try {
    const rate = normalizeRationalMinutes(value.rate_per_exact_minute);
    if (rate.numerator === '0') return null;
    return deepFreeze({ metric: value.metric, direction: value.direction, rate_per_exact_minute: rate });
  } catch { return null; }
}

function normalizeThreshold(value) {
  if (!plainObject(value) || text(value.threshold_id) === '' || !BODY_METRICS.includes(value.metric)
    || !['increase', 'decrease'].includes(value.direction)) return null;
  try {
    return deepFreeze({
      threshold_id: text(value.threshold_id),
      metric: value.metric,
      direction: value.direction,
      value: normalizeRationalMinutes(value.value)
    });
  } catch { return null; }
}

function normalizeMetricValue(value) {
  try { return normalizeRationalMinutes(value); } catch { return null; }
}

function elapsedUntilThreshold(current, threshold, direction, rate) {
  const comparison = compareRationalMinutes(current, threshold);
  if ((direction === 'increase' && comparison >= 0) || (direction === 'decrease' && comparison <= 0)) {
    return null;
  }
  const delta = direction === 'increase'
    ? subtractRationalMinutes(threshold, current)
    : subtractRationalMinutes(current, threshold);
  return divideRationalMinutes(delta, rate);
}

function hardBlock(code, message) {
  return deepFreeze({ ok: false, status: 'hard_block', error: deepFreeze({ code, message }) });
}

function contractValid(name, value) {
  return validateSpatialV3Contract(name, value).length === 0;
}

function exactKeys(value, allowed) {
  return plainObject(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function sealedRecord(value) {
  if (!plainObject(value) || typeof value.canonical_digest !== 'string') return false;
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'canonical_digest'));
  return value.canonical_digest === computeSpatialV3CanonicalDigest(payload);
}

function normalizeConditions(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)).map((entry) => ({
    id: text(entry.id) || null,
    label: text(entry.label) || null,
    location: text(entry.location) || null,
    severity: finite(entry.severity),
    cause: text(entry.cause) || null,
    effect: text(entry.effect) || null,
    treatment: text(entry.treatment) || null,
    modifier: finite(entry.modifier)
  }));
}
function plainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
