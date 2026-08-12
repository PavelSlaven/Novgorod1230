
import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import {
  expected, sealedCheck
} from './first-playable/plan-shared.js';
import {
  assertPhase2CurrentStateVersion
} from './lower-dvina-trace-phase-2-commit-admission.js';
import {
  nextState,
  phase3ActivityRef
} from './lower-dvina-trace-phase-3-state.js';
import {
  pendingScreenFor,
  phase3Writes,
  visibleEnvelopeFor
} from './lower-dvina-trace-phase-3-write-projection.js';
import {
  mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence
} from './lower-dvina-trace-turn-step-persistence.js';
import {
  bindLowerDvinaTraceTurnStepIdempotency
} from './lower-dvina-trace-turn-step-idempotency.js';
import {
  committedTraceScenarioDefinitionRevision
} from '../../runtime/lower-dvina-trace-committed-revision.js';

export function phase3SemanticCommitContext({
  writePlan,
  factual,
  scenarioRevision
}) {
  const isConversation =
    factual.consequence.phase3_kind === 'conversation';
  const semanticExchange = isConversation
    ? factual.consequence.conversation?.semantic_exchange
    : null;
  if (![14, 15, 16, 17].includes(scenarioRevision)) {
    if (semanticExchange != null) {
      fail('TRACE_M2_PHASE_3_SEMANTIC_REVISION_INVALID');
    }
    return null;
  }
  if (!isConversation) return null;
  if (semanticExchange == null) return null;
  const envelope = writePlan.turn_step_commit;
  const exactFastPath = envelope == null
    && writePlan.command_trace?.decision_protocol
      === 'code_exact_fast_path_v1';
  if (exactFastPath) {
    const rootTurnId = writePlan.turn_id;
    if (typeof rootTurnId !== 'string'
        || rootTurnId.length === 0
        || rootTurnId !== factual.mode_resolution.turn_id) {
      fail('TRACE_M2_PHASE_3_SEMANTIC_LINEAGE_INVALID');
    }
    return { rootTurnId, workingRevision: 0, semanticExchange };
  }
  const rootTurnId = envelope?.root_turn_id;
  const workingRevision = envelope?.loop_trace?.working_revision;
  if (writePlan.command_trace?.decision_protocol !== 'turn_step_plan_v1'
      || envelope?.schema !== 'turn_step_commit_envelope_v1'
      || typeof rootTurnId !== 'string'
      || rootTurnId.length === 0
      || rootTurnId !== factual.mode_resolution.turn_id
      || envelope.loop_trace?.root_turn_id !== rootTurnId
      || !Number.isSafeInteger(workingRevision)
      || workingRevision < 0) {
    fail('TRACE_M2_PHASE_3_SEMANTIC_LINEAGE_INVALID');
  }
  return { rootTurnId, workingRevision, semanticExchange };
}

export function expectedSemanticConversationSession(state, semanticExchange) {
  if (semanticExchange == null) return [];
  const conversationId = semanticExchange.decision_request?.conversation_id
    ?? semanticExchange.exchange?.contributions?.[0]?.conversation_id;
  const existing = (state.conversation_sessions ?? []).find(
    ({ conversation_id: id }) => id === conversationId
  );
  if (existing == null) return [];
  if (!Number.isSafeInteger(existing.state_version)
      || existing.state_version < 1) {
    fail('TRACE_M2_CONVERSATION_SESSION_VERSION_INVALID');
  }
  return [expected(
    'party_conversation_sessions',
    conversationId,
    existing.state_version
  )];
}

export function expectedChangedConditions(state, nextBodyState) {
  const changed = new Set((nextBodyState.active_conditions ?? [])
    .filter(({ condition_outcome: outcome }) => Boolean(outcome))
    .map(({ storage_condition_id: id }) => id));
  return (state.body_state.active_conditions ?? [])
    .filter(({ storage_condition_id: id }) => changed.has(id))
    .map((condition) => expected(
      'party_actor_active_conditions',
      `player_character:${state.actor_id}:${condition.storage_condition_id}`,
      condition.state_version
    ));
}

export function target(writePlan, name) {
  return writePlan.write_targets.find(({ target }) => target === name)?.value;
}
export function phase3CommitRechecks({
  partyId,
  state,
  factual,
  phase3Contracts,
  inputDigest
}) {
  const movement = factual.consequence.phase3_kind === 'movement'
    ? factual.consequence.movement
    : null;
  return [
    sealedCheck('physical', {
      party_id: partyId,
      location_ref: state.position.location_ref,
      g5_anchor_id: state.position.g5_anchor_id
    }),
    sealedCheck('state', {
      party_id: partyId,
      expected_party_state_version: state.party_state.state_version
    }),
    sealedCheck('pin', {
      activity_pin: phase3Contracts.activityPins.find(
      ({ id }) => id === phase3ActivityRef(factual)
      )
    }),
    sealedCheck('endpoint', {
      destination_ref: movement?.destination.location_ref ?? null
    }),
    sealedCheck('route', {
      route_binding_ref: movement?.route_ref ?? null
    }),
    sealedCheck('capacity', movement ? {
      party_id: partyId,
      capacity_model: 'trace_phase3_location_actor_capacity',
      destination_anchor_id: movement.destination.g5_anchor_id,
      destination_location_ref: movement.destination.location_ref,
      capacity_contract_ref: phase3Contracts.capacity.contract_id,
      access_policy_ref: phase3Contracts.access.policy_id,
      zone_ref: movement.destination.zone_ref,
      max_actors: phase3Contracts.capacity.zones.find(
        ({ zone_id: id }) => id === movement.destination.zone_ref
      )?.max_actors,
      incoming_participant_slot: 'player_clerk',
      allowed_participant_slots:
        phase3Contracts.capacity.admission_model.allowed_participant_slots,
      expected_present_npcs: (Array.isArray(phase3Contracts.actors)
        ? phase3Contracts.actors : Object.values(phase3Contracts.actors))
        .map((actor) => ({
        npc_id: actor.instance_id,
        participant_slot_ref: actor.ref ?? actor.participant_slot_ref
      }))
    } : { party_id: partyId }),
    sealedCheck('time', {
      expected_clock_state_version: state.party_state.clock_state_version
    }),
    sealedCheck('change_set', {
      canonical_input_digest: inputDigest
    })
  ];
}
export function fail(code, details = null) {
  throw serverError(code, 'Phase 3 factual commit failed closed.', {
    status: 409,
    details
  });
}
export const normalizeDigest = (value) =>
  `sha256:${String(value).replace('sha256:', '')}`;
