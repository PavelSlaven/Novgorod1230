import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';
import { computeTemporalDigest } from '@rus/time-events-history';
import { createWorldProcessEngine } from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const vref = (kind, id) => ({ entity_ref: ref(kind, id), authoring_version: 'v1' });
const time = (whole_minutes, subminute_numerator = '0', subminute_denominator = '1') => ({ whole_minutes: String(whole_minutes), subminute_numerator, subminute_denominator });
const rational = (numerator, denominator = '1') => ({ numerator: String(numerator), denominator: String(denominator) });
const seal = (payload) => ({ ...payload, canonical_digest: computeTemporalDigest(payload) });
const profileRef = (kind) => vref('activity_profile', kind);
const effectRef = (kind) => vref('body_effect', kind);
const visibilityRef = (kind) => vref('condition_set', `visible-${kind}`);
const terminationRef = (kind) => vref('condition_set', `terminate-${kind}`);
const pinFor = (kind) => seal({ pins: [
  { dependency_role: 'profile', entity_ref: profileRef(kind).entity_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' } },
  { dependency_role: 'consequence_rule', entity_ref: effectRef(kind).entity_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' } },
  { dependency_role: 'condition', entity_ref: visibilityRef(kind).entity_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' } },
  { dependency_role: 'condition_rule', entity_ref: terminationRef(kind).entity_ref, version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' } }
] });
const profile = (process_kind, overrides = {}) => seal({
  process_kind,
  status: 'approved_sealed',
  profile_ref: profileRef(process_kind),
  effect_ref: effectRef(process_kind),
  visibility_policy_ref: visibilityRef(process_kind),
  termination_policy_ref: terminationRef(process_kind),
  coarse_interval: rational('60'),
  max_lifetime: rational('180'),
  termination_policy: 'terminate_at_max_lifetime',
  player_visible: process_kind === 'rumor',
  provenance_ref: ref('source_record', `approved-${process_kind}`),
  applicable_scope_modes: ['coarse_remote_materialized_scope'],
  applicable_scope_refs: [ref('party', 'market')],
  dependency_pins: pinFor(process_kind),
  ...overrides
});
const profiles = Object.fromEntries(['rumor', 'order', 'alarm', 'pursuit', 'fire', 'shortage', 'weather_front', 'historical_pressure'].map((kind) => [kind, profile(kind)]));
const engine = createWorldProcessEngine({ approved_process_profiles: Object.values(profiles), safety_limits: { max_processes: 100, max_boundaries: 10000 } });
const process = (kind = 'rumor', overrides = {}) => ({ process_ref: ref('propagation_process', `${kind}-a`), process_kind: kind, source_ref: ref('party', 'market'), causal_basis_ref: ref('source_record', 'chronicle'), scope_ref: ref('party', 'market'), started_at: time('0'), status: 'active', visibility_policy_ref: profiles[kind].visibility_policy_ref, termination_policy_ref: profiles[kind].termination_policy_ref, rule_pins: profiles[kind].dependency_pins, idempotency_key: `${kind}-a`, ...overrides });
const aggregate = (overrides = {}) => { const value = { aggregate_id: 'market', scope_ref: ref('party', 'market'), scope_mode: 'coarse_remote_materialized_scope', last_updated_at: time('30'), state_version: '1', aggregate_process_refs: [process()], pending_incoming_effect_refs: [], coarse_rule_versions: Object.values(profiles).map(({ profile_ref }) => profile_ref), ...overrides }; value.canonical_digest = computeTemporalDigest((( { canonical_digest, ...rest }) => rest)(value)); return value; };
const request = (overrides = {}) => ({ aggregate_state: aggregate(), activation_timestamp: time('150'), exact_elapsed: { exact_minutes: rational('120') }, rule_pins: profiles.rumor.dependency_pins, idempotency_key: 'catch-up-1', incoming_process_refs: [], ...overrides });

test('returns only formal request/result and uses exact huge rational interval', () => {
  const huge = '900719925474099312345678901234567890';
  const exactEngine = createWorldProcessEngine({ approved_process_profiles: Object.values(profiles).map((entry) => entry.process_kind === 'rumor' ? profile('rumor', { coarse_interval: rational(huge, '3'), max_lifetime: rational(huge, '1') }) : entry), safety_limits: { max_processes: 100, max_boundaries: 10 } });
  const result = exactEngine.catchUp(request({ aggregate_state: aggregate({ last_updated_at: time('0') }), activation_timestamp: time(huge, '1', '3'), exact_elapsed: { exact_minutes: rational(`${BigInt(huge) * 3n + 1n}`, '3') } }));
  assert.deepEqual(validateSpatialV3Contract('remote_catch_up_result', result), []);
  assert.equal(result.proposed_change_set.factual[0].occurred_at.whole_minutes, '300239975158033104115226300411522630');
});

test('increments state version only on state change, is deterministic on retry, and terminates', () => {
  const first = engine.catchUp(request({ activation_timestamp: time('240'), exact_elapsed: { exact_minutes: rational('210') } }));
  assert.equal(first.aggregate_state.state_version, '2');
  assert.equal(first.proposed_change_set.factual.at(-1).kind, 'process_terminated');
  const retry = engine.catchUp(request({ aggregate_state: first.aggregate_state, activation_timestamp: time('240'), exact_elapsed: { exact_minutes: rational('0') } }));
  assert.deepEqual(retry, engine.catchUp(request({ aggregate_state: first.aggregate_state, activation_timestamp: time('240'), exact_elapsed: { exact_minutes: rational('0') } })));
  assert.equal(retry.aggregate_state.state_version, '2');
});

test('blocks duplicate conflict, preserves frozen aggregate, and separates factual rumor visibility after handoff', () => {
  const original = aggregate();
  const input = request({ aggregate_state: original, incoming_process_refs: [process('rumor', { process_ref: ref('propagation_process', 'different'), idempotency_key: 'rumor-a' })] });
  const before = structuredClone(input);
  const result = engine.catchUp(input);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.aggregate_state, original);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(result.aggregate_state));
  const completed = engine.catchUp(request());
  assert.ok(completed.proposed_change_set.factual.length > 0);
  assert.ok(completed.proposed_change_set.player_visible.length > 0);
  assert.equal(completed.proposed_change_set.activation_handoff.after_exact_catch_up, true);
});

test('requires frozen formal inputs and supports all eight registered process kinds', () => {
  const all = Object.keys(profiles).map((kind) => process(kind));
  const allPins = seal({ pins: Object.values(profiles).flatMap(({ dependency_pins }) => dependency_pins.pins) });
  const allWithPins = all.map((entry) => ({ ...entry, rule_pins: allPins }));
  const allProfiles = Object.fromEntries(Object.entries(profiles).map(([kind, entry]) => [kind, profile(kind, { dependency_pins: allPins })]));
  const allEngine = createWorldProcessEngine({ approved_process_profiles: Object.values(allProfiles), safety_limits: { max_processes: 100, max_boundaries: 10000 } });
  const result = allEngine.catchUp(request({ aggregate_state: aggregate({ aggregate_process_refs: allWithPins }), rule_pins: allPins, activation_timestamp: time('60'), exact_elapsed: { exact_minutes: rational('30') } }));
  assert.equal(result.status, 'completed');
  assert.deepEqual(validateSpatialV3Contract('remote_catch_up_request', request()), []);
  assert.throws(() => engine.catchUp({ party_snapshot: {} }), /exactly remote_catch_up_request/u);
});

test('keeps future pending processes pending and blocks corrupted overdue lifecycle state', () => {
  const future = process('rumor', {
    process_ref: ref('propagation_process', 'future-rumor'),
    idempotency_key: 'future-rumor',
    started_at: time('1000'),
    status: 'pending'
  });
  const pending = engine.catchUp(request({
    aggregate_state: aggregate({ aggregate_process_refs: [future] })
  }));
  assert.equal(pending.status, 'completed');
  assert.equal(pending.aggregate_state.aggregate_process_refs[0].status, 'pending');
  assert.deepEqual(pending.aggregate_state.aggregate_process_refs[0].next_boundary_at, time('1000'));
  assert.equal(pending.proposed_change_set.factual.length, 0);

  const overdue = process('rumor', { status: 'active' });
  const corrupted = engine.catchUp(request({
    aggregate_state: aggregate({ aggregate_process_refs: [overdue], last_updated_at: time('240') }),
    activation_timestamp: time('300'),
    exact_elapsed: { exact_minutes: rational('60') }
  }));
  assert.equal(corrupted.status, 'blocked');
  assert.equal(corrupted.trace.typed_error_code, 'propagation_rule_gap');
});

test('hard-blocks any process whose approved profile and effect are not fully pinned', () => {
  const unpinned = profile('rumor', {
    effect_ref: { ...effectRef('rumor'), authoring_version: 'v99' }
  });
  assert.throws(() => createWorldProcessEngine({
    approved_process_profiles: [unpinned, ...Object.values(profiles).filter(({ process_kind }) => process_kind !== 'rumor')],
    safety_limits: { max_processes: 100, max_boundaries: 10000 }
  }), /pinned/u);

  const aggregateWithoutProfile = aggregate({
    coarse_rule_versions: Object.values(profiles)
      .filter(({ process_kind }) => process_kind !== 'rumor')
      .map(({ profile_ref }) => profile_ref)
  });
  const result = engine.catchUp(request({ aggregate_state: aggregateWithoutProfile }));
  assert.equal(result.status, 'blocked');
  assert.equal(result.trace.typed_error_code, 'propagation_rule_gap');
});

test('requires every optional propagation path to be explicitly pinned', () => {
  const pathRef = ref('world_route', 'market-to-kremlin');
  const unpinned = process('rumor', { path_ref: pathRef });
  const unpinnedRequest = request({
    aggregate_state: aggregate({ aggregate_process_refs: [unpinned] })
  });
  assert.deepEqual(validateSpatialV3Contract('remote_catch_up_request', unpinnedRequest), []);
  const blocked = engine.catchUp(unpinnedRequest);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.trace.typed_error_code, 'propagation_rule_gap');

  const pathPins = seal({ pins: [
    ...profiles.rumor.dependency_pins.pins,
    {
      dependency_role: 'route',
      entity_ref: pathRef,
      version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' }
    }
  ] });
  const pinned = process('rumor', { path_ref: pathRef, rule_pins: pathPins });
  const completed = engine.catchUp(request({
    aggregate_state: aggregate({ aggregate_process_refs: [pinned] }),
    rule_pins: pathPins
  }));
  assert.equal(completed.status, 'completed');
});
