import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  createHistoricalPhaseHandler,
  provideHistoricalPhaseBoundaries,
  projectHistoricalPhaseVisibleEffects
} from '../src/historical-phases.js';

const timestamp = (whole_minutes, subminute_numerator = '0', subminute_denominator = '1') => ({
  whole_minutes,
  subminute_numerator,
  subminute_denominator
});

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id, authoring_version = 'v1') => ({ entity_ref: ref(entity_kind, entity_id), authoring_version });
const seal = (payload) => ({ ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) });
const dependencyPin = (dependency_role, value) => ({
  dependency_role,
  entity_ref: value.entity_ref,
  version_pin: { pin_kind: 'authoring_version', authoring_version: value.authoring_version }
});
const eventRef = ref('source_record', 'event-1');
const scopeRef = ref('canonical_spatial_node', 'novgorod');
const sourceRef = versioned('source_record', 'chronicle-1');
const provenanceRef = versioned('provenance_record', 'provenance-1');
const localRuleRef = versioned('condition_set', 'historical-local-rule-1');
const boundaryPolicyRef = versioned('condition_set', 'historical-boundary-policy');
const visibilityPolicyRef = versioned('condition_set', 'historical-visible-policy');
const pins = () => seal({
  pins: [
    dependencyPin('source_dependency', sourceRef),
    dependencyPin('profile_rule_dependency', provenanceRef),
    dependencyPin('condition_rule', localRuleRef),
    dependencyPin('condition_rule', boundaryPolicyRef),
    dependencyPin('condition', visibilityPolicyRef)
  ]
});

const phase = (overrides = {}) => seal({
  phase_id: 'phase-1',
  status: 'approved',
  event_ref: eventRef,
  scope_ref: scopeRef,
  applicability: { scope_refs: [scopeRef] },
  start_at: timestamp('10', '1', '2'),
  end_at: timestamp('20'),
  source_refs: [sourceRef],
  provenance_refs: [provenanceRef],
  local_effect_rule_ref: localRuleRef,
  boundary_policy_ref: boundaryPolicyRef,
  visibility_policy_ref: visibilityPolicyRef,
  interrupt_effect: 'notice',
  allow_derived_visible_effects: true,
  dependency_pins: pins(),
  ...overrides
});

test('WP6 emits an exact, frozen historical_phase boundary from one approved applicable sealed record', () => {
  const records = [phase()];
  const candidates = provideHistoricalPhaseBoundaries({
    from_timestamp: timestamp('10'),
    limit_timestamp: timestamp('11'),
    scope_ref: scopeRef,
    records
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].boundary_kind, 'historical_phase');
  assert.deepEqual(candidates[0].scheduled_at, timestamp('10', '1', '2'));
  assert.deepEqual(validateSpatialV3Contract('temporal_boundary_candidate', candidates[0]), []);
  assert.equal(Object.isFrozen(candidates[0]), true);
  assert.throws(() => provideHistoricalPhaseBoundaries({ from_timestamp: timestamp('10'), limit_timestamp: timestamp('11'), scope_ref: scopeRef, records: [phase({ start_at: { whole_minutes: '10' } })] }), /timestamp/i);
});

test('WP6 fails closed for no rule/profile, missing provenance/pins, and ambiguous applicable phases', () => {
  for (const records of [
    [phase({ local_effect_rule_ref: null })],
    [phase({ provenance_refs: [] })],
    [phase({ dependency_pins: seal({ pins: [] }) })],
    [phase(), phase({ event_ref: ref('source_record', 'event-2') })]
  ]) {
    assert.throws(
      () => provideHistoricalPhaseBoundaries({ from_timestamp: timestamp('10'), limit_timestamp: timestamp('11'), scope_ref: scopeRef, records }),
      (error) => ['historical_phase_rule_gap', 'temporal_boundary_ambiguous'].includes(error?.code)
    );
  }
});

test('WP6 handler is persisted-evidence exactly-once across engines and rejects key/digest or stale precondition conflicts', () => {
  const candidate = provideHistoricalPhaseBoundaries({ from_timestamp: timestamp('10'), limit_timestamp: timestamp('11'), scope_ref: scopeRef, records: [phase()] })[0];
  const first = createHistoricalPhaseHandler().resolve({ candidate, observed_preconditions_digest: candidate.preconditions_digest });
  assert.equal(first.status, 'activated');
  assert.equal(first.effect_proposal.rule_ref.entity_ref.entity_id, 'historical-local-rule-1');
  assert.equal(first.activation_evidence.length, 1);
  const replay = createHistoricalPhaseHandler({ activation_evidence: first.activation_evidence }).resolve({ candidate, observed_preconditions_digest: candidate.preconditions_digest });
  assert.equal(replay.status, 'already_activated');
  const conflictingDigest = `sha256:${'e'.repeat(64)}`;
  assert.throws(() => createHistoricalPhaseHandler({ activation_evidence: first.activation_evidence }).resolve({ candidate: { ...candidate, preconditions_digest: conflictingDigest }, observed_preconditions_digest: conflictingDigest }), (error) => error?.code === 'idempotency_conflict');
  assert.throws(() => createHistoricalPhaseHandler().resolve({ candidate, observed_preconditions_digest: `sha256:${'f'.repeat(64)}` }), (error) => error?.code === 'state_version_conflict');
});

test('WP6 projects only explicit derived visible effects, never hidden phase identity', () => {
  const candidate = provideHistoricalPhaseBoundaries({ from_timestamp: timestamp('10'), limit_timestamp: timestamp('11'), scope_ref: scopeRef, records: [phase()] })[0];
  const activation = createHistoricalPhaseHandler().resolve({ candidate, observed_preconditions_digest: candidate.preconditions_digest });
  assert.deepEqual(projectHistoricalPhaseVisibleEffects({
    activation,
    perceived_effects: [{
      effect_id: 'closed-road',
      visible: true,
      presentation: { effect_kind: 'access_change', target_ref: ref('portal_entity', 'market-gate') }
    }]
  }), [{
    effect_id: 'closed-road',
    presentation: { effect_kind: 'access_change', target_ref: ref('portal_entity', 'market-gate') }
  }]);
  assert.throws(() => projectHistoricalPhaseVisibleEffects({ activation, perceived_effects: [{ effect_id: 'leak', visible: true, phase_id: 'phase-1' }] }), (error) => error?.code === 'hidden_information_leak');
});

test('WP6 has deterministic same-time output and an explicit provider resource cap for huge timestamps', () => {
  const records = [phase({ phase_id: 'phase-b' }), phase({ phase_id: 'phase-a', event_ref: ref('source_record', 'event-2') })];
  assert.throws(() => provideHistoricalPhaseBoundaries({ from_timestamp: timestamp('999999999999999999999999999999999999999'), limit_timestamp: timestamp('999999999999999999999999999999999999999'), scope_ref: scopeRef, records, max_records: 1 }), (error) => error?.code === 'temporal_execution_unbounded');
  const sameTime = provideHistoricalPhaseBoundaries({
    from_timestamp: timestamp('10'),
    limit_timestamp: timestamp('11'),
    scope_ref: scopeRef,
    records
  });
  assert.deepEqual(sameTime.map(({ boundary_id }) => boundary_id), ['historical-phase:phase-a', 'historical-phase:phase-b']);
});
