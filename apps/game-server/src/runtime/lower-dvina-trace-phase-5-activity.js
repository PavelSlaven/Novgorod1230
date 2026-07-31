import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from
  '@rus/contracts/spatial-v3/registry';
import {
  addElapsedTime,
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { selectEarliestTemporalBoundaryBatch } from
  '@rus/time-events-history/temporal-boundaries';
import { createSpatialV3ExecutionEngine } from
  '@rus/turn/spatial-v3-execution';
import {
  phase5ActivityBoundary,
  phase5ActivitySnapshot,
  phase5BoundaryResolution,
  phase5DependencyPins,
  phase5InterruptionOutcome,
  phase5ParticipantBindings,
  phase5Progress,
  phase5ResourceBindings
} from './lower-dvina-trace-phase-5-activity-records.js';

const rational = (numerator, denominator = '1') => ({
  numerator: String(numerator), denominator: String(denominator)
});
const seal = (payload) => ({
  ...payload,
  canonical_digest: computeSpatialV3CanonicalDigest(payload)
});

export function planTracePhase5TreatmentSlice({
  state,
  contracts,
  inputDigest
}) {
  const prior = state.phase5_treatment?.activity_execution ?? null;
  const current = Number(prior?.progress?.current?.numerator ?? 0);
  const activeStage = contracts.activity.treatment_stages.find(
    ({ ordinal }) => cumulative(contracts, ordinal) > current
  );
  if (!activeStage || current >= 25) {
    fail('TRACE_PHASE_5_ACTIVITY_ALREADY_TERMINAL');
  }
  const terminalEnd = addElapsedTime(state.clock, {
    exact_minutes: rational(25 - current)
  });
  const boundaryBatch = selectEarliestTemporalBoundaryBatch({
    from_timestamp: state.clock,
    limit_timestamp: terminalEnd,
    candidates: state.temporal_boundary_candidates ?? [],
    execution_requires_boundary: false
  });
  if (boundaryBatch?.is_current_timestamp_batch === true) {
    fail('TRACE_PHASE_5_EXTERNAL_BOUNDARY_PENDING', {
      boundary_ids: boundaryBatch.candidates.map(({ boundary_id: id }) => id)
    });
  }
  const externalComparison = boundaryBatch == null ? null
    : compareGameTimestamp(boundaryBatch.scheduled_at, terminalEnd);
  if (externalComparison === 0) {
    fail('TRACE_PHASE_5_SAME_TIME_TERMINAL_BOUNDARY_UNRESOLVED', {
      boundary_ids: boundaryBatch.candidates.map(({ boundary_id: id }) => id)
    });
  }
  const interruptedByExternal = externalComparison < 0;
  const sliceEnd = interruptedByExternal
    ? boundaryBatch.scheduled_at
    : terminalEnd;
  const sliceMinutes = Number(
    subtractGameTimestamp(sliceEnd, state.clock).numerator
  );
  if (!Number.isInteger(sliceMinutes) || sliceMinutes <= 0) {
    fail('TRACE_PHASE_5_TEMPORAL_SLICE_INVALID');
  }
  const ids = {
    execution: prior?.id
      ?? `activity:${state.party_id}:trace-phase5:treatment`,
    series: `series:${state.party_id}:trace-phase5:treatment`,
    attempt: prior?.next_attempt_ordinal ?? 0
  };
  const engine = createSpatialV3ExecutionEngine();
  let execution = prior;
  let resume = null;
  if (!execution) {
    const snapshot = phase5ActivitySnapshot(contracts, sliceEnd);
    const snapshotErrors = validateSpatialV3Contract(
      'timed_activity_static_snapshot', snapshot
    );
    if (snapshotErrors.length > 0) {
      fail('TRACE_PHASE_5_ACTIVITY_PROFILE_INVALID', snapshotErrors);
    }
    const planned = engine.planTimedActivity({
      party_id: state.party_id,
      activity_execution_id: ids.execution,
      route_plan_execution_id: ids.series,
      plan_step_ordinal: 0,
      series_ordinal: 0,
      change_set_id: `planned:${inputDigest.slice(0, 24)}`,
      started_at: state.clock,
      preconditions_digest: digest({
        predicate: contracts.activity.danger_predicate,
        state_version: state.party_state.state_version
      }),
      state_version: '1',
      activity_snapshot: snapshot,
      participant_bindings: phase5ParticipantBindings(state, contracts),
      resource_bindings: phase5ResourceBindings(state, contracts),
      initial_progress: phase5Progress(0)
    });
    if (!planned.ok) fail('TRACE_PHASE_5_ACTIVITY_PLAN_REJECTED', planned.error);
    execution = planned.activity_execution;
  } else if (execution.status === 'paused') {
    resume = engine.resumeActivity({
      activity_execution: execution,
      expected_state_version: execution.state_version,
      resumed_at: state.clock,
      next_boundary_at: sliceEnd,
      precondition_check: seal({
        valid: true,
        preconditions_digest: digest({
          predicate: contracts.activity.danger_predicate,
          state_version: state.party_state.state_version
        }),
        dependency_pins: phase5DependencyPins(contracts)
      }),
      change_set_id: `resume:${inputDigest.slice(0, 24)}`
    });
    if (!resume.ok) fail('TRACE_PHASE_5_ACTIVITY_RESUME_REJECTED', resume.error);
    execution = resume.activity_execution;
  }
  const candidate = phase5ActivityBoundary({
    execution,
    scheduledAt: sliceEnd,
    ordinal: ids.attempt,
    partyId: state.party_id,
    externalCandidates: interruptedByExternal
      ? boundaryBatch.candidates : []
  });
  const after = current + sliceMinutes;
  const final = after === 25 && !interruptedByExternal;
  const interrupted = interruptedByExternal;
  const completedStages = contracts.activity.treatment_stages.filter(
    ({ ordinal }) => {
      const boundary = cumulative(contracts, ordinal);
      return boundary > current && boundary <= after;
    }
  );
  const currentStage = completedStages.at(-1) ?? activeStage;
  const resolution = phase5BoundaryResolution({
    candidate,
    contracts,
    outcome: interrupted ? 'paused' : final ? 'completed' : 'progressed',
    progressAfter: phase5Progress(after),
    nextBoundaryAt: null,
    final,
    state
  });
  const common = {
    party_id: state.party_id,
    activity_execution: execution,
    expected_state_version: execution.state_version,
    boundary_candidate: candidate,
    boundary_resolution: resolution,
    attempt_ordinal: ids.attempt,
    idempotency_record_id:
      `activity-idem:${state.party_id}:phase5:${ids.attempt}:${inputDigest.slice(0, 16)}`,
    change_set_id: `activity-change:${inputDigest.slice(0, 24)}`
  };
  const applied = interrupted
    ? engine.resolveActivityInterruption({
        ...common,
        world_time_before: state.clock,
        interruption_outcome: phase5InterruptionOutcome({
          execution, candidate, contracts, elapsed: sliceMinutes
        })
      })
    : engine.resolveActivityBoundary({
        ...common,
        world_time_before: state.clock
      });
  if (!applied.ok) fail('TRACE_PHASE_5_ACTIVITY_SLICE_REJECTED', applied.error);
  return Object.freeze({
    execution_before: prior,
    resume_result: resume,
    activity_execution: applied.activity_execution,
    attempt: applied.attempt,
    stage: currentStage,
    completed_stages: structuredClone(completedStages),
    slice_minutes: sliceMinutes,
    progress_before: current,
    progress_after: after,
    stage_completed: completedStages.length > 0,
    final,
    interrupted,
    boundary_batch: boundaryBatch,
    activity_boundary_candidate: candidate,
    encountered_boundary_candidates: boundaryBatch != null
      && compareGameTimestamp(boundaryBatch.scheduled_at, sliceEnd) === 0
      ? structuredClone(boundaryBatch.candidates) : [],
    processed_boundary_ids: []
  });
}

function cumulative(contracts, ordinal) {
  return contracts.activity.treatment_stages
    .filter((stage) => stage.ordinal <= ordinal)
    .reduce((sum, stage) => sum + stage.duration_minutes, 0);
}

function digest(value) {
  return computeSpatialV3CanonicalDigest(value).replace('sha256:', '');
}

function fail(code, details = null) {
  const error = new Error('Phase 5 timed treatment failed closed.');
  error.code = code;
  error.details = details;
  throw error;
}
