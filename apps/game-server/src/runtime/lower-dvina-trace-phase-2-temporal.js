import {
  addElapsedTime,
  compareGameTimestamp
} from '@rus/time-events-history';
import {
  selectEarliestTemporalBoundaryBatch
} from '@rus/time-events-history/temporal-boundaries';
import { serverError } from '../errors.js';

export function createTracePhase2TemporalAdvance({ contracts }) {
  if (contracts.activity.nearest_temporal_boundary_rule
      !== 'split_before_earliest_boundary') {
    throw temporalError('TRACE_PHASE_2_TEMPORAL_POLICY_MISMATCH');
  }
  return async function advance({
    clock_before: clockBefore,
    exact_elapsed: exactElapsed,
    relevant_state: state
  }) {
    const window = inspectTracePhase2TemporalWindow({
      contracts,
      state,
      clockBefore,
      exactElapsed
    });
    if (!window.ok) {
      throw temporalError(
        'TRACE_PHASE_2_TEMPORAL_BOUNDARY_REQUIRES_RESOLUTION',
        { boundary_batch: window.nearest_boundary }
      );
    }
    return {
      clock_before: clockBefore,
      clock_after: window.clock_after,
      exact_elapsed: exactElapsed,
      nearest_boundary: null,
      boundary_trace: {
        owner: '@rus/time-events-history/temporal-boundaries',
        policy:
          contracts.activity.nearest_temporal_boundary_rule,
        evaluated_candidate_count: window.candidate_count,
        processed_boundary_ids: []
      }
    };
  };
}

export function inspectTracePhase2TemporalWindow({
  contracts,
  state,
  clockBefore = state.clock_weather_light?.clock ?? state.clock,
  exactElapsed = {
    exact_minutes: {
      numerator: String(contracts.activity.duration_minutes),
      denominator: '1'
    }
  }
}) {
  assertTemporalSourceProof(
    state.temporal_source_proof,
    state.temporal_boundary_candidates ?? []
  );
  const clockAfter = addElapsedTime(clockBefore, exactElapsed);
  const candidates =
    structuredClone(state.temporal_boundary_candidates ?? []);
  const nearest = selectEarliestTemporalBoundaryBatch({
    from_timestamp: clockBefore,
    limit_timestamp: clockAfter,
    candidates,
    execution_requires_boundary: false
  });
  return {
    ok: nearest == null
      || compareGameTimestamp(nearest.scheduled_at, clockAfter) > 0,
    clock_after: clockAfter,
    nearest_boundary: nearest,
    candidate_count: candidates.length
  };
}

function assertTemporalSourceProof(proof, candidates) {
  const legacy = proof?.version === 1
      && proof.schema
        === 'lower_dvina_trace_phase_2_temporal_source_proof';
  const current = proof?.version === 2
    && proof.schema === 'lower_dvina_trace_temporal_source_proof'
    && proof.admission_policy
      === 'pass_exact_candidates_to_temporal_activity_owner'
    && Array.isArray(proof.candidates)
    && proof.candidate_count === proof.candidates.length
    && JSON.stringify(proof.candidates) === JSON.stringify(candidates);
  if ((!legacy && !current)
      || proof.owner !== '@rus/time-events-history/temporal-boundaries'
      || proof.same_time_cascade_owner
        !== '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade'
      || !Number.isInteger(proof.pending_event_count)
      || !Number.isInteger(proof.active_schedule_count)
      || !Number.isInteger(proof.candidate_count)
      || (legacy && (proof.admission_policy
          !== 'fail_closed_before_activity_when_unbound_candidate_exists'
        || proof.pending_event_count !== 0
        || proof.active_schedule_count !== 0
        || proof.candidate_count !== 0))) {
    throw temporalError('TRACE_PHASE_2_TEMPORAL_SOURCE_UNPROVEN');
  }
}

function temporalError(code, details = {}) {
  return serverError(
    code,
    'Pinned Phase 2 temporal boundary cannot be resolved by this phase.',
    { status: 409, details }
  );
}
