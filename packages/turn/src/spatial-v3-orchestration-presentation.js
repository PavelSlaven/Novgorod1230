import { inspectVisiblePackageEnvelope } from './visible-package-security.js';
import { clone, digest, exact, freeze, record, same, text } from './spatial-v3-orchestration-core.js';

export function createPresentationCoordinator({
  loadCommittedVisiblePackage, claimPresentationAttempt, narrate,
  persistNarrationOutput, finalizePresentationAttempt, projectScreen
}) {
  async function presentPersistedPackage({ partyId, packageId, packageDigest, changeSetId, dependencyPins }) {
    let loaded;
    try {
      loaded = await loadCommittedVisiblePackage(freeze({ party_id: partyId, package_id: packageId, package_digest: packageDigest }));
    } catch (error) {
      return pendingPresentationFallback(null, { stage: 'load_committed_package', message: safeError(error) });
    }
    const envelopeFailure = validateVisibleEnvelope(loaded?.envelope, { partyId, changeSetId, dependencyPins, expectedPackageId: packageId, expectedPackageDigest: packageDigest, requirePending: true });
    if (envelopeFailure) return pendingPresentationFallback(null, { stage: 'load_committed_package', ...envelopeFailure.diagnostics });
    const envelope = loaded.envelope;
    const presentationIdempotencyKey = `presentation:${envelope.package_id}:${envelope.package_digest}`;
    let claimed;
    try {
      claimed = await claimPresentationAttempt(freeze({ party_id: partyId, package_id: envelope.package_id, package_digest: envelope.package_digest, presentation_idempotency_key: presentationIdempotencyKey }));
    } catch (error) {
      return pendingPresentationFallback(envelope, { stage: 'claim_presentation', message: safeError(error) });
    }
    const dispositions = new Set(['claimed', 'in_progress', 'output_ready', 'delivered']);
    if (!claimed?.ok || !dispositions.has(claimed.disposition) || !text(claimed.attempt_id)) return pendingPresentationFallback(envelope, { stage: 'claim_presentation', message: 'Presentation claim returned an invalid state.' });
    if (claimed.disposition === 'in_progress') return pendingPresentationFallback(envelope, { stage: 'claim_presentation', message: 'A durable narration attempt is already in progress.' });

    let narrationResult = null;
    const attemptId = claimed.attempt_id;
    let claimToken = null;
    if (claimed.disposition === 'delivered') {
      if (!validPersistedNarration(claimed.narration_result, partyId, envelope) || claimed.output_digest !== claimed.narration_result.canonical_digest || claimed.presentation_outcome?.presentation_status !== 'delivered' || claimed.presentation_outcome?.attempt_id !== attemptId || claimed.presentation_outcome?.output_digest !== claimed.output_digest) return pendingPresentationFallback(envelope, { stage: 'claim_presentation', message: 'Delivered presentation replay is invalid.' });
      return complete('resolved', envelope, claimed.narration_result, claimed.presentation_outcome);
    }
    if (claimed.disposition === 'output_ready') {
      if (!validPersistedNarration(claimed.narration_result, partyId, envelope) || claimed.output_digest !== claimed.narration_result.canonical_digest) return pendingPresentationFallback(envelope, { stage: 'claim_presentation', message: 'Persisted narration output is invalid.' });
      narrationResult = claimed.narration_result;
    } else {
      claimToken = text(claimed.claim_token);
      if (!claimToken) return pendingPresentationFallback(envelope, { stage: 'claim_presentation', message: 'Claimed narration attempt has no claim token.' });
      const narrated = await invokeNarration({ partyId, envelope, attemptId, claimToken, presentationIdempotencyKey });
      if (!narrated.ok) return narrated.result;
      narrationResult = narrated.narration;
      const persisted = await persistOutput({ partyId, envelope, attemptId, claimToken, presentationIdempotencyKey, narrationResult });
      if (!persisted.ok) return persisted.result;
      narrationResult = persisted.narration;
    }
    let presentationOutcome = null;
    try {
      const finalized = await finalizePresentationAttempt(freeze({ party_id: partyId, package_id: envelope.package_id, package_digest: envelope.package_digest, presentation_idempotency_key: presentationIdempotencyKey, attempt_id: attemptId, presentation_status: 'delivered', output_digest: narrationResult.canonical_digest, failure: null }));
      if (validPresentationOutcome(finalized, 'delivered', attemptId, narrationResult.canonical_digest)) presentationOutcome = finalized;
    } catch {
      // output_ready is durable; a retry repeats only this final CAS transition.
    }
    return complete(presentationOutcome ? 'resolved' : 'committed_presentation_pending', envelope, narrationResult, presentationOutcome);
  }

  async function invokeNarration({ partyId, envelope, attemptId, claimToken, presentationIdempotencyKey }) {
    let narrationFailure = null;
    let narrationResult = null;
    try {
      const narration = await narrate(freeze({ party_id: partyId, visible_package: clone(envelope), attempt_id: attemptId, claim_token: claimToken, presentation_idempotency_key: presentationIdempotencyKey }));
      if (!narration?.ok || !validPersistedNarration(narration.result, partyId, envelope)) narrationFailure = { stage: 'narrate', message: 'Narrator returned an invalid persisted-package result.' };
      else narrationResult = narration.result;
    } catch (error) { narrationFailure = { stage: 'narrate', message: safeError(error) }; }
    if (!narrationFailure) return { ok: true, narration: narrationResult };
    let failureOutcome = null;
    try {
      const finalized = await finalizePresentationAttempt(freeze({ party_id: partyId, package_id: envelope.package_id, package_digest: envelope.package_digest, presentation_idempotency_key: presentationIdempotencyKey, attempt_id: attemptId, claim_token: claimToken, presentation_status: 'failed_retryable', output_digest: null, failure: clone(narrationFailure) }));
      if (validPresentationOutcome(finalized, 'failed_retryable', attemptId, null)) failureOutcome = finalized;
    } catch {
      // The durable claim remains in progress; concurrent retries cannot narrate.
    }
    return { ok: false, result: await complete('committed_presentation_pending', envelope, null, failureOutcome) };
  }

  async function persistOutput({ partyId, envelope, attemptId, claimToken, presentationIdempotencyKey, narrationResult }) {
    let persistedOutput;
    try {
      persistedOutput = await persistNarrationOutput(freeze({ party_id: partyId, package_id: envelope.package_id, package_digest: envelope.package_digest, presentation_idempotency_key: presentationIdempotencyKey, attempt_id: attemptId, claim_token: claimToken, narration_result: clone(narrationResult), output_digest: narrationResult.canonical_digest }));
    } catch (error) { return { ok: false, result: await pendingPresentationFallback(envelope, { stage: 'persist_narration_output', message: safeError(error) }) }; }
    if (!persistedOutput?.ok || persistedOutput.disposition !== 'output_ready' || persistedOutput.attempt_id !== attemptId || persistedOutput.output_digest !== narrationResult.canonical_digest || !validPersistedNarration(persistedOutput.narration_result, partyId, envelope) || !same(persistedOutput.narration_result, narrationResult)) return { ok: false, result: await pendingPresentationFallback(envelope, { stage: 'persist_narration_output', message: 'Narration output was not durably persisted.' }) };
    return { ok: true, narration: persistedOutput.narration_result };
  }

  async function complete(outerStatus, envelope, narration, presentationOutcome, diagnostic = undefined) {
    return { outer_status: outerStatus, visible_package: envelope, narration, presentation_outcome: presentationOutcome, screen: await safeProjectScreen({ visible_package: clone(envelope), narration_result: narration ? clone(narration) : null, outer_status: outerStatus, ...(diagnostic ? { diagnostic } : {}) }) };
  }
  async function pendingPresentationFallback(envelope, diagnostic) {
    const safeEnvelope = record(envelope) ? envelope : { package_id: 'unavailable', party_id: 'unavailable', visible_payload: {}, presentation_status: 'failed_retryable' };
    return complete('committed_presentation_pending', safeEnvelope, null, null, diagnostic);
  }
  async function safeProjectScreen(input) {
    try {
      const projected = await projectScreen(freeze(clone(input)));
      if (projected?.ok && record(projected.screen)) return projected.screen;
    } catch {
      // The factual commit is durable, so this fallback never mutates state.
    }
    return freeze({ schema: 'committed_visible_facts', visible_payload: clone(input.visible_package?.visible_payload ?? {}), narration: input.narration_result?.text ?? null, outer_status: input.outer_status });
  }
  return freeze({ presentPersistedPackage });
}

export function validateVisibleEnvelope(value, { partyId, turnId = null, changeSetId = null, dependencyPins = null, expectedPackageId = null, expectedPackageDigest = null, requirePending } = {}) {
  if (!record(value)) return { code: 'visible_package_persistence_gap', diagnostics: { reason: 'envelope missing' } };
  const inspection = inspectVisiblePackageEnvelope(value);
  if (!inspection.ok) return { code: inspection.code, diagnostics: { field: inspection.field, reason: inspection.message } };
  if (value.party_id !== partyId || (turnId && value.turn_id !== turnId) || (changeSetId && value.change_set_id !== changeSetId) || (dependencyPins && !same(value.dependency_pins, dependencyPins)) || (expectedPackageId && value.package_id !== expectedPackageId) || (expectedPackageDigest && value.package_digest !== expectedPackageDigest) || value.package_digest !== digest(value.visible_payload) || (requirePending && value.presentation_status !== 'pending')) return { code: 'visible_package_persistence_gap', diagnostics: { reason: 'envelope identity, digest, pins or status mismatch' } };
  return null;
}
export function containsNarrationOutput(value, ancestors = new WeakSet()) {
  if (!value || typeof value !== 'object') return false;
  if (ancestors.has(value)) return true;
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:narration|narrator_output|approved_narration|prose)$/u.test(key) || containsNarrationOutput(child, ancestors)) return true;
  }
  ancestors.delete(value); return false;
}
function validPersistedNarration(value, partyId, envelope) { return exact(value, 'approved_narration', partyId, envelope.dependency_pins) && value.package_digest === envelope.package_digest; }
function validPresentationOutcome(value, presentationStatus, attemptId, outputDigest) { return value?.ok === true && value.presentation_status === presentationStatus && value.attempt_id === attemptId && (value.output_digest ?? null) === outputDigest; }
function safeError(error) { return text(error?.message) || 'presentation port failed'; }
