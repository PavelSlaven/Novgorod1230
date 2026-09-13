import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import { serverError } from '../errors.js';
import {
  TRACE_PHASE_1B_APPROVED_MATERIALIZER_VERSION,
  TRACE_PHASE_1B_APPROVED_RNG_ALGORITHM_ID,
  TRACE_PHASE_1B_SESSION_IDENTITIES
} from '../internal/lower-dvina-trace-phase-1b-identities.js';
import {
  assertLowerDvinaTracePublicScreen
} from './lower-dvina-trace-opening.js';
import { validFactualPostTurnSession, visibleContextFromPayload,
  visiblePayloadErrors } from './lower-dvina-trace-factual-session.js';
import { hash, json } from './first-playable/shared.js';

export const TRACE_SCENARIO_ID = 'lower_dvina_trace_v1';
export const TRACE_INITIAL_SNAPSHOT_SCHEMA =
  'rus.lower_dvina_trace_initial_party_snapshot.v2';
export const TRACE_PHASE_2_SNAPSHOT_SCHEMA =
  'rus.lower_dvina_trace_phase_2_snapshot.v1';
export const TRACE_TURN_SNAPSHOT_SCHEMA =
  'rus.lower_dvina_trace_turn_snapshot.v2';

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
  const expectedSnapshotSchemas = Number(session?.turn_number) > 0
    ? [TRACE_PHASE_2_SNAPSHOT_SCHEMA, TRACE_TURN_SNAPSHOT_SCHEMA]
    : [TRACE_INITIAL_SNAPSHOT_SCHEMA];
  const expected = TRACE_PHASE_1B_SESSION_IDENTITIES.find((candidate) =>
    candidate.publication_manifest_digest
      === identity?.publication_manifest_digest);
  if (!session
    || !expected
    || !expectedSnapshotSchemas.includes(session.party_snapshot_schema)
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
    || delivery?.party_id !== partyId
    || delivery.message_id !== `opening:${partyId}`
    || delivery.delivery_attempt_id !== `delivery:${partyId}`
    || delivery.status !== 'sent'
    || delivery.awaiting_client_ack !== true
    || delivery.screen_digest !== identity.opening_screen_digest
    || screen?.party_id !== partyId
    || (screen?.schema !== 'factual_turn_delivery_screen'
      && screen?.scenario_id !== TRACE_SCENARIO_ID)) {
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
  if (Number(session.turn_number) === 0) {
    validateOpeningSession({ session, screen, identity });
  } else {
    validatePostTurnSession({ partyId, session, screen, identity });
  }
  return session;
}

function validateOpeningSession({ session, screen, identity }) {
  if (session.party_snapshot_schema !== TRACE_INITIAL_SNAPSHOT_SCHEMA
      || session.last_turn_id !== null
      || Number(session.state_version) !== 1
      || identity.opening_screen_digest !== canonicalDigest(screen)
      || session.delivery_attempt.screen_digest
        !== canonicalDigest(screen)
      || session.current_projection_package_id != null
      || session.current_narration_status != null) {
    invalidSession(
      'Persisted trace opening session failed exact opening-state validation.'
    );
  }
  try {
    assertLowerDvinaTracePublicScreen(screen);
  } catch (error) {
    invalidSession(
      'Persisted trace screen failed presentation or hidden-data validation.',
      error.code
    );
  }
}

function validatePostTurnSession({ partyId, session, screen, identity }) {
  if (screen?.schema === 'factual_turn_delivery_screen') {
    if (!validFactualPostTurnSession({ partyId, session, screen,
      allowedSnapshotSchemas: [TRACE_PHASE_2_SNAPSHOT_SCHEMA,
        TRACE_TURN_SNAPSHOT_SCHEMA] })) {
      invalidSession(
        'Persisted trace factual turn screen failed committed projection validation.'
      );
    }
    return;
  }
  const anchor = screen.current_projection_anchor;
  const payload = session.current_projection_payload;
  const narration = session.current_narration_output;
  const turnNumber = Number(session.turn_number);
  const stateVersion = Number(session.state_version);
  const payloadErrors = visiblePayloadErrors({ partyId,
    turnId: screen.turn_id, turnNumber, packageId: anchor?.package_id,
    packageDigest: anchor?.package_digest,
    committedStateVersion: anchor?.committed_state_version, payload });
  const expectedContext = payload && visibleContextFromPayload(payload);
  const narrationDigest = narration?.canonical_digest ?? null;
  const narrationText = narration?.text ?? null;
  if (![TRACE_PHASE_2_SNAPSHOT_SCHEMA, TRACE_TURN_SNAPSHOT_SCHEMA]
      .includes(session.party_snapshot_schema)
      || !Number.isSafeInteger(turnNumber) || turnNumber < 1
      || !Number.isSafeInteger(stateVersion) || stateVersion < 1
      || session.last_turn_id !== screen.turn_id
      || screen.schema !== 'lower_dvina_trace_turn_screen'
      || screen.turn_number !== turnNumber
      || screen.opening_screen_digest
        !== identity.opening_screen_digest
      || screen.screen_digest !== currentScreenDigest(screen)
      || anchor?.package_id
        !== session.current_projection_package_id
      || anchor?.package_digest
        !== session.current_projection_package_digest
      || String(anchor?.committed_state_version)
        !== String(session.current_projection_state_version)
      || anchor?.package_digest
        !== computeSpatialV3CanonicalDigest(payload)
      || payloadErrors.some(
        ({ field }) => String(field).startsWith('visible_payload')
      )
      || canonicalDigest(screen.visible_context)
        !== canonicalDigest(expectedContext)
      || (
        session.current_narration_status === 'delivered'
        && (
          anchor.narration_output_digest
            !== session.current_narration_output_digest
          || anchor.narration_output_digest !== narrationDigest
          || screen.main_prose !== narrationText
        )
      )
      || (
        session.current_narration_status !== 'delivered'
        && (
          anchor.narration_output_digest !== null
          || screen.screen_status !== 'committed_presentation_pending'
        )
      )) {
    invalidSession(
      'Persisted trace turn screen failed committed projection validation.'
    );
  }
}

function currentScreenDigest(screen) {
  const { screen_digest: _digest, ...payload } = screen;
  return canonicalDigest(payload);
}

function invalidSession(message, cause = null) {
  throw serverError(
    'TRACE_PHASE_1B_SESSION_READ_INVALID',
    message,
    {
      status: 409,
      ...(cause ? { details: { cause } } : {})
    }
  );
}
