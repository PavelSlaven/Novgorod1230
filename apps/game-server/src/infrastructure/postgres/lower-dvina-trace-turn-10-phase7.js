import { finalizeTracePhase7ScheduleExecution } from
  '../../runtime/lower-dvina-trace-phase-7-schedule-execution.js';

export function completeTurn10Phase7Factual(factual) {
  const semantic = factual?.consequence?.conversation?.semantic_exchange;
  const completion = semantic?.parent_activity_completion;
  if (factual?.consequence?.turn10_kind !== 'companion_request'
      || completion?.status !== 'completed') return factual;
  const phase7 = factual.consequence.phase7;
  const partial = phase7?.schedule_temporal;
  if (partial?.rest_completed === true) return factual;
  const temporalResults = semantic.exchange?.working_state
    ?.temporal_advance_results;
  if (partial?.rest_completed !== false
      || !Array.isArray(temporalResults) || temporalResults.length === 0) {
    fail();
  }
  const processed = temporalResults.flatMap(
    ({ trace }) => trace?.processed_boundary_ids ?? []);
  const scheduleTemporal = {
    ...structuredClone(partial),
    elapsed_after_decision: 5,
    rest_completed: true,
    result: {
      ...structuredClone(partial.result),
      clock_after: structuredClone(semantic.clock_after),
      temporal_status: 'completed',
      trace: {
        ...structuredClone(partial.result.trace),
        processed_boundary_ids: [...new Set(processed)]
      }
    },
    projection: {
      ...structuredClone(partial.projection),
      cumulative_elapsed_minutes: completion.cumulative_elapsed_minutes,
      active_npc_actor_steps: structuredClone(
        completion.active_npc_actor_steps)
    }
  };
  const scheduleExecution = finalizeTracePhase7ScheduleExecution({
    actorStep: {
      result: phase7.actor_step,
      working_projection: scheduleTemporal.projection
    },
    scheduleTemporal
  });
  return {
    ...structuredClone(factual),
    consequence: {
      ...structuredClone(factual.consequence),
      body_effect_ref: factual.body_update?.proposal?.profile_ref ?? null,
      phase7: {
        ...structuredClone(phase7),
        schedule_temporal: scheduleTemporal,
        schedule_execution: scheduleExecution
      }
    }
  };
}

function fail() {
  throw Object.assign(new Error('TRACE_TURN10_PARENT_ACTIVITY_INVALID'), {
    code: 'TRACE_TURN10_PARENT_ACTIVITY_INVALID'
  });
}
