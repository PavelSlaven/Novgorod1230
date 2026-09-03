import { canonicalDigest } from '@rus/materialization';
import { projectCombatDecisionState } from
  './lower-dvina-trace-combat-decision-state.js';

export function nextCombatState({ state, factual, nextVersion, turnNumber,
  changeSetId, inputDigest }) {
  const combat = factual.consequence.combat;
  let next = structuredClone(state);
  delete next.npc_semantic_decision_traces;
  delete next.npc_semantic_decision_inputs;
  const playerBody = combat.working_state_after?.actor_states?.[
    `player_character:${state.actor_id}`]?.body_state;
  if (!playerBody) fail('TRACE_COMBAT_PLAYER_BODY_GAP');
  const bodyChanged = canonicalDigest(playerBody)
    !== canonicalDigest(state.body_state);
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = { ...next.party_state, state_version: nextVersion,
    session_state_version: state.party_state.session_state_version + 1,
    clock_state_version: state.party_state.clock_state_version + 1,
    body_state_version: state.party_state.body_state_version
      + (bodyChanged ? 1 : 0), turn_number: turnNumber };
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light = { ...structuredClone(next.clock_weather_light),
    clock: structuredClone(next.clock) };
  next.body_state = committedPlayerBody(playerBody, state.body_state);
  const terminalNpcStatuses = new Map(
    combat.session_after?.status === 'ended'
      ? (combat.session_after.participant_states ?? [])
        .filter(({ actor_ref: actor }) => actor.entity_kind === 'npc')
        .map(({ actor_ref: actor, combat_status: status }) =>
          [actor.entity_id, status])
      : []
  );
  next.npcs = (next.npcs ?? []).map((npc) => {
    const workingNpc = combat.working_state_after?.npcs?.find(
      ({ instance_id: id }) => id === npc.instance_id);
    const body = combat.working_state_after?.actor_states?.[
      `npc:${npc.instance_id}`]?.body_state;
    if (body == null && workingNpc == null) return npc;
    return { ...npc,
      anchor_id: workingNpc?.anchor_id ?? npc.anchor_id,
      location_profile_ref: workingNpc?.location_profile_ref
        ?? npc.location_profile_ref,
      zone_ref: workingNpc?.zone_ref ?? npc.zone_ref,
      machine_state: {
      ...npc.machine_state, ...structuredClone(workingNpc?.machine_state ?? {}),
      ...(terminalNpcStatuses.has(npc.instance_id) ? {
        combat_terminal_status: terminalNpcStatuses.get(npc.instance_id)
      } : {}),
      ...(body == null ? {} : { body_condition: {
        ...npc.machine_state?.body_condition, health: body.health,
        combat_conditions: structuredClone(body.active_conditions ?? [])
      } })
    } };
  });
  next.items = structuredClone(combat.working_state_after?.items ?? next.items);
  next.active_combat_traversals = structuredClone(
    combat.working_state_after?.active_combat_traversals ?? []);
  next.active_combat_step_progress = structuredClone(
    combat.working_state_after?.active_combat_step_progress ?? []);
  const processedBoundaryIds = new Set((combat.temporal_advance_results ?? [])
    .flatMap((result) => result.trace?.processed_boundary_ids ?? []));
  next.temporal_boundary_candidates = (next.temporal_boundary_candidates ?? [])
    .filter(({ boundary_id: id }) => !processedBoundaryIds.has(id));
  const committedSession = { ...structuredClone(combat.session_after),
    last_change_set_ref: { entity_kind: 'party_change_set',
      entity_id: changeSetId } };
  const zhdankoId = next.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller')?.instance_id;
  const zhdankoLeft = committedSession.participant_states.some(
    ({ actor_ref: actor, combat_status: status }) =>
      actor.entity_id === zhdankoId && status === 'left');
  if (zhdankoLeft && !(next.knowledge ?? []).some(
    ({ fact_id: id }) => id === 'zhdanko_fled')) {
    next.knowledge = [...(next.knowledge ?? []), {
      fact_id: 'zhdanko_fled',
      knowledge_state: 'known_from_committed_combat_transition',
      evidence_refs: combat.outcome_events.filter(
        ({ actor_ref: actor, event_kind: kind }) =>
          actor?.entity_id === zhdankoId
          && kind === 'combat_position_transition_completed')
        .map(({ event_id: id }) => id)
    }];
  }
  next.combat_sessions = (next.combat_sessions ?? []).map((session) =>
    session.combat_id === committedSession.combat_id
      ? committedSession : session)
    .filter(({ status }) => status !== 'ended');
  next.player_response_boundary = committedSession.status === 'ended'
    ? null
    : { kind: 'combat', combat_id: committedSession.combat_id };
  next.combat_history = [...(next.combat_history ?? []), {
    combat_id: committedSession.combat_id,
    exchange_ordinal: committedSession.exchange_ordinal,
    exchange_ref: combat.exchange == null ? null : {
      entity_kind: 'combat_exchange', entity_id: combat.exchange.proposal_id },
    occurred_at: structuredClone(next.clock),
    exact_duration: structuredClone(combat.exact_duration),
    outcome_event_refs: combat.outcome_events.map(({ event_id: id }) => id),
    outcome_events: structuredClone(combat.outcome_events),
    change_set_id: changeSetId
  }];
  next = projectCombatDecisionState({ state: next,
    decisionRecords: combat.decision_records,
    signalRecords: combat.signal_records,
    sameTimeBatchKey: `combat-batch:${committedSession.combat_id}:${
      committedSession.exchange_ordinal}`,
    changeSetId,
    rootTurnId: factual.mode_resolution.turn_id, workingRevision:
      factual.mode_resolution.decision_trace?.working_revision ?? 1 });
  next.last_turn = { request_id: factual.player_input.request_id,
    idempotency_key: factual.player_input.idempotency_key,
    input_digest: inputDigest, raw_text: factual.player_input.raw_text,
    option_id: factual.mode_resolution.option_id,
    action_set_digest: factual.mode_resolution.decision_trace.action_set_digest,
    semantic_trace: structuredClone(factual.mode_resolution.decision_trace),
    consequence: structuredClone(factual.consequence),
    time_update: structuredClone(factual.time_update),
    body_update: structuredClone(factual.body_update),
    visible_package: null, change_set_id: changeSetId };
  return next;
}

function fail(code) { throw Object.assign(new Error(code), { code }); }

function committedPlayerBody(playerBody, priorBody) {
  const priorConditions = new Map((priorBody.active_conditions ?? []).map(
    (condition) => [condition.id, condition]));
  return { ...structuredClone(playerBody), active_conditions:
    (playerBody.active_conditions ?? []).map((condition) =>
      structuredClone(priorConditions.get(condition.id) ?? condition)) };
}
