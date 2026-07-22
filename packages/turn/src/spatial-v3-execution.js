import {
  addRational,
  advanceExactClock,
  compareRational,
  subtractRational
} from '@rus/time-events-history';
import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from '@rus/contracts/spatial-v3/registry';
import {
  CLOCK_MODES,
  canonicalSignals,
  isRational,
  isRecord,
  nonNegativeInteger,
  normalized,
  positiveRational,
  sealedContext,
  sealedEndpoint,
  sealedExecutionState,
  sealedPinSet,
  sealedRecord,
  stableId,
  validateResolvedTimeSources
} from './spatial-v3-execution-validation.js';

const clone = (value) => structuredClone(value);
const zero = () => ({ numerator: 0, denominator: 1 });
const sameRational = (left, right) => compareRational(left, right) === 0;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sealed(payload) {
  return deepFreeze({ ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) });
}

function payloadOf(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'canonical_digest'));
}


function typedError(code, diagnostics = {}) {
  const pins = [{
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'target' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '4.2.0-target.1', state_version: null }
  }];
  return deepFreeze({
    ok: false,
    error: createSpatialV3TypedError(code, {
      subject_ref: { entity_kind: 'party_route_plan_execution', entity_id: diagnostics.execution_id || 'execution' },
      dependency_pins: { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') },
      diagnostics
    })
  });
}

function replayRecord(replays, kind, input) {
  const key = `${kind}:${input.party_id}:${input.idempotency_key}`;
  const inputDigest = computeSpatialV3CanonicalDigest(input);
  const previous = replays.get(key);
  if (previous && previous.input_digest !== inputDigest) return typedError('idempotency_conflict', { execution_id: input.execution_id });
  return previous ? deepFreeze({ ...clone(previous.result), replayed: true }) : { key, input_digest: inputDigest };
}

function rationalFields(prefix, value) {
  const fraction = normalized(value);
  return { [`${prefix}_numerator`]: fraction.numerator, [`${prefix}_denominator`]: fraction.denominator };
}

function intervalOutcome(signals, actualAfter) {
  // A prepared terminal endpoint wins over co-occurring control signals.  A data
  // gap can strand only a still in-transit state; it must never manufacture a
  // second terminal interpretation of a reached arrival endpoint.
  if (actualAfter === 1_000_000) return 'segment_completed';
  // §11.6: stranded/data gap, completed, interrupted, paused, blocked, progressed.
  if (signals.stranded || signals.data_gap) return 'stranded';
  if (signals.interrupted || signals.interrupt) return 'interrupted_at_anchor';
  if (signals.paused || signals.pause) return 'paused_in_transit';
  if (signals.blocked || signals.blocker) return 'blocked_before_progress';
  return 'progressed';
}

function stateForOutcome(state, outcome) {
  if (outcome === 'segment_completed') return { status: 'closed', closed_result: 'completed' };
  if (outcome === 'interrupted_at_anchor') return { status: 'closed', closed_result: 'interrupted_to_anchor' };
  if (outcome === 'paused_in_transit') return { status: 'paused_in_transit' };
  if (outcome === 'stranded') return { status: 'stranded_in_transit' };
  return { status: 'active' };
}

export function createSpatialV3ExecutionEngine() {
  const replays = new Map();

  function executeImmediateAction(input = {}) {
    if (!isRecord(input) || !stableId(input.party_id) || !stableId(input.run_id) || !stableId(input.execution_id) ||
      !stableId(input.idempotency_key) || !stableId(input.idempotency_record_id) || !stableId(input.change_set_id) || !nonNegativeInteger(input.occurred_at_turn) || !nonNegativeInteger(input.step_ordinal) ||
      !sealedEndpoint(input.endpoint_before) || !sealedEndpoint(input.endpoint_after) ||
      !sealedExecutionState(input.action_snapshot, ['action_units']) || !Number.isInteger(input.action_snapshot.action_units) ||
      input.action_snapshot.action_units < 1 || !sealedPinSet(input.dependency_pins) || !sealedPinSet(input.dynamic_dependency_pins) ||
      !sealedContext(input.execution_context_snapshot)) return typedError('route_plan_snapshot_missing', { execution_id: input?.execution_id });
    const replay = replayRecord(replays, 'immediate', input);
    if (replay?.ok === false || replay?.replayed) return replay;
    const result = sealed({
      id: input.run_id,
      execution_id: input.execution_id,
      step_ordinal: input.step_ordinal,
      result_kind: input.blocked ? 'blocked' : input.failed ? 'failed' : 'completed',
      endpoint_before: clone(input.endpoint_before),
      endpoint_after: input.blocked || input.failed ? clone(input.endpoint_before) : clone(input.endpoint_after),
      elapsed: zero(),
      execution_context_snapshot: clone(input.execution_context_snapshot),
      dynamic_dependency_pins: clone(input.dynamic_dependency_pins),
      result_change_set_id: input.change_set_id,
      idempotency_record_id: input.idempotency_record_id,
      occurred_at_turn: input.occurred_at_turn,
      idempotency_key: input.idempotency_key
    });
    const output = deepFreeze({ ok: true, result, write_proposal: deepFreeze({ appends: [result], updates: [] }) });
    replays.set(replay.key, { input_digest: replay.input_digest, result: output });
    return output;
  }

  function resolveTimedActivity(input = {}) {
    if (!isRecord(input) || !stableId(input.party_id) || !stableId(input.execution_id) || !stableId(input.idempotency_key) ||
      !stableId(input.change_set_id) || !stableId(input.idempotency_record_id) || !nonNegativeInteger(input.occurred_at_turn) ||
      !CLOCK_MODES.has(input.clock_commit_mode) || !isRational(input.world_time_before) ||
      !sealedContext(input.execution_context_snapshot) || !sealedPinSet(input.dynamic_dependency_pins) ||
      !sealedExecutionState(input.activity_execution, ['id', 'status', 'next_attempt_ordinal', 'original_total_minutes', 'cumulative_elapsed', 'remaining_time'])) {
      return typedError('time_accumulator_invalid', { execution_id: input?.execution_id });
    }
    const replay = replayRecord(replays, 'activity', input);
    if (replay?.ok === false || replay?.replayed) return replay;
    const activity = input.activity_execution;
    if (!activity || !['active', 'paused'].includes(activity.status) || !Number.isInteger(activity.next_attempt_ordinal) ||
      !Number.isInteger(activity.original_total_minutes) || activity.original_total_minutes < 1 ||
      !isRational(activity.cumulative_elapsed) || !isRational(activity.remaining_time) ||
      !positiveRational(input.planned_time) || !isRational(input.actual_time) ||
      !stableId(activity.id) || !stableId(input.execution_id) ||
      !sameRational(addRational(activity.cumulative_elapsed, activity.remaining_time), { numerator: activity.original_total_minutes, denominator: 1 }) ||
      compareRational(input.planned_time, activity.remaining_time) > 0 || compareRational(input.actual_time, input.planned_time) > 0) {
      return typedError('time_accumulator_invalid', { execution_id: input.execution_id });
    }
    const before = normalized(activity.cumulative_elapsed);
    const remaining = normalized(activity.remaining_time);
    const actual = normalized(input.actual_time);
    const remainingAfter = subtractRational(remaining, actual);
    const cumulativeAfter = addRational(before, actual);
    const resultKind = input.result_kind;
    if (!['progressed', 'completed', 'paused', 'blocked', 'failed'].includes(resultKind) ||
      (resultKind === 'blocked' && actual.numerator !== 0) ||
      (resultKind === 'completed' && (!actual.numerator || remainingAfter.numerator !== 0)) ||
      (resultKind === 'progressed' && (!actual.numerator || remainingAfter.numerator === 0)) ||
      (resultKind === 'paused' && remainingAfter.numerator === 0)) {
      return typedError('time_accumulator_invalid', { execution_id: input.execution_id });
    }
    const shared = input.clock_commit_mode === 'shared_root_transport_clock';
    if ((shared && !stableId(input.synchronized_time_slice_result_id)) || (!shared && input.synchronized_time_slice_result_id != null)) return typedError('time_accumulator_invalid', { execution_id: input.execution_id });
    const clock = shared ? null : advanceExactClock(input.world_time_before, actual);
    const attempt = sealed({
      activity_execution_id: activity.id,
      attempt_ordinal: activity.next_attempt_ordinal,
      remaining_time_before: remaining,
      planned_time: normalized(input.planned_time),
      actual_time: actual,
      remaining_time_after: remainingAfter,
      cumulative_time_before: before,
      cumulative_time_after: cumulativeAfter,
      ...rationalFields('remaining_before', remaining),
      ...rationalFields('planned_time', input.planned_time),
      ...rationalFields('actual_time', actual),
      ...rationalFields('remaining_after', remainingAfter),
      ...rationalFields('cumulative_time_before', before),
      ...rationalFields('cumulative_time_after', cumulativeAfter),
      result_kind: resultKind,
      result_code: input.result_code || resultKind,
      clock_commit_mode: shared ? 'shared_root_transport_clock' : 'direct_party_clock',
      synchronized_time_slice_result_id: shared ? input.synchronized_time_slice_result_id : null,
      crossed_whole_minute_boundaries: clock?.crossed_whole_minute_boundaries ?? 0,
      execution_context_snapshot: clone(input.execution_context_snapshot),
      dynamic_dependency_pins: clone(input.dynamic_dependency_pins),
      result_change_set_id: input.change_set_id,
      idempotency_record_id: input.idempotency_record_id,
      occurred_at_turn: input.occurred_at_turn,
      idempotency_key: input.idempotency_key
    });
    const status = resultKind === 'completed' ? 'completed' : resultKind === 'paused' ? 'paused' : resultKind === 'failed' ? 'failed' : 'active';
    const updated = sealed({ ...clone(payloadOf(activity)), cumulative_elapsed: cumulativeAfter, remaining_time: remainingAfter, next_attempt_ordinal: activity.next_attempt_ordinal + 1, status });
    const output = deepFreeze({ ok: true, attempt, activity_execution: updated, clock_update: clock, write_proposal: deepFreeze({ appends: [attempt], updates: [updated] }) });
    replays.set(replay.key, { input_digest: replay.input_digest, result: output });
    return output;
  }

  function createActivitySuccessor({ predecessor, id } = {}) {
    if (!sealedExecutionState(predecessor, ['id', 'status', 'cumulative_elapsed', 'remaining_time', 'series_ordinal']) || predecessor.status !== 'failed' || !stableId(id) || !nonNegativeInteger(predecessor.series_ordinal) || !isRational(predecessor.cumulative_elapsed) || !isRational(predecessor.remaining_time)) {
      return typedError('activity_retry_lineage_invalid');
    }
    return deepFreeze({ ok: true, activity_execution: sealed({
      ...clone(payloadOf(predecessor)), id, series_ordinal: predecessor.series_ordinal + 1,
      predecessor_activity_execution_id: predecessor.id, next_attempt_ordinal: 0, status: 'active'
    }) });
  }

  function startTraversal(input = {}) {
    if (!isRecord(input) || input.departure_valid !== true || !stableId(input.travel_state_id) || !stableId(input.execution_id) ||
      !stableId(input.party_id) || !stableId(input.idempotency_key) || !stableId(input.idempotency_record_id) || !stableId(input.change_set_id) || !nonNegativeInteger(input.occurred_at_turn) || !nonNegativeInteger(input.step_ordinal) ||
      !sealedEndpoint(input.departure_endpoint) || !sealedEndpoint(input.arrival_endpoint) || !stableId(input.segment_id) || !stableId(input.method_id) ||
      !Number.isInteger(input.capacity_units) || input.capacity_units < 1 || !sealedContext(input.context_snapshot) ||
      !sealedPinSet(input.dependency_pins)) {
      return typedError('route_endpoint_invalid', { execution_id: input.execution_id });
    }
    return deepFreeze({ ok: true, travel_state: sealed({
      id: input.travel_state_id, party_id: input.party_id, execution_id: input.execution_id, step_ordinal: input.step_ordinal,
      segment_id: input.segment_id, departure_endpoint: clone(input.departure_endpoint), arrival_endpoint: clone(input.arrival_endpoint),
      method_id: input.method_id, capacity_units: input.capacity_units, dependency_pins: clone(input.dependency_pins),
      progress_ppm: 0, cumulative_actual_time: zero(), next_interval_ordinal: 0, status: 'active', context_snapshot: clone(input.context_snapshot),
      idempotency_key: input.idempotency_key, idempotency_record_id: input.idempotency_record_id,
      start_change_set_id: input.change_set_id, occurred_at_turn: input.occurred_at_turn
    }) });
  }

  function resolveTraversalInterval(input = {}) {
    if (!isRecord(input) || !stableId(input.party_id) || !stableId(input.execution_id) || !stableId(input.idempotency_key) ||
      !stableId(input.change_set_id) || !stableId(input.idempotency_record_id) || !nonNegativeInteger(input.occurred_at_turn) ||
      !nonNegativeInteger(input.step_ordinal) || !nonNegativeInteger(input.interval_ordinal) ||
      !CLOCK_MODES.has(input.clock_commit_mode) || !isRational(input.world_time_before) ||
      !sealedExecutionState(input.travel_state, ['id', 'party_id', 'execution_id', 'step_ordinal', 'next_interval_ordinal', 'progress_ppm', 'cumulative_actual_time', 'status', 'dependency_pins', 'context_snapshot']) ||
      !sealedPinSet(input.travel_state.dependency_pins) || !sealedContext(input.travel_state.context_snapshot) ||
      !sealedContext(input.execution_context_snapshot) || !sealedPinSet(input.dynamic_dependency_pins) ||
      (input.navigation_resolution != null && !sealedRecord(input.navigation_resolution)) ||
      (input.hazard_resolution != null && !sealedRecord(input.hazard_resolution))) {
      return typedError('travel_interval_conflict', { execution_id: input?.execution_id });
    }
    const replay = replayRecord(replays, 'traversal', input);
    if (replay?.ok === false || replay?.replayed) return replay;
    const state = input.travel_state;
    const sources = validateResolvedTimeSources(input);
    const signals = canonicalSignals(input);
    if (state.party_id !== input.party_id || state.execution_id !== input.execution_id ||
      state.step_ordinal !== input.step_ordinal || state.next_interval_ordinal !== input.interval_ordinal ||
      state.progress_ppm !== input.progress_before_ppm || !Number.isInteger(input.progress_before_ppm) ||
      !Number.isInteger(input.planned_progress_after_ppm) || input.progress_before_ppm < 0 ||
      input.progress_before_ppm >= 1_000_000 || input.planned_progress_after_ppm <= input.progress_before_ppm ||
      input.planned_progress_after_ppm > 1_000_000 || !positiveRational(input.planned_time) || !isRational(input.actual_time) ||
      !isRational(input.cumulative_before) || !sameRational(input.cumulative_before, state.cumulative_actual_time) || !signals) {
      return typedError('travel_interval_conflict', { execution_id: input.execution_id });
    }
    if (!sources.ok) return typedError(sources.code, { execution_id: input.execution_id });

    const requestedActualAfter = input.actual_progress_after_ppm ?? input.planned_progress_after_ppm;
    if (!Number.isInteger(requestedActualAfter) || requestedActualAfter < input.progress_before_ppm || requestedActualAfter > input.planned_progress_after_ppm) {
      return typedError('travel_interval_conflict', { execution_id: input.execution_id });
    }
    let outcome = intervalOutcome(signals, requestedActualAfter);
    let actual = normalized(input.actual_time);
    let actualAfter = requestedActualAfter;
    if (outcome === 'blocked_before_progress') { actual = zero(); actualAfter = input.progress_before_ppm; }
    if (outcome !== 'segment_completed' && actualAfter === 1_000_000) return typedError('travel_interruption_unresolved', { execution_id: input.execution_id });
    if (outcome === 'interrupted_at_anchor' && !signals.interruption_anchor_id) return typedError('travel_interruption_unresolved', { execution_id: input.execution_id });
    if (compareRational(actual, input.planned_time) > 0 ||
      (outcome === 'progressed' && (!actual.numerator || actualAfter <= input.progress_before_ppm)) ||
      (outcome === 'segment_completed' && (!actual.numerator || actualAfter !== 1_000_000)) ||
      (outcome === 'blocked_before_progress' && (actual.numerator || actualAfter !== input.progress_before_ppm || sources.delays.length))) {
      return typedError('travel_interruption_unresolved', { execution_id: input.execution_id });
    }
    const shared = input.clock_commit_mode === 'shared_root_transport_clock';
    if ((shared && !stableId(input.synchronized_time_slice_result_id)) || (!shared && input.synchronized_time_slice_result_id != null)) return typedError('travel_interval_conflict', { execution_id: input.execution_id });
    const clock = shared ? null : advanceExactClock(input.world_time_before, actual);
    const cumulativeBefore = normalized(input.cumulative_before);
    const cumulativeAfter = addRational(cumulativeBefore, actual);
    const result = sealed({
      id: input.id || `${input.execution_id}:${input.step_ordinal}:${input.interval_ordinal}`,
      route_plan_execution_id: input.execution_id, plan_step_ordinal: input.step_ordinal, interval_ordinal: input.interval_ordinal,
      progress_before_ppm: input.progress_before_ppm, planned_progress_after_ppm: input.planned_progress_after_ppm, actual_progress_after_ppm: actualAfter,
      planned_time: normalized(input.planned_time), actual_time: actual, cumulative_time_before: cumulativeBefore, cumulative_time_after: cumulativeAfter,
      ...rationalFields('planned_time', input.planned_time), ...rationalFields('actual_time', actual),
      ...rationalFields('cumulative_time_before', cumulativeBefore), ...rationalFields('cumulative_time_after', cumulativeAfter),
      crossed_whole_minute_boundaries: clock?.crossed_whole_minute_boundaries ?? 0,
      clock_commit_mode: shared ? 'shared_root_transport_clock' : 'direct_party_clock',
      synchronized_time_slice_result_id: shared ? input.synchronized_time_slice_result_id : null,
      dynamic_snapshot: clone(input.dynamic_snapshot), resolved_factors: sources.factors, resolved_delays: sources.delays,
      dynamic_dependency_pins: clone(input.dynamic_dependency_pins), execution_context_snapshot: clone(input.execution_context_snapshot),
      result_kind: outcome, result_code: input.result_code || outcome,
      navigation_resolution: input.navigation_resolution ? clone(input.navigation_resolution) : null,
      hazard_resolution: input.hazard_resolution ? clone(input.hazard_resolution) : null,
      outcome_composition_policy_version: input.outcome_composition_policy_version || 'p19-target-11.6',
      outcome_composition_trace_digest: input.outcome_composition_trace_digest || computeSpatialV3CanonicalDigest({ signals, outcome }),
      interruption_anchor_id: outcome === 'interrupted_at_anchor' ? signals.interruption_anchor_id : null,
      result_change_set_id: input.change_set_id, idempotency_record_id: input.idempotency_record_id,
      occurred_at_turn: input.occurred_at_turn
    });
    const transition = stateForOutcome(state, outcome);
    const travelState = sealed({ ...clone(payloadOf(state)), progress_ppm: actualAfter, cumulative_actual_time: cumulativeAfter,
      next_interval_ordinal: input.interval_ordinal + 1, ...transition });
    const output = deepFreeze({ ok: true, result, clock_update: clock, travel_state: travelState,
      write_proposal: deepFreeze({ appends: [result], updates: [travelState] }) });
    replays.set(replay.key, { input_digest: replay.input_digest, result: output });
    return output;
  }

  function resolveSynchronizedSlice(input = {}) {
    const root = input.root;
    const locals = input.locals;
    if (!isRecord(input) || !stableId(input.id) || !stableId(input.party_id) || !stableId(input.root_transport_execution_id) ||
      !stableId(input.change_set_id) || !stableId(input.idempotency_record_id) || !sealedPinSet(input.dependency_pins) ||
      !sealedExecutionState(input.atomic_trace, ['root_result_id', 'root_transport_execution_id', 'local_result_ids', 'change_set_id', 'idempotency_record_id']) ||
      input.atomic_trace.root_transport_execution_id !== input.root_transport_execution_id || input.atomic_trace.change_set_id !== input.change_set_id ||
      input.atomic_trace.idempotency_record_id !== input.idempotency_record_id || !Array.isArray(input.atomic_trace.local_result_ids) ||
      !sealedRecord(root) || !stableId(root.id) || root.party_id !== input.party_id || !stableId(root.route_plan_execution_id) ||
      root.route_plan_execution_id !== input.root_transport_execution_id || !isRational(root.actual_time) || !isRational(input.world_time_before) || !Array.isArray(locals)) {
      return typedError('time_accumulator_invalid');
    }
    if (input.atomic_trace.root_result_id !== root.id || input.atomic_trace.local_result_ids.length !== locals.length ||
      !locals.every((local, index) => sealedRecord(local) && local.party_id === input.party_id && stableId(local.id) && input.atomic_trace.local_result_ids[index] === local.id)) {
      return typedError('time_accumulator_invalid');
    }
    const elapsed = normalized(root.actual_time);
    const rootBlocked = root.result_kind === 'blocked_before_progress';
    if (rootBlocked && (elapsed.numerator !== 0 || locals.length !== 0)) return typedError('time_accumulator_invalid');
    for (const local of locals) {
      const controlZero = ['blocked', 'paused', 'failed'].includes(local?.result_kind) && isRational(local?.actual_time) && local.actual_time.numerator === 0;
      if (!local || !isRational(local.actual_time) || (!sameRational(local.actual_time, elapsed) && !controlZero) ||
        (local.result_kind === 'blocked' && local.actual_time.numerator !== 0) ||
        (elapsed.numerator === 0 && !controlZero)) return typedError('time_accumulator_invalid');
    }
    const clock = advanceExactClock(input.world_time_before, elapsed);
    const slice = sealed({
      id: input.id,
      party_id: input.party_id,
      root_transport_execution_id: input.root_transport_execution_id,
      root_traversal_interval_result_id: root.id,
      exact_elapsed: elapsed, ...rationalFields('exact_elapsed', elapsed),
      world_time_before: normalized(input.world_time_before), world_time_after: clock.exact_minutes,
      crossed_whole_minute_boundaries: clock.crossed_whole_minute_boundaries,
      dependency_pins: clone(input.dependency_pins),
      result_change_set_id: input.change_set_id,
      idempotency_record_id: input.idempotency_record_id,
      carrier_local_result_refs: locals.map((local) => ({ entity_kind: local.activity_execution_id ? 'party_timed_activity_attempt' : 'party_traversal_interval_result', entity_id: local.id }))
    });
    const rootResult = sealed({ ...clone(payloadOf(root)), clock_commit_mode: 'direct_party_clock', synchronized_time_slice_result_id: slice.id,
      crossed_whole_minute_boundaries: clock.crossed_whole_minute_boundaries });
    const localResults = deepFreeze(locals.map((local) => sealed({ ...clone(payloadOf(local)), clock_commit_mode: 'shared_root_transport_clock',
      synchronized_time_slice_result_id: slice.id, crossed_whole_minute_boundaries: 0 })));
    return deepFreeze({ ok: true, slice, root_result: rootResult, local_results: localResults,
      clock_update: clock, write_proposal: deepFreeze({ appends: [slice, rootResult, ...localResults], updates: [] }) });
  }

  return deepFreeze({ executeImmediateAction, resolveTimedActivity, createActivitySuccessor, startTraversal, resolveTraversalInterval, resolveSynchronizedSlice });
}
