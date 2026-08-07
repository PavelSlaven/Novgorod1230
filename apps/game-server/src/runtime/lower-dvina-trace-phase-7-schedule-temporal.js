import { canonicalDigest } from '@rus/materialization';
import {
  addElapsedTime,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  PHASE7_NPC_ACTOR_STEP_COMPLETION_EFFECT_REF,
  PHASE7_REST_PROGRESS_EFFECT_REF
} from
  './lower-dvina-trace-phase-7-temporal-effect-owner.js';
import {
  buildTracePhase7TemporalRequest,
  TRACE_PHASE7_EXTERNAL_PROVIDER,
  TRACE_PHASE7_PROVIDER,
  tracePhase7TemporalVisibleEnvelope
} from './lower-dvina-trace-phase-7-temporal-request.js';

export function resolveTracePhase7ScheduleTemporalAdvance({ state, temporal,
  actorStep, temporalAdvanceOwner, commandIdempotencyKey }) {
  if (typeof temporalAdvanceOwner?.advance !== 'function') {
    fail('TRACE_PHASE_7_TEMPORAL_OWNER_MISSING');
  }
  const processed = new Set(
    temporal.result.trace.processed_boundary_ids ?? []
  );
  const sourceCandidates = (state.temporal_boundary_candidates ?? []).filter(
    ({ boundary_id: id }) => !processed.has(id)
  );
  const request = buildTracePhase7TemporalRequest({
    state,
    executionId: temporal.execution_id,
    limit: temporal.limit_timestamp,
    commandIdempotencyKey,
    clockBefore: temporal.result.clock_after,
    sourceCandidates,
    projection: structuredClone(actorStep.working_projection),
    segment: 'schedule'
  });
  const completion = actorStepCompletionCandidate({ state, actorStep });
  const advanced = temporalAdvanceOwner.advance({
    request,
    engine_version: 'lower-dvina-trace-phase-7-temporal-adapter-v1',
    temporal_resolution_policy_version: 'temporal-resolution-v1',
    safety_limits: { max_slices: 20, max_candidates: 100,
      max_iterations: 100 },
    source_provider_ref: TRACE_PHASE7_EXTERNAL_PROVIDER,
    source_candidates: sourceCandidates,
    registered_provider_ref: TRACE_PHASE7_PROVIDER,
    registered_effects: [{
      candidate: completion,
      effect_ref: PHASE7_NPC_ACTOR_STEP_COMPLETION_EFFECT_REF,
      input: {
        npc_ref: actorStep.result.npc_ref,
        scheduled_at: structuredClone(completion.scheduled_at),
        transition_kind: 'npc_actor_step_completed'
      }
    }],
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
  if (advanced.result.temporal_status !== 'completed'
      || elapsed !== 5
      || advanced.state_projection.cumulative_elapsed_minutes !== 30
      || advanced.state_projection.active_npc_actor_step?.npc_ref
        !== actorStep.result.npc_ref
      || advanced.state_projection.active_npc_actor_step?.status
        !== 'completed') {
    fail('TRACE_PHASE_7_SCHEDULE_TEMPORAL_INTERRUPTED');
  }
  return Object.freeze({
    elapsed_after_decision: elapsed,
    result: advanced.result,
    projection: structuredClone(advanced.state_projection),
    completion_candidate: structuredClone(completion)
  });
}

function actorStepCompletionCandidate({ state, actorStep }) {
  const active = actorStep.working_projection.active_npc_actor_step;
  const scheduledAt = addElapsedTime(actorStep.started_at,
    active.planned_exact_elapsed);
  return {
    boundary_id: `npc-actor-step:${state.party_id}:${active.npc_ref}:complete`,
    boundary_kind: 'npc_schedule',
    scheduled_at: scheduledAt,
    source_ref: {
      ...structuredClone(active.decision_trace_ref)
    },
    primary_subject_ref: {
      entity_kind: 'npc', entity_id: active.npc_ref
    },
    subject_refs: [],
    scope_ref: { entity_kind: 'party', entity_id: state.party_id },
    rule_ref: versioned('action_contract', active.semantic_operation.op, '1'),
    policy_ref: versioned('activity_contract', 'npc-actor-step', '1'),
    preconditions_digest: canonicalDigest(active),
    resolution_class: 'execution_outcome',
    interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier',
      'lower-dvina-trace-phase-7-hidden-npc', '1'),
    idempotency_key:
      `npc-actor-step:${state.party_id}:${active.npc_ref}:complete`,
    causal_parent_refs: [structuredClone(active.decision_trace_ref)]
  };
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
