import { canonicalDigest } from '@rus/materialization';
import {
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  createTurnStepExecutionRegistry,
  executeTurnStepActorStep
} from '@rus/turn';
import { npcActorSteps } from '@rus/turn/temporal-advance';
import { createTracePhase7DomainExecution } from
  './lower-dvina-trace-phase-7-domain-owners.js';
import { phase7ActorStepOwnerOutputs } from './lower-dvina-trace-phase-7-owner-registry.js';

export function createTracePhase7ActorStepRuntime({
  state,
  contracts,
  temporal,
  semanticActivityScheduleOwner,
  genericCheckContextOwner,
  localFireProfile,
  worldProcessResolver,
  projectNpcWorldProcessCapability,
  npcOwnerCapabilities,
  priorLocalFirePlans = [],
  randomSource
}) {
  const npc = liveNpc(state, contracts.zhdanko);
  const worldProcessContract =
    typeof projectNpcWorldProcessCapability === 'function'
      ? projectNpcWorldProcessCapability({ committedState: state,
          npcSnapshot: npc, loadedProfile: localFireProfile,
          resolverAvailable: typeof worldProcessResolver === 'function',
          priorLocalFirePlans })
      : null;
  const domainExecution = createTracePhase7DomainExecution({
    state, contracts, temporal, semanticActivityScheduleOwner,
    worldProcessResolver, worldProcessContract, npcOwnerCapabilities
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
  return Object.freeze({ registry, ports,
    registeredOwnerOutput: domainExecution.registered_owner_output });
}

export async function executeTracePhase7SchedulePlan({
  state,
  contracts,
  temporal,
  autonomous,
  actorStepRuntime,
  priorLocalFirePlans = []
}) {
  if (autonomous.proposal.status === 'domain_rejected') {
    return Object.freeze({
      working_projection: structuredClone(temporal.projection),
      domain_result: structuredClone(autonomous.proposal.domain_result)
    });
  }
  const execution = await executeTurnStepActorStep({
    plan: autonomous.proposal.plan,
    request: actorStepRequest(
      autonomous.request, contracts, state, autonomous.proposal.plan,
      temporal.result.clock_after),
    workingProjection: checkWorkingProjection(
      temporal.projection, state, contracts, autonomous.proposal.plan),
    preparedChainContext: null,
    priorLocalFirePlans,
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
    local_fire_atomic_write_plans: structuredClone(
      execution.local_fire_atomic_write_plans ?? []),
    owner_outputs: phase7ActorStepOwnerOutputs(execution,
      actorStepRuntime.registeredOwnerOutput()),
    check: execution.checkResult == null ? null : {
      request: structuredClone(execution.checkRequest),
      result: structuredClone(execution.checkResult)
    }
  });
}

function actorStepRequest(request, contracts, state, plan, occurredAt) {
  const npc = liveNpc(state, contracts.zhdanko);
  const context = contracts.genericCheckContext ?? {};
  const body = plan.resolution === 'generic_check'
    ? authoritativeNpcCheckBody(npc)
    : {};
  return {
    ...structuredClone(request),
    change_set_id: `change:${state.party_id}:trace-phase7:${
      state.party_state.turn_number + 1}`,
    step_index: request.decision_index,
    occurred_at: structuredClone(occurredAt),
    actor: {
      actor_id: npc.instance_id,
      attributes: ratedMap(context.attributes, 'attribute_ref', 'value'),
      skills: ratedMap(context.skills, 'skill_ref', 'bonus'),
      body: structuredClone(body)
    }
  };
}

function checkWorkingProjection(projection, state, contracts, plan) {
  if (plan.resolution !== 'generic_check') {
    return structuredClone(projection);
  }
  const npc = liveNpc(state, contracts.zhdanko);
  return {
    ...structuredClone(projection),
    inventory: {
      load_category: authoritativeNpcLoadCategory(npc)
    }
  };
}

function liveNpc(state, fallback) {
  const match = (state?.npcs ?? []).find(
    ({ instance_id: id }) => id === fallback?.instance_id
  );
  return match ?? fallback;
}

function authoritativeNpcCheckBody(npc) {
  const metrics = npc?.check_body_state;
  const health = Number(metrics?.health);
  const satiety = Number(metrics?.satiety);
  const energy = Number(metrics?.energy);
  if (![health, satiety, energy].every(Number.isFinite)
      || !Array.isArray(metrics?.active_conditions)) {
    fail('TRACE_PHASE_7_NPC_CHECK_BODY_DATA_GAP');
  }
  return {
    health,
    satiety,
    energy,
    active_conditions: structuredClone(metrics.active_conditions)
  };
}

function authoritativeNpcLoadCategory(npc) {
  const fromMachine = npc?.machine_state?.load_category;
  if (typeof fromMachine === 'string' && fromMachine.length > 0) {
    return fromMachine;
  }
  const fromInventory = npc?.inventory?.load_category;
  if (typeof fromInventory === 'string' && fromInventory.length > 0) {
    return fromInventory;
  }
  fail('TRACE_PHASE_7_NPC_CHECK_LOAD_DATA_GAP');
}

function finalActorStepConsequence(fragments) {
  if (fragments.length === 1) return fragments[0];
  const [base, ...composed] = fragments;
  const result = composed.at(-1);
  const additional = result?.additional_semantic_operations;
  return composed.every((entry, index) =>
    canonicalDigest(base?.semantic_operation)
      === canonicalDigest(entry?.semantic_operation)
    && Array.isArray(entry?.additional_semantic_operations)
    && entry.additional_semantic_operations.length === index + 1)
    && Array.isArray(additional)
    && additional.every(({ op }) => op === 'apply_semantic_activity')
    ? result
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
  const active = tracePhase7ActorStep(
    scheduleTemporal.projection, started);
  const temporalStatus = scheduleTemporal.result.temporal_status;
  if (started.status !== 'started'
      || !['completed', 'paused'].includes(temporalStatus)
      || canonicalDigest(scheduleTemporal.result.clock_before)
        !== canonicalDigest(started.clock_before)
      || active?.npc_ref !== started.npc_ref) {
    fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
  }
  if (temporalStatus === 'paused') {
    if (!['started', 'completed'].includes(active.status)) {
      fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
    }
    if (active.status === 'completed') {
      const completionClock = active.completed_at;
      if (completionClock == null
          || compareGameTimestamp(completionClock,
            scheduleTemporal.result.clock_after) > 0) {
        fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
      }
      return Object.freeze({
        ...structuredClone(started),
        status: 'executed',
        failure_code: null,
        clock_after: structuredClone(completionClock)
      });
    }
    return Object.freeze({
      ...structuredClone(started),
      status: 'started',
      failure_code: null
    });
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

export function tracePhase7ActorStep(projection, started) {
  const matches = npcActorSteps(projection).filter((step) =>
    step?.npc_ref === started?.npc_ref
    && (started?.decision_trace_ref == null
      || (step?.decision_trace_ref?.entity_kind
        === started.decision_trace_ref.entity_kind
        && step?.decision_trace_ref?.entity_id
          === started.decision_trace_ref.entity_id)));
  if (matches.length !== 1) {
    fail('TRACE_PHASE_7_SCHEDULE_COMPLETION_INVALID');
  }
  return matches[0];
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
