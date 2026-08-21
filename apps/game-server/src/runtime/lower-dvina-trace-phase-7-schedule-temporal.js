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
import { localFireTemporalCandidateFromRuntime,
  localFireTemporalRuntimeFromPlan } from
  './lower-dvina-trace-local-fire-temporal.js';

export function resolveTracePhase7ScheduleTemporalAdvance({ state, temporal,
  actorStep, temporalAdvanceOwner, commandIdempotencyKey, rootTurnId,
  restLimitTimestamp = null }) {
  if (typeof temporalAdvanceOwner?.advance !== 'function') {
    fail('TRACE_PHASE_7_TEMPORAL_OWNER_MISSING');
  }
  const processed = new Set(
    temporal.result.trace.processed_boundary_ids ?? []
  );
  const sourceCandidates = (state.temporal_boundary_candidates ?? []).filter(
    ({ boundary_id: id }) => !processed.has(id)
  );
  for(const plan of actorStep.local_fire_atomic_write_plans??[]){
    const runtime=localFireTemporalRuntimeFromPlan(plan);
    if(runtime.process_state.status==='active')
      sourceCandidates.push(localFireTemporalCandidateFromRuntime(runtime));
  }
  const request = buildTracePhase7TemporalRequest({
    state,
    executionId: temporal.execution_id,
    limit: restLimitTimestamp ?? temporal.limit_timestamp,
    commandIdempotencyKey,
    rootTurnId,
    clockBefore: temporal.result.clock_after,
    sourceCandidates,
    projection: structuredClone(actorStep.working_projection),
    segment: 'schedule'
  });
  const completionEffect = createNpcActorStepCompletionEffect({
    party_ref: { entity_kind: 'party', entity_id: state.party_id },
    active_actor_step: tracePhase7ActorStep(
      actorStep.working_projection, actorStep.result),
    visibility_policy_ref: versioned('visibility_modifier',
      'lower-dvina-trace-phase-7-hidden-npc', '1')
  });
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
    registered_effects: completionWithinRest ? [completionEffect] : [],
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
  const elapsed = exactIntegerElapsed(
    temporal.result.clock_after, advanced.result.clock_after
  );
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
      result: advanced.result,
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
    result: advanced.result,
    projection: structuredClone(advanced.state_projection),
    completion_candidate: structuredClone(completion),
    completion_effect: structuredClone(completionEffect)
  });
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
