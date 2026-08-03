import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  applyApprovedFixedBodyEffect,
  applyBodyStateChange,
  calculateBodyTimeEffectProposal,
  normalizeBodyState,
  predictNearestBodyThreshold,
  stateModifier,
  validateBodyState
} from '../src/index.js';

test('fixed body effect clones and transitions existing conditions', () => {
  const result = applyApprovedFixedBodyEffect({
    body_state: {
      health: 100,
      satiety: 90,
      energy: 80,
      active_conditions: [{ id: 'fatigued', effect: 'tired' }]
    },
    selected_context: { kind: 'route', effort: 'light' },
    body_effect_profile: {
      schema: 'rus.body_state.fixed_approved_effect.v1',
      profile_ref: 'body:route-light',
      profile_pin: { artifact_id: 'body-profiles', revision: 1,
        digest: '1'.repeat(64) },
      status: 'approved',
      applicability: { kind: 'route', effort: 'light' },
      exact_deltas: { health: 0, satiety: -1, energy: -2 },
      condition_outcomes: [{ from: 'fatigued', to: 'resting',
        outcome: 'recovering' }],
      selection_policy: 'fixed_approved_effect',
      rng_consumption: 'forbidden'
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.state_after, {
    health: 100,
    satiety: 89,
    energy: 78,
    active_conditions: [{
      id: 'resting', effect: 'recovering', cause: 'body:route-light'
    }]
  });
});

test('body-state applies bounded approved change formula', () => {
  const next = applyBodyStateChange({ health:80, satiety:40, energy:20 }, { restore:{ energy:10 }, spend:{ satiety:5 }, harm:{ health:15 } });
  assert.deepEqual([next.health, next.satiety, next.energy], [65,35,30]);
  assert.equal(stateModifier(next, ['energy']), -1);
  assert.equal(Object.isFrozen(next), true);
  assert.equal(validateBodyState({ health:101 }).ok, false);
  assert.equal(normalizeBodyState({ health:'70' }).health, 70);
});

const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const timestamp = (wholeMinutes, numerator = '0', denominator = '1') => ({
  whole_minutes: wholeMinutes,
  subminute_numerator: numerator,
  subminute_denominator: denominator
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id, authoring_version = 'v1') => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version
});
const seal = (payload) => ({ ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) });
const profileRef = versioned('body_effect', 'body-rest');
const policyRef = versioned('body_effect', 'body-time-policy');
const boundaryPolicyRef = versioned('condition_set', 'body-threshold-boundary');
const visibilityPolicyRef = versioned('condition_set', 'body-threshold-visible');
const bodyStateRef = ref('body_state', 'actor-body');
const scopeRef = ref('party_g6_instance', 'restful-room');
const bodyPolicyPins = seal({
  pins: [{
    dependency_role: 'profile',
    entity_ref: profileRef.entity_ref,
    version_pin: { pin_kind: 'authoring_version', authoring_version: profileRef.authoring_version }
  }, {
    dependency_role: 'dynamic_environment_rule_set',
    entity_ref: policyRef.entity_ref,
    version_pin: { pin_kind: 'authoring_version', authoring_version: policyRef.authoring_version }
  }, {
    dependency_role: 'condition_rule',
    entity_ref: boundaryPolicyRef.entity_ref,
    version_pin: { pin_kind: 'authoring_version', authoring_version: boundaryPolicyRef.authoring_version }
  }, {
    dependency_role: 'condition',
    entity_ref: visibilityPolicyRef.entity_ref,
    version_pin: { pin_kind: 'authoring_version', authoring_version: visibilityPolicyRef.authoring_version }
  }]
});
const environmentSnapshot = seal({
  state_ref: ref('environment_overlay_state', 'restful-room'),
  body_factor_ids: ['indoors-temperate']
});

const bodyEffectProfile = () => seal({
  profile_ref: profileRef,
  time_effect_policy_ref: policyRef,
  boundary_policy_ref: boundaryPolicyRef,
  visibility_policy_ref: visibilityPolicyRef,
  interrupt_effect: 'notice',
  status: 'approved',
  provenance_ref: ref('source_record', 'body-rest-research'),
  applicability: {
    environment_state_ids: ['restful-room'],
    required_condition_ids: [],
    forbidden_condition_ids: []
  },
  effects: [{
    metric: 'energy',
    direction: 'increase',
    rate_per_exact_minute: rational('1', '3')
  }, {
    metric: 'satiety',
    direction: 'decrease',
    rate_per_exact_minute: rational('1', '2')
  }],
  thresholds: [{
    threshold_id: 'energy-ready',
    metric: 'energy',
    direction: 'increase',
    value: rational('20')
  }, {
    threshold_id: 'satiety-hungry',
    metric: 'satiety',
    direction: 'decrease',
    value: rational('5')
  }]
});
const amendProfile = (changes) => {
  const { canonical_digest: _digest, ...payload } = bodyEffectProfile();
  return seal({ ...payload, ...changes });
};
const temporalInput = (overrides = {}) => ({
  body_effect_profile: bodyEffectProfile(),
  body_state_ref: bodyStateRef,
  scope_ref: scopeRef,
  body_state: { energy: rational('10'), satiety: rational('20') },
  exact_elapsed: rational('1'),
  environment_snapshot: environmentSnapshot,
  active_conditions: [],
  body_time_effect_policy_pins: bodyPolicyPins,
  ...overrides
});

test('body-state calculates an immutable exact proposal from only the pinned profile, state and elapsed time', () => {
  const profile = bodyEffectProfile();
  const state = { energy: rational('10'), satiety: rational('20') };
  const elapsed = rational('3', '2');

  const result = calculateBodyTimeEffectProposal(temporalInput({
    body_effect_profile: profile,
    body_state: state,
    exact_elapsed: elapsed
  }));

  assert.deepEqual(result, {
    ok: true,
    body_change_proposal: {
      proposal_kind: 'body_time_effect',
      profile_ref: profileRef,
      time_effect_policy_ref: policyRef,
      exact_elapsed: rational('3', '2'),
      metric_changes: [{
        metric: 'energy', direction: 'increase', amount: rational('1', '2')
      }, {
        metric: 'satiety', direction: 'decrease', amount: rational('3', '4')
      }]
    },
    validation_report: { ok: true, profile_digest: profile.canonical_digest },
    trace: {
      owner: '@rus/body-state',
      profile_ref: profileRef,
      time_effect_policy_ref: policyRef,
      environment_state_ref: environmentSnapshot.state_ref
    }
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.body_change_proposal.metric_changes[0].amount), true);
  assert.deepEqual(profile, bodyEffectProfile());
  assert.deepEqual(state, { energy: rational('10'), satiety: rational('20') });
  assert.deepEqual(elapsed, rational('3', '2'));
});

test('body-state predicts the nearest exact threshold inside an exclusive-start, inclusive-end GameTimestamp window', () => {
  const result = predictNearestBodyThreshold(temporalInput({
    body_state: { energy: rational('19'), satiety: rational('20') },
    exact_elapsed: undefined,
    window_start: timestamp('100', '1', '2'),
    window_end: timestamp('104'),
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.threshold_candidate.scheduled_at, timestamp('103', '1', '2'));
  assert.equal(result.threshold_candidate.boundary_id, 'body-threshold:actor-body:energy-ready');
  assert.equal(result.threshold_candidate.boundary_kind, 'body_threshold');
  assert.deepEqual(result.threshold_candidate.source_ref, ref('source_record', 'body-rest-research'));
  assert.deepEqual(result.threshold_candidate.primary_subject_ref, bodyStateRef);
  assert.deepEqual(result.threshold_candidate.scope_ref, scopeRef);
  assert.deepEqual(result.threshold_candidate.rule_ref, profileRef);
  assert.deepEqual(result.threshold_candidate.policy_ref, boundaryPolicyRef);
  assert.equal(result.threshold_candidate.resolution_class, 'physical_hazard_access');
  assert.equal(result.threshold_candidate.interrupt_effect, 'notice');
  assert.deepEqual(result.threshold_candidate.visibility_policy_ref, visibilityPolicyRef);
  assert.deepEqual(result.threshold_candidate.subject_refs, [bodyStateRef]);
  assert.deepEqual(result.threshold_candidate.causal_parent_refs, []);
  assert.deepEqual(validateSpatialV3Contract('temporal_boundary_candidate', result.threshold_candidate), []);
  assert.deepEqual(result.validation_report, { ok: true, profile_digest: bodyEffectProfile().canonical_digest });
  assert.deepEqual(result.trace, { owner: '@rus/body-state', interval: '(from,to]' });
  assert.equal(Object.isFrozen(result.threshold_candidate.scheduled_at), true);
});

test('body-state threshold prediction excludes the stabilized start, includes the end and fails closed on profile data gaps', () => {
  const atStart = predictNearestBodyThreshold(temporalInput({
    body_state: { energy: rational('20'), satiety: rational('20') },
    exact_elapsed: undefined,
    window_start: timestamp('10'),
    window_end: timestamp('10')
  }));
  assert.equal(atStart.ok, true);
  assert.equal(atStart.threshold_candidate, null);

  const atEnd = predictNearestBodyThreshold(temporalInput({
    body_state: { energy: rational('19'), satiety: rational('20') },
    exact_elapsed: undefined,
    window_start: timestamp('10'),
    window_end: timestamp('13')
  }));
  assert.equal(atEnd.ok, true);
  assert.deepEqual(atEnd.threshold_candidate.scheduled_at, timestamp('13'));

  for (const profile of [
    null,
    amendProfile({ effects: [] }),
    amendProfile({ effects: [bodyEffectProfile().effects[0], bodyEffectProfile().effects[0]] })
  ]) {
    const result = calculateBodyTimeEffectProposal(temporalInput({ body_effect_profile: profile }));
    assert.deepEqual(result.ok, false);
    assert.equal(result.status, 'hard_block');
    assert.match(result.error.code, /^event_(effect|rule)_gap$/u);
  }
  assert.equal(calculateBodyTimeEffectProposal(temporalInput({ exact_elapsed: undefined })).ok, false);
  assert.equal(calculateBodyTimeEffectProposal(temporalInput({ exact_elapsed: rational('0') })).error.code, 'time_elapsed_invalid');
  assert.equal(calculateBodyTimeEffectProposal(temporalInput({ environment_snapshot: undefined })).ok, false);
  assert.equal(calculateBodyTimeEffectProposal(temporalInput({ body_time_effect_policy_pins: undefined })).ok, false);
  assert.equal(predictNearestBodyThreshold(temporalInput({
    exact_elapsed: undefined,
    window_start: timestamp('10'),
    window_end: timestamp('20'),
    body_state_ref: ref('body_effect', 'wrong-kind')
  })).ok, false);
  assert.equal(predictNearestBodyThreshold(temporalInput({
    exact_elapsed: undefined,
    window_start: timestamp('10'),
    window_end: timestamp('20'),
    body_effect_profile: amendProfile({ interrupt_effect: 'forged' })
  })).ok, false);
  assert.equal(calculateBodyTimeEffectProposal(temporalInput({
    environment_snapshot: seal({
      state_ref: ref('environment_overlay_state', 'outside-storm'),
      body_factor_ids: ['cold']
    })
  })).error.code, 'event_rule_gap');
});
