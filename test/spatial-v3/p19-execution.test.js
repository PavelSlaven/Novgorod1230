import test from 'node:test';
import assert from 'node:assert/strict';
import { addRational, subtractRational, advanceExactClock } from '@rus/time-events-history';
import { createSpatialV3ExecutionEngine } from '@rus/turn/spatial-v3-execution';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';

const seal = (payload) => ({ ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) });
const pins = seal({ pins: [{ dependency_role: 'p19', entity_ref: { entity_kind: 'world_revision', entity_id: 'r' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }] });
const context = () => seal({ context_id: 'ctx' });
const endpoint = (id) => seal({ endpoint_kind: 'scene_position', endpoint_id: id });
const history = (keys = []) => seal({ id: 'delay-history', committed_occurrence_keys: keys });
const signals = (value = {}) => seal({ dependency_pins: pins, ...value });
const snapshot = (value = {}) => seal({ snapshot_id: 'snapshot', resolved_factors: [], resolved_delays: [], ...value });
const state = (value = {}) => seal({ id: 'state', party_id: 'party', execution_id: 'exec', step_ordinal: 0, next_interval_ordinal: 0, progress_ppm: 0, cumulative_actual_time: { numerator: 0, denominator: 1 }, status: 'active', dependency_pins: pins, context_snapshot: context(), ...value });
const intervalInput = (value = {}) => ({
  party_id: 'party', execution_id: 'exec', idempotency_key: 'interval-key', change_set_id: 'change', idempotency_record_id: 'record', occurred_at_turn: 0,
  step_ordinal: 0, interval_ordinal: 0, clock_commit_mode: 'direct_party_clock', world_time_before: { numerator: 0, denominator: 1 },
  travel_state: state(), progress_before_ppm: 0, planned_progress_after_ppm: 10, actual_progress_after_ppm: 10,
  planned_time: { numerator: 1, denominator: 1 }, actual_time: { numerator: 1, denominator: 1 }, cumulative_before: { numerator: 0, denominator: 1 },
  dynamic_snapshot: snapshot(), dynamic_dependency_pins: pins, execution_context_snapshot: context(), delay_occurrence_history: history(), source_signals: signals(), ...value
});

test('P19 rational arithmetic is reduced and slicing independent', () => {
  assert.deepEqual(addRational({ numerator: 1, denominator: 3 }, { numerator: 1, denominator: 6 }), { numerator: 1, denominator: 2 });
  assert.deepEqual(subtractRational({ numerator: 1, denominator: 1 }, { numerator: 1, denominator: 3 }), { numerator: 2, denominator: 3 });
  assert.deepEqual(advanceExactClock({ numerator: 0, denominator: 1 }, { numerator: 1, denominator: 2 }), { exact_minutes: { numerator: 1, denominator: 2 }, whole_minute_index: 0, crossed_whole_minute_boundaries: 0 });
});

test('P19 immediate action accepts only sealed identities, snapshots and endpoints', () => {
  const engine = createSpatialV3ExecutionEngine();
  const input = { run_id: 'run', idempotency_key: 'key', idempotency_record_id: 'record', occurred_at_turn: 0, party_id: 'party', change_set_id: 'change', execution_id: 'exec', step_ordinal: 0, endpoint_before: endpoint('a'), endpoint_after: endpoint('b'), action_snapshot: seal({ action_units: 1 }), dependency_pins: pins, dynamic_dependency_pins: pins, execution_context_snapshot: context() };
  const first = engine.executeImmediateAction(input); const retry = engine.executeImmediateAction(input);
  assert.equal(first.ok, true); assert.equal(first.result.result_kind, 'completed'); assert.equal(retry.replayed, true);
  assert.equal(engine.executeImmediateAction({ ...input, endpoint_after: { endpoint_kind: 'scene_position', endpoint_id: 'b' } }).ok, false);
  assert.equal(engine.executeImmediateAction({ ...input, endpoint_after: endpoint('changed') }).error.code, 'idempotency_conflict');
});

test('P19 activity has no implicit clock, idempotency or context defaults', () => {
  const engine = createSpatialV3ExecutionEngine();
  const activity = seal({ id: 'activity', series_ordinal: 0, original_total_minutes: 3, cumulative_elapsed: { numerator: 1, denominator: 1 }, remaining_time: { numerator: 2, denominator: 1 }, next_attempt_ordinal: 0, status: 'active' });
  const input = { party_id: 'party', execution_id: 'exec', idempotency_key: 'activity-key', idempotency_record_id: 'activity-record', change_set_id: 'change', occurred_at_turn: 0, execution_context_snapshot: context(), dynamic_dependency_pins: pins, activity_execution: activity, planned_time: { numerator: 1, denominator: 1 }, actual_time: { numerator: 1, denominator: 1 }, result_kind: 'failed', result_code: 'hazard', clock_commit_mode: 'direct_party_clock', world_time_before: { numerator: 0, denominator: 1 } };
  const result = engine.resolveTimedActivity(input);
  assert.equal(result.ok, true); assert.equal(result.attempt.cumulative_time_after.numerator, 2);
  assert.equal(engine.resolveTimedActivity({ ...input, idempotency_key: 'unknown-clock', clock_commit_mode: 'unknown' }).ok, false);
  assert.equal(engine.resolveTimedActivity({ ...input, idempotency_key: 'missing-clock', world_time_before: undefined }).ok, false);
  const successor = engine.createActivitySuccessor({ predecessor: result.activity_execution, id: 'successor' });
  assert.equal(successor.ok, true);
  assert.equal(Object.isFrozen(successor.activity_execution), true);
  const { canonical_digest: successorDigest, ...successorPayload } = successor.activity_execution;
  assert.equal(successorDigest, computeSpatialV3CanonicalDigest(successorPayload));
  const resumed = engine.resolveTimedActivity({ ...input, activity_execution: successor.activity_execution, idempotency_key: 'successor-key', idempotency_record_id: 'successor-record', actual_time: { numerator: 1, denominator: 1 }, planned_time: { numerator: 1, denominator: 1 }, result_kind: 'completed', result_code: 'complete' });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.activity_execution.status, 'completed');
  assert.equal(engine.resolveTimedActivity({ ...input, activity_execution: { ...successor.activity_execution, id: 'forged' }, idempotency_key: 'forged-successor', idempotency_record_id: 'forged-record' }).ok, false);
});

test('P19 traversal requires sealed state lineage, exact cumulative and ordinal', () => {
  const engine = createSpatialV3ExecutionEngine();
  const valid = intervalInput();
  assert.equal(engine.resolveTraversalInterval(valid).ok, true);
  assert.equal(engine.resolveTraversalInterval(intervalInput({ cumulative_before: { numerator: 1, denominator: 1 } })).ok, false);
  assert.equal(engine.resolveTraversalInterval(intervalInput({ interval_ordinal: 1 })).ok, false);
  assert.equal(engine.resolveTraversalInterval(intervalInput({ travel_state: { ...state(), canonical_digest: 'sha256:forged' } })).ok, false);
});

test('P19 traversal start has no implicit persistence identifiers', () => {
  const engine = createSpatialV3ExecutionEngine();
  const input = { departure_valid: true, travel_state_id: 'state', execution_id: 'exec', party_id: 'party', idempotency_key: 'key', idempotency_record_id: 'record', change_set_id: 'change', occurred_at_turn: 0, step_ordinal: 0, departure_endpoint: endpoint('a'), arrival_endpoint: endpoint('b'), segment_id: 'segment', method_id: 'walk', capacity_units: 1, context_snapshot: context(), dependency_pins: pins };
  assert.equal(engine.startTraversal(input).ok, true);
  assert.equal(engine.startTraversal({ ...input, change_set_id: undefined }).ok, false);
});

test('P19 traversal resolved factors/delays require sealed pins and history linkage', () => {
  const engine = createSpatialV3ExecutionEngine();
  const factor = seal({ factor_kind: 'pace', numerator: 1, denominator: 1, source_dependency_pins: pins });
  const delay = seal({ delay_kind: 'queue', application_scope: 'interval_once', occurrence_key: 'd1', occurrence_history_id: 'delay-history', exact_minutes: { numerator: 1, denominator: 2 }, source_dependency_pins: pins });
  assert.equal(engine.resolveTraversalInterval(intervalInput({ dynamic_snapshot: snapshot({ resolved_factors: [factor], resolved_delays: [delay] }) })).ok, true);
  assert.equal(engine.resolveTraversalInterval(intervalInput({ idempotency_key: 'forged-factor', dynamic_snapshot: snapshot({ resolved_factors: [{ ...factor, numerator: 2 }] }) })).error.code, 'time_factor_invalid');
  assert.equal(engine.resolveTraversalInterval(intervalInput({ idempotency_key: 'committed-delay', dynamic_snapshot: snapshot({ resolved_delays: [delay] }), delay_occurrence_history: history(['d1']) })).error.code, 'time_delay_occurrence_invalid');
  assert.equal(engine.resolveTraversalInterval(intervalInput({ idempotency_key: 'wrong-history', dynamic_snapshot: snapshot({ resolved_delays: [seal({ ...delay, occurrence_history_id: 'other' })] }) })).error.code, 'time_delay_occurrence_invalid');
});

test('P19 traversal controls retain six outcomes while rejecting unsealed sources and unknown modes', () => {
  const engine = createSpatialV3ExecutionEngine();
  const paused = engine.resolveTraversalInterval(intervalInput({ actual_progress_after_ppm: 0, actual_time: { numerator: 0, denominator: 1 }, source_signals: signals({ paused: true }) }));
  assert.equal(paused.ok, true); assert.equal(paused.result.result_kind, 'paused_in_transit');
  assert.equal(engine.resolveTraversalInterval(intervalInput({ source_signals: { paused: true, dependency_pins: pins } })).ok, false);
  assert.equal(engine.resolveTraversalInterval(intervalInput({ clock_commit_mode: 'clockish' })).ok, false);
});

test('P19 synchronized slice is a complete atomic root/local trace', () => {
  const engine = createSpatialV3ExecutionEngine();
  const root = seal({ id: 'root', party_id: 'party', route_plan_execution_id: 'exec', actual_time: { numerator: 1, denominator: 1 }, result_kind: 'progressed' });
  const local = seal({ id: 'local', party_id: 'party', actual_time: { numerator: 1, denominator: 1 }, result_kind: 'progressed' });
  const input = { id: 'slice', party_id: 'party', root_transport_execution_id: 'exec', change_set_id: 'change', idempotency_record_id: 'record', dependency_pins: pins, root, locals: [local], world_time_before: { numerator: 0, denominator: 1 }, atomic_trace: seal({ root_result_id: 'root', root_transport_execution_id: 'exec', local_result_ids: ['local'], change_set_id: 'change', idempotency_record_id: 'record' }) };
  const result = engine.resolveSynchronizedSlice(input);
  assert.equal(result.ok, true); assert.equal(result.slice.crossed_whole_minute_boundaries, 1);
  assert.equal(engine.resolveSynchronizedSlice({ ...input, atomic_trace: seal({ ...input.atomic_trace, local_result_ids: [] }) }).ok, false);
  assert.equal(engine.resolveSynchronizedSlice({ ...input, party_id: undefined }).ok, false);
});
