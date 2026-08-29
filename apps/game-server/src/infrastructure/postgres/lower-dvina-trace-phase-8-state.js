import { canonicalDigest } from '@rus/materialization';
import { projectSemanticConversationSnapshot } from
  './lower-dvina-trace-conversation-state.js';
import { applyConversationTemporalNpcWrites } from
  './lower-dvina-trace-conversation-temporal.js';
import { projectCombatDecisionState } from
  './lower-dvina-trace-combat-decision-state.js';

export function nextPhase8AccusationState({ state, factual, nextVersion,
  turnNumber, changeSetId, inputDigest }) {
  const accusation = factual.consequence.accusation ?? null;
  const semantic = accusation?.semantic_exchange ?? null;
  const initialization = accusation?.combat_initialization
    ?? factual.consequence.combat_initialization ?? null;
  let next = structuredClone(state);
  delete next.npc_semantic_decision_traces;
  delete next.npc_semantic_decision_inputs;
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = { ...next.party_state, state_version: nextVersion,
    session_state_version: state.party_state.session_state_version + 1,
    clock_state_version: state.party_state.clock_state_version + 1,
    turn_number: turnNumber };
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light = { ...structuredClone(next.clock_weather_light),
    clock: structuredClone(next.clock) };
  if (semantic != null && (semantic.exchange.applied_contribution_count > 0
      || semantic.exchange.stop_reason === 'npc_unavailable')) {
    next = projectSemanticConversationSnapshot({ state: next,
      semanticExchange: semantic,
      rootTurnId: factual.mode_resolution.turn_id,
      workingRevision:
        factual.mode_resolution.decision_trace?.working_revision ?? 1,
      appliedChangeSetId: changeSetId });
    applyConversationTemporalNpcWrites(next, semantic);
  }
  if (initialization != null) {
    next.combat_sessions = [{ ...structuredClone(initialization.session),
      last_change_set_ref: { entity_kind: 'party_change_set',
        entity_id: changeSetId } }];
    next.player_response_boundary = { kind: 'combat',
      combat_id: initialization.session.combat_id };
    next = projectCombatDecisionState({ state: next,
      decisionRecords: initialization.decision_records, changeSetId,
      rootTurnId: factual.mode_resolution.turn_id, workingRevision:
        factual.mode_resolution.decision_trace?.working_revision ?? 1 });
  } else if (semantic?.response_kind === 'surrender') {
    next.npcs = next.npcs.map((npc) => npc.participant_slot_ref
      !== 'zhdanko_storehouse_controller' ? npc : { ...npc,
      machine_state: { ...npc.machine_state,
        surrender_state: 'surrendered_without_further_attack' } });
    next.player_response_boundary = null;
  } else {
    next.player_response_boundary = null;
  }
  next.activity_history = [...(next.activity_history ?? []), {
    activity_execution_id: `activity:${state.party_id}:trace-phase8:${turnNumber}:${
      accusation == null ? 'combat-start' : 'accusation'}`,
    activity_snapshot: { activity_ref: accusation?.activity_ref ?? null,
      consequence: accusation == null ? 'combat_start' : 'accusation' }, option_id: factual.mode_resolution.option_id,
    request_id: factual.player_input.request_id, input_digest: inputDigest,
    change_set_id: changeSetId,
    duration_minutes: factual.consequence.duration_minutes,
    started_at: structuredClone(factual.time_update.clock_before),
    ended_at: structuredClone(next.clock),
    execution_result: { response_kind: semantic?.response_kind ?? 'combat_start',
      combat_session_id: initialization?.session.combat_id ?? null } }];
  next.last_turn = { request_id: factual.player_input.request_id,
    idempotency_key: factual.player_input.idempotency_key,
    input_digest: inputDigest, raw_text: factual.player_input.raw_text,
    option_id: factual.mode_resolution.option_id,
    action_set_digest: factual.mode_resolution.decision_trace.action_set_digest,
    semantic_trace: structuredClone(factual.mode_resolution.decision_trace),
    consequence: safeConsequence(factual.consequence),
    time_update: structuredClone(factual.time_update),
    body_update: structuredClone(factual.body_update), visible_package: null,
    change_set_id: changeSetId };
  return next;
}

function safeConsequence(consequence) {
  const value = structuredClone(consequence);
  if (value.accusation?.combat_initialization) {
    value.accusation.combat_initialization = {
      combat_id: value.accusation.combat_initialization.session.combat_id,
      status: value.accusation.combat_initialization.session.status };
  }
  if (value.combat_initialization) {
    value.combat_initialization = {
      combat_id: value.combat_initialization.session.combat_id,
      status: value.combat_initialization.session.status };
  }
  if (value.accusation?.semantic_exchange) {
    value.accusation.semantic_exchange = {
      response_kind: value.accusation.semantic_exchange.response_kind,
      exact_elapsed_minutes:
        value.accusation.semantic_exchange.exact_elapsed_minutes,
      digest: canonicalDigest(value.accusation.semantic_exchange) };
  }
  return value;
}
