import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { calculateBodyTimeEffectProposal, predictNearestBodyThreshold }
  from '@rus/body-state';
import { addElapsedTime, compareGameTimestamp, isPositiveRationalMinutes,
  subtractGameTimestamp } from '@rus/time-events-history';
import { deriveBodyEnvironmentSnapshot } from '@rus/environment-state';

const METRICS = ['health', 'satiety', 'energy'];
const INTENSITY_BY_EFFORT = Object.freeze({
  none: 'rest_or_ordinary_activity', light: 'rest_or_ordinary_activity',
  moderate: 'rest_or_ordinary_activity', heavy: 'heavy_activity', extreme: 'heavy_activity'
});
const PROFILE_IDS = Object.freeze({
  satiety: 'satiety_hourly_spend_v2', energy: 'energy_awake_spend_v2',
  health: 'starvation_health_harm_v2'
});

/**
 * Builds body-state inputs from the loader's attested body binding and approved Temporal records.
 */
export function createBodyNeedsTemporalAdapter({ body_needs_profile: bodyNeedsProfile } = {}) {
  validateBodyNeedsProfile(bodyNeedsProfile);
  const trustedBindingPin = bindingPin(bodyNeedsProfile);

  function calculateProposals(input = {}) {
    const context = normalizeContext(input);
    if (!context.ok) return context;
    const environment = deriveEnvironmentSnapshot(context);
    if (!environment.ok) return environment;
    const intensity = INTENSITY_BY_EFFORT[input.effort];
    if (!intensity || bodyNeedsProfile.effort_bindings.find((binding) => binding.effort_id === input.effort)
        ?.activity_intensity_id !== intensity) {
      return failure('BODY_NEEDS_EFFORT_BINDING_REQUIRED');
    }

    const proposals = [];
    const appendProposal = (metric, exactElapsed) => {
      const profileId = PROFILE_IDS[metric];
      const source = bodyNeedsProfile.profiles[profileId];
      const profile = makeBodyEffectProfile(source, metric, intensity, environment.snapshot.state_ref.entity_id);
      const pins = makePins(profile);
      const result = calculateBodyTimeEffectProposal({
        body_effect_profile: profile,
        body_state_ref: context.body_state_ref,
        scope_ref: context.scope_ref,
        body_state: context.body_state,
        exact_elapsed: exactElapsed,
        environment_snapshot: environment.snapshot,
        active_conditions: context.active_conditions,
        body_time_effect_policy_pins: pins
      });
      if (!result.ok) return result;
      proposals.push(Object.freeze({ ...result.body_change_proposal,
        profile_pin: sourceProfilePin(source),
        binding_pin: trustedBindingPin }));
      return null;
    };
    for (const metric of ['satiety', 'energy']) {
      const error = appendProposal(metric, input.exact_elapsed);
      if (error) return error;
    }

    let healthElapsed = null;
    if (rationalIsZero(context.body_state.satiety)) {
      healthElapsed = proposals[0].exact_elapsed;
    } else {
      const actualElapsed = proposals[0].exact_elapsed;
      const windowEnd = addElapsedTime(context.observed_at,
        { exact_minutes: actualElapsed });
      const satietyProfile = bodyNeedsProfile.profiles[PROFILE_IDS.satiety];
      const zeroThresholdProfile = makeBodyEffectProfile(satietyProfile, 'satiety',
        intensity, environment.snapshot.state_ref.entity_id, [0]);
      const crossing = predictNearestBodyThreshold({
        body_effect_profile: zeroThresholdProfile,
        body_state_ref: context.body_state_ref,
        scope_ref: context.scope_ref,
        body_state: context.body_state,
        environment_snapshot: environment.snapshot,
        active_conditions: context.active_conditions,
        body_time_effect_policy_pins: makePins(zeroThresholdProfile),
        window_start: context.observed_at,
        window_end: windowEnd
      });
      if (!crossing.ok) return crossing;
      if (crossing.threshold_candidate) {
        healthElapsed = subtractGameTimestamp(windowEnd,
          crossing.threshold_candidate.scheduled_at);
      }
    }
    if (healthElapsed && isPositiveRationalMinutes(healthElapsed)) {
      const error = appendProposal('health', healthElapsed);
      if (error) return error;
    }
    return Object.freeze({ ok: true, proposals: Object.freeze(proposals),
      trace: Object.freeze({ owner: '@rus/body-state', effort: input.effort,
        activity_intensity_id: intensity, binding_candidate_sha256: bodyNeedsProfile.candidate_sha256 }) });
  }

  function predictNearestThreshold(input = {}) {
    const context = normalizeContext(input);
    if (!context.ok) return context;
    const environment = deriveEnvironmentSnapshot(context);
    if (!environment.ok) return environment;
    const metric = input.metric;
    const profileId = PROFILE_IDS[metric];
    if (!profileId) {
      return failure('BODY_NEEDS_THRESHOLD_PROFILE_REQUIRED');
    }
    const intensity = INTENSITY_BY_EFFORT[input.effort];
    if (!intensity || bodyNeedsProfile.effort_bindings.find((binding) => binding.effort_id === input.effort)
        ?.activity_intensity_id !== intensity) return failure('BODY_NEEDS_EFFORT_BINDING_REQUIRED');
    const source = bodyNeedsProfile.profiles[profileId];
    const profile = makeBodyEffectProfile(source, metric, intensity, environment.snapshot.state_ref.entity_id);
    let bodyState = context.body_state;
    let windowStart = input.window_start;
    if (metric === 'health' && !rationalIsZero(context.body_state.satiety)) {
      const satietySource = bodyNeedsProfile.profiles[PROFILE_IDS.satiety];
      const satietyProfile = makeBodyEffectProfile(satietySource, 'satiety',
        intensity, environment.snapshot.state_ref.entity_id, [0]);
      const satietyResult = predictNearestBodyThreshold({
        body_effect_profile: satietyProfile,
        body_state_ref: context.body_state_ref,
        scope_ref: context.scope_ref,
        body_state: context.body_state,
        environment_snapshot: environment.snapshot,
        active_conditions: context.active_conditions,
        body_time_effect_policy_pins: makePins(satietyProfile),
        window_start: input.window_start,
        window_end: input.window_end
      });
      if (!satietyResult.ok) return satietyResult;
      if (satietyResult.threshold_candidate) {
        windowStart = satietyResult.threshold_candidate.scheduled_at;
        bodyState = { ...context.body_state, satiety: rational('0') };
      } else {
        windowStart = input.window_end;
      }
    }
    const result = predictNearestBodyThreshold({
      body_effect_profile: profile,
      body_state_ref: context.body_state_ref,
      scope_ref: context.scope_ref,
      body_state: bodyState,
      environment_snapshot: environment.snapshot,
      active_conditions: context.active_conditions,
      body_time_effect_policy_pins: makePins(profile),
      window_start: windowStart,
      window_end: input.window_end
    });
    if (!result.ok) return result;
    return Object.freeze({ ...result, profile_pin: sourceProfilePin(source),
      binding_pin: trustedBindingPin });
  }

  function predictThresholdCandidates(input = {}) {
    const context = normalizeContext(input);
    if (!context.ok) return context;
    const environment = deriveEnvironmentSnapshot(context);
    if (!environment.ok) return environment;
    const intensity = INTENSITY_BY_EFFORT[input.effort];
    if (!intensity || bodyNeedsProfile.effort_bindings.find((binding) => binding.effort_id === input.effort)
        ?.activity_intensity_id !== intensity) return failure('BODY_NEEDS_EFFORT_BINDING_REQUIRED');
    const found = [];
    const values = [50, 20, 0];
    const metrics = ['satiety', 'energy'];
    let healthState = null;
    let healthWindowStart = input.window_start;
    if (rationalIsZero(context.body_state.satiety)) {
      healthState = context.body_state;
    } else {
      const source = bodyNeedsProfile.profiles[PROFILE_IDS.satiety];
      const profile = makeBodyEffectProfile(source, 'satiety', intensity,
        environment.snapshot.state_ref.entity_id, [0]);
      const crossing = predictNearestBodyThreshold({
        body_effect_profile: profile,
        body_state_ref: context.body_state_ref,
        scope_ref: context.scope_ref,
        body_state: context.body_state,
        environment_snapshot: environment.snapshot,
        active_conditions: context.active_conditions,
        body_time_effect_policy_pins: makePins(profile),
        window_start: input.window_start,
        window_end: input.window_end
      });
      if (!crossing.ok) return crossing;
      if (crossing.threshold_candidate) {
        healthState = { ...context.body_state, satiety: rational('0') };
        healthWindowStart = crossing.threshold_candidate.scheduled_at;
      }
    }
    if (healthState) metrics.push('health');
    for (const metric of metrics) {
      const source = bodyNeedsProfile.profiles[PROFILE_IDS[metric]];
      for (const value of values) {
        const profile = makeBodyEffectProfile(source, metric, intensity,
          environment.snapshot.state_ref.entity_id, [value]);
        const pins = makePins(profile);
        const result = predictNearestBodyThreshold({
          body_effect_profile: profile,
          body_state_ref: context.body_state_ref,
          scope_ref: context.scope_ref,
          body_state: metric === 'health' ? healthState : context.body_state,
          environment_snapshot: environment.snapshot,
          active_conditions: context.active_conditions,
          body_time_effect_policy_pins: pins,
          window_start: metric === 'health' ? healthWindowStart : input.window_start,
          window_end: input.window_end
        });
        if (!result.ok) return result;
        if (result.threshold_candidate) found.push({
          candidate: result.threshold_candidate,
          descriptor: Object.freeze({ metric,
            threshold_value: rational(String(value)),
            critical: value === 0 })
        });
        else if (metric === 'energy' && value === 0
            && rationalIsZero(context.body_state[metric])) {
          found.push({
            candidate: currentZeroThresholdCandidate({ profile, metric, context,
              environment: environment.snapshot, windowStart: input.window_start,
              bodyStateRef: context.body_state_ref, scopeRef: context.scope_ref,
              pins }),
            descriptor: Object.freeze({ metric,
              threshold_value: rational('0'), critical: true })
          });
        } else if (metric === 'health' && value === 0
            && rationalIsZero(healthState.health)) {
          found.push({
            candidate: currentZeroThresholdCandidate({ profile, metric,
              context: { ...context, body_state: healthState },
              environment: environment.snapshot, windowStart: healthWindowStart,
              bodyStateRef: context.body_state_ref, scopeRef: context.scope_ref,
              pins }),
            descriptor: Object.freeze({ metric,
              threshold_value: rational('0'), critical: true })
          });
        }
      }
    }
    found.sort((left, right) => compareGameTimestamp(
      left.candidate.scheduled_at, right.candidate.scheduled_at));
    const firstEnergyZero = found.find(({ descriptor }) =>
      descriptor.metric === 'energy'
        && descriptor.threshold_value.numerator === '0');
    const candidates = firstEnergyZero == null ? found : found.filter(({ candidate }) =>
      compareGameTimestamp(candidate.scheduled_at,
        firstEnergyZero.candidate.scheduled_at) <= 0);
    return Object.freeze({ ok: true, candidates: Object.freeze(candidates) });
  }

  return Object.freeze({ schema: 'rus.live_world_runtime.body_needs_temporal_adapter.v1',
    candidate_status: bodyNeedsProfile.status, approved: true,
    trustedBindingPin,
    calculateProposals, predictNearestThreshold, predictThresholdCandidates });
}

function currentZeroThresholdCandidate({ profile, metric, context, environment,
  windowStart, bodyStateRef, scopeRef, pins }) {
  const preconditionsDigest = computeSpatialV3CanonicalDigest({
    observed_at: windowStart,
    body_state_ref: bodyStateRef,
    scope_ref: scopeRef,
    body_state: METRICS.map((stateMetric) => ({ metric: stateMetric,
      value: context.body_state[stateMetric] }))
      .sort((left, right) => left.metric.localeCompare(right.metric)),
    active_conditions: [...context.active_conditions]
      .sort((left, right) => left.localeCompare(right)),
    environment_snapshot_digest: environment.canonical_digest,
    profile_digest: profile.canonical_digest,
    dependency_pins_digest: pins.canonical_digest
  });
  const thresholdId = `${metric}-0`;
  return Object.freeze({
    boundary_id: `body-threshold:${bodyStateRef.entity_id}:${thresholdId}`,
    boundary_kind: 'body_threshold',
    scheduled_at: windowStart,
    source_ref: profile.provenance_ref,
    primary_subject_ref: bodyStateRef,
    scope_ref: scopeRef,
    rule_ref: profile.profile_ref,
    policy_ref: profile.boundary_policy_ref,
    preconditions_digest: preconditionsDigest,
    resolution_class: 'physical_hazard_access',
    interrupt_effect: profile.interrupt_effect,
    visibility_policy_ref: profile.visibility_policy_ref,
    idempotency_key: `body-threshold:${bodyStateRef.entity_id}:${thresholdId}:${preconditionsDigest}`,
    subject_refs: [bodyStateRef],
    causal_parent_refs: []
  });
}

function makeBodyEffectProfile(source, metric, intensity, environmentId,
  thresholdValues = [50, 20, 0]) {
  const payload = source.payload;
  const rule = payload.exact_rate_or_piecewise_rule;
  const hourly = metric === 'satiety' ? rule.base_spend_points_per_hour
    : metric === 'energy' ? rule.base_spend_points_per_hour : rule.base_harm_points_per_hour;
  const heavy = metric === 'satiety' ? rule.heavy_activity_spend_points_per_hour
    : metric === 'energy' ? rule.heavy_activity_spend_points_per_hour : rule.heavy_activity_harm_points_per_hour;
  const perHour = intensity === 'heavy_activity' ? heavy : hourly;
  if (!isRationalDto(perHour)) throw new TypeError(`Approved rate is invalid for ${metric}`);
  const rate = rational(perHour.numerator, BigInt(perHour.denominator) * 60n);
  const version = String(source.version);
  const profileRef = versioned('body_effect', payload.body_effect_profile_id, version);
  const policyRef = versioned('body_effect', `${payload.body_effect_profile_id}:time-policy`, version);
  const boundaryRef = versioned('condition_set', `${payload.body_effect_profile_id}:threshold-boundary`, version);
  const visibilityRef = versioned('condition_set', `${payload.body_effect_profile_id}:threshold-visibility`, version);
  return seal({
    profile_ref: profileRef, time_effect_policy_ref: policyRef,
    boundary_policy_ref: boundaryRef, visibility_policy_ref: visibilityRef,
    interrupt_effect: 'background', status: 'approved',
    provenance_ref: entityRef('source_record', source.record_id),
    applicability: { environment_state_ids: [environmentId], required_condition_ids: [], forbidden_condition_ids: [] },
    effects: [{ metric, direction: metric === 'health' ? 'decrease' : 'decrease',
      rate_per_exact_minute: rate }],
    thresholds: thresholdValues.map((value) => ({ threshold_id: `${metric}-${value}`,
      metric, direction: 'decrease', value: rational(String(value)) }))
  });
}

function makePins(profile) {
  return seal({ pins: [
    pin('profile', profile.profile_ref),
    pin('dynamic_environment_rule_set', profile.time_effect_policy_ref),
    pin('condition_rule', profile.boundary_policy_ref),
    pin('condition', profile.visibility_policy_ref)
  ] });
}
function pin(dependencyRole, reference) {
  return { dependency_role: dependencyRole, entity_ref: reference.entity_ref,
    version_pin: { pin_kind: 'authoring_version', authoring_version: reference.authoring_version } };
}
function versioned(kind, id, authoringVersion) {
  return { entity_ref: entityRef(kind, id), authoring_version: authoringVersion };
}
function entityRef(kind, id) { return { entity_kind: kind, entity_id: id }; }
function seal(value) { return { ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) }; }
function sourceProfilePin(source) {
  return Object.freeze({ artifact_id: source.record_id, revision: Number(source.version),
    digest: source.source_digest ?? computeSpatialV3CanonicalDigest(source.payload) });
}
function bindingPin(profile) {
  return Object.freeze({ artifact_id: profile.candidate_path, revision: 1,
    digest: profile.candidate_sha256, dataset_sha256: profile.dataset_sha256,
    source_approval_sha256: profile.source_approval_sha256,
    candidate_path: profile.candidate_path,
    candidate_sha256: profile.candidate_sha256,
    approval_attestation_path: profile.approval_attestation.path,
    approval_attestation_sha256: profile.approval_attestation.sha256,
    verdict: profile.approval_attestation.verdict,
    status: 'approved_by_attestation', approved: true });
}
export function deriveTrustedBodyNeedsBindingPin(profile) {
  if (profile == null || profile.approved !== true
    || profile.import_authorized !== true || profile.activation_authorized !== true) return null;
  validateBodyNeedsProfile(profile);
  return bindingPin(profile);
}
function rational(numerator, denominator = 1n) {
  const divisor = gcd(BigInt(numerator), BigInt(denominator));
  return { numerator: String(BigInt(numerator) / divisor), denominator: String(BigInt(denominator) / divisor) };
}
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }
function isRationalDto(value) {
  return value && /^\d+$/u.test(String(value.numerator)) && /^\d+$/u.test(String(value.denominator))
    && BigInt(value.denominator) > 0n;
}
function exactBodyMetric(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.keys(value).length === 2
      && /^-?(0|[1-9]\d*)$/u.test(String(value.numerator))
      && /^[1-9]\d*$/u.test(String(value.denominator))) return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/iu.exec(String(value));
  if (!match) return null;
  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? 0);
  let numerator = BigInt(`${match[2]}${fraction}`) * sign;
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  else if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  const divisor = gcd(numerator, denominator);
  return rational(numerator / divisor, denominator / divisor);
}
function rationalIsZero(value) {
  if (value && typeof value === 'object' && /^-?\d+$/u.test(String(value.numerator))) return BigInt(value.numerator) === 0n;
  return Number(value) === 0;
}
function normalizeContext(input) {
  if (!input || typeof input !== 'object' || !input.body_state || typeof input.body_state !== 'object'
    || !METRICS.every((metric) => Object.hasOwn(input.body_state, metric))
    || !input.body_state_ref || !input.scope_ref || !input.environment_fact
    || typeof input.party_id !== 'string' || !Number.isSafeInteger(input.state_version)
    || !input.observed_at
    || !Array.isArray(input.active_conditions)) return failure('BODY_NEEDS_CONTEXT_REQUIRED');
  const bodyState = Object.fromEntries(METRICS.map((metric) => [
    metric, exactBodyMetric(input.body_state[metric])
  ]));
  if (Object.values(bodyState).some((value) => value === null)) {
    return failure('BODY_NEEDS_CONTEXT_REQUIRED');
  }
  return { ok: true, body_state: bodyState, body_state_ref: input.body_state_ref,
    scope_ref: input.scope_ref, environment_fact: input.environment_fact,
    party_id: input.party_id, state_version: input.state_version,
    observed_at: input.observed_at,
    active_conditions: input.active_conditions };
}
function deriveEnvironmentSnapshot(context) {
  const result = deriveBodyEnvironmentSnapshot({
    environment_fact: context.environment_fact,
    party_id: context.party_id,
    state_version: context.state_version,
    observed_at: context.observed_at
  });
  return result.status === 'ok' && result.environment_snapshot
    ? { ok: true, snapshot: result.environment_snapshot }
    : failure(result.error?.code ?? 'BODY_NEEDS_ENVIRONMENT_SNAPSHOT_BLOCKED');
}
function validateBodyNeedsProfile(profile) {
  if (profile?.schema !== 'rus.live_world_runtime.body_needs_profile_candidate.v1'
    || profile.status !== 'candidate_only_pending_review' || profile.approved !== true
    || profile.import_authorized !== true || profile.activation_authorized !== true
    || typeof profile.candidate_path !== 'string' || profile.candidate_path.length === 0
    || !isSha256(profile.candidate_sha256)
    || !profile.approval_attestation || typeof profile.approval_attestation !== 'object'
    || Array.isArray(profile.approval_attestation)
    || typeof profile.approval_attestation?.path !== 'string'
    || profile.approval_attestation.path.length === 0
    || !isSha256(profile.approval_attestation.sha256)
    || !['APPROVE', 'APPROVE_CONDITIONAL'].includes(
      profile.approval_attestation.verdict)
    || !Array.isArray(profile.effort_bindings)
    || !Object.values(PROFILE_IDS).every((id) => profile.profiles?.[id]?.payload?.body_effect_profile_id === id)
    || profile.profiles?.energy_sleep_recovery_v1) {
    throw new TypeError('Exact approved body-needs binding attestation is required');
  }
}
function isSha256(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
function failure(code) { return Object.freeze({ ok: false, code }); }
