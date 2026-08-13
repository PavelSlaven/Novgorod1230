import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  createTemporalPresentationPostgresStore
} from './temporal-presentation-store.js';

export function createLowerDvinaTracePhase2DurableNarrator({
  partyPool,
  narrationService,
  presentationStore = null
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
      const envelope = await loadEnvelope(
        partyPool,
        request.request_id,
        request.visible_context
      );
      const identity = {
        party_id: envelope.party_id,
        package_id: envelope.package_id,
        package_digest: envelope.package_digest,
        presentation_idempotency_key:
          `presentation:${envelope.package_id}:${envelope.package_digest}`
      };
      const claimed = await store.claimPresentationAttempt(identity);
      if (!claimed?.ok) throw presentationError();
      if (claimed.disposition === 'delivered'
          || claimed.disposition === 'output_ready') {
        const flow = claimed.narration_result?.flow_result;
        if (!validPersistedFlow(flow, claimed.narration_result, envelope)) {
          throw presentationError();
        }
        if (claimed.disposition === 'output_ready') {
          await finalize(store, identity, claimed, envelope);
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
        flow = await narrationService.run(request);
      } catch (error) {
        await store.finalizePresentationAttempt({
          ...identity,
          attempt_id: claimed.attempt_id,
          claim_token: claimed.claim_token,
          presentation_status: 'failed_retryable',
          failure: {
            stage: 'narration',
            message: String(error?.message ?? 'Narration failed.')
          }
        }).catch(() => {});
        throw error;
      }
      if (flow?.status !== 'approved' || flow.pass !== true
          || !flow.approved_output?.prose) {
        await store.finalizePresentationAttempt({
          ...identity,
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
        throw error;
      }
      const persistedNarration = sealNarration({
        envelope,
        flow
      });
      const persisted = await store.persistNarrationOutput({
        ...identity,
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
      }, envelope);
      return withPresentation(flow, persistedNarration);
    }
  });
}

async function loadEnvelope(pool, turnId, visibleContext) {
  const result = await pool.query(
    `SELECT package_id,party_id,turn_id,committed_state_version,
            change_set_id,package_digest,visible_payload,
            presentation_status,projection_policy_ref,dependency_pins,
            idempotency_record_id
       FROM party_runtime.party_visible_packages
      WHERE turn_id=$1`,
    [turnId]
  );
  const expectedContextDigest = canonicalDigest(visibleContext);
  const matches = result.rows.filter((candidate) =>
    candidate.package_digest
      === computeSpatialV3CanonicalDigest(candidate.visible_payload)
    && canonicalDigest(visibleContextFromPayload(candidate.visible_payload))
      === expectedContextDigest);
  if (matches.length !== 1) {
    throw presentationError();
  }
  return matches[0];
}

function sealNarration({ envelope, flow }) {
  const payload = {
    kind: 'approved_narration',
    party_id: envelope.party_id,
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

async function finalize(store, identity, attempt, envelope) {
  const outputDigest =
    attempt.output_digest ?? attempt.narration_result?.canonical_digest;
  const finalized = await store.finalizePresentationAttempt({
    ...identity,
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

function visibleContextFromPayload(payload) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: payload.perceived_scene,
    visible_changes: structuredClone(payload.perceived_changes),
    sensory_details: structuredClone(payload.sensory_details),
    visible_npc: structuredClone(payload.visible_npcs),
    visible_objects: structuredClone(payload.visible_objects),
    known_context: structuredClone(payload.known_context),
    uncertainties: structuredClone(payload.uncertainties),
    allowed_tensions: [],
    do_not_imply: []
  };
}

function presentationError() {
  return Object.assign(
    new Error('Persisted Phase 2 narration lifecycle is inconsistent.'),
    { code: 'TRACE_PHASE_2_PRESENTATION_INVALID' }
  );
}
