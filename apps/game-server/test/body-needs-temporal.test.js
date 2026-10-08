import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveBodyEnvironmentSnapshot } from '@rus/environment-state';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';
import { createBodyNeedsTemporalAdapter, deriveTrustedBodyNeedsBindingPin } from
  '../src/runtime/body-needs-temporal.js';
import { createTracePhase9BodyEffect } from '../src/runtime/lower-dvina-trace-phase-9-effects.js';

const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const entity = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const timestamp = (minutes) => ({ whole_minutes: String(minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const context = (satiety = '60') => ({
  party_id: 'party-1',
  state_version: 7,
  observed_at: timestamp(120),
  body_state: { health: rational('100'), satiety: rational(satiety), energy: rational('80') },
  body_state_ref: entity('body_state', 'actor-body-1'),
  scope_ref: entity('party_g6_instance', 'party-1'),
  environment_fact: { schema: 'rus.approved_initial_environment.v1', version: 1,
    season: 'summer', light_state: 'daylight',
    weather_state: { weather_state_id: 'clear' } },
  active_conditions: []
});

async function adapter() {
  const bodyNeedsProfile = await loadTargetBodyNeedsProfile({ worldRevisionId });
  return { bodyNeedsProfile, value: createBodyNeedsTemporalAdapter({ body_needs_profile: bodyNeedsProfile }) };
}

test('body-needs loader returns exact source profiles with effective approval attestation', async () => {
  const { bodyNeedsProfile } = await adapter();
  assert.equal(bodyNeedsProfile.status, 'candidate_only_pending_review');
  assert.equal(bodyNeedsProfile.approved, true);
  assert.equal(bodyNeedsProfile.import_authorized, true);
  assert.equal(bodyNeedsProfile.activation_authorized, true);
  assert.ok(['APPROVE', 'APPROVE_CONDITIONAL'].includes(
    bodyNeedsProfile.approval_attestation.verdict));
  assert.equal(bodyNeedsProfile.approval_attestation.path.length > 0, true);
  assert.match(bodyNeedsProfile.approval_attestation.sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(bodyNeedsProfile.effort_bindings.map(({ effort_id, activity_intensity_id }) =>
    [effort_id, activity_intensity_id]), [
    ['none', 'rest_or_ordinary_activity'], ['light', 'rest_or_ordinary_activity'],
    ['moderate', 'rest_or_ordinary_activity'], ['heavy', 'heavy_activity'], ['extreme', 'heavy_activity']
  ]);
  assert.deepEqual(Object.keys(bodyNeedsProfile.profiles).sort(), [
    'energy_awake_spend_v2', 'satiety_hourly_spend_v2', 'starvation_health_harm_v2'
  ]);
  assert.equal(bodyNeedsProfile.profiles.energy_awake_spend_v2.payload.body_effect_profile_id,
    'energy_awake_spend_v2');
});

test('body-needs trusted pin helper matches adapter pin and preserves disabled null', async () => {
  const { bodyNeedsProfile, value } = await adapter();
  assert.deepEqual(deriveTrustedBodyNeedsBindingPin(bodyNeedsProfile), value.trustedBindingPin);
  assert.equal(deriveTrustedBodyNeedsBindingPin(null), null);
});

test('ordinary waiting emits distinct exact satiety and awake-energy source proposals', async () => {
  const { bodyNeedsProfile, value } = await adapter();
  const result = value.calculateProposals({ ...context(), effort: 'none', exact_elapsed: rational('60') });
  assert.equal(result.ok, true);
  assert.equal(result.proposals.length, 2);
  const [satiety, energy] = result.proposals;
  assert.notDeepEqual(satiety.profile_ref, energy.profile_ref);
  assert.deepEqual(satiety.metric_changes, [{ metric: 'satiety', direction: 'decrease',
    amount: rational('25', '18') }]);
  assert.deepEqual(energy.metric_changes, [{ metric: 'energy', direction: 'decrease',
    amount: rational('25', '18') }]);
  assert.equal(satiety.profile_pin.artifact_id, bodyNeedsProfile.profiles.satiety_hourly_spend_v2.record_id);
  assert.equal(energy.profile_pin.artifact_id, bodyNeedsProfile.profiles.energy_awake_spend_v2.record_id);
  for (const proposal of result.proposals) {
    assert.equal(Object.isFrozen(value.trustedBindingPin), true);
    assert.deepEqual(proposal.binding_pin, value.trustedBindingPin);
    assert.equal(proposal.binding_pin.status, 'approved_by_attestation');
    assert.equal(proposal.binding_pin.approved, true);
    assert.equal(proposal.binding_pin.digest, bodyNeedsProfile.candidate_sha256);
    assert.equal(proposal.binding_pin.candidate_path, bodyNeedsProfile.candidate_path);
    assert.equal(proposal.binding_pin.candidate_sha256, bodyNeedsProfile.candidate_sha256);
    assert.equal(proposal.binding_pin.approval_attestation_path,
      bodyNeedsProfile.approval_attestation.path);
    assert.equal(proposal.binding_pin.approval_attestation_sha256,
      bodyNeedsProfile.approval_attestation.sha256);
    assert.equal(proposal.binding_pin.verdict,
      bodyNeedsProfile.approval_attestation.verdict);
    assert.equal(proposal.binding_pin.dataset_sha256, bodyNeedsProfile.dataset_sha256);
    assert.equal(proposal.binding_pin.source_approval_sha256, bodyNeedsProfile.source_approval_sha256);
  }
});

test('body-needs adapter rejects absent or malformed approval attestation', async () => {
  const { bodyNeedsProfile } = await adapter();
  for (const invalid of [
    { ...bodyNeedsProfile, approval_attestation: null },
    { ...bodyNeedsProfile, approval_attestation: { ...bodyNeedsProfile.approval_attestation,
      sha256: 'not-a-sha256' } },
    { ...bodyNeedsProfile, approval_attestation: { ...bodyNeedsProfile.approval_attestation,
      verdict: 'pending' } },
    { ...bodyNeedsProfile, activation_authorized: false }
  ]) {
    assert.throws(() => createBodyNeedsTemporalAdapter({ body_needs_profile: invalid }),
      /Exact approved body-needs binding attestation is required/u);
  }
});

test('adapter derives body snapshot from persisted party version and exact segment start', async () => {
  const { value } = await adapter();
  const input = { ...context(), effort: 'none', exact_elapsed: rational('60') };
  const environment = deriveBodyEnvironmentSnapshot({
    environment_fact: input.environment_fact,
    party_id: input.party_id,
    state_version: input.state_version,
    observed_at: input.observed_at
  });
  assert.equal(environment.status, 'ok');
  assert.equal(environment.environment_snapshot.state_ref.entity_id,
    `${input.party_id}:environment:${input.state_version}`);
  assert.deepEqual(environment.environment_snapshot.body_factor_ids, []);
  const result = value.calculateProposals(input);
  assert.equal(result.ok, true);
  assert.equal(result.proposals.length, 2);

  const invalidStart = value.calculateProposals({ ...input,
    observed_at: { whole_minutes: '120' } });
  assert.equal(invalidStart.ok, false);
  assert.equal(invalidStart.code, 'time_timestamp_invalid');
});

test('heavy work uses approved heavy rates and starvation activates from the moment satiety reaches zero', async () => {
  const { bodyNeedsProfile, value } = await adapter();
  const ordinary = value.calculateProposals({ ...context('1'), effort: 'heavy', exact_elapsed: rational('60') });
  assert.equal(ordinary.ok, true);
  assert.equal(ordinary.proposals.length, 3);
  assert.deepEqual(ordinary.proposals[0].metric_changes[0].amount, rational('25', '12'));
  assert.deepEqual(ordinary.proposals.flatMap(({ metric_changes }) => metric_changes), [
    { metric: 'satiety', direction: 'decrease', amount: rational('25', '12') },
    { metric: 'energy', direction: 'decrease', amount: rational('25', '12') },
    { metric: 'health', direction: 'decrease', amount: rational('13', '12') }
  ]);
  const ordinaryHealth = ordinary.proposals.find(({ metric_changes }) => metric_changes[0].metric === 'health');
  assert.equal(ordinaryHealth.profile_pin.artifact_id, bodyNeedsProfile.profiles.starvation_health_harm_v2.record_id);
  // Approved heavy rate: satiety 1 reaches zero at 144/5 min, leaving 156/5 min of starvation.
  assert.deepEqual(ordinaryHealth.exact_elapsed, rational('156', '5'));
  for (const proposal of ordinary.proposals.filter(({ metric_changes }) => metric_changes[0].metric !== 'health')) {
    assert.deepEqual(proposal.exact_elapsed, rational('60'));
  }
  const { applyBodyTimeEffectProposals } = await import('@rus/body-state');
  const applied = applyBodyTimeEffectProposals({ health: 100, satiety: 1, energy: 80 }, ordinary.proposals);
  assert.equal(applied.ok, true);
  assert.equal(applied.state_after.satiety, 0);
  const starving = value.calculateProposals({ ...context('0'), effort: 'heavy', exact_elapsed: rational('60') });
  assert.equal(starving.ok, true);
  assert.equal(starving.proposals.length, 3);
  const health = starving.proposals.find(({ metric_changes }) => metric_changes[0].metric === 'health');
  assert.equal(health.profile_pin.artifact_id, bodyNeedsProfile.profiles.starvation_health_harm_v2.record_id);
  assert.deepEqual(health.metric_changes, [{ metric: 'health', direction: 'decrease', amount: rational('25', '12') }]);
  assert.equal(new Set(starving.proposals.map(({ profile_ref }) => profile_ref.entity_ref.entity_id)).size, 3);
});

test('threshold prediction delegates exact boundary timing to body-state', async () => {
  const { value } = await adapter();
  const result = value.predictNearestThreshold({ ...context('50'), effort: 'none', metric: 'satiety',
    window_start: timestamp(0), window_end: timestamp(3000) });
  assert.equal(result.ok, true);
  assert.equal(result.threshold_candidate.boundary_kind, 'body_threshold');
  assert.equal(result.threshold_candidate.scheduled_at.whole_minutes, '1296');
});

test('body-needs adapter converts persisted numeric metrics to exact rationals', async () => {
  const { value } = await adapter();
  const numericContext = { ...context(), body_state: { health: 12.5, satiety: 60.25, energy: 80.125 } };
  const result = value.predictNearestThreshold({ ...numericContext, effort: 'none', metric: 'satiety',
    window_start: timestamp(0), window_end: timestamp(3000) });
  assert.equal(result.ok, true);
  assert.equal(result.threshold_candidate.boundary_kind, 'body_threshold');
  const proposals = value.calculateProposals({ ...numericContext, effort: 'none',
    exact_elapsed: rational('60') });
  assert.equal(proposals.ok, true);
});

test('phase-9 body wrapper preserves continuous-effect capability and delegates semantic activity', () => {
  const input = { consequence: null };
  const result = { owner: '@rus/body-state', applied: true };
  const fallback = { supportsBodyTimeEffects: true, apply: (value) => {
    assert.equal(value, input);
    return result;
  } };
  const wrapped = createTracePhase9BodyEffect({ fallback });

  assert.equal(wrapped.supportsBodyTimeEffects, true);
  assert.equal(wrapped.apply(input), result);
  assert.equal(createTracePhase9BodyEffect({ fallback: { apply() {} } }).supportsBodyTimeEffects,
    false);
});
