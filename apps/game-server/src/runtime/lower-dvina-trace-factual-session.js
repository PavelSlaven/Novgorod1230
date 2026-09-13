import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';
import { validateLowerDvinaFactualTurnDeliveryScreen } from '@rus/presentation';

export function validFactualPostTurnSession({ partyId, session, screen,
  allowedSnapshotSchemas, expectedScreen }) {
  if (expectedScreen == null) return false;
  const payload = session.current_projection_payload;
  const turnNumber = Number(session.turn_number);
  const stateVersion = Number(session.current_party_state_version);
  const snapshot = session.current_party_snapshot_payload;
  const snapshotTurnNumber = snapshot?.party_state?.turn_number;
  const payloadErrors = visiblePayloadErrors({ partyId,
    turnId: screen.turn_id, turnNumber, packageId: screen.package_id,
    packageDigest: session.current_projection_package_digest,
    committedStateVersion: screen.committed_state_version, payload });
  const expectedContext = payload && visibleContextFromPayload(payload);
  return validateLowerDvinaFactualTurnDeliveryScreen(screen).ok
    && screen.party_id === partyId
    && allowedSnapshotSchemas.includes(session.party_snapshot_schema)
    && Number.isSafeInteger(turnNumber) && turnNumber >= 1
    && Number.isSafeInteger(stateVersion) && stateVersion >= 1
    && snapshot != null
    && session.current_party_snapshot_digest === canonicalDigest(snapshot)
    && Number.isSafeInteger(snapshotTurnNumber) && snapshotTurnNumber >= 1
    && session.last_turn_id === screen.turn_id
    && session.current_projection_turn_id === screen.turn_id
    && screen.turn_number === turnNumber
    && snapshotTurnNumber === turnNumber
    && screen.committed_state_version === String(stateVersion)
    && screen.committed_state_version
      === String(session.current_projection_state_version)
    && screen.package_id === session.current_projection_package_id
    && session.current_projection_package_digest
      === computeSpatialV3CanonicalDigest(payload)
    && !payloadErrors.some(({ field }) =>
      String(field).startsWith('visible_payload'))
    && canonicalDigest(screen.visible_context)
      === canonicalDigest(expectedContext)
    && canonicalDigest(screen.visible_changes)
      === canonicalDigest(expectedContext?.visible_changes)
    && canonicalDigest(screen.uncertainties)
      === canonicalDigest(expectedContext?.uncertainties)
    && session.current_narration_status === 'delivered'
    && session.current_narration_delivery_mode === 'factual'
    && session.current_narration_output == null
    && session.current_narration_output_digest == null
    && canonicalDigest(session.current_narration_factual_screen)
      === canonicalDigest(screen)
    && canonicalDigest(screen) === canonicalDigest(expectedScreen);
}

export function visiblePayloadErrors({
  partyId, turnId, turnNumber, packageId, packageDigest,
  committedStateVersion, payload
}) {
  return validateSpatialV3Contract('visible_package_persistence_envelope', {
    package_id: packageId, party_id: partyId, turn_id: turnId,
    committed_state_version: String(committedStateVersion ?? ''),
    change_set_id: `change:${partyId}:trace-phase2:${turnNumber}`,
    package_digest: packageDigest, visible_payload: payload,
    presentation_status: 'pending', projection_policy_ref: {
      entity_ref: { entity_kind: 'visibility_modifier',
        entity_id: 'lower_dvina_trace_phase_2_visible_v1' },
      authoring_version: '1'
    }, dependency_pins: { pins: [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'activity_profile',
        entity_id: 'trace_ld_v1_activity_detailed_wreck_inspection' },
      version_pin: { pin_kind: 'authoring_version', authoring_version: '1',
        state_version: null } }], canonical_digest: 'placeholder' },
    idempotency_record_id: 'placeholder'
  });
}

export function visibleContextFromPayload(payload) {
  return { version: 1, schema: 'visible_context_package',
    visible_scene: payload.perceived_scene,
    visible_changes: payload.perceived_changes,
    sensory_details: payload.sensory_details,
    visible_npc: payload.visible_npcs,
    visible_objects: payload.visible_objects,
    known_context: payload.known_context,
    uncertainties: payload.uncertainties,
    allowed_tensions: [], do_not_imply: [] };
}
