import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { appendActivity } from './lower-dvina-trace-phase-3-activity-writes.js';
import { appendConversation, appendKnowledge } from './lower-dvina-trace-phase-3-conversation-writes.js';
import {
  appendPhase3MovementTraversal
} from './lower-dvina-trace-phase-3-movement-writes.js';
import { routeMovement } from './lower-dvina-trace-phase-3-state.js';
import { appendRouteBodyWrites } from './lower-dvina-trace-route-body-writes.js';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from './npc-semantic-conversation-writes.js';
import { assertSharedSemanticSnapshotSafe } from
  './lower-dvina-trace-conversation-state.js';
import { appendPhase3SemanticInteraction } from
  './lower-dvina-trace-phase-3-semantic-interaction-write.js';

export function phase3Writes(input) {
  const {
    partyId, state, next, factual, visibleEnvelope, pendingScreen,
    nextVersion, turnNumber, changeSetId, idemId, inputDigest,
    phase3Contracts, rootTurnId, workingRevision, operationKind
  } = input;
  assertSharedSemanticSnapshotSafe(next);
  const inserts = [row(
    'party_state_snapshots',
    `${partyId}:${nextVersion}`,
    {
      party_id: partyId,
      state_version: nextVersion,
      state_payload: next,
      state_digest: canonicalDigest(next)
    }
  )];
  const updates = [
    row('parties', partyId, { party_id: partyId, status: 'active' }),
    row('party_server_sessions', partyId, {
      party_id: partyId,
      screen: pendingScreen,
      turn_number: turnNumber,
      last_turn_id: factual.mode_resolution.turn_id,
      updated_change_set_id: changeSetId
    }),
    row('party_clocks', partyId, {
      party_id: partyId,
      whole_minutes: next.clock.whole_minutes,
      subminute_numerator: next.clock.subminute_numerator,
      subminute_denominator: next.clock.subminute_denominator,
      updated_change_set_id: changeSetId
    })
  ];
  if (routeMovement(factual) && operationKind !== 'first_entry') {
    updates.push(row('party_positions', partyId, {
      party_id: partyId,
      g4_id: next.position.g4_id,
      g5_node_id: next.position.g5_node_id,
      g5_anchor_id: next.position.g5_anchor_id
    }));
  }
  const appends = [row('party_v3_change_sets', changeSetId, {
    id: changeSetId,
    party_id: partyId,
    operation_kind: operationKind ?? 'trace_phase_3_turn',
    idempotency_record_id: idemId
  })];
  if (routeMovement(factual)) {
    appendPhase3MovementTraversal({
      inserts, updates, appends, state, factual, partyId, turnNumber,
      changeSetId, idemId, phase3Contracts
    });
    appendKnowledge(inserts, state, partyId,
      factual.consequence.movement.reverse_route_ref
        ?? 'trace_ld_v1_route_camp_to_wreck',
      [factual.consequence.movement.route_ref]);
    for (const npcId of factual.consequence.movement.participants ?? []) {
      const npc = next.npcs?.find(({ instance_id: id }) => id === npcId);
      const before = state.npcs?.find(({ instance_id: id }) => id === npcId);
      if (npc && before != null && npcId !== state.actor_id) updates.push(row('party_npcs', npcId,
        { party_id: partyId, npc_id: npcId,
          anchor_id: npc.anchor_id,
          run_id: npc.run_id ?? state.materialization_trace?.run_id,
          profile_set_id: npc.profile_id,
          profile_level: npc.profile_level,
          identity_state: npc.identity_state,
          machine_state: npc.machine_state ?? before?.machine_state,
          semantic_state: {
            ...(before?.semantic_state ?? {}),
            participant_slot_ref:
              before?.participant_slot_ref ?? npc.participant_slot_ref,
            location_profile_ref: npc.location_profile_ref,
            zone_ref: npc.zone_ref,
            ...(npc.semantic_state ?? {})
          } }));
    }
    if (operationKind === 'first_entry') {
      for (const npc of state.first_entry_preparation?.npcs ?? []) {
        inserts.push(row('entity_placements', `npc:${npc.instance_id}`, {
          party_id: partyId,
          entity_kind: 'npc',
          entity_id: npc.instance_id,
          placement_kind: 'scene_position',
          position_node_id:
            state.first_entry_preparation.spatial_v3.target.position_id,
          host_entity_ref: null,
          occupies_capacity_units: 1,
          visibility_modifier_ref: null,
          interaction_profile_ref: null,
          state_version: 1,
          updated_change_set_id: changeSetId
        }));
      }
    }
    appendRouteBodyWrites({ updates, appends, partyId, state, next, factual,
      changeSetId, idemId, historyId: `body-history:${partyId}:trace-phase3:${turnNumber}` });
  } else {
    appendActivity({
      inserts, updates, appends, state, next, factual, partyId, turnNumber,
      changeSetId, idemId, inputDigest
    });
    const semanticExchange =
      factual.consequence.conversation?.semantic_exchange ?? null;
    if (semanticExchange !== null
        && (semanticExchange.exchange.applied_contribution_count > 0
          || semanticExchange.exchange.stop_reason === 'npc_unavailable')) {
      const semanticInput = buildNpcSemanticConversationWriteInput({
        state,
        next,
        semanticExchange
      });
      appendNpcSemanticConversationWrites({
        inserts,
        updates,
        appends,
        partyId,
        changeSetId,
        idempotencyRecordId: idemId,
        rootTurnId,
        workingRevision,
        sessionWrite: semanticInput.sessionWrite,
        semanticExchange: semanticInput.semanticExchange,
        signalRecords: semanticInput.signalRecords,
        actualMessageEvidence: semanticInput.actualMessageEvidence,
        persistedMessageStatements:
          semanticInput.persistedMessageStatements,
        persistedMessageAudiences:
          semanticInput.persistedMessageAudiences,
        supportingOperationEvidence:
          semanticInput.supportingOperationEvidence,
        partyStateVersion: semanticInput.partyStateVersion,
        sameTimeBatchRef: semanticInput.sameTimeBatchRef,
        contributions: semanticInput.contributions
      });
      appendPhase3SemanticConsequences({
        appends,
        inserts,
        state,
        factual,
        semanticExchange,
        partyId,
        turnNumber,
        changeSetId,
        inputDigest
      });
    } else if (semanticExchange === null) {
      appendConversation({
        appends, inserts, state, next, factual, partyId, turnNumber,
        changeSetId, inputDigest
      });
    }
  }
  return { inserts, updates, appends, deletes: [] };
}

function appendPhase3SemanticConsequences({
  appends,
  inserts,
  state,
  factual,
  semanticExchange,
  partyId,
  turnNumber,
  changeSetId,
  inputDigest
}) {
  const conversation = factual.consequence.conversation;
  appendPhase3SemanticInteraction({
    appends,
    state,
    factual,
    semanticExchange,
    partyId,
    turnNumber,
    changeSetId
  });
  const disclosure = semanticExchange.route_disclosure;
  if (disclosure != null) {
    appendKnowledge(
      inserts,
      state,
      partyId,
      disclosure.route_ref,
      [disclosure.source_statement_ref.entity_id]
    );
  }
  if (conversation.check_result == null) return;
  appends.push(row('party_check_resolutions',
    `check:${partyId}:trace-phase3:${turnNumber}`, {
      check_resolution_id:
        `check:${partyId}:trace-phase3:${turnNumber}`,
      party_id: partyId,
      check_scope_kind: 'immediate_action',
      check_scope_key: {
        request_id: factual.player_input.request_id,
        option_id: factual.mode_resolution.option_id
      },
      check_policy_ref: {
        entity_kind: 'check_policy',
        entity_id: factual.availability.check_requests[0].check_id,
        authoring_version: '1'
      },
      deterministic_roll_input_digest: canonicalDigest({
        input_digest: inputDigest,
        audit: conversation.check_result.audit
      }),
      roll_value: conversation.check_result.roll,
      modifier_snapshot: conversation.check_result.modifiers,
      target_value: conversation.check_result.difficulty,
      result_kind: conversation.check_result.outcome.success
        ? 'success'
        : 'failure',
      consequence_policy_ref: {
        entity_kind: 'consequence_policy',
        entity_id: conversation.consequence_ref,
        authoring_version: '1'
      },
      result_change_set_id: changeSetId,
      canonical_digest: canonicalDigest(conversation.check_result)
    }));
}
