import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { appendCombatSessionWrite } from './combat-session-persistence.js';
import { appendNpcDecisionTraceWrites } from
  './npc-semantic-conversation-decision-writes.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';

export function combatVisibleEnvelope({ partyId, factual, visibleContext,
  nextVersion, turnNumber, changeSetId, idemId }) {
  const session = factual.consequence.combat.session_after;
  const combatEnded = session.status === 'ended';
  const payload = { schema: 'temporal_visible_package.v1',
    perceived_scene: visibleContext.visible_scene,
    perceived_changes: visibleContext.visible_changes,
    sensory_details: visibleContext.sensory_details,
    visible_npcs: visibleContext.visible_npc,
    visible_objects: visibleContext.visible_objects,
    known_context: visibleContext.known_context,
    uncertainties: visibleContext.uncertainties, hypotheses: [],
    player_safe_interruption: combatEnded ? null : {
      kind: 'combat_player_response_required', combat_id: session.combat_id },
    allowed_action_affordances: combatEnded ? [] : ['request_combat'] };
  const pins = [{ dependency_role: 'runtime_contract', entity_ref: {
    entity_kind: 'combat_contract', entity_id: 'combat_session_v1' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: '1',
    state_version: null } }];
  return { package_id: `visible:${partyId}:combat:${turnNumber}`,
    party_id: partyId, turn_id: factual.mode_resolution.turn_id,
    committed_state_version: String(nextVersion), change_set_id: changeSetId,
    package_digest: computeSpatialV3CanonicalDigest(payload),
    visible_payload: payload, presentation_status: 'pending',
    projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier',
      entity_id: 'lower_dvina_combat_visible_v1' }, authoring_version: '1' },
    dependency_pins: { pins, canonical_digest: canonicalDigest(pins) },
    idempotency_record_id: idemId };
}

export function combatPendingScreen({ state, factual, visibleEnvelope,
  turnNumber, nextVersion }) {
  const combatEnded = factual.consequence.combat.session_after.status === 'ended';
  const screen = { version: 1, schema: 'lower_dvina_trace_turn_screen',
    scenario_id: 'lower_dvina_trace_v1', party_id: state.party_id,
    turn_id: factual.mode_resolution.turn_id, turn_number: turnNumber,
    screen_status: 'committed_presentation_pending',
    opening_screen_digest: state.opening_identity.opening_screen_digest,
    current_projection_anchor: { committed_state_version: nextVersion,
      package_id: visibleEnvelope.package_id,
      package_digest: visibleEnvelope.package_digest,
      narration_output_digest: null },
    visible_context: phase2VisibleContextFromPayload(
      visibleEnvelope.visible_payload),
    main_prose: combatEnded ? 'Боевая сцена завершена.'
      : 'Боевая сцена сохранена; требуется следующее решение.' };
  screen.screen_digest = phase2ScreenDigest(screen);
  return screen;
}

export function combatWrites({ partyId, state, next, factual, turnNumber,
  changeSetId, idemId, visibleEnvelope, pendingScreen }) {
  const combat = factual.consequence.combat;
  const inserts = [row('party_state_snapshots',
    `${partyId}:${next.party_state.state_version}`, { party_id: partyId,
      state_version: next.party_state.state_version, state_payload: next,
      state_digest: canonicalDigest(next) })];
  const updates = [row('parties', partyId, { party_id: partyId,
    status: 'active' }), row('party_server_sessions', partyId, {
      party_id: partyId, turn_number: turnNumber,
      last_turn_id: factual.mode_resolution.turn_id, screen: pendingScreen,
      updated_change_set_id: changeSetId }), row('party_clocks', partyId, {
      party_id: partyId, ...next.clock, updated_change_set_id: changeSetId })];
  if (next.party_state.body_state_version
      !== state.party_state.body_state_version) updates.push(row(
    'party_actor_body_states', `player_character:${state.actor_id}`, {
      party_id: partyId, actor_kind: 'player_character', actor_id: state.actor_id,
      health: next.body_state.health, energy: next.body_state.energy,
      satiety: next.body_state.satiety, updated_change_set_id: changeSetId }));
  appendNpcBodyWrites({ updates, state, next, partyId });
  appendCombatItemWrites({ updates, state, next, partyId });
  const appends = [row('party_v3_change_sets', changeSetId, { id: changeSetId,
    party_id: partyId, operation_kind: 'combat_exchange',
    idempotency_record_id: idemId })];
  const previous = (state.combat_sessions ?? []).find(
    ({ combat_id: id }) => id === combat.session_after.combat_id);
  appendCombatSessionWrite({ inserts, updates, partyId, changeSetId,
    session: combat.session_after, previousSession: previous, mode: 'update' });
  appendCombatChecks({ appends, partyId, factual, changeSetId });
  appendCombatEvents({ inserts, partyId, factual, changeSetId });
  appendCombatBodyHistory({ appends, partyId, factual, changeSetId, idemId });
  appendNpcDecisionTraceWrites({ appends,
    decisionRecords: combat.decision_records ?? [], partyId, changeSetId,
    rootTurnId: factual.mode_resolution.turn_id,
    workingRevision: factual.mode_resolution.decision_trace?.working_revision ?? 2 });
  return { inserts, updates, appends, deletes: [] };
}

function appendCombatItemWrites({ updates, state, next, partyId }) {
  const before = new Map((state.items ?? []).map((item) => [item.item_id, item]));
  for (const item of next.items ?? []) {
    const prior = before.get(item.item_id);
    if (!prior || canonicalDigest(prior) === canonicalDigest(item)) continue;
    updates.push(row('party_item_placements', item.item_id, {
      party_id: partyId, item_id: item.item_id,
      holder_npc_id: item.placement?.holder_npc_id ?? null,
      holder_character_id: item.placement?.holder_character_id ?? null,
      physical_position: item.placement?.physical_position }));
    updates.push(row('party_ownership',
      item.ownership?.ownership_id ?? item.item_id, {
        ...structuredClone(item.ownership), party_id: partyId,
        ownership_id: item.ownership?.ownership_id ?? item.item_id,
        item_id: item.item_id }));
    updates.push(row('party_items', item.item_id, { party_id: partyId,
      item_id: item.item_id, state: structuredClone(item.state) }));
  }
}

function appendNpcBodyWrites({ updates, state, next, partyId }) {
  const before = new Map((state.npcs ?? []).map((npc) => [npc.instance_id, npc]));
  for (const npc of next.npcs ?? []) {
    const prior = before.get(npc.instance_id);
    if (prior && canonicalDigest(prior.machine_state)
        !== canonicalDigest(npc.machine_state)) updates.push(row('party_npcs',
      npc.instance_id, { party_id: partyId, npc_id: npc.instance_id,
        anchor_id: npc.anchor_id, machine_state: npc.machine_state }));
  }
}

function appendCombatChecks({ appends, partyId, factual, changeSetId }) {
  for (const result of factual.consequence.combat.check_results) {
    const id = result.check_id;
    const scope = { combat_id: factual.consequence.combat.session_after.combat_id,
      exchange_ordinal: factual.consequence.combat.session_after.exchange_ordinal,
      check_id: id };
    appends.push(row('party_check_resolutions', id, {
      check_resolution_id: id, party_id: partyId,
      check_scope_kind: 'immediate_action', check_scope_key: scope,
      check_policy_ref: { entity_kind: 'check_policy',
        entity_id: 'combat_execution_profile_v1', authoring_version: '1' },
      deterministic_roll_input_digest: canonicalDigest({ scope,
        audit: result.audit }), roll_value: result.roll,
      modifier_snapshot: result.modifiers, target_value: result.difficulty,
      result_kind: result.outcome.success ? 'success' : 'failure',
      consequence_policy_ref: { entity_kind: 'consequence_policy',
        entity_id: 'combat_health_v1', authoring_version: '1' },
      result_change_set_id: changeSetId,
      canonical_digest: canonicalDigest({ scope, result, changeSetId }) }));
  }
}

function appendCombatEvents({ inserts, partyId, factual, changeSetId }) {
  const at = factual.time_update.clock_after;
  for (const event of factual.consequence.combat.outcome_events) {
    inserts.push(row('party_temporal_events', event.event_id, {
      event_id: event.event_id, party_id: partyId,
      event_kind: event.event_kind, status: 'resolved',
      scheduled_at_whole_minutes: at.whole_minutes,
      scheduled_at_subminute_numerator: at.subminute_numerator,
      scheduled_at_subminute_denominator: at.subminute_denominator,
      rule_ref: factual.consequence.combat.exchange?.proposal_id
        ? { entity_kind: 'combat_exchange',
          entity_id: factual.consequence.combat.exchange.proposal_id }
        : structuredClone(event.source_step_ref),
      policy_ref: { entity_kind: 'combat_contract',
        entity_id: 'combat_exchange_proposal_v1' },
      preconditions_digest: canonicalDigest(event),
      idempotency_key: `${factual.player_input.idempotency_key}:${event.event_id}`,
      change_set_id: changeSetId, terminal_change_set_id: changeSetId,
      state_version: 2 }));
  }
}

function appendCombatBodyHistory({ appends, partyId, factual, changeSetId,
  idemId }) {
  for (const [index, transition] of factual.consequence.combat.body_transitions.entries()) {
    const id = `body-history:${partyId}:combat:${
      factual.consequence.combat.session_after.exchange_ordinal}:${index}`;
    appends.push(row('party_body_temporal_history', id, { history_id: id,
      party_id: partyId, subject_kind: transition.actor_ref.entity_kind,
      subject_id: transition.actor_ref.entity_id, effect_ref: {
        entity_kind: 'body_effect', entity_id: 'combat_harm',
        threshold_crossings: transition.threshold_crossings },
      change_set_id: changeSetId, idempotency_record_id: idemId,
      occurred_at_whole_minutes: factual.time_update.clock_after.whole_minutes,
      occurred_at_subminute_numerator:
        factual.time_update.clock_after.subminute_numerator,
      occurred_at_subminute_denominator:
        factual.time_update.clock_after.subminute_denominator }));
  }
}
