import { canonicalDigest } from '@rus/materialization';
import {
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  createTurnStepExecutionRegistry,
  executeTurnStepActorStep
} from '@rus/turn';
import { createTracePhase7DomainExecution } from
  './lower-dvina-trace-phase-7-domain-owners.js';

export function createTracePhase7ActorStepRuntime({
  state,
  contracts,
  temporal,
  semanticActivityScheduleOwner,
  genericCheckContextOwner,
  randomSource
}) {
  const domainExecution = createTracePhase7DomainExecution({
    state, contracts, temporal, semanticActivityScheduleOwner
  });
  const registry = createTurnStepExecutionRegistry({
    domain: domainExecution.handlers,
    applySemanticActivity: domainExecution.semantic_activity_handler,
    operationContract: domainExecution.operation_contract
  });
  const ports = Object.freeze({
    resolveCheckContext: genericCheckContextOwner == null
      ? null
      : ({ check, actor, working_projection: projection }) =>
          genericCheckContextOwner.resolve({
            check, actor, working_projection: projection
          }),
    randomSource
  });
  return Object.freeze({ registry, ports });
}

export async function executeTracePhase7SchedulePlan({
  state,
  contracts,
  temporal,
  autonomous,
  actorStepRuntime
}) {
  if (autonomous.proposal.status === 'domain_rejected') {
    return Object.freeze({
      working_projection: structuredClone(temporal.projection),
      domain_result: structuredClone(autonomous.proposal.domain_result)
    });
  }
  const execution = await executeTurnStepActorStep({
    plan: autonomous.proposal.plan,
    request: actorStepRequest(autonomous.request, contracts),
    workingProjection: checkWorkingProjection(
      temporal.projection, contracts.genericCheckContext),
    preparedChainContext: null,
    registry: actorStepRuntime.registry,
    ports: actorStepRuntime.ports
  });
  const result = finalActorStepConsequence(execution.consequenceFragments);
  if (result == null) {
    fail('TRACE_PHASE_7_ACTOR_STEP_RESULT_INVALID');
  }
  return Object.freeze({
    started_at: structuredClone(temporal.result.clock_after),
    working_projection: structuredClone(execution.workingProjection),
    result: structuredClone(result),
    check: execution.checkResult == null ? null : {
      request: structuredClone(execution.checkRequest),
      result: structuredClone(execution.checkResult)
    }
  });
}

function actorStepRequest(request, contracts) {
  const npc = contracts.zhdanko;
  const context = contracts.genericCheckContext ?? {};
  return {
    ...structuredClone(request),
    step_index: request.decision_index,
    actor: {
      actor_id: npc.instance_id,
      attributes: ratedMap(context.attributes, 'attribute_ref', 'value'),
      skills: ratedMap(context.skills, 'skill_ref', 'bonus'),
      body: structuredClone(context.body ?? null)
    }
  };
}

function checkWorkingProjection(projection, context) {
  return {
    ...structuredClone(projection),
    inventory: structuredClone(context?.inventory ?? null)
  };
}

function finalActorStepConsequence(fragments) {
  if (fragments.length === 1) return fragments[0];
  if (fragments.length !== 2) return null;
  const [base, composed] = fragments;
  const additional = composed?.additional_semantic_operations;
  return base?.semantic_operation?.op === 'apply_semantic_activity'
    && composed?.semantic_operation?.op === 'apply_semantic_activity'
    && Array.isArray(additional)
    && additional.length === 1
    && canonicalDigest(base.semantic_operation)
      === canonicalDigest(composed.semantic_operation)
      ? composed
      : null;
}

function ratedMap(entries, refKey, numericKey) {
  if (!Array.isArray(entries)) return structuredClone(entries ?? {});
  return Object.fromEntries(entries.map((entry) => [
    entry[refKey],
    {
      ...structuredClone(entry),
      [numericKey]: entry[numericKey] ?? entry.value
    }
  ]));
}

export function finalizeTracePhase7ScheduleExecution({
  actorStep,
  scheduleTemporal
}) {
  const started = actorStep.result;
  const active = scheduleTemporal.projection?.active_npc_actor_step;
  if (started.status !== 'started'
      || scheduleTemporal.result.temporal_status !== 'completed'
      || canonicalDigest(scheduleTemporal.result.clock_before)
        !== canonicalDigest(started.clock_before)
      || active?.npc_ref !== started.npc_ref) {
    fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
  }
  if (active.status === 'completed') {
    const completionClock = active.completed_at;
    if (completionClock == null) {
      fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
    }
    const elapsed = exactIntegerElapsed(started.clock_before, completionClock);
    if (compareGameTimestamp(completionClock,
          scheduleTemporal.result.clock_after) > 0
        || elapsed !== Number(started.exact_elapsed.exact_minutes.numerator)) {
      fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
    }
    return Object.freeze({
      ...structuredClone(started),
      status: 'executed',
      failure_code: null,
      clock_after: structuredClone(completionClock)
    });
  }
  if (active.status !== 'started'
      || compareGameTimestamp(
        scheduleTemporal.completion_candidate.scheduled_at,
        scheduleTemporal.result.clock_after) <= 0) {
    fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
  }
  return Object.freeze({
    ...structuredClone(started),
    status: 'started',
    failure_code: null
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
