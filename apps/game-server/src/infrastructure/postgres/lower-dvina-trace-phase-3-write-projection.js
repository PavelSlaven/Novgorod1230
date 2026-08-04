import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from './lower-dvina-trace-phase-2-projection.js';
import { appendActivity } from './lower-dvina-trace-phase-3-activity-writes.js';
import { appendConversation, appendKnowledge } from './lower-dvina-trace-phase-3-conversation-writes.js';
import {
  appendPhase3MovementTraversal
} from './lower-dvina-trace-phase-3-movement-writes.js';
import { phase3ActivityRef } from './lower-dvina-trace-phase-3-state.js';
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
    phase3Contracts, rootTurnId, workingRevision
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
  if (factual.consequence.phase3_kind === 'movement') {
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
    operation_kind: 'trace_phase_3_turn',
    idempotency_record_id: idemId
  })];
  if (factual.consequence.phase3_kind === 'movement') {
    appendPhase3MovementTraversal({
      inserts, updates, appends, state, factual, partyId, turnNumber,
      changeSetId, idemId, phase3Contracts
    });
    appendKnowledge(inserts, state, partyId,
      'trace_ld_v1_route_camp_to_wreck', []);
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
        && semanticExchange.exchange.applied_contribution_count > 0) {
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

export function visibleEnvelopeFor({
  partyId, nextVersion, turnNumber, changeSetId, idemId,
  visibleContext, factual, phase3Contracts
}) {
  const payload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: visibleContext.visible_scene,
    perceived_changes: visibleContext.visible_changes,
    sensory_details: visibleContext.sensory_details,
    visible_npcs: visibleContext.visible_npc,
    visible_objects: visibleContext.visible_objects,
    known_context: visibleContext.known_context,
    uncertainties: visibleContext.uncertainties,
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const activity = phase3Contracts.activityPins.find(
      ({ id }) => id === phase3ActivityRef(factual)
  );
  const dependencyPins = [{
    dependency_role: 'source_authoring',
    entity_ref: {
      entity_kind: 'activity_profile',
      entity_id: activity.id
    },
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: String(activity.version),
      state_version: null
    }
  }];
  return {
    package_id: `visible:${partyId}:trace-phase3:${turnNumber}`,
    party_id: partyId,
    turn_id: `turn:${partyId}:${turnNumber}`,
    committed_state_version: String(nextVersion),
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload,
    presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_modifier',
        entity_id: 'lower_dvina_trace_phase_3_visible_v1'
      },
      authoring_version: '1'
    },
    dependency_pins: {
      pins: dependencyPins,
      canonical_digest: canonicalDigest(dependencyPins)
    },
    idempotency_record_id: idemId
  };
}

export function pendingScreenFor({ state, factual, visibleEnvelope }) {
  const screen = {
    version: 1,
    schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1',
    party_id: state.party_id,
    turn_id: factual.mode_resolution.turn_id,
    turn_number: state.party_state.turn_number,
    screen_status: 'committed_presentation_pending',
    opening_screen_digest: state.opening_identity.opening_screen_digest,
    current_projection_anchor: {
      committed_state_version: state.party_state.state_version,
      package_id: visibleEnvelope.package_id,
      package_digest: visibleEnvelope.package_digest,
      narration_output_digest: null
    },
    visible_context:
      phase2VisibleContextFromPayload(visibleEnvelope.visible_payload),
    main_prose: 'Факты хода сохранены; повествование ожидает повторной доставки.'
  };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}
