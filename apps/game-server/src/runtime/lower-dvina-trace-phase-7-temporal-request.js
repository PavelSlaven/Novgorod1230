import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';

export const TRACE_PHASE7_EXTERNAL_PROVIDER = versioned(
  'dynamic_recheck_policy', 'lower-dvina-trace-pending-boundaries', '1'
);
export const TRACE_PHASE7_PROVIDER = versioned(
  'dynamic_recheck_policy', 'lower-dvina-trace-phase-7-waiting', '1'
);

export function buildTracePhase7TemporalRequest({ state, contracts,
  executionId, limit, commandIdempotencyKey, rootTurnId,
  clockBefore = state.clock,
  sourceCandidates = state.temporal_boundary_candidates ?? [],
  projection = null, segment = 'waiting' }) {
  const pins = sealed({ pins: [{
    dependency_role: 'dynamic_recheck_policy',
    entity_ref: {
      entity_kind: 'dynamic_recheck_policy',
      entity_id: 'lower-dvina-trace-phase-7-temporal-admission'
    },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1' }
  }] });
  return {
    party_id: state.party_id,
    turn_id: rootTurnId,
    base_state_version: String(state.party_state.state_version),
    clock_before: structuredClone(clockBefore),
    clock_commit_mode: 'direct_party_clock',
    clock_owner_ref: { entity_kind: 'party', entity_id: state.party_id },
    requested_execution_ref: {
      entity_kind: 'party_timed_activity_execution', entity_id: executionId
    },
    inclusive_limit_timestamp: structuredClone(limit),
    active_scope: 'exact_active_g6',
    relevant_state_projection: projection ?? initialProjection({
      executionId, sourceCandidates, contracts
    }),
    catalog_pins: pins,
    temporal_resolution_policy_ref: sealed({ policy_ref: versioned(
      'dynamic_recheck_policy', 'temporal-resolution', 'v1') }),
    idempotency_context: {
      record_id:
        `idem:${state.party_id}:trace-phase7:${commandIdempotencyKey}:${segment}`,
      idempotency_key: `${commandIdempotencyKey}:${segment}`,
      change_set_id:
        `change:${state.party_id}:trace-phase7:${state.party_state.turn_number + 1}`
    },
    provider_versions: [TRACE_PHASE7_EXTERNAL_PROVIDER, TRACE_PHASE7_PROVIDER]
  };
}

export function tracePhase7TemporalVisibleEnvelope(request) {
  const payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Отдых у огня продолжается.',
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
    projection_policy_ref: versioned('visibility_modifier',
      'lower-dvina-trace-temporal-projection', '1'),
    dependency_pins: request.catalog_pins,
    idempotency_record_id: request.idempotency_context.record_id
  };
}

function initialProjection({ executionId, sourceCandidates, contracts }) {
  return {
    calendar_profile_ref: sealed({ profile_ref: versioned(
      'calendar_profile', 'lower-dvina-trace-calendar', '1') }),
    active_execution_refs: [{
      entity_kind: 'party_timed_activity_execution', entity_id: executionId
    }],
    active_execution_requires_boundary: false,
    available_event_ids: sourceCandidates.map(({ boundary_id: id }) => id),
    cumulative_elapsed_minutes: 0,
    npc_activity_states: {
      [contracts.autonomous.target_npc_ref]: {
        activity_ref: contracts.waitActivity.profile_id,
        status: 'waiting'
      }
    },
    npc_activity_factual_transitions: []
  };
}

function sealed(value) {
  return { ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) };
}

function versioned(entityKind, entityId, authoringVersion) {
  return {
    entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: authoringVersion
  };
}
