import {
  deepFreeze,
  plain,
  text
} from './lower-dvina-trace-turn-step-runtime-common.js';

const DURATION_CLASSES = ['moment', 'brief', 'short', 'extended'];
const EFFORTS = ['none', 'light', 'moderate', 'heavy', 'extreme'];
const BODY_METRICS = ['health', 'satiety', 'energy'];

export function admitTurnStepOwnerProfiles(profiles, artifactPin) {
  const keys = [
    'schema', 'profile_set_id', 'revision', 'status', 'fallback_policy',
    'semantic_activity_profile_namespace', 'semantic_duration_profiles',
    'semantic_effort_profiles', 'direct_body_effect_profile_namespace',
    'direct_body_mechanism_profiles', 'direct_body_severity_profiles',
    'direct_body_part_policy', 'generic_check_modifier_policy',
    'ordinary_result_policy'
  ];
  if (!plain(profiles) || !exactKeys(profiles, keys)
      || profiles.schema !== 'rus.lower_dvina_trace_turn_step_owner_profiles.v1'
      || profiles.profile_set_id !== 'trace_ld_v1_turn_step_owner_profiles'
      || profiles.revision !== 1 || profiles.status !== 'approved'
      || profiles.fallback_policy !== 'forbidden'
      || !validArtifactPin(artifactPin)
      || !profilesValid(profiles)) {
    ownerFail('TRACE_TURN_STEP_OWNER_PROFILES_INVALID');
  }
  return deepFreeze({
    ...structuredClone(profiles),
    profile_pin: {
      artifact_id: profiles.profile_set_id,
      revision: profiles.revision,
      digest: artifactPin.digest
    }
  });
}

export function expandActivityProfiles(profiles) {
  return profiles.semantic_duration_profiles.flatMap((duration) =>
    profiles.semantic_effort_profiles.map((effort) => ({
      profile_ref: `${profiles.semantic_activity_profile_namespace}:${duration.duration_class}:${effort.effort}`,
      body_effect_profile_ref: `${profiles.semantic_activity_profile_namespace}:body:${duration.duration_class}:${effort.effort}`,
      duration_class: duration.duration_class,
      duration_minutes: duration.duration_minutes,
      effort: effort.effort,
      exact_deltas: structuredClone(effort.exact_deltas),
      condition_outcomes: structuredClone(effort.condition_outcomes)
    })));
}

export function expandDirectBodyProfiles(profiles) {
  return profiles.direct_body_mechanism_profiles.flatMap(({ mechanism }) =>
    profiles.direct_body_severity_profiles.map((severity) => ({
      body_effect_profile_ref: `${profiles.direct_body_effect_profile_namespace}:${mechanism}:${severity.severity}`,
      mechanism,
      severity: severity.severity,
      exact_deltas: structuredClone(severity.exact_deltas),
      condition_outcomes: structuredClone(severity.condition_outcomes)
    })));
}

export function fixedBodyProfile(profile, profilePin,
  selectedContext = null) {
  const applicability = selectedContext ?? (Object.hasOwn(
    profile, 'duration_class')
    ? semanticBodyContext(profile)
    : { kind: 'direct_body_event', mechanism: profile.mechanism,
        severity: profile.severity, body_part_ref: null });
  return deepFreeze({
    schema: 'rus.body_state.fixed_approved_effect.v1',
    profile_ref: profile.body_effect_profile_ref,
    profile_pin: structuredClone(profilePin),
    status: 'approved', applicability,
    exact_deltas: structuredClone(profile.exact_deltas),
    condition_outcomes: structuredClone(profile.condition_outcomes),
    selection_policy: 'fixed_approved_effect',
    rng_consumption: 'forbidden'
  });
}

export function directBodyContext(event) {
  return { kind: 'direct_body_event', mechanism: event.mechanism,
    severity: event.severity, body_part_ref: event.body_part_ref ?? null };
}

export function semanticBodyContext(profile) {
  return { kind: 'semantic_activity', duration_class: profile.duration_class,
    effort: profile.effort };
}

export function activityKey(value) {
  return `${value?.duration_class ?? ''}:${value?.effort ?? ''}`;
}

export function bodyEventKey(value) {
  return `${value?.mechanism ?? ''}:${value?.severity ?? ''}`;
}

export function validBodyPart(value, policy) {
  return value == null ? policy.null_allowed === true
    : Array.isArray(policy.allowed_body_part_refs)
      && policy.allowed_body_part_refs.includes(value);
}

export function requireBodyResult(result) {
  if (result?.ok !== true || result.owner !== '@rus/body-state'
      || result.applied !== true || !plain(result.proposal)
      || !plain(result.state_after)) {
    ownerFail('TRACE_TURN_STEP_BODY_EFFECT_DATA_GAP', {
      body_error: result?.error ?? null
    });
  }
}

export function samePin(left, right) {
  return plain(left) && left.artifact_id === right.artifact_id
    && left.revision === right.revision && left.digest === right.digest;
}

export function ownerFail(code, details = {}) {
  throw Object.assign(new Error(code), {
    code,
    details: deepFreeze(structuredClone(details))
  });
}

function profilesValid(profiles) {
  const durations = profiles.semantic_duration_profiles;
  const efforts = profiles.semantic_effort_profiles;
  const mechanisms = profiles.direct_body_mechanism_profiles;
  const severities = profiles.direct_body_severity_profiles;
  if (!text(profiles.semantic_activity_profile_namespace)
      || !text(profiles.direct_body_effect_profile_namespace)
      || !Array.isArray(durations) || durations.length !== 4
      || !Array.isArray(efforts) || efforts.length !== 5
      || !Array.isArray(mechanisms) || mechanisms.length !== 12
      || !Array.isArray(severities) || severities.length !== 4
      || !plain(profiles.direct_body_part_policy)
      || profiles.direct_body_part_policy.null_allowed !== true
      || !unique(durations.map(({ duration_class: value }) => value))
      || !unique(efforts.map(({ effort: value }) => value))
      || !unique(mechanisms.map(({ mechanism: value }) => value))
      || !unique(severities.map(({ severity: value }) => value))) return false;
  return durations.every(validDurationProfile)
    && DURATION_CLASSES.every((value) => durations.some(
      ({ duration_class: current }) => current === value))
    && efforts.every(validEffortProfile)
    && EFFORTS.every((value) => efforts.some(
      ({ effort: current }) => current === value))
    && mechanisms.every(validMechanismProfile)
    && severities.every(validSeverityProfile)
    && validModifierPolicy(profiles.generic_check_modifier_policy)
    && validOrdinaryResultPolicy(profiles.ordinary_result_policy);
}

function validDurationProfile(profile) {
  return plain(profile) && exactKeys(profile,
    ['duration_class', 'duration_minutes'])
    && DURATION_CLASSES.includes(profile.duration_class)
    && Number.isSafeInteger(profile.duration_minutes)
    && profile.duration_minutes > 0;
}
function validEffortProfile(profile) {
  return plain(profile) && exactKeys(profile,
    ['effort', 'exact_deltas', 'condition_outcomes'])
    && EFFORTS.includes(profile.effort) && fixedDeltas(profile.exact_deltas)
    && Array.isArray(profile.condition_outcomes);
}
function validMechanismProfile(profile) {
  return plain(profile) && exactKeys(profile, ['mechanism'])
    && ['impact', 'cut', 'puncture', 'burn', 'strain', 'crush', 'fall',
      'cold', 'heat', 'suffocation', 'poison', 'other']
      .includes(profile.mechanism);
}
function validSeverityProfile(profile) {
  return plain(profile) && exactKeys(profile,
    ['severity', 'exact_deltas', 'condition_outcomes'])
    && ['minor', 'moderate', 'severe', 'critical'].includes(profile.severity)
    && fixedDeltas(profile.exact_deltas)
    && Array.isArray(profile.condition_outcomes);
}
function validModifierPolicy(policy) {
  return plain(policy) && exactKeys(policy, [
    'profile_ref', 'state_relevance_by_attribute',
    'load_category_modifiers', 'circumstance_policy', 'check_policy_ref',
    'consequence_policy_ref'
  ]) && text(policy.profile_ref) && plain(policy.state_relevance_by_attribute)
    && plain(policy.load_category_modifiers)
    && ['light', 'moderate', 'heavy', 'overloaded'].every((category) =>
      Number.isSafeInteger(policy.load_category_modifiers[category]))
    && validVersionedPolicyRef(policy.check_policy_ref, 'check_policy')
    && validVersionedPolicyRef(
      policy.consequence_policy_ref, 'consequence_policy');
}

function validVersionedPolicyRef(value, entityKind) {
  return plain(value) && exactKeys(value, [
    'entity_kind', 'entity_id', 'authoring_version'
  ]) && value.entity_kind === entityKind && text(value.entity_id)
    && text(value.authoring_version);
}
function validOrdinaryResultPolicy(policy) {
  return plain(policy) && exactKeys(policy,
    ['schema', 'version', 'status', 'candidates'])
    && policy.schema === 'rus.items.ordinary_result_admission_policy.v1'
    && policy.version === 1 && policy.status === 'approved'
    && Array.isArray(policy.candidates) && policy.candidates.length > 0
    && unique(policy.candidates.map(({ semantic_type: type, name }) =>
      `${type}:${name}`))
    && policy.candidates.every((candidate) => plain(candidate)
      && exactKeys(candidate, [
        'semantic_type', 'name', 'significance', 'allowed_origin_kinds',
        'approved_fact_texts'
      ]) && text(candidate.semantic_type) && text(candidate.name)
      && candidate.significance === 'ordinary'
      && Array.isArray(candidate.allowed_origin_kinds)
      && candidate.allowed_origin_kinds.length > 0
      && Array.isArray(candidate.approved_fact_texts));
}
function fixedDeltas(value) {
  return plain(value) && exactKeys(value, BODY_METRICS)
    && BODY_METRICS.every((metric) => Number.isSafeInteger(value[metric]));
}
function validArtifactPin(pin) {
  return plain(pin) && text(pin.digest) && /^[a-f0-9]{64}$/u.test(pin.digest);
}
function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}
function unique(values) {
  return values.every((value) => text(value))
    && new Set(values).size === values.length;
}
