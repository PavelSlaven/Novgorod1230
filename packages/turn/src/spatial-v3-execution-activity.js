import {
  addElapsedTime,
  addRationalMinutes,
  compareGameTimestamp,
  compareRationalMinutes,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  isGameTimestamp,
  isRational,
  isRecord,
  nonNegativeInteger,
  normalized,
  positiveDecimalString,
  positiveRational,
  sealedPinSet,
  sealedRecord,
  stableId
} from './spatial-v3-execution-validation.js';
import {
  clone,
  deepFreeze,
  sameRational,
  sealed,
  timestampEqual,
  zero
} from './spatial-v3-execution-support.js';
import {
  activityError,
  activityReplay,
  activitySnapshot,
  activityState,
  contractValid,
  exactKeys,
  expectedInterruptionBoundaryOutcome,
  expectedVersion,
  initialActivityBoundary,
  modelOf,
  nextStateVersion,
  validBoundaryCandidate,
  validBoundaryResolution,
  validInterruptionOutcome,
  validateBindings
} from './spatial-v3-execution-activity-support.js';

export function createSpatialV3ActivityExecution(replays) {
  function planTimedActivity(input = {}) {
    if (!isRecord(input) ||
      !stableId(input.party_id) ||
      !stableId(input.activity_execution_id) ||
      !stableId(input.route_plan_execution_id) ||
      !nonNegativeInteger(input.plan_step_ordinal) ||
      !nonNegativeInteger(input.series_ordinal) ||
      !stableId(input.change_set_id) ||
      !isGameTimestamp(input.started_at) ||
      !positiveDecimalString(input.state_version) ||
      !/^[a-f0-9]{64}$/iu.test(input.preconditions_digest ?? '')) {
      return activityError('activity_transition_invalid', { execution_id: input?.activity_execution_id });
    }
    if (!activitySnapshot(input.activity_snapshot)) {
      return activityError('activity_profile_gap', { execution_id: input.activity_execution_id });
    }
    const model = input.activity_snapshot.completion_model_snapshot;
    if ((model.kind === 'fixed_exact' && !positiveRational(model.fixed_duration)) ||
      (model.kind === 'progress_target' && input.initial_progress == null) ||
      (input.initial_progress != null && (!sealedRecord(input.initial_progress) ||
        !contractValid('activity_progress_snapshot', input.initial_progress) ||
        compareRationalMinutes(input.initial_progress.current, input.initial_progress.required) > 0 ||
        input.initial_progress.required.numerator === '0')) ||
      !validateBindings('participant_binding', input.participant_bindings ?? []) ||
      !validateBindings('resource_binding', input.resource_bindings ?? [])) {
      return activityError('activity_policy_gap', { execution_id: input.activity_execution_id });
    }
    const nextBoundary = initialActivityBoundary(input.started_at, model);
    if (!isGameTimestamp(nextBoundary) || compareGameTimestamp(nextBoundary, input.started_at) < 0) {
      return activityError('temporal_execution_unbounded', { execution_id: input.activity_execution_id });
    }
    const state = deepFreeze({
      id: input.activity_execution_id,
      route_plan_execution_id: input.route_plan_execution_id,
      plan_step_ordinal: input.plan_step_ordinal,
      series_ordinal: input.series_ordinal,
      ...(input.predecessor_activity_execution_id == null ? {} : { predecessor_activity_execution_id: input.predecessor_activity_execution_id }),
      activity_snapshot: clone(input.activity_snapshot),
      status: 'active',
      started_at: clone(input.started_at),
      last_processed_at: clone(input.started_at),
      next_boundary_at: clone(nextBoundary),
      exact_elapsed: zero(),
      next_attempt_ordinal: 0,
      ...(input.initial_progress == null ? {} : { progress: clone(input.initial_progress) }),
      preconditions_digest: input.preconditions_digest,
      state_version: input.state_version,
      updated_change_set_id: input.change_set_id,
      active_participant_bindings: clone(input.participant_bindings ?? []),
      reserved_resource_bindings: clone(input.resource_bindings ?? [])
    });
    if (!activityState(state)) return activityError('activity_transition_invalid', { execution_id: state.id });
    return deepFreeze({
      ok: true,
      activity_execution: state,
      write_proposal: deepFreeze({ appends: [state], updates: [] })
    });
  }

  function createActivitySlice({ state, worldTimeBefore, endsAt, attemptOrdinal, idempotencyRecordId }) {
    if (!activityState(state) ||
      state.status !== 'active' ||
      !isGameTimestamp(worldTimeBefore) ||
      !isGameTimestamp(endsAt) ||
      !timestampEqual(worldTimeBefore, state.last_processed_at) ||
      compareGameTimestamp(endsAt, worldTimeBefore) < 0 ||
      compareGameTimestamp(endsAt, state.next_boundary_at) > 0 ||
      !nonNegativeInteger(attemptOrdinal) ||
      attemptOrdinal !== state.next_attempt_ordinal ||
      !stableId(idempotencyRecordId)) return null;
    const plannedElapsed = subtractGameTimestamp(endsAt, worldTimeBefore);
    return sealed({
      activity_execution_id: state.id,
      attempt_ordinal: attemptOrdinal,
      started_at: clone(worldTimeBefore),
      planned_elapsed: plannedElapsed,
      ends_at: clone(endsAt),
      state_version: state.state_version,
      idempotency_record_id: idempotencyRecordId
    });
  }

  function planActivitySlice(input = {}) {
    const state = input.activity_execution;
    if (!isRecord(input) || !activityState(state) || state.status !== 'active') {
      return activityError('activity_transition_invalid', { execution_id: state?.id });
    }
    if (!expectedVersion(input, state)) {
      return activityError('activity_precondition_stale', { execution_id: state.id });
    }
    if (input.attempt_ordinal !== state.next_attempt_ordinal) {
      return activityError('activity_precondition_stale', { execution_id: state.id });
    }
    const slice = createActivitySlice({
      state,
      worldTimeBefore: input.world_time_before,
      endsAt: state.next_boundary_at,
      attemptOrdinal: input.attempt_ordinal,
      idempotencyRecordId: input.idempotency_record_id
    });
    if (!slice || !positiveRational(slice.planned_elapsed)) {
      return activityError('time_window_invalid', { execution_id: state.id });
    }
    return deepFreeze({ ok: true, slice });
  }

  function applyActivityElapsed(input = {}) {
    const state = input.activity_execution;
    const slice = input.slice;
    if (!isRecord(input) || !activityState(state) || state.status !== 'active') {
      return activityError('activity_transition_invalid', { execution_id: state?.id });
    }
    if (!expectedVersion(input, state)) {
      return activityError('activity_precondition_stale', { execution_id: state.id });
    }
    if (!sealedRecord(slice) ||
      slice.activity_execution_id !== state.id ||
      slice.state_version !== state.state_version ||
      !nonNegativeInteger(slice.attempt_ordinal) ||
      slice.attempt_ordinal !== state.next_attempt_ordinal ||
      !isGameTimestamp(slice.started_at) ||
      !isGameTimestamp(slice.ends_at) ||
      !isRational(slice.planned_elapsed) ||
      !stableId(slice.idempotency_record_id) ||
      slice.idempotency_record_id !== input.idempotency_record_id ||
      !stableId(input.change_set_id) ||
      !isRational(input.actual_elapsed) ||
      !sameRational(input.actual_elapsed, slice.planned_elapsed) ||
      !timestampEqual(addElapsedTime(slice.started_at, { exact_minutes: slice.planned_elapsed }), slice.ends_at) ||
      !validBoundaryCandidate(input.boundary_candidate, state, slice.ends_at) ||
      !validBoundaryResolution(input.boundary_resolution, input.boundary_candidate, state)) {
      return activityError('activity_transition_invalid', { execution_id: state.id });
    }
    const replay = activityReplay(replays, input, state);
    if (replay?.ok === false || replay?.replayed) return replay;
    if (!replay) return activityError('idempotency_conflict', { execution_id: state.id });

    const actual = normalized(input.actual_elapsed);
    const resolution = input.boundary_resolution;
    const model = modelOf(state);
    const elapsedAfter = addRationalMinutes(state.exact_elapsed, actual);
    const progressBefore = state.progress;
    const progressAfter = resolution.progress_after ?? progressBefore;
    if (model.kind === 'fixed_exact' && compareRationalMinutes(elapsedAfter, model.fixed_duration) > 0) {
      return activityError('activity_transition_invalid', { execution_id: state.id });
    }
    if (model.kind === 'progress_target') {
      if (!progressBefore || !progressAfter ||
        progressBefore.unit_id !== progressAfter.unit_id ||
        !sameRational(progressBefore.required, progressAfter.required) ||
        compareRationalMinutes(progressAfter.current, progressBefore.current) < 0 ||
        compareRationalMinutes(progressAfter.current, progressAfter.required) > 0) {
        return activityError('activity_policy_gap', { execution_id: state.id });
      }
    } else if (resolution.progress_after != null && progressBefore == null) {
      return activityError('activity_policy_gap', { execution_id: state.id });
    }
    if (model.kind === 'condition_or_deadline' &&
      ['progressed', 'completed'].includes(resolution.outcome) &&
      typeof resolution.condition_met !== 'boolean') {
      return activityError('activity_policy_gap', { execution_id: state.id });
    }

    const durationMet = model.kind === 'fixed_exact' && sameRational(elapsedAfter, model.fixed_duration);
    const targetMet = model.kind === 'progress_target' && sameRational(progressAfter.current, progressAfter.required);
    const conditionMet = model.kind === 'condition_or_deadline' && resolution.condition_met;
    const completionMet = durationMet || targetMet || conditionMet;
    const outcome = resolution.outcome;
    if ((outcome === 'completed' && !completionMet) ||
      (outcome === 'progressed' && (actual.numerator === '0' || completionMet)) ||
      (outcome === 'blocked' && (actual.numerator !== '0' ||
        (progressBefore != null && !sameRational(progressBefore.current, progressAfter.current)))) ||
      (outcome === 'failed' && resolution.failure_class != null && resolution.failure_class !== 'precondition_invalidated')) {
      return activityError('activity_transition_invalid', { execution_id: state.id });
    }
    const status = outcome === 'completed' ? 'completed'
      : outcome === 'failed' ? 'failed'
        : outcome === 'paused' ? 'paused'
          : 'active';
    if (status === 'active') {
      if (!isGameTimestamp(resolution.next_boundary_at) ||
        compareGameTimestamp(resolution.next_boundary_at, slice.ends_at) <= 0 ||
        (model.hard_deadline_at && compareGameTimestamp(resolution.next_boundary_at, model.hard_deadline_at) > 0)) {
        return activityError('temporal_execution_unbounded', { execution_id: state.id });
      }
    } else if (resolution.next_boundary_at != null) {
      return activityError('activity_transition_invalid', { execution_id: state.id });
    }

    const participantsAfter = clone(resolution.participant_bindings_after ?? state.active_participant_bindings ?? []);
    const resourcesAfter = clone(resolution.resource_bindings_after ?? state.reserved_resource_bindings ?? []);
    const updated = deepFreeze({
      ...clone(state),
      status,
      last_processed_at: clone(slice.ends_at),
      next_boundary_at: status === 'active' ? clone(resolution.next_boundary_at) : null,
      exact_elapsed: elapsedAfter,
      next_attempt_ordinal: state.next_attempt_ordinal + 1,
      ...(progressAfter == null ? {} : { progress: clone(progressAfter) }),
      preconditions_digest: resolution.preconditions_digest,
      state_version: nextStateVersion(state.state_version),
      updated_change_set_id: input.change_set_id,
      terminal_change_set_id: ['completed', 'failed'].includes(status) ? input.change_set_id : null,
      terminal_reason_code: ['completed', 'failed'].includes(status) ? resolution.reason_code : null,
      active_participant_bindings: participantsAfter,
      reserved_resource_bindings: resourcesAfter
    });
    const attempt = deepFreeze({
      activity_execution_id: state.id,
      attempt_ordinal: slice.attempt_ordinal,
      started_at: clone(slice.started_at),
      ended_at: clone(slice.ends_at),
      planned_elapsed: clone(slice.planned_elapsed),
      actual_elapsed: actual,
      ...(progressBefore == null ? {} : { progress_before: clone(progressBefore) }),
      ...(progressAfter == null ? {} : { progress_after: clone(progressAfter) }),
      outcome,
      reason_code: resolution.reason_code,
      ...(resolution.failure_class == null ? {} : { failure_class: resolution.failure_class }),
      rule_and_policy_pins: clone(resolution.dependency_pins),
      change_set_id: input.change_set_id,
      idempotency_record_id: input.idempotency_record_id,
      trace: {
        boundary_id: input.boundary_candidate.boundary_id,
        boundary_resolution_digest: resolution.canonical_digest,
        state_version_before: state.state_version
      },
      resource_reservations: clone(resolution.resource_reservations ?? []),
      resource_consumptions: clone(resolution.resource_consumptions ?? []),
      body_effect_refs: clone(resolution.body_effect_refs ?? []),
      participant_attendance: clone(resolution.participant_attendance ?? state.active_participant_bindings ?? [])
    });
    if (!activityState(updated) || !contractValid('party_timed_activity_attempt', attempt)) {
      return activityError('activity_transition_invalid', { execution_id: state.id });
    }
    const idempotency = deepFreeze({
      record_id: input.idempotency_record_id,
      operation_kind: 'activity_elapsed',
      idempotency_key: input.boundary_candidate.idempotency_key,
      canonical_input_digest: replay.input_digest,
      expected_state_versions_digest: replay.expected_state_versions_digest
    });
    const output = deepFreeze({
      ok: true,
      attempt,
      activity_execution: updated,
      idempotency,
      write_proposal: deepFreeze({
        appends: [attempt],
        updates: [updated],
        idempotency_claim: idempotency
      })
    });
    replays.set(replay.key, { input_digest: replay.input_digest, result: output });
    return output;
  }

  function resolveActivityBoundary(input = {}) {
    const state = input.activity_execution;
    const planned = input.slice == null
      ? planActivitySlice({
        activity_execution: state,
        expected_state_version: input.expected_state_version,
        world_time_before: input.world_time_before,
        attempt_ordinal: input.attempt_ordinal ?? state?.next_attempt_ordinal,
        idempotency_record_id: input.idempotency_record_id
      })
      : { ok: true, slice: input.slice };
    if (!planned.ok) return planned;
    return applyActivityElapsed({ ...input, slice: planned.slice, actual_elapsed: planned.slice.planned_elapsed });
  }

  function interruptionSlice(input, state) {
    const candidate = input.boundary_candidate;
    if (!validBoundaryCandidate(candidate, state, candidate?.scheduled_at)) return null;
    return createActivitySlice({
      state,
      worldTimeBefore: input.world_time_before ?? state.last_processed_at,
      endsAt: candidate.scheduled_at,
      attemptOrdinal: input.attempt_ordinal ?? state.next_attempt_ordinal,
      idempotencyRecordId: input.idempotency_record_id
    });
  }

  function resolveActivityInterruption(input = {}) {
    const state = input.activity_execution;
    if (!activityState(state) || state.status !== 'active') {
      return activityError('activity_transition_invalid', { execution_id: state?.id });
    }
    if (!expectedVersion(input, state)) {
      return activityError('activity_precondition_stale', { execution_id: state.id });
    }
    const outcome = input.interruption_outcome;
    const expectedBoundaryOutcome = expectedInterruptionBoundaryOutcome(outcome);
    if (input.boundary_resolution?.outcome !== expectedBoundaryOutcome) {
      return activityError('activity_policy_gap', { execution_id: state.id });
    }
    const slice = interruptionSlice(input, state);
    if (!slice) return activityError('activity_transition_invalid', { execution_id: state.id });
    if (!validInterruptionOutcome(outcome, state, input.boundary_candidate, slice.planned_elapsed)) {
      return activityError('activity_policy_gap', { execution_id: state.id });
    }
    if (outcome.outcome_kind !== 'continue' || slice.planned_elapsed.numerator !== '0') {
      const result = applyActivityElapsed({ ...input, slice, actual_elapsed: slice.planned_elapsed });
      return result.ok ? deepFreeze({ ...result, interruption_outcome: clone(outcome) }) : result;
    }
    if (!validBoundaryResolution(input.boundary_resolution, input.boundary_candidate, state) ||
      !isGameTimestamp(input.boundary_resolution.next_boundary_at) ||
      compareGameTimestamp(input.boundary_resolution.next_boundary_at, slice.ends_at) <= 0 ||
      input.boundary_resolution.progress_after != null ||
      (input.boundary_resolution.resource_reservations ?? []).length > 0 ||
      (input.boundary_resolution.resource_consumptions ?? []).length > 0 ||
      (input.boundary_resolution.body_effect_refs ?? []).length > 0) {
      return activityError('activity_transition_invalid', { execution_id: state.id });
    }
    const replay = activityReplay(replays, input, state);
    if (replay?.ok === false || replay?.replayed) return replay;
    if (!replay) return activityError('idempotency_conflict', { execution_id: state.id });
    const updated = deepFreeze({
      ...clone(state),
      next_boundary_at: clone(input.boundary_resolution.next_boundary_at),
      state_version: nextStateVersion(state.state_version),
      updated_change_set_id: input.change_set_id,
      active_participant_bindings: clone(input.boundary_resolution.participant_bindings_after ??
        state.active_participant_bindings ?? []),
      reserved_resource_bindings: clone(input.boundary_resolution.resource_bindings_after ??
        state.reserved_resource_bindings ?? [])
    });
    if (!activityState(updated)) return activityError('activity_transition_invalid', { execution_id: state.id });
    const idempotency = deepFreeze({
      record_id: input.idempotency_record_id,
      operation_kind: 'activity_elapsed',
      idempotency_key: input.boundary_candidate.idempotency_key,
      canonical_input_digest: replay.input_digest,
      expected_state_versions_digest: replay.expected_state_versions_digest
    });
    const output = deepFreeze({
      ok: true,
      activity_execution: updated,
      interruption_outcome: clone(outcome),
      idempotency,
      write_proposal: deepFreeze({
        appends: [],
        updates: [updated],
        idempotency_claim: idempotency
      })
    });
    replays.set(replay.key, { input_digest: replay.input_digest, result: output });
    return output;
  }

  function resumeActivity(input = {}) {
    const state = input.activity_execution;
    const check = input.precondition_check;
    if (!activityState(state) || state.status !== 'paused') {
      return activityError('activity_transition_invalid', { execution_id: state?.id });
    }
    if (!expectedVersion(input, state)) {
      return activityError('activity_precondition_stale', { execution_id: state.id });
    }
    if (!sealedRecord(check) ||
      !exactKeys(check, ['valid', 'preconditions_digest', 'dependency_pins', 'canonical_digest']) ||
      check.valid !== true ||
      !/^[a-f0-9]{64}$/iu.test(check.preconditions_digest ?? '') ||
      !sealedPinSet(check.dependency_pins) ||
      !isGameTimestamp(input.resumed_at) ||
      !isGameTimestamp(input.next_boundary_at) ||
      compareGameTimestamp(input.resumed_at, state.last_processed_at) < 0 ||
      compareGameTimestamp(input.next_boundary_at, input.resumed_at) <= 0 ||
      !stableId(input.change_set_id)) {
      return activityError('activity_policy_gap', { execution_id: state.id });
    }
    const updated = deepFreeze({
      ...clone(state),
      status: 'active',
      next_boundary_at: clone(input.next_boundary_at),
      preconditions_digest: check.preconditions_digest,
      state_version: nextStateVersion(state.state_version),
      updated_change_set_id: input.change_set_id,
      terminal_change_set_id: null,
      terminal_reason_code: null
    });
    if (!activityState(updated)) return activityError('activity_transition_invalid', { execution_id: state.id });
    return deepFreeze({
      ok: true,
      activity_execution: updated,
      write_proposal: deepFreeze({ appends: [], updates: [updated] })
    });
  }

  function abortActivity(input = {}) {
    const state = input.activity_execution;
    if (!activityState(state) || !['active', 'paused'].includes(state.status)) {
      return activityError('activity_transition_invalid', { execution_id: state?.id });
    }
    if (!expectedVersion(input, state)) {
      return activityError('activity_precondition_stale', { execution_id: state.id });
    }
    if (!stableId(input.change_set_id) || !stableId(input.reason_code)) {
      return activityError('activity_transition_invalid', { execution_id: state.id });
    }
    const updated = deepFreeze({
      ...clone(state),
      status: 'aborted',
      next_boundary_at: null,
      state_version: nextStateVersion(state.state_version),
      updated_change_set_id: input.change_set_id,
      terminal_change_set_id: input.change_set_id,
      terminal_reason_code: input.reason_code
    });
    if (!activityState(updated)) return activityError('activity_transition_invalid', { execution_id: state.id });
    return deepFreeze({
      ok: true,
      activity_execution: updated,
      write_proposal: deepFreeze({ appends: [], updates: [updated] })
    });
  }

  function resolveParticipantChange(input = {}) {
    if (!Array.isArray(input.boundary_resolution?.participant_bindings_after) ||
      !validateBindings('participant_binding', input.boundary_resolution.participant_bindings_after)) {
      return activityError('activity_policy_gap', { execution_id: input.activity_execution?.id });
    }
    return resolveActivityInterruption(input);
  }

  function resolveResourceChange(input = {}) {
    if (!Array.isArray(input.boundary_resolution?.resource_bindings_after) ||
      !validateBindings('resource_binding', input.boundary_resolution.resource_bindings_after)) {
      return activityError('activity_policy_gap', { execution_id: input.activity_execution?.id });
    }
    return resolveActivityInterruption(input);
  }

  return {
    planTimedActivity,
    activateTimedActivity: planTimedActivity,
    planActivitySlice,
    applyActivityElapsed,
    resolveActivityBoundary,
    resolveActivityInterruption,
    resumeActivity,
    abortActivity,
    resolveParticipantChange,
    resolveResourceChange
  };
}
