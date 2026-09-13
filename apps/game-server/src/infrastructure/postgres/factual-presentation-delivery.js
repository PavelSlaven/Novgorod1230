import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createFactualTurnDeliveryScreenReadModel,
  validateLowerDvinaFactualTurnDeliveryScreen } from '@rus/presentation';
import { buildPhase2PreProseCarrier, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';

export function buildFactualTurnDelivery({
  envelope,
  payload = envelope?.snapshot_payload,
  presentation = null,
  visibleContext,
  requestVisibleContext,
  turnNumber
}) {
  if (canonicalDigest(visibleContext) !== canonicalDigest(requestVisibleContext)) {
    throw presentationError();
  }
  const envelopeTurnNumber = factualEnvelopeTurnNumber(envelope);
  if (envelopeTurnNumber == null || turnNumber !== envelopeTurnNumber) {
    throw presentationError();
  }
  if (payload == null || canonicalDigest(payload) !== envelope.state_digest) {
    throw presentationError();
  }
  const carrier = buildPhase2PreProseCarrier({ payload, turnId: envelope.turn_id,
    visibleContext, visiblePayload: envelope.visible_payload, presentation });
  const currentProjectionAnchor = { ...carrier.current_projection_anchor,
    committed_state_version: String(carrier.current_projection_anchor.committed_state_version) };
  const screen = createFactualTurnDeliveryScreenReadModel({
    partyId: envelope.party_id, turnId: envelope.turn_id, turnNumber: envelopeTurnNumber,
    packageId: envelope.package_id, committedStateVersion: envelope.committed_state_version,
    visibleContext, visibleChanges: visibleContext.visible_changes,
    uncertainties: visibleContext.uncertainties,
    actions: carrier.actions,
    checks: carrier.checks,
    panels: carrier.panels,
    actionPanel: carrier.action_panel,
    inputPanel: carrier.input_panel,
    scenarioId: carrier.scenario_id,
    screenKind: carrier.screen_kind,
    deliveryState: carrier.delivery_state,
    openingScreenDigest: carrier.opening_screen_digest,
    combatState: carrier.combat_state,
    currentProjectionAnchor,
    presentationContext: carrier.presentation_context,
    sceneAssetId: carrier.scene_asset_id
  });
  if (!validFactualTurnDelivery(screen, envelope)) throw presentationError();
  return screen;
}

export function validFactualTurnDelivery(screen, envelope) {
  const visibleContext = factualVisibleContext(envelope);
  const turnNumber = factualEnvelopeTurnNumber(envelope);
  return visibleContext != null
    && turnNumber != null
    && validateLowerDvinaFactualTurnDeliveryScreen(screen).ok
    && screen.party_id === envelope.party_id
    && screen.turn_id === envelope.turn_id
    && screen.package_id === envelope.package_id
    && screen.committed_state_version === String(envelope.committed_state_version)
    && screen.turn_number === turnNumber
    && screen.presentation_quality === 'degraded'
    && factualCarrierIsBound(screen, envelope)
    && canonicalDigest(screen.visible_context) === canonicalDigest(visibleContext)
    && canonicalDigest(screen.visible_changes)
      === canonicalDigest(visibleContext.visible_changes)
    && canonicalDigest(screen.uncertainties)
      === canonicalDigest(visibleContext.uncertainties);
}

function factualCarrierIsBound(screen, envelope) {
  const anchor = screen.current_projection_anchor;
  return anchor?.committed_state_version === String(envelope.committed_state_version)
    && anchor.package_id === envelope.package_id
    && anchor.package_digest === envelope.package_digest
    && anchor.narration_output_digest === null
    && screen.action_panel?.suggested_actions != null
    && canonicalDigest(screen.action_panel.suggested_actions)
      === canonicalDigest(screen.actions);
}

export function factualEnvelopeTurnNumber(envelope) {
  const payload = envelope?.snapshot_payload;
  const turnNumber = payload?.party_state?.turn_number;
  return payload != null && envelope?.state_digest === canonicalDigest(payload)
    && Number.isSafeInteger(turnNumber) && turnNumber >= 1
    ? turnNumber : null;
}

function factualVisibleContext(envelope) {
  if (!envelope?.visible_payload
      || envelope.package_digest
        !== computeSpatialV3CanonicalDigest(envelope.visible_payload)) {
    return null;
  }
  return phase2VisibleContextFromPayload(envelope.visible_payload);
}

function presentationError() {
  return Object.assign(
    new Error('Persisted Phase 2 narration lifecycle is inconsistent.'),
    { code: 'TRACE_PHASE_2_PRESENTATION_INVALID' }
  );
}
