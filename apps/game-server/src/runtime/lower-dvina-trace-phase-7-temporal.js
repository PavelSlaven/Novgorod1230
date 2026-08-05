import { canonicalDigest } from '@rus/materialization';
import {
  addElapsedTime,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  PHASE7_REST_PROGRESS_EFFECT_REF,
  PHASE7_WAITING_TERMINAL_EFFECT_REF
} from './lower-dvina-trace-phase-7-temporal-effect-owner.js';
import {
  buildTracePhase7TemporalRequest,
  TRACE_PHASE7_EXTERNAL_PROVIDER,
  TRACE_PHASE7_PROVIDER,
  tracePhase7TemporalVisibleEnvelope
} from './lower-dvina-trace-phase-7-temporal-request.js';

export function resolveTracePhase7RestTemporalAdvance({
  state,
  contracts,
  temporalAdvanceOwner,
  commandIdempotencyKey
}) {
  if (typeof temporalAdvanceOwner?.advance !== 'function') {
    fail('TRACE_PHASE_7_TEMPORAL_OWNER_MISSING');
  }
  const executionId = `activity:${state.party_id}:trace-phase7:fire-rest`;
  const terminalCandidate = waitingTerminalCandidate({
    state,
    contracts,
    executionId
  });
  const limit = addElapsedTime(state.clock, {
    exact_minutes: { numerator: '30', denominator: '1' }
  });
  const request = buildTracePhase7TemporalRequest({
    state,
    contracts,
    executionId,
    limit,
    commandIdempotencyKey,
    segment: 'waiting'
  });
  const advanced = temporalAdvanceOwner.advance({
    request,
    engine_version: 'lower-dvina-trace-phase-7-temporal-adapter-v1',
    temporal_resolution_policy_version: 'temporal-resolution-v1',
    safety_limits: { max_slices: 20, max_candidates: 100,
      max_iterations: 100 },
    source_provider_ref: TRACE_PHASE7_EXTERNAL_PROVIDER,
    source_candidates: state.temporal_boundary_candidates ?? [],
    registered_provider_ref: TRACE_PHASE7_PROVIDER,
    registered_effects: [{
      candidate: terminalCandidate,
      effect_ref: PHASE7_WAITING_TERMINAL_EFFECT_REF,
      input: {
        npc_ref: contracts.autonomous.target_npc_ref,
        activity_ref: contracts.waitActivity.profile_id,
        transition_kind: 'waiting_terminal_reached'
      }
    }],
    continuous_effect: {
      effect_ref: PHASE7_REST_PROGRESS_EFFECT_REF,
      input: { execution_id: executionId }
    },
    finalization: {
      visible_package_candidate: tracePhase7TemporalVisibleEnvelope(request),
      validation_report: { ok: true }
    },
    stop_after_source_batch: true
  });
  const result = advanced.result;
  const projection = advanced.state_projection;
  const elapsedBeforeDecision = integerElapsed(state.clock,
    result.clock_after);
  if (result.temporal_status !== 'paused'
      || elapsedBeforeDecision !== contracts.waitingBoundary.elapsed_minutes
      || projection.waiting_terminal_reached !== true
      || !projection.waiting_transition) {
    fail('TRACE_PHASE_7_WAITING_BOUNDARY_NOT_REACHED');
  }
  return Object.freeze({
    execution_id: executionId,
    limit_timestamp: limit,
    elapsed_before_decision: elapsedBeforeDecision,
    result,
    projection: structuredClone(projection),
    terminal_candidate: structuredClone(terminalCandidate)
  });
}

function waitingTerminalCandidate({ state, contracts, executionId }) {
  const boundary = contracts.waitingBoundary;
  const scheduledAt = addElapsedTime(state.clock, {
    exact_minutes: {
      numerator: String(boundary.elapsed_minutes), denominator: '1'
    }
  });
  return {
    boundary_id: `npc-waiting:${state.party_id}:zhdanko:terminal`,
    boundary_kind: 'npc_schedule',
    scheduled_at: scheduledAt,
    source_ref: {
      entity_kind: 'party_timed_activity_execution',
      entity_id: executionId
    },
    primary_subject_ref: {
      entity_kind: 'npc', entity_id: contracts.zhdanko.instance_id
    },
    subject_refs: [],
    scope_ref: { entity_kind: 'party', entity_id: state.party_id },
    rule_ref: versioned('action_contract',
      contracts.waitActivity.profile_id,
      String(contracts.waitActivity.version)),
    policy_ref: versioned('activity_contract',
      contracts.schedulePolicy.schedule_policy_id,
      String(contracts.schedulePolicy.version)),
    preconditions_digest: canonicalDigest({
      npc_ref: contracts.autonomous.target_npc_ref,
      source_activity_ref: contracts.waitActivity.profile_id,
      expected_state: 'waiting',
      terminal_state: 'decision_required',
      parent_execution_ref: executionId
    }),
    resolution_class: 'reaction_decision',
    interrupt_effect: 'background',
    visibility_policy_ref: versioned('visibility_modifier',
      'lower-dvina-trace-phase-7-hidden-npc', '1'),
    idempotency_key: `npc-waiting:${state.party_id}:zhdanko:terminal`,
    causal_parent_refs: []
  };
}

function versioned(entityKind, entityId, authoringVersion) {
  return {
    entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: authoringVersion
  };
}

function integerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') fail('TRACE_PHASE_7_TEMPORAL_FRACTION_GAP');
  const value = Number(exact.numerator);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('TRACE_PHASE_7_TEMPORAL_INTERVAL_INVALID');
  }
  return value;
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
