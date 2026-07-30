import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import {
  TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION,
  TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID,
  TRACE_PHASE_1B_SESSION_IDENTITIES
} from '../internal/lower-dvina-trace-phase-1b-identities.js';
import {
  assertLowerDvinaTracePublicScreen
} from './lower-dvina-trace-opening.js';
import { hash, json } from './first-playable/shared.js';

export const TRACE_SCENARIO_ID = 'lower_dvina_trace_v1';
export const TRACE_INITIAL_SNAPSHOT_SCHEMA =
  'rus.lower_dvina_trace_initial_party_snapshot.v2';

export function isLowerDvinaTraceSession(session) {
  return session?.party_snapshot_schema === TRACE_INITIAL_SNAPSHOT_SCHEMA
    || TRACE_PHASE_1B_SESSION_IDENTITIES.some((expected) =>
      session?.party_scenario_manifest_digest
        === expected.phase_1a_manifest_digest)
    || session?.stage26_result?.scenario_id === TRACE_SCENARIO_ID;
}

export function validateLowerDvinaTraceSessionRead({
  partyId,
  session
} = {}) {
  const identity = session?.stage26_result;
  const delivery = session?.delivery_attempt;
  const screen = session?.screen;
  const expected = TRACE_PHASE_1B_SESSION_IDENTITIES.find((candidate) =>
    candidate.publication_manifest_digest
      === identity?.publication_manifest_digest);
  if (!session
    || !expected
    || session.party_snapshot_schema !== TRACE_INITIAL_SNAPSHOT_SCHEMA
    || session.party_materializer_version
      !== TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION
    || session.party_rng_algorithm_id
      !== TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID
    || session.party_scenario_manifest_digest
      !== expected.phase_1a_manifest_digest
    || identity?.version !== 1
    || identity.schema
      !== 'rus.lower_dvina_trace_phase_1b_session_identity.v1'
    || identity.scenario_id !== TRACE_SCENARIO_ID
    || identity.creation_identity?.version !== 1
    || identity.creation_identity?.schema
      !== 'rus.first_playable_public_creation_identity.v1'
    || identity.creation_identity.party_id !== partyId
    || identity.creation_identity.request_id_digest
      !== hash(session.request_id)
    || identity.creation_identity.launch_branch !== 'scenario_id'
    || identity.creation_identity.scenario_id !== TRACE_SCENARIO_ID
    || identity.creation_identity.effective_player_name !== null
    || identity.creation_identity.branch_input_digest !== hash(json({
      launch_branch: 'scenario_id',
      scenario_id: TRACE_SCENARIO_ID
    }))
    || identity.party_id !== partyId
    || identity.request_id !== session.request_id
    || identity.publication_manifest_digest
      !== expected.publication_manifest_digest
    || identity.publication_binding_id
      !== expected.publication_binding_id
    || identity.publication_binding_revision
      !== expected.publication_binding_revision
    || identity.publication_binding_digest
      !== expected.publication_binding_digest
    || identity.phase_1a_manifest_digest
      !== expected.phase_1a_manifest_digest
    || identity.scenario_definition_revision
      !== expected.scenario_definition_revision
    || identity.scenario_definition_digest
      !== expected.scenario_definition_digest
    || identity.materializer_binding_id
      !== expected.materializer_binding_id
    || identity.materializer_version
      !== TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION
    || identity.rng_algorithm_id
      !== TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID
    || identity.materializer_version
      !== session.party_materializer_version
    || identity.rng_algorithm_id !== session.party_rng_algorithm_id
    || identity.opening_screen_digest !== canonicalDigest(screen)
    || delivery?.party_id !== partyId
    || delivery.message_id !== `opening:${partyId}`
    || delivery.delivery_attempt_id !== `delivery:${partyId}`
    || delivery.status !== 'sent'
    || delivery.awaiting_client_ack !== true
    || delivery.screen_digest !== canonicalDigest(screen)
    || delivery.screen_digest !== identity.opening_screen_digest
    || screen?.party_id !== partyId
    || screen.scenario_id !== TRACE_SCENARIO_ID
    || Number(session.turn_number) !== 0
    || session.last_turn_id !== null
    || Number(session.state_version) !== 1) {
    throw serverError(
      'TRACE_PHASE_1B_SESSION_READ_INVALID',
      'Persisted trace opening session failed exact identity or digest validation.',
      { status: 409 }
    );
  }
  if (session.delivery_ack_result != null
    && (session.delivery_ack_result.pass !== true
      || !String(session.delivery_ack_result.client_ack_id ?? '').trim()
      || !String(session.delivery_ack_result.acknowledged_at ?? '').trim())) {
    throw serverError(
      'TRACE_PHASE_1B_SESSION_READ_INVALID',
      'Persisted trace acknowledgement is incomplete or incompatible.',
      { status: 409 }
    );
  }
  try {
    assertLowerDvinaTracePublicScreen(screen);
  } catch (error) {
    throw serverError(
      'TRACE_PHASE_1B_SESSION_READ_INVALID',
      'Persisted trace screen failed presentation or hidden-data validation.',
      { status: 409, details: { cause: error.code } }
    );
  }
  return session;
}
