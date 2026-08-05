import { subtractGameTimestamp } from '@rus/time-events-history';
import {
  createTurnStepExecutionRegistry,
  executeTurnStepActorStep
} from '@rus/turn';
import { createTracePhase7DomainExecution } from
  './lower-dvina-trace-phase-7-domain-owners.js';

export function createTracePhase7ActorStepRuntime({
  state,
  contracts,
  temporal
}) {
  const domainExecution = createTracePhase7DomainExecution({
    state, contracts, temporal
  });
  const registry = createTurnStepExecutionRegistry({
    domain: domainExecution.handlers,
    operationContract: domainExecution.operation_contract
  });
  return Object.freeze({ registry });
}

export async function executeTracePhase7SchedulePlan({
  state,
  contracts,
  temporal,
  autonomous,
  actorStepRuntime
}) {
  const execution = await executeTurnStepActorStep({
    plan: autonomous.proposal.plan,
    request: autonomous.request,
    workingProjection: temporal.projection,
    preparedChainContext: null,
    registry: actorStepRuntime.registry,
    ports: {}
  });
  if (execution.consequenceFragments.length !== 1) {
    fail('TRACE_PHASE_7_ACTOR_STEP_RESULT_INVALID');
  }
  return Object.freeze({
    started_at: structuredClone(temporal.result.clock_after),
    working_projection: structuredClone(execution.workingProjection),
    result: structuredClone(execution.consequenceFragments[0])
  });
}

export function finalizeTracePhase7ScheduleExecution({
  actorStep,
  scheduleTemporal
}) {
  const started = actorStep.result;
  const elapsed = exactIntegerElapsed(
    started.clock_before, scheduleTemporal.result.clock_after
  );
  if (started.status !== 'started'
      || scheduleTemporal.result.temporal_status !== 'completed'
      || scheduleTemporal.result.clock_before.whole_minutes
        !== started.clock_before.whole_minutes
      || elapsed !== Number(started.exact_elapsed.exact_minutes.numerator)
      || scheduleTemporal.projection.active_npc_actor_step?.npc_ref
        !== started.npc_ref
      || scheduleTemporal.projection.active_npc_actor_step?.status
        !== 'completed') {
    fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
  }
  return Object.freeze({
    ...structuredClone(started),
    status: 'executed',
    failure_code: null,
    clock_after: structuredClone(scheduleTemporal.result.clock_after)
  });
}

function exactIntegerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') {
    fail('TRACE_PHASE_7_TEMPORAL_FRACTION_GAP');
  }
  const value = Number(exact.numerator);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('TRACE_PHASE_7_TEMPORAL_INTERVAL_INVALID');
  }
  return value;
}

function fail(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
