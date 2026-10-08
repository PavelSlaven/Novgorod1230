import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import { assertLowerDvinaTracePublicScreen } from './lower-dvina-trace-opening.js';
import { hash, json } from './first-playable/shared.js';
import { validateNarrationFlowResult } from '@rus/narration';

export function validateAuthoredStartSessionRead({ partyId, session,
  resolveRuntimeBinding } = {}) {
  const identity = session?.stage26_result;
  const creation = identity?.creation_identity;
  const screen = session?.screen;
  const delivery = session?.delivery_attempt;
  const scenarioId = identity?.scenario_id;
  const persistedBinding = identity?.runtime_binding;
  const resolvedBinding = typeof resolveRuntimeBinding === 'function'
    ? resolveRuntimeBinding(persistedBinding) : null;
  if (!resolvedBinding) {
    throw serverError('AUTHORED_START_RUNTIME_BINDING_MISSING',
      'Persisted authored-start runtime binding is unavailable.',
      { status: 409 });
  }
  if (Number(session?.turn_number) > 0) {
    if (identity?.schema
        !== 'rus.live_world_runtime.authored_start_session_identity.v1'
      || identity.party_id !== partyId || !scenarioId
      || persistedBinding?.catalog_id !== resolvedBinding.catalog_id
      || persistedBinding?.revision !== resolvedBinding.revision
      || resolvedBinding.materializer_binding_id != null
        && identity.materializer_binding_id
          !== resolvedBinding.materializer_binding_id
      || identity.materializer_version !== resolvedBinding.materializer_version
      || resolvedBinding.status !== 'approved'
      || creation?.schema
        !== 'rus.first_playable_public_creation_identity.v1'
      || creation.party_id !== partyId || creation.scenario_id !== scenarioId
      || session.party_snapshot_schema
        !== 'rus.lower_dvina_trace_turn_snapshot.v2'
      || Number(session.current_party_state_version)
        !== Number(session.turn_number)
      || !session.last_turn_id
      || screen?.party_id !== partyId || screen?.scenario_id !== scenarioId
      || !['turn_screen', 'factual_turn_delivery_screen']
        .includes(screen.schema)) invalid();
    return session;
  }
  const initialSnapshotSchema = resolvedBinding.snapshot_schema;
  const openingFlow = identity?.opening_narration_flow;
  const openingAudit = identity?.opening_stage23_original_audit;
  if (!session
    || identity?.schema !== 'rus.live_world_runtime.authored_start_session_identity.v1'
    || identity.party_id !== partyId
    || !scenarioId
    || persistedBinding?.catalog_id !== resolvedBinding.catalog_id
    || persistedBinding?.revision !== resolvedBinding.revision
    || resolvedBinding.materializer_binding_id != null
      && identity.materializer_binding_id !== resolvedBinding.materializer_binding_id
    || identity.materializer_version !== resolvedBinding.materializer_version
    || resolvedBinding.status !== 'approved'
    || creation?.schema !== 'rus.first_playable_public_creation_identity.v1'
    || creation.party_id !== partyId
    || creation.scenario_id !== scenarioId
    || creation.request_id_digest !== hash(session.request_id)
    || creation.branch_input_digest !== hash(json({
      launch_branch: 'scenario_id', scenario_id: scenarioId
    }))
    || session.party_snapshot_schema !== initialSnapshotSchema
    || session.party_scenario_manifest_digest !== identity.phase_1a_manifest_digest
    || session.party_materializer_version !== identity.materializer_version
    || session.party_rng_algorithm_id !== identity.rng_algorithm_id
    || Number(session.turn_number) !== 0
    || session.last_turn_id !== null
    || Number(session.state_version) !== 1
    || screen?.party_id !== partyId
    || screen?.scenario_id !== scenarioId
    || identity.opening_screen_digest !== canonicalDigest(screen)
    || !validateNarrationFlowResult(openingFlow).ok
    || openingFlow.surface !== 'first_game'
    || openingFlow.status !== 'approved'
    || openingFlow.approved_output?.prose !== screen.main_prose
    || openingAudit?.schema !== 'narrator_prose_audit'
    || typeof openingAudit.pass !== 'boolean'
    || delivery?.party_id !== partyId
    || delivery.message_id !== `opening:${partyId}`
    || delivery.delivery_attempt_id !== `delivery:${partyId}`
    || delivery.screen_digest !== canonicalDigest(screen)
    || delivery.status !== 'sent'
    || delivery.awaiting_client_ack !== true) invalid();
  if (session.delivery_ack_result != null
    && (session.delivery_ack_result.pass !== true
      || !String(session.delivery_ack_result.client_ack_id ?? '').trim()
      || !String(session.delivery_ack_result.acknowledged_at ?? '').trim())) invalid();
  try { assertLowerDvinaTracePublicScreen(screen); } catch { invalid(); }
  return session;
}

function invalid() {
  throw serverError('AUTHORED_START_SESSION_READ_INVALID',
    'Persisted authored-start session failed exact identity validation.',
    { status: 409 });
}
