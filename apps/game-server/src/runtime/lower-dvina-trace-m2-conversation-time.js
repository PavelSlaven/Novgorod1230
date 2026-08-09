import {
  addElapsedTime,
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { fail, ref } from './lower-dvina-trace-m2-conversation-shared.js';
import {
  conversationTemporalComposition,
  conversationTemporalParentProjection,
  conversationTemporalWorld
} from './lower-dvina-trace-m2-conversation-time-contract.js';

const SOURCE_PROVIDER_REF = versioned(
  'dynamic_recheck_policy', 'lower-dvina-trace-pending-boundaries', '1'
);
const PROGRESS_PROVIDER_REF = versioned(
  'dynamic_recheck_policy', 'conversation-activity-progress', '1'
);

export function advanceConversationContributionTime(
  context,
  working,
  plannedDurationMinutes
) {
  const durationMinutes = plannedDurationMinutes;
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 0) {
    fail('TRACE_M2_CONVERSATION_TIME_BUDGET_INVALID');
  }
  if (durationMinutes === 0) {
    if (context.conversationTimeContract?.mode !== 'same_timestamp') {
      fail('TRACE_M2_CONVERSATION_TIME_BUDGET_INVALID');
    }
    return {
      working_state: structuredClone(working),
      temporal_boundary_refs: [],
      session_status: 'active',
      elapsed_minutes: 0,
      completed: true,
      interrupted: false
    };
  }
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
  if (typeof context.temporalAdvanceOwner?.advance !== 'function') {
    fail('TRACE_M2_CONVERSATION_TEMPORAL_OWNER_MISSING');
  }
  const request = temporalRequest({ context, working, limit, candidates });
  const composition = conversationTemporalComposition(context, candidates);
  const advanced = context.temporalAdvanceOwner.advance({
    request,
    engine_version: 'lower-dvina-trace-conversation-temporal-adapter-v1',
    temporal_resolution_policy_version: 'temporal-resolution-v1',
    safety_limits: {
      max_slices: 20, max_candidates: 100, max_iterations: 100
    },
    source_provider_ref: SOURCE_PROVIDER_REF,
    source_candidates: composition.source_candidates,
    registered_provider_ref: PROGRESS_PROVIDER_REF,
    registered_effects: composition.registered_effects,
    continuous_effects: composition.continuous_effects,
    finalization: {
      visible_package_candidate: visibleEnvelope(request),
      validation_report: { ok: true }
    },
    stop_after_source_batch: false
  });
  const clockAfter = advanced.result.clock_after;
  const processedBoundaryIds = advanced.result.trace.processed_boundary_ids;
  const contributionCompleted = compareGameTimestamp(clockAfter, limit) === 0;
  const interrupted = !contributionCompleted
    || advanced.result.trace.stopped_after_current_batch === true;
  const elapsed = subtractGameTimestamp(clockAfter, clockBefore);
  if (elapsed.denominator !== '1') {
    fail(
      'TRACE_M2_CONVERSATION_TEMPORAL_FRACTION_GAP',
      'Conversation time profile must resolve to whole approved minutes.'
    );
  }
  const temporalResult = {
    ...structuredClone(advanced.result),
    canonical_digest: computeSpatialV3CanonicalDigest(advanced.result)
  };
  const conversationState = advanced.state_projection.conversation_state
    ?? working;
  const workingWorld = conversationTemporalWorld(
    context, conversationState, advanced.state_projection);
  return {
    working_state: {
      ...conversationState,
      world_state: workingWorld,
      clock: structuredClone(clockAfter),
      elapsed_minutes: working.elapsed_minutes + Number(elapsed.numerator),
      temporal_boundary_refs: [
        ...working.temporal_boundary_refs,
        ...processedBoundaryIds.map((boundaryId) =>
          ref('temporal_boundary_candidate', boundaryId))
      ],
      temporal_advance_results: [
        ...(working.temporal_advance_results ?? []), temporalResult
      ]
    },
    temporal_boundary_refs: processedBoundaryIds.map((boundaryId) =>
      ref('temporal_boundary_candidate', boundaryId)),
    session_status: interrupted ? 'suspended' : 'active',
    elapsed_minutes: Number(elapsed.numerator),
    completed: contributionCompleted,
    interrupted
  };
}

function temporalRequest({ context, working, limit, candidates }) {
  const pins = sealed({ pins: [{
    dependency_role: 'dynamic_recheck_policy',
    entity_ref: SOURCE_PROVIDER_REF.entity_ref,
    version_pin: {
      pin_kind: 'authoring_version', authoring_version: '1'
    }
  }] });
  const requestId = `${context.exchangeId}:${working.elapsed_minutes}`;
  return {
    party_id: context.state.party_id,
    turn_id: `turn:${requestId}`,
    base_state_version: String(context.stateVersion),
    clock_before: structuredClone(working.clock),
    clock_commit_mode: 'direct_party_clock',
    clock_owner_ref: ref('party', context.state.party_id),
    requested_execution_ref: ref(
      'party_timed_activity_execution',
      `activity:${context.state.party_id}:${context.exchangeId}`
    ),
    inclusive_limit_timestamp: structuredClone(limit),
    active_scope: 'exact_active_g6',
    relevant_state_projection: {
      calendar_profile_ref: sealed({ profile_ref: versioned(
        'calendar_profile', 'lower-dvina-trace-calendar', '1') }),
      active_execution_refs: [ref(
        'party_timed_activity_execution',
        `activity:${context.state.party_id}:${context.exchangeId}`
      )],
      active_execution_requires_boundary: false,
      available_event_ids: candidates.map(({ boundary_id: id }) => id),
      conversation_state: structuredClone(working),
      ...conversationTemporalParentProjection(context, working)
    },
    catalog_pins: pins,
    temporal_resolution_policy_ref: sealed({ policy_ref: versioned(
      'dynamic_recheck_policy', 'temporal-resolution', '1') }),
    idempotency_context: {
      record_id: `idem:${requestId}`,
      idempotency_key: requestId,
      change_set_id: `change:${requestId}`
    },
    provider_versions: [SOURCE_PROVIDER_REF, PROGRESS_PROVIDER_REF]
  };
}

function visibleEnvelope(request) {
  const payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Разговор продолжается.',
    perceived_changes: [], sensory_details: [], visible_npcs: [],
    visible_objects: [], known_context: [], uncertainties: [], hypotheses: [],
    player_safe_interruption: null, allowed_action_affordances: []
  };
  return {
    package_id: `${request.turn_id}:temporal-visible`,
    party_id: request.party_id,
    turn_id: request.turn_id,
    committed_state_version: String(BigInt(request.base_state_version) + 1n),
    change_set_id: request.idempotency_context.change_set_id,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload,
    presentation_status: 'pending',
    projection_policy_ref: versioned(
      'visibility_modifier', 'conversation-temporal-projection', '1'),
    dependency_pins: request.catalog_pins,
    idempotency_record_id: request.idempotency_context.record_id
  };
}

function sealed(value) {
  return { ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) };
}

function versioned(entityKind, entityId, authoringVersion) {
  return {
    entity_ref: ref(entityKind, entityId), authoring_version: authoringVersion
  };
}

export function conversationExchangeDurationMinutes(context) {
  if (context.playerPlan?.activity?.duration_class !== 'domain_owned') {
    fail('TRACE_M2_CONVERSATION_DURATION_CLASS_INVALID');
  }
  return exactDurationMinutes(context);
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
  const resumedExecution = semanticExchange?.resumed_npc_execution
    ?? semanticExchange?.resumed_player_execution ?? null;
  if (!Number.isSafeInteger(exactMinutes) || exactMinutes < 0
      || (exactMinutes === 0 && resumedExecution == null
        && semanticExchange?.exchange?.time_budget?.status !== 'completed')
      || !Array.isArray(candidates) || !Array.isArray(roots)
      || !Array.isArray(boundaryRefs)
      || (exactMinutes === 0 && boundaryRefs.length !== 0)) {
    fail('TRACE_M2_CONVERSATION_TEMPORAL_RESULT_INVALID');
  }
  const expectedAfter = addElapsedTime(clockBefore, {
    exact_minutes: { numerator: String(exactMinutes), denominator: '1' }
  });
  if (compareGameTimestamp(expectedAfter, clockAfter) !== 0) {
    fail('TRACE_M2_CONVERSATION_TEMPORAL_RESULT_INVALID');
  }
  const referencedIds = boundaryRefs.map((reference) => {
    if (reference?.entity_kind !== 'temporal_boundary_candidate'
        || typeof reference.entity_id !== 'string') {
      fail('TRACE_M2_CONVERSATION_TEMPORAL_RESULT_INVALID');
    }
    return reference.entity_id;
  });
  const candidatesById = new Map(candidates.map((candidate) => [
    candidate.boundary_id, candidate
  ]));
  const processed = referencedIds.map((id) => candidatesById.get(id));
  if (processed.some((candidate) => candidate == null)
      || processed.some((candidate) =>
        compareGameTimestamp(candidate.scheduled_at, clockBefore) < 0
        || compareGameTimestamp(candidate.scheduled_at, clockAfter) > 0)
      || processed.some((candidate, index) => index > 0
        && compareGameTimestamp(
          processed[index - 1].scheduled_at,
          candidate.scheduled_at
        ) > 0)) {
    fail('TRACE_M2_CONVERSATION_TEMPORAL_RESULT_INVALID');
  }
  const boundaryIds = [...referencedIds];
  const nearestAt = processed[0]?.scheduled_at ?? null;
  const nearestBoundaryIds = nearestAt === null ? [] : processed
    .filter(({ scheduled_at: scheduledAt }) =>
      compareGameTimestamp(scheduledAt, nearestAt) === 0)
    .map(({ boundary_id: boundaryId }) => boundaryId);
  return {
    clock_before: structuredClone(clockBefore),
    clock_after: structuredClone(clockAfter),
    exact_elapsed: {
      exact_minutes: { numerator: String(exactMinutes), denominator: '1' }
    },
    nearest_boundary: processed.length === 0 ? null : {
      scheduled_at: structuredClone(nearestAt),
      boundary_ids: nearestBoundaryIds
    },
    boundary_trace: {
      owner: '@rus/time-events-history/temporal-boundaries',
      policy: 'split_before_earliest_boundary',
      evaluated_candidate_count: candidates.length,
      processed_boundary_ids: boundaryIds,
      deferred_to_source_owner_ids: [],
      activity_roots: structuredClone(roots)
    }
  };
}

function exactDurationMinutes(context) {
  if (context.conversationTimeContract?.mode === 'same_timestamp') {
    return 0;
  }
  const profile = context.activityProfile ?? (context.phase === 'phase_3'
    ? (context.evidencePresented
        ? context.contracts.evidenceTalk : context.contracts.talk)
    : context.contracts.negotiation);
  if (!Number.isSafeInteger(profile?.duration_minutes)
      || profile.duration_minutes < 1) {
    fail('TRACE_M2_CONVERSATION_TIME_PROFILE_GAP');
  }
  return profile.duration_minutes;
}
