import {
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  createNpcActorStepCompletionEffect
} from '@rus/turn/temporal-advance';
import { tracePhase7ActorStep } from
  './lower-dvina-trace-phase-7-schedule-execution.js';
import { PHASE7_REST_PROGRESS_EFFECT_REF } from
  './lower-dvina-trace-phase-7-temporal-effect-owner.js';
import {
  buildTracePhase7TemporalRequest,
  TRACE_PHASE7_EXTERNAL_PROVIDER,
  TRACE_PHASE7_PROVIDER,
  tracePhase7TemporalVisibleEnvelope
} from './lower-dvina-trace-phase-7-temporal-request.js';
import { replaceLocalFireTemporalCandidates } from
  './lower-dvina-trace-local-fire-temporal.js';

export function resolveTracePhase7ScheduleTemporalAdvance({ state, temporal,
  actorStep, temporalAdvanceOwner, commandIdempotencyKey, rootTurnId,
  restLimitTimestamp = null, priorScheduleTemporal = null }) {
  if (typeof temporalAdvanceOwner?.advance !== 'function') {
    fail('TRACE_PHASE_7_TEMPORAL_OWNER_MISSING');
  }
  const composed = composedConversationAdvance({ state, actorStep, temporal });
  if (composed != null) return composed;
  const resumed = priorScheduleTemporal?.rest_completed === false;
  const priorResult = resumed ? priorScheduleTemporal.result : null;
  const projectionBefore = resumed
    ? priorScheduleTemporal.projection : actorStep.working_projection;
  const processed = new Set([
    ...(temporal.result.trace.processed_boundary_ids ?? []),
    ...(priorResult?.trace?.processed_boundary_ids ?? [])
  ]);
  const committedCandidates = (state.temporal_boundary_candidates ?? []).filter(
    ({ boundary_id: id }) => !processed.has(id)
  );
  const sourceCandidates=replaceLocalFireTemporalCandidates(
    committedCandidates,actorStep.working_projection,
    actorStep.local_fire_atomic_write_plans??[]);
  const request = buildTracePhase7TemporalRequest({
    state,
    executionId: temporal.execution_id,
    limit: restLimitTimestamp ?? temporal.limit_timestamp,
    commandIdempotencyKey,
    rootTurnId,
    clockBefore: temporal.result.clock_after,
    sourceCandidates,
    projection: structuredClone(projectionBefore),
    clockBefore: priorResult?.clock_after ?? temporal.result.clock_after,
    segment: 'schedule'
  });
  const activeBefore = tracePhase7ActorStep(
    projectionBefore, actorStep.result);
  const completionEffect = activeBefore.status === 'started'
    ? createNpcActorStepCompletionEffect({
        party_ref: { entity_kind: 'party', entity_id: state.party_id },
        active_actor_step: activeBefore,
        visibility_policy_ref: versioned('visibility_modifier',
          'lower-dvina-trace-phase-7-hidden-npc', '1')
      })
    : structuredClone(priorScheduleTemporal?.completion_effect);
  if (completionEffect?.candidate == null) {
    fail('TRACE_PHASE_7_SCHEDULE_TEMPORAL_INTERRUPTED');
  }
  const completion = completionEffect.candidate;
  const completionWithinRest = compareGameTimestamp(
    completion.scheduled_at, request.inclusive_limit_timestamp
  ) <= 0;
  const advanced = temporalAdvanceOwner.advance({
    request,
    engine_version: 'lower-dvina-trace-phase-7-temporal-adapter-v1',
    temporal_resolution_policy_version: 'temporal-resolution-v1',
    safety_limits: { max_slices: 20, max_candidates: 100,
      max_iterations: 100 },
    source_provider_ref: TRACE_PHASE7_EXTERNAL_PROVIDER,
    source_candidates: sourceCandidates,
    registered_provider_ref: TRACE_PHASE7_PROVIDER,
    registered_effects: completionWithinRest
      && activeBefore.status === 'started' ? [completionEffect] : [],
    continuous_effect: {
      effect_ref: PHASE7_REST_PROGRESS_EFFECT_REF,
      input: { execution_id: temporal.execution_id }
    },
    finalization: {
      visible_package_candidate: tracePhase7TemporalVisibleEnvelope(request),
      validation_report: { ok: true }
    },
    stop_after_source_batch: false
  });
  const segmentElapsed = exactIntegerElapsed(
    request.clock_before, advanced.result.clock_after
  );
  const elapsed = (priorScheduleTemporal?.elapsed_after_decision ?? 0)
    + segmentElapsed;
  const result = resumed
    ? cumulativeResult(priorResult, advanced.result)
    : advanced.result;
  const active = tracePhase7ActorStep(
    advanced.state_projection, actorStep.result);
  if (advanced.result.temporal_status === 'paused') {
    if (active?.npc_ref !== actorStep.result.npc_ref
        || !['started', 'completed'].includes(active?.status)) {
      fail('TRACE_PHASE_7_SCHEDULE_TEMPORAL_INTERRUPTED');
    }
    return Object.freeze({
      elapsed_after_decision: elapsed,
      rest_completed: false,
      result,
      projection: structuredClone(advanced.state_projection),
      completion_candidate: structuredClone(completion),
      completion_effect: structuredClone(completionEffect)
    });
  }
  const restCompleted = compareGameTimestamp(
    advanced.result.clock_after, temporal.limit_timestamp) === 0;
  const finished = active?.status === 'completed';
  const stillRunning = active?.status === 'started';
  if (advanced.result.temporal_status !== 'completed'
      || (restCompleted ? elapsed !== 5 : elapsed !== 0)
      || advanced.state_projection.cumulative_elapsed_minutes
        !== (restCompleted ? 30 : 25)
      || active?.npc_ref !== actorStep.result.npc_ref
      || (!finished && !stillRunning)
      || (finished && !completionWithinRest)
      || (stillRunning && completionWithinRest)) {
    fail('TRACE_PHASE_7_SCHEDULE_TEMPORAL_INTERRUPTED');
  }
  return Object.freeze({
    elapsed_after_decision: elapsed,
    rest_completed: restCompleted,
    result,
    projection: structuredClone(advanced.state_projection),
    completion_candidate: structuredClone(completion),
    completion_effect: structuredClone(completionEffect)
  });
}

function cumulativeResult(prior, current) {
  return {
    ...structuredClone(current),
    clock_before: structuredClone(prior.clock_before),
    trace: {
      ...structuredClone(current.trace),
      processed_boundary_ids: [...new Set([
        ...(prior.trace?.processed_boundary_ids ?? []),
        ...(current.trace?.processed_boundary_ids ?? [])
      ])]
    }
  };
}

function composedConversationAdvance({ state, actorStep, temporal }) {
  const result = actorStep.owner_outputs?.consequence_fragment?.state_changes
    ?.find(({ mode_handoff: handoff }) => handoff?.mode === 'conversation')
    ?.mode_handoff?.result;
  const temporalResult = result?.temporal_advance_results?.at(-1);
  const completionEffect = result?.parent_temporal_completion_effect;
  const projection = result?.exchange?.working_state?.world_state;
  if (temporalResult?.temporal_status == null || completionEffect == null
      || projection == null) return null;
  const active = tracePhase7ActorStep(projection, actorStep.result);
  const elapsed = exactIntegerElapsed(temporal.result.clock_after,
    temporalResult.clock_after);
  const expectedElapsed = Number(
    active.planned_exact_elapsed?.exact_minutes?.numerator);
  const parentCumulative = result.parent_temporal_cumulative_elapsed_minutes
    ?? temporal.projection?.cumulative_elapsed_minutes;
  const expectedCumulative = parentCumulative == null ? null
    : parentCumulative + elapsed;
  const restCompleted = compareGameTimestamp(temporalResult.clock_after,
    temporal.limit_timestamp) === 0;
  const completed = temporalResult.temporal_status === 'completed';
  const paused = temporalResult.temporal_status === 'paused';
  if (!Number.isSafeInteger(expectedElapsed) || expectedElapsed < 0
      || (completed && (elapsed !== expectedElapsed || active.status !== 'completed'))
      || (paused && (elapsed >= expectedElapsed || active.status !== 'started'))
      || (expectedCumulative !== null
        && projection.cumulative_elapsed_minutes !== expectedCumulative)
      || (!completed && !paused)) {
    fail('TRACE_PHASE_7_SCHEDULE_TEMPORAL_INTERRUPTED');
  }
  const composedResult = { ...structuredClone(temporalResult),
    combined_change_set: { ...structuredClone(temporalResult.combined_change_set),
      change_set_id: temporal.result.combined_change_set.change_set_id } };
  delete composedResult.canonical_digest;
  return Object.freeze({ elapsed_after_decision: elapsed,
    rest_completed: restCompleted && completed,
    result: composedResult, projection: structuredClone(projection),
    completion_candidate: structuredClone(completionEffect.candidate),
    completion_effect: structuredClone(completionEffect) });
}

function versioned(entityKind, entityId, authoringVersion) {
  return {
    entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: authoringVersion
  };
}

function exactIntegerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') {
    fail('TRACE_PHASE_7_TEMPORAL_FRACTION_GAP');
  }
  const value = Number(exact.numerator);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('TRACE_PHASE_7_TEMPORAL_INTERVAL_INVALID');
  }
  return value;
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
