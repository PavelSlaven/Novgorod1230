import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { appendPhase4ActivityExecution } from
  './lower-dvina-trace-phase-4-activity-writes.js';
import { appendPhase4CombatInitialization } from
  './lower-dvina-trace-phase-4-combat-writes.js';
import { appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput } from
  './npc-semantic-conversation-writes.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';

export function phase8VisibleEnvelope({ partyId, factual, visibleContext,
  nextVersion, turnNumber, changeSetId, idemId }) {
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: visibleContext.visible_scene,
    perceived_changes: visibleContext.visible_changes,
    sensory_details: visibleContext.sensory_details,
    visible_npcs: visibleContext.visible_npc,
    visible_objects: visibleContext.visible_objects,
    known_context: visibleContext.known_context,
    uncertainties: visibleContext.uncertainties, hypotheses: [],
    player_safe_interruption: factual.consequence.accusation
      .combat_initialization == null ? null : 'Требуется решение в бою.',
    allowed_action_affordances: factual.consequence.accusation
      .combat_initialization == null ? [] : [{ action_id: 'request_combat',
        label: 'Действовать в бою', command_kind: 'request_combat' }] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: {
    entity_kind: 'source_record', entity_id: 'lower_dvina_trace_v16' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: '16',
    state_version: null } }];
  return { package_id: `visible:${partyId}:trace-phase8:${turnNumber}`,
    party_id: partyId, turn_id: factual.mode_resolution.turn_id,
    committed_state_version: String(nextVersion), change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload, presentation_status: 'pending',
    projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
      entity_id: 'lower_dvina_phase8_visible_v1' }, authoring_version: '1' },
    dependency_pins: { pins, canonical_digest: canonicalDigest(pins) },
    idempotency_record_id: idemId };
}

export function phase8PendingScreen({ state, factual, envelope, turnNumber,
  nextVersion }) {
  const screen = { version: 1, schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1', party_id: state.party_id,
    turn_id: factual.mode_resolution.turn_id, turn_number: turnNumber,
    screen_status: 'committed_presentation_pending',
    opening_screen_digest: state.opening_identity.opening_screen_digest,
    current_projection_anchor: { committed_state_version: nextVersion,
      package_id: envelope.package_id, package_digest: envelope.package_digest,
      narration_output_digest: null }, visible_context:
      phase2VisibleContextFromPayload(envelope.visible_payload),
    main_prose: envelope.visible_payload.player_safe_interruption == null
      ? 'Разговор у клети сохранён.'
      : 'Угроза у клети сохранена; требуется решение.' };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}

export function phase8AccusationWrites({ partyId, state, next, factual,
  turnNumber, changeSetId, idemId, envelope, screen }) {
  const semantic = factual.consequence.accusation.semantic_exchange;
  const inserts = [row('party_state_snapshots',
    `${partyId}:${next.party_state.state_version}`, { party_id: partyId,
      state_version: next.party_state.state_version, state_payload: next,
      state_digest: canonicalDigest(next) })];
  const updates = [row('parties', partyId, { party_id: partyId,
    status: 'active' }), row('party_server_sessions', partyId, {
      party_id: partyId, turn_number: turnNumber,
      last_turn_id: factual.mode_resolution.turn_id, screen,
      updated_change_set_id: changeSetId }), row('party_clocks', partyId, {
      party_id: partyId, ...next.clock, updated_change_set_id: changeSetId })];
  const appends = [row('party_v3_change_sets', changeSetId, { id: changeSetId,
    party_id: partyId, operation_kind: 'trace_phase_8_accusation',
    idempotency_record_id: idemId })];
  appendPhase4ActivityExecution({ inserts, updates, appends, partyId, state,
    factual, next, root: factual.consequence.accusation.activity_roots[0],
    id: `activity:${partyId}:trace-phase8:${turnNumber}:accusation`,
    seriesOrdinal: 0,
    activitySeriesId: `series:${partyId}:trace-phase8:${turnNumber}`,
    attemptOrdinal: 0, turnNumber, changeSetId, idemId });
  if (semantic.exchange.applied_contribution_count > 0
      || semantic.exchange.stop_reason === 'npc_unavailable') {
    const input = buildNpcSemanticConversationWriteInput({ state, next,
      semanticExchange: semantic });
    appendNpcSemanticConversationWrites({ inserts, updates, appends, partyId,
      changeSetId, idempotencyRecordId: idemId,
      rootTurnId: factual.mode_resolution.turn_id,
      workingRevision:
        factual.mode_resolution.decision_trace?.working_revision ?? 1,
      sessionWrite: input.sessionWrite, semanticExchange: input.semanticExchange,
      signalRecords: input.signalRecords,
      actualMessageEvidence: input.actualMessageEvidence,
      persistedMessageStatements: input.persistedMessageStatements,
      persistedMessageAudiences: input.persistedMessageAudiences,
      supportingOperationEvidence: input.supportingOperationEvidence,
      partyStateVersion: input.partyStateVersion,
      sameTimeBatchRef: input.sameTimeBatchRef,
      contributions: input.contributions });
  }
  appendPhase4CombatInitialization({ inserts, updates, appends, partyId,
    changeSetId, rootTurnId: factual.mode_resolution.turn_id,
    workingRevision:
      factual.mode_resolution.decision_trace?.working_revision ?? 1,
    initialization: factual.consequence.accusation.combat_initialization });
  appendChangedNpcs({ updates, partyId, state, next });
  return { inserts, updates, appends, deletes: [] };
}

function appendChangedNpcs({ updates, partyId, state, next }) {
  const before = new Map((state.npcs ?? []).map((npc) => [npc.instance_id, npc]));
  for (const npc of next.npcs ?? []) {
    const prior = before.get(npc.instance_id);
    if (prior && canonicalDigest(prior) !== canonicalDigest(npc)) {
      updates.push(row('party_npcs', npc.instance_id, { party_id: partyId,
        npc_id: npc.instance_id, anchor_id: npc.anchor_id,
        machine_state: npc.machine_state, semantic_state: {
          ...npc.semantic_state, participant_slot_ref: npc.participant_slot_ref } }));
    }
  }
}
