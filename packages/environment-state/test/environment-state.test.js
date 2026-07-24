import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  deriveEnvironment,
  findNearestEnvironmentBoundaries,
  proposeEnvironmentBoundaryEffect
} from '../src/index.js';

const at = (whole_minutes, subminute_numerator = '0', subminute_denominator = '1') => ({ whole_minutes, subminute_numerator, subminute_denominator });
const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id, authoring_version = 'v1') => ({ entity_ref: ref(entity_kind, entity_id), authoring_version });
const seal = (payload) => ({ ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) });
const dependencyPin = (dependency_role, value) => ({
  dependency_role,
  entity_ref: value.entity_ref,
  version_pin: { pin_kind: 'authoring_version', authoring_version: value.authoring_version }
});
const scopeRef = ref('party_g6_instance', 'market-square');
const weatherRef = versioned('weather_state', 'weather-novgorod');
const lightRef = versioned('light_profile', 'light-novgorod');
const compositionRef = versioned('transition_environment_profile', 'worst-applicable');
const accessRef = versioned('condition_set', 'market-curfew');
const weatherBoundaryRef = versioned('condition_set', 'weather-boundary');
const weatherVisibilityRef = versioned('condition_set', 'weather-visible');
const lightBoundaryRef = versioned('condition_set', 'light-boundary');
const lightVisibilityRef = versioned('condition_set', 'light-visible');
const accessVisibilityRef = versioned('condition_set', 'access-visible');

const weatherProfile = () => seal({
  profile_ref: weatherRef,
  status: 'approved',
  provenance_ref: ref('source_record', 'novgorod-weather-source'),
  applicability: { scope_refs: [scopeRef] },
  current_weather_id: 'clear',
  current_movement_factor: rational('1'),
  boundary_policy_ref: weatherBoundaryRef,
  visibility_policy_ref: weatherVisibilityRef,
  interrupt_effect: 'background',
  transitions: [{ boundary_id: 'weather-rain', scheduled_at: at('120', '1', '2'), weather_id: 'rain', movement_factor: rational('3', '2') }]
});
const lightProfile = () => seal({
  profile_ref: lightRef,
  status: 'approved',
  provenance_ref: ref('source_record', 'novgorod-light-source'),
  applicability: { scope_refs: [scopeRef] },
  current_light_id: 'night',
  current_movement_factor: rational('5', '4'),
  boundary_policy_ref: lightBoundaryRef,
  visibility_policy_ref: lightVisibilityRef,
  interrupt_effect: 'notice',
  transitions: [
    { boundary_id: 'dawn', scheduled_at: at('105'), light_id: 'dawn', movement_factor: rational('1') },
    { boundary_id: 'sunset', scheduled_at: at('200'), light_id: 'night', movement_factor: rational('5', '4') }
  ],
  artificial_light: { light_id: 'torch', movement_factor: rational('1') }
});
const compositionPolicy = () => seal({
  policy_ref: compositionRef,
  status: 'approved',
  composition_kind: 'worst_applicable',
  factor_reducer: 'maximum_rational',
  provenance_ref: ref('source_record', 'movement-environment-formula')
});
const accessContext = () => seal({
  scope_ref: scopeRef,
  portal_access_state_id: 'open',
  invalidates_at: at('130'),
  invalidation_reason_id: 'curfew',
  access_policy_ref: accessRef,
  visibility_policy_ref: accessVisibilityRef,
  interrupt_effect: 'hard_interrupt'
});
const amendSealed = (value, changes) => {
  const { canonical_digest: _digest, ...payload } = value;
  return seal({ ...payload, ...changes });
};

function input(overrides = {}) {
  return Object.freeze({
    clock: at('100'),
    weather_state: weatherProfile(),
    light_profile: lightProfile(),
    movement_composition_policy: compositionPolicy(),
    place_access_context: accessContext(),
    catalog_pins: seal({ pins: [
      dependencyPin('weather_dependency', weatherRef),
      dependencyPin('light_profile', lightRef),
      dependencyPin('dynamic_environment_rule_set', compositionRef),
      dependencyPin('availability_condition_set', accessRef),
      dependencyPin('condition_rule', weatherBoundaryRef),
      dependencyPin('condition', weatherVisibilityRef),
      dependencyPin('condition_rule', lightBoundaryRef),
      dependencyPin('condition', lightVisibilityRef),
      dependencyPin('condition', accessVisibilityRef)
    ] }),
    ...overrides
  });
}

test('derives frozen dawn/light state and exactly one composite movement factor', () => {
  const result = deriveEnvironment(input({ clock: at('106'), light_profile: amendSealed(lightProfile(), { artificial_light: null }) }));
  assert.equal(result.status, 'ok');
  assert.equal(result.environment_state.light_id, 'dawn');
  assert.deepEqual(result.effects.movement_factor, rational('1'));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.environment_state), true);
  assert.equal(Object.isFrozen(result.effects.movement_factor), true);
});

test('uses approved artificial light and weather transition without stacking movement factors', () => {
  const result = deriveEnvironment(input({
    clock: at('121'),
    light_profile: amendSealed(lightProfile(), { artificial_light: { light_id: 'lantern', movement_factor: rational('6', '5') } })
  }));
  assert.equal(result.environment_state.weather_id, 'rain');
  assert.equal(result.environment_state.light_id, 'lantern');
  assert.deepEqual(result.effects.movement_factor, rational('3', '2'));
  assert.deepEqual(result.effects.composition_policy_ref, compositionRef);
});

test('exposes the nearest approved weather, light and access boundaries in exact timestamp order', () => {
  const result = findNearestEnvironmentBoundaries(input());
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.candidates.map((candidate) => candidate.boundary_id), ['dawn', 'weather-rain', 'portal-access-invalidated']);
  assert.deepEqual(result.candidates.map((candidate) => candidate.boundary_kind), ['light', 'weather', 'place_access']);
  assert.deepEqual(result.candidates[1].scheduled_at, at('120', '1', '2'));
  for (const candidate of result.candidates) {
    assert.deepEqual(validateSpatialV3Contract('temporal_boundary_candidate', candidate), []);
  }
  assert.equal(Object.isFrozen(result.candidates), true);
});

test('proposes a code-owned portal/access invalidation effect without persisting it', () => {
  const boundaries = findNearestEnvironmentBoundaries(input());
  const result = proposeEnvironmentBoundaryEffect({ input: input(), candidate: boundaries.candidates[2] });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.effect_proposal, {
    effect_kind: 'portal_access_invalidated',
    portal_access_state_id: 'open',
    invalidation_reason_id: 'curfew',
    access_policy_ref: accessRef,
    scheduled_at: at('130')
  });
  assert.equal(Object.isFrozen(result.effect_proposal), true);
  const forged = proposeEnvironmentBoundaryEffect({
    input: input(),
    candidate: { ...boundaries.candidates[2], interrupt_effect: 'background' }
  });
  assert.equal(forged.error.code, 'event_rule_gap');
});

test('returns typed hard blocks for absent profiles, pin incompatibility and empty candidate sets', () => {
  assert.equal(deriveEnvironment(input({ weather_state: null })).error.code, 'weather_profile_gap');
  assert.equal(deriveEnvironment(input({ catalog_pins: seal({ pins: [dependencyPin('weather_dependency', weatherRef)] }) })).error.code, 'event_rule_gap');
  assert.equal(findNearestEnvironmentBoundaries(input({
    weather_state: amendSealed(weatherProfile(), { transitions: [] }),
    light_profile: amendSealed(lightProfile(), { transitions: [], artificial_light: null }),
    place_access_context: amendSealed(accessContext(), { invalidates_at: null, invalidation_reason_id: null })
  })).error.code, 'event_rule_gap');
});

test('rejects non-exact timestamps and never reads implicit defaults', () => {
  assert.equal(deriveEnvironment(input({ clock: { whole_minutes: 100, subminute_numerator: '0', subminute_denominator: '1' } })).error.code, 'time_timestamp_invalid');
  assert.equal(deriveEnvironment(input({ light_profile: amendSealed(lightProfile(), { artificial_light: undefined }) })).error.code, 'weather_profile_gap');
  assert.equal(deriveEnvironment(input({ movement_composition_policy: null })).error.code, 'event_rule_gap');
  assert.equal(deriveEnvironment(input({
    movement_composition_policy: amendSealed(compositionPolicy(), { factor_reducer: 'minimum_rational' })
  })).error.code, 'event_rule_gap');
  assert.equal(deriveEnvironment(input({
    weather_state: amendSealed(weatherProfile(), { applicability: { scope_refs: [ref('party_g6_instance', 'other-place')] } })
  })).error.code, 'weather_profile_gap');
});
