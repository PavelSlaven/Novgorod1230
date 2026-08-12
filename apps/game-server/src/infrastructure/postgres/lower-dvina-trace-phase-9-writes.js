import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { appendPhase4ActivityExecution } from
  './lower-dvina-trace-phase-4-activity-writes.js';
import { appendPhase3MovementTraversal } from
  './lower-dvina-trace-phase-3-movement-writes.js';
import { appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput } from
  './npc-semantic-conversation-writes.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';

export function phase9VisibleEnvelope({ partyId, factual, visibleContext,
  nextVersion, turnNumber, changeSetId, idemId }) {
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: visibleContext.visible_scene,
    perceived_changes: visibleContext.visible_changes,
    sensory_details: visibleContext.sensory_details,
    visible_npcs: visibleContext.visible_npc,
    visible_objects: visibleContext.visible_objects,
    known_context: visibleContext.known_context,
    uncertainties: visibleContext.uncertainties, hypotheses: [],
    player_safe_interruption: null, allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: {
    entity_kind: 'source_record', entity_id: 'lower_dvina_trace_v17' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: '17',
    state_version: null } }];
  return { package_id: `visible:${partyId}:trace-phase9:${turnNumber}`,
    party_id: partyId, turn_id: factual.mode_resolution.turn_id,
    committed_state_version: String(nextVersion), change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload, presentation_status: 'pending',
    projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
      entity_id: 'lower_dvina_phase9_visible_v1' }, authoring_version: '1' },
    dependency_pins: { pins, canonical_digest: canonicalDigest(pins) },
    idempotency_record_id: idemId };
}

export function phase9PendingScreen({ state, factual, envelope, turnNumber,
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
    main_prose: envelope.visible_payload.perceived_scene };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}

export function phase9Writes({ partyId, state, next, factual, turnNumber,
  changeSetId, idemId, envelope, screen, contracts }) {
  const kind = factual.consequence.phase9_kind;
  const phase9 = factual.consequence.phase9;
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
    party_id: partyId, operation_kind: `trace_phase_9_${kind}`,
    idempotency_record_id: idemId })];
  appendBody(updates, appends, { partyId, state, next, changeSetId, idemId,
    turnNumber });
  if (factual.consequence.duration_minutes > 0) {
    appendActivity({ inserts, updates, appends, partyId, state, next, factual,
      turnNumber, changeSetId, idemId, contracts });
  }
  if (['bag_recovery', 'bag_opened'].includes(kind)) {
    const bag = next.containers.find(({ container_id: id }) =>
      id === phase9.property_transition.subject_id);
    updates.push(row('party_containers', bag.container_id, {
      party_id: partyId, container_id: bag.container_id, state: bag.state,
      anchor_id: bag.anchor_id ?? null,
      parent_container_id: bag.parent_container_id ?? null,
      holder_npc_id: bag.holder_npc_id ?? null,
      holder_character_id: bag.holder_character_id ?? null,
      physical_position: bag.physical_position ?? null,
      closure_state: bag.closure_state,
      updated_change_set_id: changeSetId }));
  }
  if (kind === 'packet_recovered') appendPacket({ updates, partyId, next,
    phase9 });
  if (kind === 'return_to_camp') appendMovement({ inserts, updates, appends,
    partyId, state, next, factual, turnNumber, changeSetId, idemId, contracts });
  if (kind === 'onisim_testimony') appendConversation({ inserts, updates,
    appends, partyId, state, next, factual, changeSetId, idemId });
  if (kind === 'temporary_disposition') appendTemporaryDisposition({ updates,
    appends, partyId, state, next, factual, turnNumber, changeSetId, idemId,
    contracts });
  appendKnowledge({ inserts, partyId, state, next, changeSetId });
  return { inserts, updates, appends, deletes: [] };
}

function appendTemporaryDisposition({ updates, appends, partyId, state, next,
  factual, turnNumber, changeSetId, idemId, contracts }) {
  const heldSlots = new Set(next.phase9.custody_state.party_slots);
  for (const npc of (next.npcs ?? []).filter(({ participant_slot_ref: slot }) =>
    heldSlots.has(slot))) {
    updates.push(row('party_npcs', npc.instance_id, { party_id: partyId,
      npc_id: npc.instance_id, anchor_id: npc.anchor_id,
      machine_state: structuredClone(npc.machine_state) }));
  }
  const packet = next.items.find(({ item_id: id }) =>
    id === contracts.packet.item_id);
  if (packet == null) throw new Error('TRACE_PHASE_9_PACKET_MISSING');
  updates.push(row('party_items', packet.item_id, { party_id: partyId,
    item_id: packet.item_id, quantity: packet.quantity,
    condition_state: packet.condition_state, legal_status: packet.legal_status,
    state: structuredClone(packet.state) }));
  const prior = state.promise_instances?.[0];
  const promise = next.promise_instances?.[0];
  if (prior != null && promise != null) {
    updates.push(row('party_obligations', promise.obligation_id, {
      obligation_id: promise.obligation_id, party_id: partyId,
      policy_ref: structuredClone(promise.policy_ref),
      policy_version: promise.policy_version,
      promisor_ref: { entity_kind: 'player_character',
        entity_id: promise.promisor_actor_id },
      beneficiary_ref: { entity_kind: 'npc',
        entity_id: promise.beneficiary_actor_id },
      witness_refs: promise.witness_actor_ids.map((id) => ({
        entity_kind: 'npc', entity_id: id })),
      scope_snapshot: structuredClone(promise.scope_snapshot),
      current_state: promise.current_state,
      current_state_fact: promise.current_state_fact,
      state_version: promise.state_version,
      created_change_set_id: promise.created_change_set_id,
      last_change_set_id: changeSetId }));
    const lifecycle = next.phase9.promise_outcome?.transition ?? null;
    const transitionRow = ({ ordinal, from, to, kind, causalBasis }) =>
      row('party_obligation_transitions',
        `${promise.obligation_id}:${ordinal}`, {
          obligation_transition_id: `${promise.obligation_id}:${ordinal}`,
          party_id: partyId, obligation_id: promise.obligation_id,
          transition_ordinal: ordinal, from_state: from, to_state: to,
          transition_kind: kind, causal_basis: causalBasis,
        witness_snapshot: promise.witness_actor_ids.map((id) => ({
          entity_kind: 'npc', entity_id: id })),
        activity_execution_id:
          `activity:${partyId}:trace-phase9:${turnNumber}:temporary_disposition`,
        check_resolution_id: null, npc_decision_request_id: null,
        change_set_id: changeSetId, idempotency_record_id: idemId,
        occurred_at_turn: turnNumber,
        occurred_at_whole_minutes: factual.time_update.clock_after.whole_minutes,
        occurred_at_subminute_numerator:
          factual.time_update.clock_after.subminute_numerator,
          occurred_at_subminute_denominator:
            factual.time_update.clock_after.subminute_denominator });
    const firstOrdinal = Number(prior.state_version) - 1;
    if (lifecycle != null) {
      appends.push(transitionRow({ ordinal: firstOrdinal,
        from: prior.current_state, to: promise.current_state,
        kind: lifecycle.history_event.fact_id,
        causalBasis: structuredClone(lifecycle.causal_basis) }));
    }
    const memoryOrdinal = firstOrdinal + (lifecycle == null ? 0 : 1);
    appends.push(transitionRow({ ordinal: memoryOrdinal,
      from: promise.current_state, to: promise.current_state,
      kind: 'temporary_disposition_promise_memory_recorded',
      causalBasis: { committed_fact_ids: [
        promise.temporary_disposition_memory.committed_fact_id] } }));
  }
}

function appendActivity({ inserts, updates, appends, partyId, state, next,
  factual, turnNumber, changeSetId, idemId, contracts }) {
  const kind = factual.consequence.phase9_kind;
  const activityRef = phase9ActivityRef(kind, contracts);
  appendPhase4ActivityExecution({ inserts, updates, appends, partyId, state,
    factual, next, root: { activity_ref: activityRef,
      duration_minutes: factual.consequence.duration_minutes },
    id: `activity:${partyId}:trace-phase9:${turnNumber}:${kind}`,
    seriesOrdinal: 0,
    activitySeriesId: `series:${partyId}:trace-phase9:${turnNumber}`,
    attemptOrdinal: 0, turnNumber, changeSetId, idemId });
}

export function phase9ActivityRef(kind, contracts) {
  return kind === 'return_to_camp'
    ? contracts.activities.return.profile_id
    : kind === 'onisim_testimony'
      ? contracts.binding.onisim_testimony.activity_profile.profile_id
      : kind === 'temporary_disposition'
        ? contracts.activities.disposition.profile_id
        : contracts.activities.inspect.profile_id;
}

function appendPacket({ updates, partyId, next, phase9 }) {
  const item = next.items.find(({ item_id: id }) =>
    id === phase9.property_transition.subject_id);
  updates.push(row('party_items', item.item_id, { party_id: partyId,
    item_id: item.item_id, quantity: item.quantity,
    condition_state: item.condition_state, legal_status: item.legal_status,
    state: item.state }), row('party_item_placements', item.item_id, {
    party_id: partyId, item_id: item.item_id,
    anchor_id: item.placement.anchor_id ?? null,
    container_id: item.placement.container_id ?? null,
    holder_npc_id: item.placement.holder_npc_id ?? null,
    holder_character_id: item.placement.holder_character_id ?? null,
    physical_position: item.placement.physical_position ?? null,
    equipment_slot_category_id: null, attached_item_id: null }),
  row('party_ownership', item.ownership.ownership_id ?? item.item_id, {
    party_id: partyId,
    ownership_id: item.ownership.ownership_id ?? item.item_id,
    item_id: item.item_id, container_id: null,
    owner_npc_id: item.ownership.owner_npc_id ?? null,
    owner_character_id: item.ownership.owner_character_id ?? null,
    owner_party: item.ownership.owner_party === true,
    owner_external_ref: item.ownership.owner_external_ref ?? null,
    controller_npc_id: item.ownership.controller_npc_id ?? null,
    controller_character_id:
      item.ownership.controller_character_id ?? null,
    claim_state: item.ownership.claim_state }));
}

function appendMovement(input) {
  const { inserts, updates, appends, partyId, state, next, factual,
    turnNumber, changeSetId, idemId, contracts } = input;
  updates.push(row('party_positions', partyId, { party_id: partyId,
    g4_id: next.position.g4_id, g5_node_id: next.position.g5_node_id,
    g5_anchor_id: next.position.g5_anchor_id }));
  const proxy = { ...factual, consequence: { ...factual.consequence,
    movement: factual.consequence.phase9.movement } };
  appendPhase3MovementTraversal({ inserts, updates, appends, state,
    factual: proxy, partyId, turnNumber, changeSetId, idemId,
    phase3Contracts: { route: contracts.route } });
  for (const npcId of factual.consequence.phase9.movement.participants.slice(1)) {
    const npc = next.npcs.find(({ instance_id: id }) => id === npcId);
    if (npc) updates.push(row('party_npcs', npcId, { party_id: partyId,
      npc_id: npcId, anchor_id: npc.anchor_id,
      machine_state: npc.machine_state }));
  }
}

function appendConversation({ inserts, updates, appends, partyId, state, next,
  factual, changeSetId, idemId }) {
  const semantic = factual.consequence.phase9.semantic_exchange;
  if (semantic.exchange.applied_contribution_count === 0
      && semantic.exchange.stop_reason !== 'npc_unavailable') return;
  const input = buildNpcSemanticConversationWriteInput({ state, next,
    semanticExchange: semantic });
  appendNpcSemanticConversationWrites({ inserts, updates, appends, partyId,
    changeSetId, idempotencyRecordId: idemId,
    rootTurnId: factual.mode_resolution.turn_id,
    workingRevision:
      factual.mode_resolution.decision_trace?.working_revision ?? 1,
    sessionWrite: input.sessionWrite,
    semanticExchange: input.semanticExchange,
    signalRecords: input.signalRecords,
    actualMessageEvidence: input.actualMessageEvidence,
    persistedMessageStatements: input.persistedMessageStatements,
    persistedMessageAudiences: input.persistedMessageAudiences,
    supportingOperationEvidence: input.supportingOperationEvidence,
    partyStateVersion: input.partyStateVersion,
    sameTimeBatchRef: input.sameTimeBatchRef,
    contributions: input.contributions });
}

function appendBody(updates, appends, { partyId, state, next, changeSetId,
  idemId, turnNumber }) {
  if (canonicalDigest(state.body_state) === canonicalDigest(next.body_state)) {
    return;
  }
  updates.push(row('party_actor_body_states', state.actor_id, {
    party_id: partyId, actor_kind: 'player_character',
    actor_id: state.actor_id, body_state: next.body_state,
    updated_change_set_id: changeSetId }));
  appends.push(row('party_actor_body_state_history',
    `body-history:${partyId}:trace-phase9:${turnNumber}`, {
      party_id: partyId, actor_kind: 'player_character',
      actor_id: state.actor_id, state_before: state.body_state,
      state_after: next.body_state, source_kind: 'activity_effect',
      change_set_id: changeSetId, idempotency_record_id: idemId }));
}

function appendKnowledge({ inserts, partyId, state, next, changeSetId }) {
  const prior = new Set((state.knowledge ?? []).map(({ fact_id: id }) => id));
  for (const fact of (next.knowledge ?? []).filter(
    ({ fact_id: id }) => !prior.has(id))) {
    inserts.push(row('party_character_knowledge',
      `${state.actor_id}:${fact.fact_id}`, { party_id: partyId,
        character_id: state.actor_id, fact_id: fact.fact_id,
        knowledge_state: fact.knowledge_state,
        evidence: fact.evidence_refs ?? [changeSetId] }));
  }
}
