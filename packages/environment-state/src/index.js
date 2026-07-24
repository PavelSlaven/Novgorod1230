import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { deepFreeze } from '@rus/kernel';
import {
  compareGameTimestamp,
  compareRationalMinutes,
  normalizeGameTimestamp,
  normalizeRationalMinutes
} from '@rus/time-events-history';

const GAP_RETRYABILITY = 'after_data_repair';
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stableId = (value) => typeof value === 'string' && value.trim() === value && value.length > 0;
const exactKeys = (value, allowed) => isRecord(value) && Object.keys(value).every((key) => allowed.includes(key));
const contractValid = (name, value) => validateSpatialV3Contract(name, value).length === 0;
const refKey = (value) => `${value.entity_kind}\u0000${value.entity_id}`;
const INTERRUPTION_EFFECTS = new Set(['background', 'emergency', 'hard_interrupt', 'interaction', 'notice', 'strand']);

function frozen(value) {
  return deepFreeze(structuredClone(value));
}

function gap(code, message, details = {}) {
  return frozen({
    status: 'blocked',
    error: { code, message, retryability: GAP_RETRYABILITY, details },
    trace: { owner: '@rus/environment-state' }
  });
}

function sealedRecord(value) {
  if (!isRecord(value) || typeof value.canonical_digest !== 'string') return false;
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'canonical_digest'));
  return value.canonical_digest === computeSpatialV3CanonicalDigest(payload);
}

function normalizeFactor(value) {
  try {
    const factor = normalizeRationalMinutes(value);
    return factor.numerator === '0' ? null : factor;
  } catch {
    return null;
  }
}

function normalizeTransition(value, kind) {
  if (!exactKeys(value, ['boundary_id', 'scheduled_at', `${kind}_id`, 'movement_factor'])
    || !stableId(value.boundary_id)
    || !stableId(value[`${kind}_id`])) return null;
  try {
    const scheduled_at = normalizeGameTimestamp(value.scheduled_at);
    const movement_factor = normalizeFactor(value.movement_factor);
    return movement_factor
      ? frozen({ boundary_id: value.boundary_id, scheduled_at, state_id: value[`${kind}_id`], movement_factor })
      : null;
  } catch {
    return null;
  }
}

function timestampKey(value) {
  return `${value.whole_minutes}:${value.subminute_numerator}/${value.subminute_denominator}`;
}

function normalizeProfile(value, kind, scopeRef) {
  const allowed = [
    'profile_ref',
    'status',
    'provenance_ref',
    'applicability',
    `current_${kind}_id`,
    'current_movement_factor',
    'boundary_policy_ref',
    'visibility_policy_ref',
    'interrupt_effect',
    'transitions',
    'canonical_digest',
    ...(kind === 'light' ? ['artificial_light'] : [])
  ];
  const expectedEntityKind = kind === 'weather' ? 'weather_state' : 'light_profile';
  if (!exactKeys(value, allowed)
    || value.status !== 'approved'
    || !contractValid('versioned_ref', value.profile_ref)
    || value.profile_ref.entity_ref.entity_kind !== expectedEntityKind
    || !contractValid('entity_ref', value.provenance_ref)
    || !contractValid('versioned_ref', value.boundary_policy_ref)
    || !contractValid('versioned_ref', value.visibility_policy_ref)
    || !INTERRUPTION_EFFECTS.has(value.interrupt_effect)
    || !sealedRecord(value)
    || !stableId(value[`current_${kind}_id`])
    || !isRecord(value.applicability)
    || !exactKeys(value.applicability, ['scope_refs'])
    || !Array.isArray(value.applicability.scope_refs)
    || value.applicability.scope_refs.length === 0
    || value.applicability.scope_refs.some((entry) => !contractValid('entity_ref', entry))
    || !value.applicability.scope_refs.some((entry) => refKey(entry) === refKey(scopeRef))
    || !Array.isArray(value.transitions)) return null;
  const current_movement_factor = normalizeFactor(value.current_movement_factor);
  const transitions = value.transitions.map((entry) => normalizeTransition(entry, kind));
  if (!current_movement_factor || transitions.some((entry) => entry === null)) return null;
  const boundaryIds = transitions.map(({ boundary_id }) => boundary_id);
  const timestamps = transitions.map(({ scheduled_at }) => timestampKey(scheduled_at));
  if (new Set(boundaryIds).size !== boundaryIds.length || new Set(timestamps).size !== timestamps.length) return null;
  return frozen({
    profile_ref: value.profile_ref,
    boundary_policy_ref: value.boundary_policy_ref,
    visibility_policy_ref: value.visibility_policy_ref,
    interrupt_effect: value.interrupt_effect,
    provenance_ref: value.provenance_ref,
    canonical_digest: value.canonical_digest,
    current_id: value[`current_${kind}_id`],
    current_movement_factor,
    transitions
  });
}

function normalizeAccess(value) {
  if (!exactKeys(value, [
    'scope_ref',
    'portal_access_state_id',
    'invalidates_at',
    'invalidation_reason_id',
    'access_policy_ref',
    'visibility_policy_ref',
    'interrupt_effect',
    'canonical_digest'
  ])
    || !contractValid('entity_ref', value.scope_ref)
    || !stableId(value.portal_access_state_id)
    || !contractValid('versioned_ref', value.access_policy_ref)
    || !contractValid('versioned_ref', value.visibility_policy_ref)
    || !INTERRUPTION_EFFECTS.has(value.interrupt_effect)
    || !sealedRecord(value)) return null;
  let invalidates_at = null;
  if (value.invalidates_at !== null) {
    try {
      invalidates_at = normalizeGameTimestamp(value.invalidates_at);
    } catch {
      return null;
    }
  }
  if ((invalidates_at === null) !== (value.invalidation_reason_id === null)
    || (value.invalidation_reason_id !== null && !stableId(value.invalidation_reason_id))) return null;
  return frozen({
    scope_ref: value.scope_ref,
    portal_access_state_id: value.portal_access_state_id,
    invalidates_at,
    invalidation_reason_id: value.invalidation_reason_id,
    access_policy_ref: value.access_policy_ref,
    visibility_policy_ref: value.visibility_policy_ref,
    interrupt_effect: value.interrupt_effect,
    canonical_digest: value.canonical_digest
  });
}

function normalizeCompositionPolicy(value) {
  if (!exactKeys(value, ['policy_ref', 'status', 'composition_kind', 'factor_reducer', 'provenance_ref', 'canonical_digest'])
    || value.status !== 'approved'
    || value.composition_kind !== 'worst_applicable'
    || value.factor_reducer !== 'maximum_rational'
    || !contractValid('versioned_ref', value.policy_ref)
    || value.policy_ref.entity_ref.entity_kind !== 'transition_environment_profile'
    || !contractValid('entity_ref', value.provenance_ref)
    || !sealedRecord(value)) return null;
  return frozen(value);
}

function versionedRefPinned(pinSet, dependencyRole, reference) {
  return pinSet.pins.some((pin) => pin.dependency_role === dependencyRole
    && refKey(pin.entity_ref) === refKey(reference.entity_ref)
    && pin.version_pin.pin_kind === 'authoring_version'
    && pin.version_pin.authoring_version === reference.authoring_version);
}

function validateInput(rawInput) {
  let input;
  try {
    input = frozen(rawInput);
  } catch {
    return gap('generated_schema_mismatch', 'Environment input must be structured-cloneable data');
  }
  if (!isRecord(input)) return gap('generated_schema_mismatch', 'Environment input must be an explicit object');
  let clock;
  try {
    clock = normalizeGameTimestamp(input.clock);
  } catch {
    return gap('time_timestamp_invalid', 'clock must be an exact canonical GameTimestamp');
  }
  const access = normalizeAccess(input.place_access_context);
  if (!access) return gap('event_rule_gap', 'A digest-bound place/access context and policy are required');
  const weather = normalizeProfile(input.weather_state, 'weather', access.scope_ref);
  const light = normalizeProfile(input.light_profile, 'light', access.scope_ref);
  if (!weather || !light) return gap('weather_profile_gap', 'Required approved weather or light profile is absent, inapplicable or malformed');
  const composition = normalizeCompositionPolicy(input.movement_composition_policy);
  if (!composition) return gap('event_rule_gap', 'An approved worst-applicable environment composition policy is required');
  if (!contractValid('dependency_pin_set', input.catalog_pins) || !sealedRecord(input.catalog_pins)
    || !versionedRefPinned(input.catalog_pins, 'weather_dependency', weather.profile_ref)
    || !versionedRefPinned(input.catalog_pins, 'light_profile', light.profile_ref)
    || !versionedRefPinned(input.catalog_pins, 'dynamic_environment_rule_set', composition.policy_ref)
    || !versionedRefPinned(input.catalog_pins, 'availability_condition_set', access.access_policy_ref)
    || !versionedRefPinned(input.catalog_pins, 'condition_rule', weather.boundary_policy_ref)
    || !versionedRefPinned(input.catalog_pins, 'condition', weather.visibility_policy_ref)
    || !versionedRefPinned(input.catalog_pins, 'condition_rule', light.boundary_policy_ref)
    || !versionedRefPinned(input.catalog_pins, 'condition', light.visibility_policy_ref)
    || !versionedRefPinned(input.catalog_pins, 'condition', access.visibility_policy_ref)) {
    return gap('event_rule_gap', 'Environment profiles, composition and access policy require matching dependency pins');
  }
  return { input, clock, weather, light, composition, access, pins: input.catalog_pins };
}

function environmentPreconditionsDigest(normalized) {
  return computeSpatialV3CanonicalDigest({
    observed_at: normalized.clock,
    scope_ref: normalized.access.scope_ref,
    weather_profile_digest: normalized.weather.canonical_digest,
    light_profile_digest: normalized.light.canonical_digest,
    access_context_digest: normalized.access.canonical_digest,
    composition_policy_digest: normalized.composition.canonical_digest,
    catalog_pins_digest: normalized.pins.canonical_digest
  });
}

function boundaryCandidate(normalized, {
  boundary_id,
  boundary_kind,
  scheduled_at,
  source_ref,
  rule_ref,
  policy_ref,
  visibility_policy_ref,
  interrupt_effect
}) {
  const preconditions_digest = environmentPreconditionsDigest(normalized);
  const candidate = {
    boundary_id,
    boundary_kind,
    scheduled_at,
    source_ref,
    primary_subject_ref: normalized.access.scope_ref,
    scope_ref: normalized.access.scope_ref,
    rule_ref,
    policy_ref,
    preconditions_digest,
    resolution_class: 'physical_hazard_access',
    interrupt_effect,
    visibility_policy_ref,
    idempotency_key: `environment:${boundary_kind}:${boundary_id}:${preconditions_digest}`,
    subject_refs: [normalized.access.scope_ref],
    causal_parent_refs: []
  };
  return contractValid('temporal_boundary_candidate', candidate) ? frozen(candidate) : null;
}

function currentState(profile, clock) {
  const due = profile.transitions
    .filter(({ scheduled_at }) => compareGameTimestamp(scheduled_at, clock) <= 0)
    .sort((left, right) => compareGameTimestamp(left.scheduled_at, right.scheduled_at)
      || left.boundary_id.localeCompare(right.boundary_id, 'en'));
  if (due.length === 0) return { id: profile.current_id, factor: profile.current_movement_factor };
  const selected = due.at(-1);
  return { id: selected.state_id, factor: selected.movement_factor };
}

function artificialLight(value) {
  if (value === null) return null;
  if (!exactKeys(value, ['light_id', 'movement_factor']) || !stableId(value.light_id)) return undefined;
  const factor = normalizeFactor(value.movement_factor);
  return factor ? { id: value.light_id, factor } : undefined;
}

function nearestCandidates(normalized) {
  const candidates = [];
  const nextTransition = (transitions) => transitions
    .filter(({ scheduled_at }) => compareGameTimestamp(scheduled_at, normalized.clock) > 0)
    .sort((left, right) => compareGameTimestamp(left.scheduled_at, right.scheduled_at)
      || left.boundary_id.localeCompare(right.boundary_id, 'en'))[0];
  const weather = nextTransition(normalized.weather.transitions);
  const light = nextTransition(normalized.light.transitions);
  if (weather) candidates.push(boundaryCandidate(normalized, {
    boundary_id: weather.boundary_id,
    boundary_kind: 'weather',
    scheduled_at: weather.scheduled_at,
    source_ref: normalized.weather.profile_ref.entity_ref,
    rule_ref: normalized.weather.profile_ref,
    policy_ref: normalized.weather.boundary_policy_ref,
    visibility_policy_ref: normalized.weather.visibility_policy_ref,
    interrupt_effect: normalized.weather.interrupt_effect
  }));
  if (light) candidates.push(boundaryCandidate(normalized, {
    boundary_id: light.boundary_id,
    boundary_kind: 'light',
    scheduled_at: light.scheduled_at,
    source_ref: normalized.light.profile_ref.entity_ref,
    rule_ref: normalized.light.profile_ref,
    policy_ref: normalized.light.boundary_policy_ref,
    visibility_policy_ref: normalized.light.visibility_policy_ref,
    interrupt_effect: normalized.light.interrupt_effect
  }));
  if (normalized.access.invalidates_at
    && compareGameTimestamp(normalized.access.invalidates_at, normalized.clock) > 0) {
    candidates.push(boundaryCandidate(normalized, {
      boundary_id: 'portal-access-invalidated',
      boundary_kind: 'place_access',
      scheduled_at: normalized.access.invalidates_at,
      source_ref: normalized.access.access_policy_ref.entity_ref,
      rule_ref: normalized.access.access_policy_ref,
      policy_ref: normalized.access.access_policy_ref,
      visibility_policy_ref: normalized.access.visibility_policy_ref,
      interrupt_effect: normalized.access.interrupt_effect
    }));
  }
  if (candidates.some((candidate) => candidate === null)) return null;
  return candidates.sort((left, right) => compareGameTimestamp(left.scheduled_at, right.scheduled_at)
    || left.boundary_id.localeCompare(right.boundary_id, 'en'));
}

export function findNearestEnvironmentBoundaries(input) {
  const normalized = validateInput(input);
  if (normalized.status === 'blocked') return normalized;
  const light = artificialLight(normalized.input.light_profile.artificial_light);
  if (light === undefined) return gap('weather_profile_gap', 'Artificial light must be explicitly null or an approved factor');
  const candidates = nearestCandidates(normalized);
  if (candidates === null) return gap('generated_schema_mismatch', 'Environment provider produced a non-formal boundary candidate');
  if (candidates.length === 0) return gap('event_rule_gap', 'No approved environment boundary candidate exists');
  return frozen({
    status: 'ok',
    candidates,
    trace: { clock: normalized.clock, catalog_pins: normalized.pins, interval: '(from,to]' }
  });
}

export function deriveEnvironment(input) {
  const normalized = validateInput(input);
  if (normalized.status === 'blocked') return normalized;
  const artificial = artificialLight(normalized.input.light_profile.artificial_light);
  if (artificial === undefined) return gap('weather_profile_gap', 'Artificial light must be explicitly null or an approved factor');
  const weather = currentState(normalized.weather, normalized.clock);
  const daylight = currentState(normalized.light, normalized.clock);
  const light = artificial ?? daylight;
  const movementFactor = compareRationalMinutes(weather.factor, light.factor) >= 0
    ? weather.factor
    : light.factor;
  const boundaries = nearestCandidates(normalized);
  if (boundaries === null) return gap('generated_schema_mismatch', 'Environment provider produced a non-formal boundary candidate');
  return frozen({
    status: 'ok',
    environment_state: {
      observed_at: normalized.clock,
      scope_ref: normalized.access.scope_ref,
      weather_id: weather.id,
      light_id: light.id,
      portal_access_state_id: normalized.access.portal_access_state_id,
      weather_profile_ref: normalized.weather.profile_ref,
      light_profile_ref: normalized.light.profile_ref
    },
    effects: {
      movement_factor: movementFactor,
      composition_policy_ref: normalized.composition.policy_ref
    },
    trace: {
      catalog_pins: normalized.pins,
      composition_kind: normalized.composition.composition_kind,
      next_boundary: boundaries[0] ?? null
    }
  });
}

export function proposeEnvironmentBoundaryEffect({ input, candidate } = {}) {
  const normalized = validateInput(input);
  if (normalized.status === 'blocked') return normalized;
  const candidates = nearestCandidates(normalized);
  if (candidates === null) return gap('generated_schema_mismatch', 'Environment provider produced a non-formal boundary candidate');
  const selected = contractValid('temporal_boundary_candidate', candidate)
    ? candidates.find((entry) => computeSpatialV3CanonicalDigest(entry) === computeSpatialV3CanonicalDigest(candidate))
    : null;
  if (!selected) return gap('event_rule_gap', 'Boundary candidate is absent from the approved current candidate set');
  let effect_proposal;
  if (selected.boundary_kind === 'place_access') {
    effect_proposal = {
      effect_kind: 'portal_access_invalidated',
      portal_access_state_id: normalized.access.portal_access_state_id,
      invalidation_reason_id: normalized.access.invalidation_reason_id,
      access_policy_ref: normalized.access.access_policy_ref,
      scheduled_at: selected.scheduled_at
    };
  } else if (selected.boundary_kind === 'weather') {
    effect_proposal = {
      effect_kind: 'weather_transition',
      scheduled_at: selected.scheduled_at,
      weather_id: normalized.weather.transitions.find(({ boundary_id }) => boundary_id === selected.boundary_id).state_id,
      weather_profile_ref: normalized.weather.profile_ref
    };
  } else {
    effect_proposal = {
      effect_kind: 'light_transition',
      scheduled_at: selected.scheduled_at,
      light_id: normalized.light.transitions.find(({ boundary_id }) => boundary_id === selected.boundary_id).state_id,
      light_profile_ref: normalized.light.profile_ref
    };
  }
  return frozen({
    status: 'ok',
    effect_proposal,
    trace: { boundary_id: selected.boundary_id, catalog_pins: normalized.pins }
  });
}
