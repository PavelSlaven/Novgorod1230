import {
  addElapsedTime,
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  selectEarliestTemporalBoundaryBatch
} from '@rus/time-events-history/temporal-boundaries';
import { fail, ref } from './lower-dvina-trace-m2-conversation-shared.js';

export function advanceConversationContributionTime(
  context,
  working,
  plan
) {
  const durationMinutes = exactDurationMinutes(context, plan.activity);
  const clockBefore = working.clock;
  const limit = addElapsedTime(clockBefore, {
    exact_minutes: {
      numerator: String(durationMinutes), denominator: '1'
    }
  });
  const candidates = structuredClone(
    working.world_state?.temporal_boundary_candidates
      ?? context.state.temporal_boundary_candidates
      ?? []
  );
  const boundary = selectEarliestTemporalBoundaryBatch({
    from_timestamp: clockBefore,
    limit_timestamp: limit,
    candidates,
    execution_requires_boundary: false
  });
  const interrupted = boundary !== null
    && compareGameTimestamp(boundary.scheduled_at, limit) <= 0;
  const clockAfter = interrupted ? boundary.scheduled_at : limit;
  const elapsed = subtractGameTimestamp(clockAfter, clockBefore);
  if (elapsed.denominator !== '1') {
    fail(
      'TRACE_M2_CONVERSATION_TEMPORAL_FRACTION_GAP',
      'Conversation time profile must resolve to whole approved minutes.'
    );
  }
  return {
    working_state: {
      ...working,
      clock: structuredClone(clockAfter),
      elapsed_minutes: working.elapsed_minutes + Number(elapsed.numerator),
      temporal_boundary_refs: [
        ...working.temporal_boundary_refs,
        ...(interrupted ? boundary.candidates.map(
          ({ boundary_id: boundaryId }) =>
            ref('temporal_boundary_candidate', boundaryId)
        ) : [])
      ]
    },
    temporal_boundary_refs: interrupted ? boundary.candidates.map(
      ({ boundary_id: boundaryId }) =>
        ref('temporal_boundary_candidate', boundaryId)
    ) : [],
    session_status: interrupted ? 'suspended' : 'active'
  };
}

export function projectConversationTemporalAdvance({
  clockBefore,
  semanticExchange,
  candidates,
  roots
}) {
  const exactMinutes = semanticExchange?.exact_elapsed_minutes;
  const clockAfter = semanticExchange?.clock_after;
  const boundaryRefs = semanticExchange?.temporal_boundary_refs;
  if (!Number.isSafeInteger(exactMinutes) || exactMinutes < 1
      || !Array.isArray(candidates) || !Array.isArray(roots)
      || !Array.isArray(boundaryRefs)) {
    fail('TRACE_M2_CONVERSATION_TEMPORAL_RESULT_INVALID');
  }
  const expectedAfter = addElapsedTime(clockBefore, {
    exact_minutes: { numerator: String(exactMinutes), denominator: '1' }
  });
  if (compareGameTimestamp(expectedAfter, clockAfter) !== 0) {
    fail('TRACE_M2_CONVERSATION_TEMPORAL_RESULT_INVALID');
  }
  const boundary = selectEarliestTemporalBoundaryBatch({
    from_timestamp: clockBefore,
    limit_timestamp: clockAfter,
    candidates,
    execution_requires_boundary: false
  });
  const referencedIds = boundaryRefs.map((reference) => {
    if (reference?.entity_kind !== 'temporal_boundary_candidate'
        || typeof reference.entity_id !== 'string') {
      fail('TRACE_M2_CONVERSATION_TEMPORAL_RESULT_INVALID');
    }
    return reference.entity_id;
  }).sort();
  const boundaryIds = (boundary?.candidates ?? [])
    .map(({ boundary_id: boundaryId }) => boundaryId).sort();
  if (referencedIds.length !== boundaryIds.length
      || referencedIds.some((id, index) => id !== boundaryIds[index])
      || (boundary !== null
        && compareGameTimestamp(boundary.scheduled_at, clockAfter) !== 0)) {
    fail('TRACE_M2_CONVERSATION_TEMPORAL_RESULT_INVALID');
  }
  return {
    clock_before: structuredClone(clockBefore),
    clock_after: structuredClone(clockAfter),
    exact_elapsed: {
      exact_minutes: { numerator: String(exactMinutes), denominator: '1' }
    },
    nearest_boundary: boundary === null ? null : {
      scheduled_at: structuredClone(boundary.scheduled_at),
      boundary_ids: boundaryIds
    },
    boundary_trace: {
      owner: '@rus/time-events-history/temporal-boundaries',
      policy: 'split_before_earliest_boundary',
      evaluated_candidate_count: candidates.length,
      processed_boundary_ids: [],
      deferred_to_source_owner_ids: boundaryIds,
      activity_roots: structuredClone(roots)
    }
  };
}

function exactDurationMinutes(context, activity) {
  const durationClass = activity?.duration_class;
  if (durationClass === 'domain_owned') {
    const profile = context.phase === 'phase_3'
      ? (context.evidencePresented
          ? context.contracts.evidenceTalk : context.contracts.talk)
      : context.contracts.negotiation;
    if (!Number.isSafeInteger(profile?.duration_minutes)
        || profile.duration_minutes < 1) {
      fail('TRACE_M2_CONVERSATION_TIME_PROFILE_GAP');
    }
    return profile.duration_minutes;
  }
  const matches = (context.contracts.conversationTimeProfiles ?? []).filter(
    ({ duration_class: candidate }) => candidate === durationClass
  );
  if (matches.length !== 1
      || !Number.isSafeInteger(matches[0].duration_minutes)
      || matches[0].duration_minutes < 1) {
    fail('TRACE_M2_CONVERSATION_TIME_PROFILE_GAP');
  }
  return matches[0].duration_minutes;
}
