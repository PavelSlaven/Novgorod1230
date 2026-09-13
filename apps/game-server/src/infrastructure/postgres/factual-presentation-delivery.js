import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createFactualTurnDeliveryScreenReadModel,
  validateFactualTurnDeliveryScreen } from '@rus/presentation';
import { phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';

export function buildFactualTurnDelivery({ envelope, visibleContext, requestVisibleContext, turnNumber }) {
  if (canonicalDigest(visibleContext) !== canonicalDigest(requestVisibleContext)) {
    throw presentationError();
  }
  const envelopeTurnNumber = factualEnvelopeTurnNumber(envelope);
  if (envelopeTurnNumber == null || turnNumber !== envelopeTurnNumber) {
    throw presentationError();
  }
  const screen = createFactualTurnDeliveryScreenReadModel({
    partyId: envelope.party_id, turnId: envelope.turn_id, turnNumber: envelopeTurnNumber,
    packageId: envelope.package_id, committedStateVersion: envelope.committed_state_version,
    visibleContext, visibleChanges: visibleContext.visible_changes,
    uncertainties: visibleContext.uncertainties, panels: {}
  });
  if (!validFactualTurnDelivery(screen, envelope)) throw presentationError();
  return screen;
}

export function validFactualTurnDelivery(screen, envelope) {
  const visibleContext = factualVisibleContext(envelope);
  const turnNumber = factualEnvelopeTurnNumber(envelope);
  return visibleContext != null
    && turnNumber != null
    && validateFactualTurnDeliveryScreen(screen).ok
    && screen.party_id === envelope.party_id
    && screen.turn_id === envelope.turn_id
    && screen.package_id === envelope.package_id
    && screen.committed_state_version === String(envelope.committed_state_version)
    && screen.turn_number === turnNumber
    && canonicalDigest(screen.visible_context) === canonicalDigest(visibleContext)
    && canonicalDigest(screen.visible_changes)
      === canonicalDigest(visibleContext.visible_changes)
    && canonicalDigest(screen.uncertainties)
      === canonicalDigest(visibleContext.uncertainties);
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
