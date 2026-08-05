import { subtractGameTimestamp } from '@rus/time-events-history';
import { PHASE7_REST_PROGRESS_EFFECT_REF } from
  './lower-dvina-trace-phase-7-temporal-effect-owner.js';
import {
  buildTracePhase7TemporalRequest,
  TRACE_PHASE7_EXTERNAL_PROVIDER,
  TRACE_PHASE7_PROVIDER,
  tracePhase7TemporalVisibleEnvelope
} from './lower-dvina-trace-phase-7-temporal-request.js';

export function resolveTracePhase7ScheduleTemporalAdvance({ state, temporal,
  temporalAdvanceOwner, commandIdempotencyKey }) {
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
    projection: structuredClone(temporal.projection),
    segment: 'schedule'
  });
  const advanced = temporalAdvanceOwner.advance({
    request,
    engine_version: 'lower-dvina-trace-phase-7-temporal-adapter-v1',
    temporal_resolution_policy_version: 'temporal-resolution-v1',
    safety_limits: { max_slices: 20, max_candidates: 100,
      max_iterations: 100 },
    source_provider_ref: TRACE_PHASE7_EXTERNAL_PROVIDER,
    source_candidates: sourceCandidates,
    registered_provider_ref: TRACE_PHASE7_PROVIDER,
    registered_effects: [],
    continuous_effect: {
      effect_ref: PHASE7_REST_PROGRESS_EFFECT_REF,
      input: { execution_id: temporal.execution_id }
    },
    finalization: {
      visible_package_candidate: tracePhase7TemporalVisibleEnvelope(request),
      validation_report: { ok: true }
    },
    stop_after_source_batch: true
  });
  const elapsed = exactIntegerElapsed(
    temporal.result.clock_after, advanced.result.clock_after
  );
  if (advanced.result.temporal_status !== 'completed'
      || elapsed !== 5
      || advanced.state_projection.cumulative_elapsed_minutes !== 30) {
    fail('TRACE_PHASE_7_SCHEDULE_TEMPORAL_INTERRUPTED');
  }
  return Object.freeze({
    elapsed_after_decision: elapsed,
    result: advanced.result,
    projection: structuredClone(advanced.state_projection)
  });
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
