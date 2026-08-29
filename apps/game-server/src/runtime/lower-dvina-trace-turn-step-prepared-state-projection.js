import { applyTracePhase7ScheduleState } from
  './lower-dvina-trace-phase-7-state-projection.js';
import { tracePhase7ActorStep } from
  './lower-dvina-trace-phase-7-schedule-execution.js';

export function projectPreparedDomainState(state, effect) {
  let next = structuredClone(state);
  next.clock = structuredClone(effect.time_update.clock_after);
  next.clock_weather_light = {
    ...structuredClone(next.clock_weather_light ?? {}),
    clock: structuredClone(next.clock)
  };
  next.body_state = structuredClone(effect.body_update.state_after);
  if (effect.consequence?.phase7_kind === 'fire_rest') {
    const phase7 = effect.consequence.phase7;
    next = applyTracePhase7ScheduleState({
      state: next,
      execution: phase7.schedule_execution,
      changeSetId: null,
      activeActorStep: tracePhase7ActorStep(
        phase7.schedule_temporal.projection, phase7.actor_step)
    });
    next.phase7_fire_rest = {
      status: phase7.schedule_temporal.rest_completed === true
        ? 'completed' : 'active'
    };
    if (phase7.schedule_temporal.rest_completed !== true) {
      next.phase7_parent_temporal = {
        execution_id: phase7.temporal.execution_id,
        limit_timestamp: structuredClone(phase7.temporal.limit_timestamp),
        completion_effect: structuredClone(
          phase7.schedule_temporal.completion_effect)
      };
      next.cumulative_elapsed_minutes = phase7.schedule_temporal.projection
        .cumulative_elapsed_minutes;
      next.active_npc_actor_steps = structuredClone(
        phase7.schedule_temporal.projection.active_npc_actor_steps);
      next.temporal_boundary_candidates = [structuredClone(
        phase7.schedule_temporal.completion_effect.candidate)];
    } else {
      next.temporal_boundary_candidates = [];
    }
  }
  if (effect.consequence?.parent_activity_completion?.status === 'completed') {
    const completion = effect.consequence.parent_activity_completion;
    next.phase7_fire_rest = { status: 'completed' };
    next.active_npc_actor_steps = structuredClone(
      completion.active_npc_actor_steps);
    next.cumulative_elapsed_minutes = completion.cumulative_elapsed_minutes;
    delete next.phase7_parent_temporal;
    next.temporal_boundary_candidates = [];
  }
  if (effect.consequence?.combat_kind === 'exchange') {
    const combat = effect.consequence.combat;
    next.combat_sessions = (next.combat_sessions ?? []).map((session) =>
      session.combat_id === combat.session_after.combat_id
        ? structuredClone(combat.session_after) : session);
    next.body_state = structuredClone(
      combat.working_state_after?.actor_states?.[
        `player_character:${next.actor_id}`]?.body_state ?? next.body_state);
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
        machine_state: { ...npc.machine_state,
        ...structuredClone(workingNpc?.machine_state ?? {}),
        ...(body == null ? {} : { body_condition: {
          ...npc.machine_state?.body_condition, health: body.health
        } })
      } };
    });
    next.active_combat_traversals = structuredClone(
      combat.working_state_after?.active_combat_traversals ?? []);
    next.active_combat_step_progress = structuredClone(
      combat.working_state_after?.active_combat_step_progress ?? []);
  }
  if (effect.consequence?.combat_kind === 'start') {
    next.combat_sessions = [structuredClone(
      effect.consequence.combat_initialization.session)];
    next.player_response_boundary = { kind: 'combat', combat_id:
      effect.consequence.combat_initialization.session.combat_id };
  }
  return next;
}
