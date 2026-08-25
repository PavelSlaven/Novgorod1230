import { canonicalDigest } from '@rus/materialization';
import { buildNpcSemanticDecisionTrace } from '@rus/npc-runtime';
import { commitPhase2BodyState } from './lower-dvina-trace-phase-2-state.js';
import { semanticDecisionTraceReference } from
  './lower-dvina-trace-conversation-state.js';
import { applyTurn10CompanionState } from
  './lower-dvina-trace-turn-10-state.js';
import { completeTurn10Phase7Factual } from
  './lower-dvina-trace-turn-10-phase7.js';
import {
  applyTracePhase7ScheduleState,
  tracePhase7ScheduleHistoryEntry
} from '../../runtime/lower-dvina-trace-phase-7-state-projection.js';
import { tracePhase7ActorStep } from
  '../../runtime/lower-dvina-trace-phase-7-schedule-execution.js';
import { projectLowerDvinaTraceN1ModeHandoff } from
  '../../runtime/lower-dvina-trace-n1-mode-handoffs.js';

export function nextPhase7State({ state, factual, nextVersion, turnNumber,
  changeSetId, inputDigest, turn10Contracts = null }) {
  factual = completeTurn10Phase7Factual(factual);
  let next = structuredClone(state);
  delete next.npc_semantic_decision_traces;
  delete next.npc_semantic_decision_inputs;
  const phase7 = factual.consequence.phase7;
  const autonomous = phase7.autonomous;
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  const restCompleted =
    phase7.schedule_temporal.result.temporal_status === 'completed';
  next.party_state = {
    ...next.party_state,
    state_version: nextVersion,
    session_state_version: state.party_state.session_state_version + 1,
    clock_state_version: state.party_state.clock_state_version + 1,
    body_state_version: restCompleted
      ? state.party_state.body_state_version + 1
      : state.party_state.body_state_version,
    turn_number: turnNumber
  };
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light.clock = structuredClone(next.clock);
  if (restCompleted) {
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
  }
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
  next = applyTracePhase7ScheduleState({
    state: next,
    execution: phase7.schedule_execution,
    changeSetId,
    activeActorStep: tracePhase7ActorStep(
      phase7.schedule_temporal.projection, phase7.actor_step)
  });
  applyNpcDirectBodyState(next, phase7);
  next = projectLowerDvinaTraceN1ModeHandoff({ state: next,
    consequenceFragment: phase7.actor_step_owner_outputs?.consequence_fragment,
    semanticOperation: phase7.schedule_execution.semantic_operation,
    changeSetId });
  next.phase7_fire_rest = {
    schema: 'rus.lower_dvina_trace_phase_7_state.v1',
    status: restCompleted ? 'completed' : 'paused',
    activity_execution_id: factual.consequence.activity_attempt_id,
    exact_elapsed_minutes: restCompleted
      ? 30
      : Number(factual.time_update.exact_elapsed.exact_minutes.numerator),
    body_effect_ref: restCompleted
      ? factual.body_update.proposal.profile_ref
      : null,
    waiting_terminal_candidate_id:
      phase7.temporal.terminal_candidate.boundary_id,
    waiting_transition_id:
      phase7.temporal.waiting_transition.transition_id,
    decision_signal_id: autonomous.signal.signal_id,
    decision_request_id: autonomous.request.request_id,
    decision_boundary_id: autonomous.boundary.boundary_id,
    actor_step_completion_candidate_id:
      phase7.schedule_temporal.completion_candidate.boundary_id,
    schedule_execution_binding_ref:
      phase7.schedule_execution.execution_binding_ref,
    schedule_option_id: phase7.schedule_execution.schedule_option_id,
    schedule_exact_elapsed: structuredClone(
      phase7.schedule_execution.exact_elapsed
    ),
    schedule_result: tracePhase7ScheduleHistoryEntry(
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
  if (factual.consequence.turn10_kind === 'companion_request') {
    next = applyTurn10CompanionState({
      next,
      factual,
      changeSetId,
      rootTurnId: factual.mode_resolution.turn_id,
      workingRevision:
        factual.mode_resolution.decision_trace?.working_revision ?? 2,
      turn10Contracts
    });
  }
  return next;
}

function applyNpcDirectBodyState(next, phase7) {
  const bodyEvents = phase7.actor_step_owner_outputs?.write_fragments
    ?.filter(({ value }) => value?.operation_kind === 'apply_body_event') ?? [];
  if (bodyEvents.length === 0) return;
  if (bodyEvents.length !== 1) fail('TRACE_PHASE_7_NPC_BODY_EVENT_INVALID');
  const event = bodyEvents[0].value;
  const actor = phase7.autonomous.request.npc_ref;
  if (event?.payload?.actor_ref !== actor || event.payload?.payload?.state_after == null) {
    fail('TRACE_PHASE_7_NPC_BODY_EVENT_INVALID');
  }
  const index = next.npcs.findIndex(({ instance_id }) => instance_id === actor);
  if (index < 0) fail('TRACE_PHASE_7_NPC_BODY_EVENT_INVALID');
  const body = structuredClone(event.payload.payload.state_after);
  next.npcs[index] = { ...next.npcs[index], check_body_state:
    body, machine_state: { ...next.npcs[index].machine_state,
      check_body_state: body } };
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
