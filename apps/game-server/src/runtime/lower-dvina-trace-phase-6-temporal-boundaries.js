import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import {
  addElapsedTime,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  PHASE6_PROGRESS_EFFECT_REF,
  PHASE6_REBIND_EFFECT_REF
} from './lower-dvina-trace-phase-6-temporal-effect-owner.js';

const EXTERNAL_PROVIDER = versioned(
  'dynamic_recheck_policy', 'lower-dvina-trace-pending-boundaries', '1'
);
const REBIND_PROVIDER = versioned(
  'dynamic_recheck_policy', 'lower-dvina-trace-carrier-rebinding', '1'
);

export function resolvePhase6TemporalAdvance({ state, contracts, prior,
  remaining, internalBoundary, rebindingDescriptor,
  temporalAdvanceOwner, commandIdempotencyKey }) {
  if (typeof temporalAdvanceOwner?.advance !== 'function') {
    fail('TRACE_PHASE_6_TEMPORAL_OWNER_MISSING');
  }
  const executionId = prior?.id
    ?? `activity:${state.party_id}:trace-phase6:carry`;
  const limit = addElapsedTime(state.clock, {
    exact_minutes: { numerator: String(remaining), denominator: '1' }
  });
  const internalCandidate = prior?.internal_rebinding_applied === true
    ? null
    : replacementBoundaryCandidate({ state, contracts, prior,
      boundary: internalBoundary });
  const externalCandidates = state.temporal_boundary_candidates ?? [];
  const registeredEffects = internalCandidate == null ? [] : [{
    candidate: internalCandidate,
    effect_ref: PHASE6_REBIND_EFFECT_REF,
    input: rebindingDescriptor
  }];
  const request = temporalRequest({ state, contracts, executionId, limit,
    commandIdempotencyKey });
  const advanced = temporalAdvanceOwner.advance({
    request,
    engine_version: 'lower-dvina-trace-phase-6-temporal-adapter-v1',
    temporal_resolution_policy_version: 'temporal-resolution-v1',
    safety_limits: { max_slices: 20, max_candidates: 100,
      max_iterations: 100 },
    source_provider_ref: EXTERNAL_PROVIDER,
    source_candidates: externalCandidates,
    registered_provider_ref: REBIND_PROVIDER,
    registered_effects: registeredEffects,
    continuous_effect: {
      effect_ref: PHASE6_PROGRESS_EFFECT_REF,
      input: { execution_id: executionId }
    },
    finalization: {
      visible_package_candidate: visibleEnvelope(request),
      validation_report: { ok: true }
    },
    stop_after_source_batch: true
  });
  const result = advanced.result;
  const processedExternal = result.trace.processed_boundary_ids.filter(
    (id) => id !== internalCandidate?.boundary_id
  );
  return Object.freeze({
    elapsed: integerElapsed(state.clock, result.clock_after),
    result,
    projection: structuredClone(advanced.state_projection),
    internal_candidate: structuredClone(internalCandidate),
    processed_external_boundary_ids: processedExternal,
    processed_boundary_ids: [...result.trace.processed_boundary_ids],
    dispositions: structuredClone(result.trace.dispositions),
    evaluated_candidate_count: externalCandidates.length
      + (internalCandidate == null ? 0 : 1)
  });
}

export function replacementBoundaryTimestamp({ state, prior, boundary }) {
  return addElapsedTime(prior?.started_at ?? state.clock, {
    exact_minutes: {
      numerator: String(boundary.elapsed_minutes), denominator: '1'
    }
  });
}

function replacementBoundaryCandidate({ state, contracts, prior, boundary }) {
  const executionId = prior?.id
    ?? `activity:${state.party_id}:trace-phase6:carry`;
  return {
    boundary_id: boundary.boundary_id,
    boundary_kind: 'carrier_sync',
    scheduled_at: replacementBoundaryTimestamp({ state, prior, boundary }),
    source_ref: { entity_kind: 'party_route_plan_execution_event',
      entity_id: executionId },
    primary_subject_ref: { entity_kind: 'player_character',
      entity_id: state.actor_id },
    subject_refs: [],
    scope_ref: { entity_kind: 'party', entity_id: state.party_id },
    rule_ref: versioned('action_contract', contracts.route.route_id,
      String(contracts.route.version)),
    policy_ref: versioned('activity_contract', contracts.activity.profile_id,
      String(contracts.activity.version)),
    preconditions_digest: canonicalDigest({ execution_id: executionId,
      replacement_boundary: boundary }),
    resolution_class: 'execution_outcome',
    interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier',
      'lower-dvina-trace-phase-6-visibility', '1'),
    idempotency_key: `${executionId}:${boundary.boundary_id}`,
    causal_parent_refs: []
  };
}

function temporalRequest({ state, contracts, executionId, limit,
  commandIdempotencyKey }) {
  const pins = sealed({ pins: [{
    dependency_role: 'dynamic_recheck_policy',
    entity_ref: { entity_kind: 'dynamic_recheck_policy',
      entity_id: 'lower-dvina-trace-phase-6-temporal-admission' },
    version_pin: { pin_kind: 'authoring_version',
      authoring_version: String(contracts.route.version) }
  }] });
  return {
    party_id: state.party_id,
    turn_id: `turn:${state.party_id}:phase6:${state.party_state.turn_number + 1}`,
    base_state_version: String(state.party_state.state_version),
    clock_before: structuredClone(state.clock),
    clock_commit_mode: 'direct_party_clock',
    clock_owner_ref: { entity_kind: 'party', entity_id: state.party_id },
    requested_execution_ref: {
      entity_kind: 'party_timed_activity_execution', entity_id: executionId
    },
    inclusive_limit_timestamp: limit,
    active_scope: 'exact_active_g6',
    relevant_state_projection: {
      calendar_profile_ref: sealed({ profile_ref: versioned(
        'calendar_profile', 'lower-dvina-trace-calendar', '1') }),
      active_execution_refs: [{
        entity_kind: 'party_timed_activity_execution', entity_id: executionId
      }],
      active_execution_requires_boundary: false,
      available_event_ids: (state.temporal_boundary_candidates ?? [])
        .map(({ boundary_id: id }) => id),
      cumulative_elapsed_minutes:
        Number(priorElapsed(state.phase6_carry_execution)),
      phase6_clock_before: structuredClone(state.clock),
      phase6_state: structuredClone(state)
    },
    catalog_pins: pins,
    temporal_resolution_policy_ref: sealed({ policy_ref: versioned(
      'dynamic_recheck_policy', 'temporal-resolution', 'v1') }),
    idempotency_context: {
      record_id: `idem:${state.party_id}:trace-phase6:${commandIdempotencyKey}`,
      idempotency_key: commandIdempotencyKey,
      change_set_id: `change:${state.party_id}:trace-phase6:${state.party_state.turn_number + 1}`
    },
    provider_versions: [EXTERNAL_PROVIDER, REBIND_PROVIDER]
  };
}

function visibleEnvelope(request) {
  const payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Переноска продолжается по сохранённому пути.',
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
      'visibility_modifier', 'lower-dvina-trace-temporal-projection', '1'),
    dependency_pins: request.catalog_pins,
    idempotency_record_id: request.idempotency_context.record_id
  };
}

function sealed(value) {
  return { ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) };
}

function versioned(entityKind, entityId, authoringVersion) {
  return { entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: authoringVersion };
}

function integerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') fail('TRACE_PHASE_6_TEMPORAL_FRACTION_GAP');
  const value = Number(exact.numerator);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('TRACE_PHASE_6_TEMPORAL_INTERVAL_INVALID');
  }
  return value;
}

function priorElapsed(prior) {
  return prior?.cumulative_elapsed_minutes ?? 0;
}

function fail(code, details = undefined) {
  throw Object.assign(new Error(code), { code, details });
}
