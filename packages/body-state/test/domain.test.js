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
  initializeBodyState,
  projectCombatBodyStateDescriptions,
  normalizeBodyState,
  predictNearestBodyThreshold,
  stateModifier,
  validateBodyState
} from '../src/index.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const COMBAT_DATA = 'data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1';

test('D65 combat body projection emits only package-authored phrases', async () => {
  const bundle = JSON.parse(await readFile(resolve(ROOT, COMBAT_DATA,
    'minimal-combat-bundle.candidate.json'), 'utf8'));
  const approval = JSON.parse(await readFile(resolve(ROOT, COMBAT_DATA,
    'combat-data-approval.json'), 'utf8'));
  const profile = bundle.npc_decision.body_state_qualitative_context;
  const result = projectCombatBodyStateDescriptions({
    body_state: { health: 29, energy: 70, satiety: 100 },
    qualitative_profile: profile, data_approval: approval, mode: 'D65_PROBE'
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.body_state_descriptions, [
    { metric: 'health', npc_description: 'Здоровье низкое.' },
    { metric: 'energy', npc_description: 'Запас энергии высокий.' },
    { metric: 'satiety', npc_description: 'Сытость высокая.' }
  ]);
  assert.deepEqual(result.gaps, []);
  const serialized = JSON.stringify(result);
  for (const forbidden of ['29', '70', '100', 'band_id', 'thresholds',
    'calibration', 'D71']) assert.equal(serialized.includes(forbidden), false);
});

test('approved combat body profile matches approval-7 intervals and phrase snapshot', async () => {
  const bundle = JSON.parse(await readFile(resolve(ROOT, COMBAT_DATA,
    'minimal-combat-bundle.candidate.json'), 'utf8'));
  const approval = JSON.parse(await readFile(resolve(ROOT, COMBAT_DATA,
    'body-bands-production-approval-7.json'), 'utf8'));
  const pointer = approval.json_pointer.split('/').slice(1);
  const profile = pointer.reduce((value, key) => value[key.replaceAll('~1', '/')
    .replaceAll('~0', '~')], bundle);
  // Approval-7 authorizes these intervals, outputs, and nine state-only phrases.
  const expectedPhrases = {
    health: ['Здоровье низкое.', 'Здоровье умеренное.', 'Здоровье высокое.'],
    energy: ['Запас энергии низкий.', 'Запас энергии умеренный.', 'Запас энергии высокий.'],
    satiety: ['Сытость низкая.', 'Сытость умеренная.', 'Сытость высокая.']
  };

  assert.equal(approval.json_pointer,
    '/npc_decision/body_state_qualitative_context');
  assert.equal(profile.profile_id, 'candidate.npc-body-state-description.v1');
  assert.equal(profile.version, 1);
  assert.deepEqual(approval.approved_use.intervals,
    ['[0,30)', '[30,70)', '[70,100]']);
  assert.deepEqual(approval.approved_use.owner_projection_output,
    ['metric', 'npc_description']);
  assert.equal(approval.data_checks.state_only_phrases, 9);
  for (const [metric, phrases] of Object.entries(expectedPhrases)) {
    const bands = profile.metrics[metric].bands;
    const intervals = bands.map(({ min_value, min_inclusive,
      max_value, max_inclusive }) => `${min_inclusive ? '[' : '('}${min_value},${max_value}${max_inclusive ? ']' : ')'}`);
    assert.deepEqual(intervals, approval.approved_use.intervals, metric);
    assert.deepEqual(bands.map((band) => band.npc_description), phrases, metric);
  }
});

test('general production flags do not authorize candidate combat body bands', async () => {
  const bundle = JSON.parse(await readFile(resolve(ROOT, COMBAT_DATA,
    'minimal-combat-bundle.candidate.json'), 'utf8'));
  const result = projectCombatBodyStateDescriptions({
    body_state: { health: 29, energy: 70, satiety: 100 },
    qualitative_profile: bundle.npc_decision.body_state_qualitative_context,
    data_approval: {
      approval_granted: true,
      import_authorized: true,
      activation_authorized: true,
      production_authorized: true
    },
    production_usable: true,
    mode: 'runtime'
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.body_state_descriptions, []);
  assert.deepEqual(result.gaps, ['health', 'energy', 'satiety'].map((metric) => ({
    metric, code: 'body_state_qualitative_metric_gap'
  })));
});

test('scoped production approval gate matches profile id and version', async () => {
  const bundle = JSON.parse(await readFile(resolve(ROOT, COMBAT_DATA,
    'minimal-combat-bundle.candidate.json'), 'utf8'));
  const profile = bundle.npc_decision.body_state_qualitative_context;
  const approval = {
    schema: 'npc_body_qualitative_profile_scoped_approval_v1',
    repository: 'PavelSlaven/Novgorod1230',
    branch: 'fleet/combat-data',
    path: 'data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1/minimal-combat-bundle.candidate.json',
    commit: 'feed71c2647b38e3ba4ab7bc613aa1483beaa774',
    json_pointer: '/npc_decision/body_state_qualitative_context',
    profile_id: 'candidate.npc-body-state-description.v1',
    version: 1,
    verdict: 'APPROVE_WITH_LIMITS',
    approval_granted: true,
    production_authorized: true,
    import_authorized: false,
    activation_authorized: false,
    bundle_production_authorized: false,
    approved_use: {
      actor: 'ordinary combat NPC only',
      source: 'Текущий authoritative @rus/body-state readback, привязанный к тому же NPC; только его собственные доступные ему метрики.',
      metrics: ['health', 'energy', 'satiety'],
      numeric_domain: 'finite JSON/JS number in [0,100], без округления и преобразования строки/bool',
      intervals: ['[0,30)', '[30,70)', '[70,100]'],
      owner_projection_output: ['metric', 'npc_description']
    }
  };
  const result = projectCombatBodyStateDescriptions({
    body_state: { health: 29, energy: 70, satiety: 100 },
    qualitative_profile: profile,
    scoped_production_approval: approval,
    mode: 'runtime'
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.body_state_descriptions, [
    { metric: 'health', npc_description: 'Здоровье низкое.' },
    { metric: 'energy', npc_description: 'Запас энергии высокий.' },
    { metric: 'satiety', npc_description: 'Сытость высокая.' }
  ]);
  assert.deepEqual(result.gaps, []);
  assert.equal(JSON.stringify(result).includes('29'), false);

  for (const mismatch of [
    { approval: { ...approval, profile_id: 'other-profile' } },
    { approval: { ...approval, version: 2 } },
    { approval: { ...approval, approval_granted: false } },
    { approval: { ...approval, production_authorized: false } },
    { profile: { ...profile, profile_id: 'other-profile' } },
    { profile: { ...profile, version: 2 } },
    { profile: { ...profile, status: 'approved' } }
  ]) {
    const blocked = projectCombatBodyStateDescriptions({
      body_state: { health: 29, energy: 70, satiety: 100 },
      qualitative_profile: mismatch.profile ?? profile,
      scoped_production_approval: mismatch.approval,
      mode: 'runtime'
    });
    assert.deepEqual(blocked.body_state_descriptions, []);
    assert.deepEqual(blocked.gaps, ['health', 'energy', 'satiety'].map((metric) => ({
      metric, code: 'body_state_qualitative_metric_gap'
    })));
  }
});

test('unavailable body metric returns a gap without discarding other bands', async () => {
  const bundle = JSON.parse(await readFile(resolve(ROOT, COMBAT_DATA,
    'minimal-combat-bundle.candidate.json'), 'utf8'));
  const approval = JSON.parse(await readFile(resolve(ROOT, COMBAT_DATA,
    'combat-data-approval.json'), 'utf8'));
  const result = projectCombatBodyStateDescriptions({
    body_state: { health: 29, energy: null, satiety: 100 },
    qualitative_profile: bundle.npc_decision.body_state_qualitative_context,
    data_approval: approval, mode: 'D65_PROBE'
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.body_state_descriptions, [
    { metric: 'health', npc_description: 'Здоровье низкое.' },
    { metric: 'satiety', npc_description: 'Сытость высокая.' }
  ]);
  assert.deepEqual(result.gaps, [{ metric: 'energy',
    code: 'body_state_qualitative_metric_gap' }]);
  assert.equal(JSON.stringify(result).includes('29'), false);
  assert.equal(JSON.stringify(result).includes('100'), false);
});

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

test('body-state initializer requires approved versioned profile and is deterministic', () => {
  const profile = {
    schema: 'rus.body_state.initialization_profile.v1',
    profile_ref: {
      entity_ref: { entity_kind: 'body_state_profile', entity_id: 'test-npc' },
      authoring_version: 'v1'
    },
    status: 'approved',
    initial_state: { health: 72, satiety: 61, energy: 48 }
  };
  const result = initializeBodyState({ body_state_profile: profile });

  assert.equal(result.ok, true);
  assert.deepEqual(result.body_state, { health: 72, satiety: 61, energy: 48 });
  assert.deepEqual(result.profile_ref, profile.profile_ref);
  assert.deepEqual(initializeBodyState({ body_state_profile: profile }), result);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.body_state), true);
});

test('body-state initializer returns typed gap for missing profile or required metric', () => {
  const missingProfile = initializeBodyState();
  const missingMetric = initializeBodyState({ body_state_profile: {
    schema: 'rus.body_state.initialization_profile.v1',
    profile_ref: {
      entity_ref: { entity_kind: 'body_state_profile', entity_id: 'test-npc' },
      authoring_version: 'v1'
    },
    status: 'approved',
    initial_state: { health: 72, satiety: 61 }
  } });

  for (const result of [missingProfile, missingMetric]) {
    assert.deepEqual(result, {
      ok: false,
      status: 'hard_block',
      error: {
        code: 'body_state_profile_gap',
        message: 'approved versioned body-state profile with health, satiety and energy is required'
      }
    });
  }
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
