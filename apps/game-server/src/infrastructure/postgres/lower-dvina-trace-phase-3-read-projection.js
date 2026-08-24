import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from './lower-dvina-trace-phase-2-projection.js';
import { phase3ActivityRef } from './lower-dvina-trace-phase-3-state.js';

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
    hypotheses: [], player_safe_interruption: null, allowed_action_affordances: []
  };
  const activity = phase3Contracts.activityPins.find(
    ({ id }) => id === phase3ActivityRef(factual));
  const dependencyPins = [{
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'activity_profile', entity_id: activity.id },
    version_pin: {
      pin_kind: 'authoring_version', authoring_version: String(activity.version),
      state_version: null
    }
  }];
  return {
    package_id: `visible:${partyId}:trace-phase3:${turnNumber}`,
    party_id: partyId, turn_id: `turn:${partyId}:${turnNumber}`,
    committed_state_version: String(nextVersion), change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload, presentation_status: 'pending',
    projection_policy_ref: {
      entity_ref: {
        entity_kind: 'visibility_modifier',
        entity_id: 'lower_dvina_trace_phase_3_visible_v1'
      },
      authoring_version: '1'
    },
    dependency_pins: {
      pins: dependencyPins, canonical_digest: canonicalDigest(dependencyPins)
    },
    idempotency_record_id: idemId
  };
}

export function pendingScreenFor({ state, factual, visibleEnvelope }) {
  const screen = {
    version: 1, schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1', party_id: state.party_id,
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
