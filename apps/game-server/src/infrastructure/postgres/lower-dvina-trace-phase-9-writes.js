import { appendActivity, appendMovement, appendPacket, appendTemporaryDisposition, phase9ActivityRef } from './lower-dvina-trace-phase-9-disposition-writes.js';
import { appendBody, appendConversation, appendKnowledge } from './lower-dvina-trace-phase-9-consequence-writes.js';
export { phase9ActivityRef } from './lower-dvina-trace-phase-9-disposition-writes.js';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { appendPhase4ActivityExecution } from './lower-dvina-trace-phase-4-activity-writes.js';
import { appendPhase3MovementTraversal } from './lower-dvina-trace-phase-3-movement-writes.js';
import { appendNpcSemanticConversationWrites, buildNpcSemanticConversationWriteInput } from './npc-semantic-conversation-writes.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from './lower-dvina-trace-phase-2-projection.js';
export function phase9VisibleEnvelope({ partyId, factual, visibleContext, nextVersion, turnNumber, changeSetId, idemId }) {
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
    allowed_action_affordances: [],
  };
  const pins = [
    {
      dependency_role: 'source_authoring',
      entity_ref: {
        entity_kind: 'source_record',
        entity_id: 'lower_dvina_trace_v17',
      },
      version_pin: {
        pin_kind: 'authoring_version',
        authoring_version: '17',
        state_version: null,
      },
    },
  ];
  return {
    package_id: `visible:${partyId}:trace-phase9:${turnNumber}`,
    party_id: partyId,
    turn_id: factual.mode_resolution.turn_id,
    committed_state_version: String(nextVersion),
    change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload,
    presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_modifier',
        entity_id: 'lower_dvina_phase9_visible_v1',
      },
      authoring_version: '1',
    },
    dependency_pins: { pins, canonical_digest: canonicalDigest(pins) },
    idempotency_record_id: idemId,
  };
}
export function phase9PendingScreen({ state, factual, envelope, turnNumber, nextVersion }) {
  const screen = {
    version: 1,
    schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1',
    party_id: state.party_id,
    turn_id: factual.mode_resolution.turn_id,
    turn_number: turnNumber,
    screen_status: 'committed_presentation_pending',
    opening_screen_digest: state.opening_identity.opening_screen_digest,
    current_projection_anchor: {
      committed_state_version: nextVersion,
      package_id: envelope.package_id,
      package_digest: envelope.package_digest,
      narration_output_digest: null,
    },
    visible_context: phase2VisibleContextFromPayload(envelope.visible_payload),
    main_prose: envelope.visible_payload.perceived_scene,
  };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}

export function phase9Writes({ partyId, state, next, factual, turnNumber, changeSetId, idemId, envelope, screen, contracts }) {
  const kind = factual.consequence.phase9_kind;
  const phase9 = factual.consequence.phase9;
  const inserts = [
    row('party_state_snapshots', `${partyId}:${next.party_state.state_version}`, {
      party_id: partyId,
      state_version: next.party_state.state_version,
      state_payload: next,
      state_digest: canonicalDigest(next),
    }),
  ];
  const updates = [
    row('parties', partyId, { party_id: partyId, status: 'active' }),
    row('party_server_sessions', partyId, {
      party_id: partyId,
      turn_number: turnNumber,
      last_turn_id: factual.mode_resolution.turn_id,
      screen,
      updated_change_set_id: changeSetId,
    }),
    row('party_clocks', partyId, {
      party_id: partyId,
      ...next.clock,
      updated_change_set_id: changeSetId,
    }),
  ];
  const appends = [
    row('party_v3_change_sets', changeSetId, {
      id: changeSetId,
      party_id: partyId,
      operation_kind: `trace_phase_9_${kind}`,
      idempotency_record_id: idemId,
    }),
  ];
  appendBody(updates, appends, {
    partyId,
    state,
    next,
    changeSetId,
    idemId,
    turnNumber,
  });
  if (factual.consequence.duration_minutes > 0) {
    appendActivity({
      inserts,
      updates,
      appends,
      partyId,
      state,
      next,
      factual,
      turnNumber,
      changeSetId,
      idemId,
      contracts,
    });
  }
  if (['bag_recovery', 'bag_opened'].includes(kind)) {
    const bag = next.containers.find(({ container_id: id }) => id === phase9.property_transition.subject_id);
    updates.push(
      row('party_containers', bag.container_id, {
        party_id: partyId,
        container_id: bag.container_id,
        state: bag.state,
        anchor_id: bag.anchor_id ?? null,
        parent_container_id: bag.parent_container_id ?? null,
        holder_npc_id: bag.holder_npc_id ?? null,
        holder_character_id: bag.holder_character_id ?? null,
        physical_position: bag.physical_position ?? null,
        closure_state: bag.closure_state,
        updated_change_set_id: changeSetId,
      }),
    );
  }
  if (kind === 'packet_recovered') appendPacket({ updates, partyId, next, phase9 });
  if (kind === 'return_to_camp')
    appendMovement({
      inserts,
      updates,
      appends,
      partyId,
      state,
      next,
      factual,
      turnNumber,
      changeSetId,
      idemId,
      contracts,
    });
  if (kind === 'onisim_testimony')
    appendConversation({
      inserts,
      updates,
      appends,
      partyId,
      state,
      next,
      factual,
      changeSetId,
      idemId,
    });
  if (kind === 'temporary_disposition')
    appendTemporaryDisposition({
      updates,
      appends,
      partyId,
      state,
      next,
      factual,
      turnNumber,
      changeSetId,
      idemId,
      contracts,
    });
  appendKnowledge({ inserts, partyId, state, next, changeSetId });
  return { inserts, updates, appends, deletes: [] };
}
