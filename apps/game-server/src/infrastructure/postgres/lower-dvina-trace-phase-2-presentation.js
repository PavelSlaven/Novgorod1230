import { canonicalDigest } from '@rus/materialization';
import { validateTerminalNarrationPolicyRejection } from '@rus/narration';
import { buildFactualTurnDelivery, validFactualTurnDelivery,
  rebuildExpectedFactualTurnDelivery, factualTurnDeliveryMatchesExpected } from
  './factual-presentation-delivery.js';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  createTemporalPresentationPostgresStore
} from './temporal-presentation-store.js';
import { queryWithTurnDeadline } from './query-with-turn-deadline.js';
import { phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';
import { loadLowerDvinaTraceScreenPresentation } from
  '../../internal/lower-dvina-trace-screen-presentation.js';

export function createLowerDvinaTracePhase2DurableNarrator({
  partyPool,
  narrationService,
  presentationStore = null,
  recordDiagnosticFailure = null
} = {}) {
  if (!partyPool?.query || typeof narrationService?.run !== 'function') {
    throw new TypeError(
      'Phase 2 durable narrator requires PostgreSQL and narration owner.'
    );
  }
  const store = presentationStore
    ?? createTemporalPresentationPostgresStore({ pool: partyPool });
  return Object.freeze({
    async run(request) {
      const turnBudget = request.turnBudget ?? null;
      const narrationRequest = { ...request };
      delete narrationRequest.turnBudget;
      const deliveryTurnNumber = narrationRequest.delivery_turn_number;
      delete narrationRequest.delivery_turn_number;
      const envelope = await loadEnvelope(
        partyPool,
        request.party_id,
        request.request_id,
        request.visible_context,
        turnBudget
      );
      const identity = {
        party_id: envelope.party_id,
        package_id: envelope.package_id,
        package_digest: envelope.package_digest,
        presentation_idempotency_key:
          `presentation:${envelope.package_id}:${envelope.package_digest}`
      };
      const claimed = await store.claimPresentationAttempt({ ...identity, turnBudget });
      if (!claimed?.ok) throw presentationError();
      if (claimed.disposition === 'factual_delivered') {
        if (!validFactualTurnDelivery(claimed.factual_screen, envelope)
            || !factualTurnDeliveryMatchesExpected(claimed.factual_screen,
              rebuildExpectedFactualTurnDelivery({ envelope,
                presentation: await loadLowerDvinaTraceScreenPresentation(envelope.snapshot_payload) }))) {
          throw presentationError();
        }
        return Object.freeze({ factual_delivery: structuredClone(claimed.factual_screen) });
      }
      if (claimed.disposition === 'delivered'
          || claimed.disposition === 'output_ready') {
        const flow = claimed.narration_result?.flow_result;
        if (!validPersistedFlow(flow, claimed.narration_result, envelope)) {
          throw presentationError();
        }
        if (claimed.disposition === 'output_ready') {
          await finalize(store, identity, claimed, envelope, turnBudget);
        }
        return withPresentation(flow, claimed.narration_result);
      }
      if (claimed.disposition === 'in_progress') {
        const error = presentationError();
        error.code = 'TRACE_PHASE_2_NARRATION_IN_PROGRESS';
        throw error;
      }
      let flow;
      try {
        flow = await narrationService.run(narrationRequest);
      } catch (error) {
        await store.finalizePresentationAttempt({
          ...identity,
          turnBudget,
          attempt_id: claimed.attempt_id,
          claim_token: claimed.claim_token,
          presentation_status: 'failed_retryable',
          failure: {
            stage: 'narration',
            message: 'Narration provider failed.'
          }
        });
        const rejected = presentationError();
        rejected.code = 'TRACE_PHASE_2_NARRATION_REJECTED';
        throw rejected;
      }
      if (flow?.status !== 'approved' || flow.pass !== true
          || !flow.approved_output?.prose) {
        if (validateTerminalNarrationPolicyRejection(flow, narrationRequest).ok) {
          recordNarrationFailure(recordDiagnosticFailure, flow);
          if (deliveryTurnNumber !== envelope.turn_number) throw presentationError();
          const factualScreen = buildFactualTurnDelivery({ envelope,
            payload: envelope.snapshot_payload,
            presentation: await loadLowerDvinaTraceScreenPresentation(
              envelope.snapshot_payload),
            visibleContext: phase2VisibleContextFromPayload(envelope.visible_payload),
            requestVisibleContext: request.visible_context, turnNumber: deliveryTurnNumber });
          const finalized = await store.finalizeFactualPresentationAttempt({
            ...identity,
            turnBudget,
            attempt_id: claimed.attempt_id,
            claim_token: claimed.claim_token,
            factual_screen: factualScreen
          });
          if (!finalized?.ok || finalized.presentation_status !== 'factual_delivered') {
            throw presentationError();
          }
          return Object.freeze({ factual_delivery: factualScreen });
        }
        await store.finalizePresentationAttempt({
          ...identity,
          turnBudget,
          attempt_id: claimed.attempt_id,
          claim_token: claimed.claim_token,
          presentation_status: 'failed_retryable',
          failure: {
            stage: 'narration_audit',
            message: 'Narration flow did not produce approved prose.'
          }
        });
        const error = presentationError();
        error.code = 'TRACE_PHASE_2_NARRATION_REJECTED';
        error.details = narrationFailureDetails(flow);
        recordNarrationFailure(recordDiagnosticFailure, flow);
        throw error;
      }
      const persistedNarration = sealApprovedNarration({
        envelope,
        flow
      });
      const persisted = await store.persistNarrationOutput({
        ...identity,
        turnBudget,
        attempt_id: claimed.attempt_id,
        claim_token: claimed.claim_token,
        narration_result: persistedNarration,
        output_digest: persistedNarration.canonical_digest
      });
      if (!persisted?.ok || persisted.disposition !== 'output_ready') {
        throw presentationError();
      }
      await finalize(store, identity, {
        attempt_id: claimed.attempt_id,
        output_digest: persistedNarration.canonical_digest
      }, envelope, turnBudget);
      return withPresentation(flow, persistedNarration);
    }
  });
}

function narrationFailureDetails(flow) {
  const audits = Array.isArray(flow?.audit_history)
    ? flow.audit_history.map(({ value }) => value).filter(Boolean) : [];
  const audit = audits.at(-1);
  const concerns = Array.isArray(audit?.concerns) ? audit.concerns : [];
  return {
    phase: flow?.diagnostics?.phase,
    concern_count: concerns.length,
    concern_kinds: concerns.map(({ kind }) => kind),
    audit_attempts: audits.map((candidate, index) => ({
      ordinal: index + 1,
      failed_checks: [
        ...(candidate?.pass === false ? ['policy'] : []),
        ...(candidate?.artistic_verdict === 'fail' ? ['artistic'] : []),
        ...(candidate?.technical_verdict === 'fail' ? ['technical'] : [])
      ],
      coverage_refs: ['visible_changes', 'uncertainties'].flatMap((kind) =>
        Array.isArray(candidate?.coverage?.[kind])
          ? candidate.coverage[kind].map(({ source_index: sourceIndex,
            segment_ids: segmentIds }) => ({ kind, source_index: sourceIndex,
            covered: Array.isArray(segmentIds) && segmentIds.length > 0 }))
          : [])
    }))
  };
}

function recordNarrationFailure(recordDiagnosticFailure, flow) {
  const error = presentationError();
  error.code = 'TRACE_PHASE_2_NARRATION_REJECTED';
  error.details = narrationFailureDetails(flow);
  try { recordDiagnosticFailure?.(error); } catch {
    // Diagnostics must not replace factual delivery or typed presentation failure.
  }
}

async function loadEnvelope(pool, partyId, turnId, visibleContext, turnBudget = null) {
  if (typeof partyId !== 'string' || !partyId.trim()) throw presentationError();
  const result = await queryWithTurnDeadline(pool, { text: `SELECT visible.package_id,visible.party_id,visible.turn_id,visible.committed_state_version,
            visible.change_set_id,visible.package_digest,visible.visible_payload,
            visible.presentation_status,visible.projection_policy_ref,visible.dependency_pins,
            visible.idempotency_record_id,snapshot.state_payload AS snapshot_payload,
            snapshot.state_digest
       FROM party_runtime.party_visible_packages visible
       JOIN party_runtime.party_state_snapshots snapshot
         ON snapshot.party_id=visible.party_id
        AND snapshot.state_version=visible.committed_state_version
      WHERE visible.party_id=$1 AND visible.turn_id=$2`,
    values: [partyId, turnId] }, turnBudget);
  const expectedContextDigest = canonicalDigest(visibleContext);
  const matches = result.rows.filter((candidate) =>
    candidate.package_digest
      === computeSpatialV3CanonicalDigest(candidate.visible_payload)
    && candidate.snapshot_payload != null
    && candidate.state_digest === canonicalDigest(candidate.snapshot_payload)
    && Number.isSafeInteger(candidate.snapshot_payload?.party_state?.turn_number)
    && candidate.snapshot_payload.party_state.turn_number >= 1
    && canonicalDigest(phase2VisibleContextFromPayload(candidate.visible_payload))
      === expectedContextDigest);
  if (matches.length !== 1) {
    throw presentationError();
  }
  return { ...matches[0], turn_number: matches[0].snapshot_payload.party_state.turn_number };
}

export function sealApprovedNarration({ envelope, flow }) {
  const payload = {
    kind: 'approved_narration',
    party_id: envelope.party_id,
    request_id: envelope.turn_id,
    package_id: envelope.package_id,
    package_digest: envelope.package_digest,
    dependency_pins: envelope.dependency_pins,
    text: flow.approved_output.prose,
    flow_result: structuredClone(flow)
  };
  return {
    ...payload,
    canonical_digest: computeSpatialV3CanonicalDigest(payload)
  };
}

async function finalize(store, identity, attempt, envelope, turnBudget = null) {
  const outputDigest =
    attempt.output_digest ?? attempt.narration_result?.canonical_digest;
  const finalized = await store.finalizePresentationAttempt({
    ...identity,
    turnBudget,
    attempt_id: attempt.attempt_id,
    presentation_status: 'delivered',
    output_digest: outputDigest
  });
  if (!finalized?.ok
      || finalized.presentation_status !== 'delivered'
      || finalized.output_digest !== outputDigest) {
    throw presentationError();
  }
  return envelope;
}

function validPersistedFlow(flow, narration, envelope) {
  if (!flow || flow.schema !== 'narration_flow_result'
      || flow.status !== 'approved' || flow.pass !== true
      || narration.package_digest !== envelope.package_digest) {
    return false;
  }
  const { canonical_digest: digest, ...payload } = narration;
  return digest === computeSpatialV3CanonicalDigest(payload)
    && narration.text === flow.approved_output?.prose;
}

function withPresentation(flow, narration) {
  return Object.freeze({
    ...structuredClone(flow),
    presentation: {
      package_digest: narration.package_digest,
      output_digest: narration.canonical_digest
    }
  });
}

function presentationError() {
  return Object.assign(
    new Error('Persisted Phase 2 narration lifecycle is inconsistent.'),
    { code: 'TRACE_PHASE_2_PRESENTATION_INVALID' }
  );
}
