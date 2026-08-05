import { canonicalDigest } from '@rus/materialization';
import { buildNpcSemanticDecisionTrace } from '@rus/npc-runtime';
import { commitPhase2BodyState } from './lower-dvina-trace-phase-2-state.js';
import { semanticDecisionTraceReference } from
  './lower-dvina-trace-conversation-state.js';

export function nextPhase7State({ state, factual, nextVersion, turnNumber,
  changeSetId, inputDigest }) {
  const next = structuredClone(state);
  delete next.npc_semantic_decision_traces;
  const phase7 = factual.consequence.phase7;
  const autonomous = phase7.autonomous;
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = {
    ...next.party_state,
    state_version: nextVersion,
    session_state_version: state.party_state.session_state_version + 1,
    clock_state_version: state.party_state.clock_state_version + 1,
    body_state_version: state.party_state.body_state_version + 1,
    turn_number: turnNumber
  };
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light.clock = structuredClone(next.clock);
  next.body_state = commitPhase2BodyState({
    before: state.body_state,
    proposed: factual.body_update.state_after
  });
  next.body_effect_history = [...(next.body_effect_history ?? []), {
    history_id: `body-history:${state.party_id}:trace-phase7:fire-rest`,
    effect_ref: factual.body_update.proposal.profile_ref,
    activity_attempt_id: factual.consequence.activity_attempt_id,
    occurred_at: structuredClone(next.clock)
  }];
  next.npc_decision_signals = appendUnique(
    next.npc_decision_signals,
    autonomous.new_signal_records,
    (record) => record.signal.signal_id,
    'TRACE_PHASE_7_SIGNAL_CONFLICT'
  );
  next.consumed_npc_decision_signal_ids = [...new Set([
    ...(next.consumed_npc_decision_signal_ids ?? []),
    ...autonomous.consumed_signal_ids
  ])].sort();
  if (autonomous.proposal.status === 'planned') {
    const trace = buildNpcSemanticDecisionTrace({
      request: autonomous.request,
      plan: autonomous.proposal.plan,
      applied_change_set_id: changeSetId
    });
    next.npc_semantic_decision_refs = appendUnique(
      next.npc_semantic_decision_refs,
      [semanticDecisionTraceReference(trace)],
      ({ request_id: id }) => id,
      'TRACE_PHASE_7_DECISION_TRACE_CONFLICT'
    );
  }
  applyScheduleResult(next, phase7.schedule_execution, changeSetId);
  next.phase7_fire_rest = {
    schema: 'rus.lower_dvina_trace_phase_7_state.v1',
    status: 'completed',
    activity_execution_id: factual.consequence.activity_attempt_id,
    exact_elapsed_minutes: 30,
    body_effect_ref: factual.body_update.proposal.profile_ref,
    waiting_transition_id:
      phase7.temporal.projection.waiting_transition.transition_id,
    decision_request_id: autonomous.request.request_id,
    decision_boundary_id: autonomous.boundary.boundary_id,
    schedule_execution_binding_ref:
      phase7.schedule_execution.execution_binding_ref,
    schedule_option_id: phase7.schedule_execution.schedule_option_id,
    schedule_exact_elapsed: structuredClone(
      phase7.schedule_execution.exact_elapsed
    ),
    schedule_result: scheduleHistoryEntry(
      phase7.schedule_execution, changeSetId
    ),
    change_set_id: changeSetId
  };
  next.phase7_history = [...(next.phase7_history ?? []), {
    turn_number: turnNumber,
    request_id: factual.player_input.request_id,
    input_digest: inputDigest,
    change_set_id: changeSetId,
    result: structuredClone(next.phase7_fire_rest)
  }];
  next.last_turn = {
    request_id: factual.player_input.request_id,
    idempotency_key: factual.player_input.idempotency_key,
    input_digest: inputDigest,
    raw_text: factual.player_input.raw_text,
    option_id: factual.mode_resolution.option_id,
    action_set_digest:
      factual.mode_resolution.decision_trace.action_set_digest,
    semantic_trace: structuredClone(factual.mode_resolution.decision_trace),
    consequence: {
      schema: factual.consequence.schema,
      status: factual.consequence.status,
      phase7_kind: 'fire_rest',
      activity_attempt_id: factual.consequence.activity_attempt_id,
      body_effect_ref: factual.consequence.body_effect_ref,
      duration_minutes: 30,
      factual_result_ref: structuredClone(next.phase7_fire_rest)
    },
    time_update: structuredClone(factual.time_update),
    body_update: structuredClone(factual.body_update),
    visible_package: null,
    change_set_id: changeSetId
  };
  return next;
}

function applyScheduleResult(next, execution, changeSetId) {
  const npc = next.npcs.find(({ instance_id: id }) =>
    id === execution.npc_ref);
  if (!npc || !['wait', 'move_bag'].includes(
    execution.schedule_option_id)) {
    fail('TRACE_PHASE_7_SCHEDULE_STATE_INVALID');
  }
  const history = scheduleHistoryEntry(execution, changeSetId);
  npc.machine_state = {
    ...npc.machine_state,
    ...(execution.movement_proposal ? {
      location_ref: execution.movement_proposal.location_ref,
      spatial_zone_ref: execution.movement_proposal.destination_zone_ref
    } : {}),
    status: execution.schedule_option_id === 'wait'
      ? 'waiting' : 'preparing_departure',
    current_activity_ref: execution.activity_profile_ref,
    last_phase7_change_set_id: changeSetId,
    last_schedule_execution: history,
    npc_schedule_history: [
      ...(npc.machine_state?.npc_schedule_history ?? []), history
    ]
  };
  if (execution.schedule_option_id === 'wait') return;
  if (!execution.property_proposal) {
    fail('TRACE_PHASE_7_SCHEDULE_STATE_INVALID');
  }
  const property = execution.property_proposal;
  const container = next.containers.find(
    ({ container_id: id }) => id === property.item_id
  );
  if (!container) fail('TRACE_PHASE_7_ROAD_BAG_STATE_MISSING');
  container.state = {
    ...container.state,
    location_ref: property.destination.location_ref,
    zone_ref: property.destination.zone_ref,
    controller_npc_id: property.destination.controller_actor_id,
    approved_transition_history: [
      ...(container.state?.approved_transition_history ?? []),
      {
        transition_profile_id: property.transition_profile_id,
        owner_change: 'forbidden',
        change_set_id: changeSetId
      }
    ]
  };
  container.state_version += 1;
}

function scheduleHistoryEntry(execution, changeSetId) {
  return {
    execution_binding_ref: execution.execution_binding_ref,
    schedule_option_id: execution.schedule_option_id,
    activity_profile_ref: execution.activity_profile_ref,
    exact_elapsed: structuredClone(execution.exact_elapsed),
    clock_before: structuredClone(execution.clock_before),
    clock_after: structuredClone(execution.clock_after),
    factual_result_source: execution.factual_result_source,
    change_set_id: changeSetId
  };
}

function appendUnique(current = [], additions = [], identity, code) {
  const byId = new Map(current.map((entry) => [identity(entry), entry]));
  for (const entry of additions) {
    const id = identity(entry);
    const prior = byId.get(id);
    if (prior && canonicalDigest(prior) !== canonicalDigest(entry)) fail(code);
    if (!prior) byId.set(id, structuredClone(entry));
  }
  return [...byId.values()];
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
