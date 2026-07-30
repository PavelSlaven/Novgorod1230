import { canonicalDigest } from '@rus/materialization';
import { validateFirstGameScreen } from '@rus/presentation';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { serverError } from '../errors.js';
import { hash } from './first-playable/shared.js';
import {
  TRACE_SCENARIO_ID,
  validateLowerDvinaTraceSessionRead
} from './lower-dvina-trace-session.js';

export async function startLowerDvinaTrace({
  requestId,
  partyId,
  creationIdentity,
  release,
  repository,
  traceStartAdapter,
  publicationLoader,
  traceOpeningProjector
}) {
  if (!traceStartAdapter
    || typeof traceStartAdapter.materialize !== 'function'
    || typeof traceStartAdapter.assertExecutionSupport !== 'function'
    || typeof traceStartAdapter.loadInternal !== 'function'
    || typeof traceStartAdapter.loadVisible !== 'function') {
    throw serverError(
      'TRACE_PHASE_1B_PRODUCTION_ADAPTER_MISSING',
      'Lower Dvina trace production materialization adapter is unavailable.',
      { status: 503 }
    );
  }
  const publication = await publicationLoader();
  const binding = publication.binding;
  if (binding.world_compatibility.production_world_revision_id
      !== release.world_revision_id
    || binding.world_compatibility.production_world_catalog_digest
      !== release.world_catalog_digest) {
    throw serverError(
      'TRACE_PHASE_1B_WORLD_TUPLE_MISMATCH',
      'Published trace scenario is incompatible with the active world tuple.',
      { status: 409 }
    );
  }
  const request = {
    party_id: partyId,
    scenario_id: binding.scenario_id,
    scenario_definition_revision:
      binding.scenario_definition_ref.revision,
    scenario_manifest_digest:
      binding.phase_1a_manifest_ref.digest,
    world_revision_id: release.world_revision_id,
    world_catalog_digest: release.world_catalog_digest,
    materializer_version:
      binding.execution_identity.materializer_version,
    rng_algorithm_id:
      binding.execution_identity.rng_algorithm_id,
    seed_context: binding.execution_identity.seed_context,
    idempotency_key:
      `new-game:${binding.scenario_id}:${hash(requestId)}`,
    trigger: binding.execution_identity.trigger,
    occurrence: binding.execution_identity.occurrence,
    existing_party_state: { baseline_exists: false },
    world_compatibility:
      structuredClone(binding.world_compatibility)
  };
  traceStartAdapter.assertExecutionSupport(
    binding.execution_identity
  );
  const outcome = await traceStartAdapter.materialize(request);
  if (!['committed', 'replayed', 'committed_recovered']
    .includes(outcome?.status)) {
    throw serverError(
      'TRACE_PHASE_1B_MATERIALIZATION_NOT_COMMITTED',
      'Trace party was not committed; opening screen is unavailable.',
      { status: 409 }
    );
  }
  const internal = await traceStartAdapter.loadInternal(partyId);
  const visible = await traceStartAdapter.loadVisible(partyId);
  if (!internal || !visible
    || internal.request_identity?.party_id !== partyId
    || internal.request_identity?.idempotency_key
      !== request.idempotency_key) {
    throw serverError(
      'TRACE_PHASE_1B_REHYDRATE_INCOMPLETE',
      'Committed trace party failed exact postcommit rehydration.',
      { status: 409 }
    );
  }
  const screen = traceOpeningProjector({
    visible,
    approvedProjection: publication.public_projection
  });
  const screenValidation = validateFirstGameScreen(screen);
  if (!screenValidation.ok || detectHiddenLeaks(screen).length > 0) {
    throw serverError(
      'TRACE_PHASE_1B_OPENING_SCREEN_INVALID',
      'Trace opening screen failed the public presentation contract.',
      { status: 409, details: screenValidation.errors }
    );
  }
  const screenDigest = canonicalDigest(screen);
  const sessionIdentity = {
    version: 1,
    schema: 'rus.lower_dvina_trace_phase_1b_session_identity.v1',
    scenario_id: binding.scenario_id,
    creation_identity: structuredClone(creationIdentity),
    request_id: requestId,
    party_id: partyId,
    publication_manifest_digest: publication.manifest_digest,
    publication_binding_id: binding.binding_id,
    publication_binding_revision: binding.revision,
    publication_binding_digest: publication.binding_digest,
    phase_1a_manifest_digest:
      binding.phase_1a_manifest_ref.digest,
    scenario_definition_revision:
      binding.scenario_definition_ref.revision,
    scenario_definition_digest:
      binding.scenario_definition_ref.digest,
    materializer_binding_id: binding.materializer_binding_id,
    materializer_version:
      binding.execution_identity.materializer_version,
    rng_algorithm_id:
      binding.execution_identity.rng_algorithm_id,
    opening_screen_digest: screenDigest
  };
  const deliveryAttempt = {
    version: 1,
    schema: 'opening_delivery_attempt',
    delivery_attempt_id: `delivery:${partyId}`,
    party_id: partyId,
    message_id: `opening:${partyId}`,
    screen_digest: screenDigest,
    status: 'sent',
    awaiting_client_ack: true
  };
  await repository.attachCommittedOpeningSession({
    partyId,
    requestId,
    sessionIdentity,
    deliveryAttempt,
    screen
  });
  const persisted = await repository.loadSession(partyId);
  validateLowerDvinaTraceSessionRead({ partyId, session: persisted });
  return {
    request_id: requestId,
    party_id: partyId,
    screen: persisted.screen,
    delivery: {
      delivery_attempt_id:
        persisted.delivery_attempt.delivery_attempt_id,
      message_id: persisted.delivery_attempt.message_id,
      screen_digest: persisted.delivery_attempt.screen_digest,
      status: persisted.delivery_attempt.status,
      awaiting_client_ack:
        persisted.delivery_attempt.awaiting_client_ack
    }
  };
}
