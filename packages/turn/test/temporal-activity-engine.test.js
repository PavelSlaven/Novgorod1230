import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3ExecutionEngine } from '../src/spatial-v3-execution.js';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

const seal = (payload) => ({ ...payload, canonical_digest: computeSpatialV3CanonicalDigest(payload) });
const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const timestamp = (whole = '0', numerator = '0', denominator = '1') => ({
  whole_minutes: whole,
  subminute_numerator: numerator,
  subminute_denominator: denominator
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version: 'v1'
});
const pins = seal({
  pins: [{
    dependency_role: 'activity_contract',
    entity_ref: ref('activity_profile', 'profile'),
    version_pin: { pin_kind: 'authoring_version', authoring_version: 'v1' }
  }]
});
const policyRef = (id) => versioned('activity_contract', id);
const progress = (current, required = '2') => seal({
  unit_id: 'work_unit',
  current: rational(current),
  required: rational(required)
});
const participant = (endedAt = null) => ({
  participant_ref: ref('actor', 'helper'),
  role_id: 'helper',
  attendance_started_at: timestamp(),
  ...(endedAt ? { attendance_ended_at: endedAt } : {}),
  contribution_policy_ref: policyRef('participant-contribution'),
  state_version: endedAt ? '2' : '1'
});
const resource = (bindingKind = 'consumable_input', quantity = '1') => ({
  resource_ref: ref('item', 'wood'),
  unit_id: 'piece',
  quantity: rational(quantity),
  binding_kind: bindingKind,
  consumption_policy_ref: policyRef('consume-once'),
  state_version: '1'
});

function activitySnapshot(completionModel) {
  const model = seal(completionModel);
  return seal({
    activity_profile_ref: seal({
      profile_ref: versioned('activity_profile', 'profile')
    }),
    completion_model_snapshot: model,
    progress_policy_ref: policyRef('progress'),
    resource_policy_ref: policyRef('resources'),
    participant_policy_ref: policyRef('participants'),
    continuation_policy_ref: policyRef('continuation'),
    interruption_policy_ref: policyRef('interruption'),
    completion_policy_ref: policyRef('completion'),
    same_timestamp_policy_ref: policyRef('same-time'),
    body_intensity_profile_ref: versioned('hazard_profile', 'body-intensity'),
    perception_visibility_policy_ref: versioned('visibility_modifier', 'activity-visibility'),
    recheck_policy_ref: versioned('dynamic_recheck_policy', 'activity-recheck'),
    dependency_pins: pins
  });
}

function plan(instance, model, extra = {}) {
  return instance.planTimedActivity({
    party_id: 'party',
    activity_execution_id: extra.activity_execution_id ?? 'activity',
    route_plan_execution_id: 'route-execution',
    plan_step_ordinal: 0,
    series_ordinal: 0,
    change_set_id: 'change-1',
    started_at: timestamp(),
    preconditions_digest: 'a'.repeat(64),
    state_version: '1',
    activity_snapshot: activitySnapshot(model),
    participant_bindings: extra.participant_bindings ?? [],
    resource_bindings: extra.resource_bindings ?? [],
    ...(extra.initial_progress ? { initial_progress: extra.initial_progress } : {})
  });
}

function boundaryCandidate(state, at = state.next_boundary_at, suffix = 'boundary') {
  return {
    boundary_id: `${state.id}:${suffix}`,
    boundary_kind: 'activity',
    scheduled_at: at,
    source_ref: ref('party_timed_activity_execution', state.id),
    primary_subject_ref: ref('party_timed_activity_execution', state.id),
    scope_ref: ref('party', 'party'),
    rule_ref: policyRef('activity-boundary-rule'),
    policy_ref: policyRef('activity-boundary-policy'),
    preconditions_digest: state.preconditions_digest,
    resolution_class: 'execution_outcome',
    interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier', 'activity-boundary-visibility'),
    idempotency_key: `${state.id}:${suffix}`,
    subject_refs: [],
    causal_parent_refs: []
  };
}

function boundaryResolution(candidate, outcome, extra = {}) {
  return seal({
    boundary_id: candidate.boundary_id,
    scheduled_at: candidate.scheduled_at,
    preconditions_digest: candidate.preconditions_digest,
    outcome,
    reason_code: extra.reason_code ?? outcome,
    dependency_pins: pins,
    ...extra
  });
}

function planSlice(instance, state, attemptOrdinal = null) {
  const ordinal = attemptOrdinal ?? state.next_attempt_ordinal;
  return instance.planActivitySlice({
    activity_execution: state,
    expected_state_version: state.state_version,
    world_time_before: state.last_processed_at,
    attempt_ordinal: ordinal,
    idempotency_record_id: `idempotency-${state.id}-${ordinal}`
  });
}

function interruptionOutcome(state, candidate, outcomeKind, exactMinutes = rational('0')) {
  return {
    interruption_level: 'background',
    outcome_kind: outcomeKind,
    execution_ref: ref('party_timed_activity_execution', state.id),
    boundary_ref: ref('temporal_boundary_candidate', candidate.boundary_id),
    elapsed: { exact_minutes: exactMinutes },
    reason_code: `${outcomeKind}_after_dependency_change`,
    progress_preservation_policy_ref: policyRef('preserve-progress'),
    resource_preservation_policy_ref: policyRef('preserve-resources'),
    player_decision_required: false,
    dependency_pins: pins
  };
}

function applyBoundary(instance, state, outcome, extra = {}) {
  const sliceResult = extra.sliceResult ?? planSlice(instance, state, extra.attemptOrdinal ?? 0);
  assert.equal(sliceResult.ok, true);
  const candidate = extra.candidate ?? boundaryCandidate(state);
  const resolution = extra.resolution ?? boundaryResolution(candidate, outcome, extra.resolutionFields);
  const input = {
    party_id: 'party',
    activity_execution: state,
    expected_state_version: state.state_version,
    slice: sliceResult.slice,
    actual_elapsed: sliceResult.slice.planned_elapsed,
    boundary_candidate: candidate,
    boundary_resolution: resolution,
    idempotency_record_id: sliceResult.slice.idempotency_record_id,
    change_set_id: extra.change_set_id ?? 'change-2'
  };
  return { input, result: instance.applyActivityElapsed(input) };
}

function assertContract(name, value) {
  assert.deepEqual(validateSpatialV3Contract(name, value), [], `${name} must match the current formal contract`);
}

test('wait completes at its exact approved boundary and emits current formal DTOs', () => {
  const instance = createSpatialV3ExecutionEngine();
  const snapshot = activitySnapshot({ kind: 'fixed_exact', fixed_duration: rational('1') });
  assert.deepEqual(validateSpatialV3Contract('timed_activity_static_snapshot', snapshot), []);
  const created = instance.planTimedActivity({
    party_id: 'party',
    activity_execution_id: 'activity',
    route_plan_execution_id: 'route-execution',
    plan_step_ordinal: 0,
    series_ordinal: 0,
    change_set_id: 'change-1',
    started_at: timestamp(),
    preconditions_digest: 'a'.repeat(64),
    state_version: '1',
    activity_snapshot: snapshot,
    participant_bindings: [],
    resource_bindings: []
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  assertContract('party_timed_activity_execution', created.activity_execution);
  assert.deepEqual(created.activity_execution.next_boundary_at, timestamp('1'));
  assert.equal(created.activity_execution.next_attempt_ordinal, 0);

  const { result } = applyBoundary(instance, created.activity_execution, 'completed');
  assert.equal(result.ok, true);
  assert.equal(result.activity_execution.status, 'completed');
  assert.equal(result.activity_execution.next_attempt_ordinal, 1);
  assert.deepEqual(result.activity_execution.last_processed_at, timestamp('1'));
  assertContract('party_timed_activity_execution', result.activity_execution);
  assertContract('party_timed_activity_attempt', result.attempt);
});

test('condition sleep rechecks and progress work preserves exact partial progress', () => {
  const conditionEngine = createSpatialV3ExecutionEngine();
  const sleeping = plan(conditionEngine, {
    kind: 'condition_or_deadline',
    completion_condition_ref: versioned('condition_set', 'rested'),
    hard_deadline_at: timestamp('3'),
    hard_deadline_policy_ref: policyRef('sleep-deadline'),
    next_recheck_at: timestamp('1')
  }, { activity_execution_id: 'sleep' });
  const conditionCandidate = boundaryCandidate(sleeping.activity_execution);
  const conditionResolution = boundaryResolution(conditionCandidate, 'progressed', {
    condition_met: false,
    next_boundary_at: timestamp('2')
  });
  const conditionResult = applyBoundary(conditionEngine, sleeping.activity_execution, 'progressed', {
    candidate: conditionCandidate,
    resolution: conditionResolution
  }).result;
  assert.equal(conditionResult.activity_execution.status, 'active');
  assert.deepEqual(conditionResult.activity_execution.next_boundary_at, timestamp('2'));

  const workEngine = createSpatialV3ExecutionEngine();
  const working = plan(workEngine, {
    kind: 'progress_target',
    progress_target_ref: versioned('activity_contract', 'wall-complete'),
    next_recheck_at: timestamp('1')
  }, { activity_execution_id: 'work', initial_progress: progress('0') });
  const progressCandidate = boundaryCandidate(working.activity_execution);
  const progressResolution = boundaryResolution(progressCandidate, 'progressed', {
    progress_after: progress('1'),
    next_boundary_at: timestamp('2')
  });
  const progressResult = applyBoundary(workEngine, working.activity_execution, 'progressed', {
    candidate: progressCandidate,
    resolution: progressResolution
  }).result;
  assert.deepEqual(progressResult.activity_execution.progress.current, rational('1'));
  assertContract('party_timed_activity_attempt', progressResult.attempt);
});

test('resource consumption is formal, proposed once, and persisted replay survives a new engine', () => {
  const instance = createSpatialV3ExecutionEngine();
  const created = plan(instance, { kind: 'fixed_exact', fixed_duration: rational('1') }, {
    activity_execution_id: 'consume',
    resource_bindings: [resource()]
  });
  const candidate = boundaryCandidate(created.activity_execution);
  const resolution = boundaryResolution(candidate, 'completed', {
    resource_consumptions: [resource('consumable_input', '1')]
  });
  const first = applyBoundary(instance, created.activity_execution, 'completed', { candidate, resolution });
  assert.equal(first.result.ok, true);
  assertContract('resource_binding', first.result.attempt.resource_consumptions[0]);
  assert.equal(first.result.write_proposal.appends.filter((entry) => entry === first.result.attempt).length, 1);

  const persistedRecord = {
    id: first.input.idempotency_record_id,
    party_id: 'party',
    operation_kind: 'activity_elapsed',
    idempotency_key: candidate.idempotency_key,
    canonical_input_digest: first.result.idempotency.canonical_input_digest,
    expected_state_versions_digest: first.result.idempotency.expected_state_versions_digest,
    result_change_set_id: 'change-2',
    status: 'committed',
    state_version: 1
  };
  assertContract('idempotency_record', persistedRecord);
  const replay = createSpatialV3ExecutionEngine().applyActivityElapsed({
    ...first.input,
    persisted_replay: { record: persistedRecord, result: first.result }
  });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.attempt, first.result.attempt);
  assert.equal(replay.activity_execution.next_attempt_ordinal, 1);
  const conflict = createSpatialV3ExecutionEngine().applyActivityElapsed({
    ...first.input,
    change_set_id: 'different-change',
    persisted_replay: { record: persistedRecord, result: first.result }
  });
  assert.equal(conflict.error.code, 'idempotency_conflict');
});

test('participant leave pauses at a current-time boundary; resume and abort stay explicit', () => {
  const instance = createSpatialV3ExecutionEngine();
  const created = plan(instance, {
    kind: 'condition_or_deadline',
    completion_condition_ref: versioned('condition_set', 'work-complete'),
    next_recheck_at: timestamp('1')
  }, { activity_execution_id: 'group-work', participant_bindings: [participant()] });
  const currentCandidate = boundaryCandidate(created.activity_execution, timestamp(), 'participant-left');
  const currentResolution = boundaryResolution(currentCandidate, 'paused', {
    participant_bindings_after: [participant(timestamp())],
    reason_code: 'required_participant_left'
  });
  const paused = instance.resolveParticipantChange({
    party_id: 'party',
    activity_execution: created.activity_execution,
    expected_state_version: '1',
    boundary_candidate: currentCandidate,
    boundary_resolution: currentResolution,
    interruption_outcome: interruptionOutcome(created.activity_execution, currentCandidate, 'pause'),
    attempt_ordinal: 0,
    idempotency_record_id: 'participant-left-record',
    change_set_id: 'change-2'
  });
  assert.equal(paused.ok, true, JSON.stringify(paused));
  assert.equal(paused.activity_execution.status, 'paused');
  assertContract('party_timed_activity_attempt', paused.attempt);

  const resumed = instance.resumeActivity({
    activity_execution: paused.activity_execution,
    expected_state_version: '2',
    resumed_at: timestamp('1'),
    next_boundary_at: timestamp('2'),
    precondition_check: seal({
      valid: true,
      preconditions_digest: 'b'.repeat(64),
      dependency_pins: pins
    }),
    change_set_id: 'change-3'
  });
  assert.equal(resumed.activity_execution.status, 'active');
  assert.deepEqual(resumed.activity_execution.next_boundary_at, timestamp('2'));
  const aborted = instance.abortActivity({
    activity_execution: resumed.activity_execution,
    expected_state_version: '3',
    change_set_id: 'change-4',
    reason_code: 'player_aborted'
  });
  assert.equal(aborted.activity_execution.status, 'aborted');
  assert.equal(aborted.write_proposal.appends.length, 0);
  assertContract('party_timed_activity_execution', aborted.activity_execution);
});

test('precondition invalidation is a failed attempt, never a persisted status', () => {
  const instance = createSpatialV3ExecutionEngine();
  const created = plan(instance, { kind: 'fixed_exact', fixed_duration: rational('1') }, {
    activity_execution_id: 'invalidated',
    resource_bindings: [resource('required_tool')]
  });
  const currentCandidate = boundaryCandidate(created.activity_execution, timestamp(), 'tool-lost');
  const currentResolution = boundaryResolution(currentCandidate, 'failed', {
    failure_class: 'precondition_invalidated',
    reason_code: 'required_tool_lost',
    resource_bindings_after: []
  });
  const failed = instance.resolveResourceChange({
    party_id: 'party',
    activity_execution: created.activity_execution,
    expected_state_version: '1',
    boundary_candidate: currentCandidate,
    boundary_resolution: currentResolution,
    interruption_outcome: interruptionOutcome(created.activity_execution, currentCandidate, 'fail'),
    attempt_ordinal: 0,
    idempotency_record_id: 'tool-lost-record',
    change_set_id: 'change-2'
  });
  assert.equal(failed.ok, true, JSON.stringify(failed));
  assert.equal(failed.activity_execution.status, 'failed');
  assert.equal(failed.attempt.failure_class, 'precondition_invalidated');
  assert.equal(Object.hasOwn(failed.activity_execution, 'failure_class'), false);
  assertContract('party_timed_activity_attempt', failed.attempt);
});

test('participant and resource changes require formal continue, pause, or fail outcomes', () => {
  const scenarios = [
    ['participant', 'continue', 'progressed'],
    ['participant', 'pause', 'paused'],
    ['participant', 'fail', 'failed'],
    ['resource', 'continue', 'progressed'],
    ['resource', 'pause', 'paused'],
    ['resource', 'fail', 'failed']
  ];
  for (const [kind, outcomeKind, boundaryOutcome] of scenarios) {
    const instance = createSpatialV3ExecutionEngine();
    const created = plan(instance, {
      kind: 'condition_or_deadline',
      completion_condition_ref: versioned('condition_set', 'work-complete'),
      next_recheck_at: timestamp('1')
    }, {
      activity_execution_id: `${kind}-${outcomeKind}`,
      participant_bindings: [participant()],
      resource_bindings: [resource('required_tool')]
    });
    const candidate = boundaryCandidate(created.activity_execution, timestamp(), `${kind}-${outcomeKind}`);
    const resolution = boundaryResolution(candidate, boundaryOutcome, {
      ...(outcomeKind === 'continue' ? { next_boundary_at: timestamp('1') } : {}),
      ...(outcomeKind === 'fail' ? { failure_class: 'precondition_invalidated' } : {}),
      participant_bindings_after: kind === 'participant' ? [participant(timestamp())] : [participant()],
      resource_bindings_after: kind === 'resource' ? [] : [resource('required_tool')]
    });
    const resolve = kind === 'participant'
      ? instance.resolveParticipantChange
      : instance.resolveResourceChange;
    const result = resolve({
      party_id: 'party',
      activity_execution: created.activity_execution,
      expected_state_version: '1',
      boundary_candidate: candidate,
      boundary_resolution: resolution,
      interruption_outcome: interruptionOutcome(created.activity_execution, candidate, outcomeKind),
      attempt_ordinal: 0,
      idempotency_record_id: `${kind}-${outcomeKind}-record`,
      change_set_id: `${kind}-${outcomeKind}-change`
    });
    assert.equal(result.ok, true, `${kind}/${outcomeKind}: ${JSON.stringify(result)}`);
    assert.equal(result.activity_execution.status, outcomeKind === 'continue' ? 'active' : boundaryOutcome);
    if (outcomeKind === 'continue') {
      assert.equal(result.attempt, undefined);
      assert.equal(result.activity_execution.next_attempt_ordinal, 0);
    } else {
      assertContract('party_timed_activity_attempt', result.attempt);
      assert.equal(result.activity_execution.next_attempt_ordinal, 1);
    }
  }

  const instance = createSpatialV3ExecutionEngine();
  const created = plan(instance, { kind: 'fixed_exact', fixed_duration: rational('1') });
  const candidate = boundaryCandidate(created.activity_execution, timestamp(), 'missing-outcome');
  const rejected = instance.resolveParticipantChange({
    party_id: 'party',
    activity_execution: created.activity_execution,
    expected_state_version: '1',
    boundary_candidate: candidate,
    boundary_resolution: boundaryResolution(candidate, 'paused', {
      participant_bindings_after: [participant(timestamp())]
    }),
    attempt_ordinal: 0,
    idempotency_record_id: 'missing-formal-outcome',
    change_set_id: 'missing-formal-outcome-change'
  });
  assert.equal(rejected.error.code, 'activity_policy_gap');
});

test('attempt ordinals are contiguous across committed state and reload', () => {
  const firstEngine = createSpatialV3ExecutionEngine();
  const created = plan(firstEngine, {
    kind: 'condition_or_deadline',
    completion_condition_ref: versioned('condition_set', 'work-complete'),
    next_recheck_at: timestamp('1')
  }, { activity_execution_id: 'ordinal-activity' });
  const firstCandidate = boundaryCandidate(created.activity_execution);
  const firstResolution = boundaryResolution(firstCandidate, 'progressed', {
    condition_met: false,
    next_boundary_at: timestamp('2')
  });
  const first = applyBoundary(firstEngine, created.activity_execution, 'progressed', {
    candidate: firstCandidate,
    resolution: firstResolution,
    attemptOrdinal: 0
  }).result;
  assert.equal(first.ok, true);
  assert.equal(first.activity_execution.next_attempt_ordinal, 1);

  const reloadedEngine = createSpatialV3ExecutionEngine();
  assert.equal(planSlice(reloadedEngine, first.activity_execution, 0).error.code, 'activity_precondition_stale');
  assert.equal(planSlice(reloadedEngine, first.activity_execution, 2).error.code, 'activity_precondition_stale');
  const contiguous = planSlice(reloadedEngine, first.activity_execution, 1);
  assert.equal(contiguous.ok, true, JSON.stringify(contiguous));
  assert.equal(contiguous.slice.attempt_ordinal, 1);
});

test('malformed profiles, stale versions, and arbitrary partial elapsed hard-fail', () => {
  const malformed = createSpatialV3ExecutionEngine().planTimedActivity({
    party_id: 'party',
    activity_execution_id: 'bad',
    route_plan_execution_id: 'route-execution',
    plan_step_ordinal: 0,
    series_ordinal: 0,
    change_set_id: 'change',
    started_at: timestamp(),
    preconditions_digest: 'a'.repeat(64),
    state_version: '1',
    activity_snapshot: seal({ completion_model_snapshot: seal({ kind: 'fixed_exact', fixed_duration: rational('1') }) })
  });
  assert.equal(malformed.error.code, 'activity_profile_gap');

  const instance = createSpatialV3ExecutionEngine();
  const created = plan(instance, { kind: 'fixed_exact', fixed_duration: rational('1') });
  assert.equal(instance.planActivitySlice({
    activity_execution: created.activity_execution,
    expected_state_version: '9',
    world_time_before: timestamp(),
    attempt_ordinal: 0,
    idempotency_record_id: 'stale'
  }).error.code, 'activity_precondition_stale');
  const slice = planSlice(instance, created.activity_execution).slice;
  const candidate = boundaryCandidate(created.activity_execution);
  const resolution = boundaryResolution(candidate, 'completed');
  const partial = instance.applyActivityElapsed({
    party_id: 'party',
    activity_execution: created.activity_execution,
    expected_state_version: '1',
    slice,
    actual_elapsed: rational('1', '2'),
    boundary_candidate: candidate,
    boundary_resolution: resolution,
    idempotency_record_id: slice.idempotency_record_id,
    change_set_id: 'change-2'
  });
  assert.equal(partial.error.code, 'activity_transition_invalid');
});
