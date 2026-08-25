import { selectApplicableNpcActivityExecution } from '@rus/npc-runtime';
import { subtractGameTimestamp } from '@rus/time-events-history';
import { startNpcActorStep } from '@rus/turn/temporal-advance';
import { resolveTracePhase7DomainProposals,
  tracePhase7PropertyTransitions } from
  './lower-dvina-trace-phase-7-owner-proposals.js';
import { resolveTracePhase7SemanticActivity } from './lower-dvina-trace-phase-7-semantic-activity.js';
import { phase7OwnerOutputs } from './lower-dvina-trace-phase-7-owner-registry.js';
import { projectTracePhase7OwnerCapabilities } from
  './lower-dvina-trace-phase-7-owner-capabilities.js';
export function createTracePhase7DomainExecution({ state, contracts,
  temporal, semanticActivityScheduleOwner, worldProcessResolver = null,
  worldProcessContract = null, npcOwnerCapabilities = [], directHandlers = {},
  directOperationContract = {} }) {
  const capabilities = projectTracePhase7OwnerCapabilities({ contracts,
    worldProcessContract, npcOwnerCapabilities, state, worldProcessResolver,
    directHandlers, directOperationContract });
  let registeredOwnerOutput = null;
  const handlers = {
    request_activity: (execution) => executeActivity({ execution, state,
      contracts, temporal, capabilities }),
    request_item_use: (execution) => executeItem({ execution, state,
      contracts, temporal, capabilities }),
    request_movement: (execution) => executeMovement({ execution, state,
      contracts, temporal, capabilities })
  };
  for (const owner of capabilities.additional_owners) {
    const fallback = handlers[owner.operation];
    handlers[owner.operation] = (execution) => owner.supports(execution)
      ? executeRegisteredOwner({ execution, state, temporal, owner,
          capture: (output) => { registeredOwnerOutput = output; } })
      : fallback == null
        ? fail('TRACE_PHASE_7_DOMAIN_REQUEST_NOT_APPLICABLE')
        : fallback(execution);
  }
  return Object.freeze({
    semantic_activity_handler: async (execution) => {
      const semantic = await resolveTracePhase7SemanticActivity({
        execution, contracts, semanticActivityScheduleOwner
      });
      return started({ execution, temporal, ...semantic, movement: null,
        property: null });
    },
    handlers: Object.freeze(handlers),
    direct_handlers: capabilities.direct_handlers,
    operation_contract: capabilities.operation_contract,
    registered_owner_output: () => structuredClone(registeredOwnerOutput)
  });
}

async function executeRegisteredOwner({ execution, state, temporal, owner,
  capture }) {
  const resolved = await owner.execute({ ...execution,
    actor: execution.request.actor,
    committed_state: state,
    request: { ...execution.request,
      change_set_id: `change:${state.party_id}:trace-phase7:${
        state.party_state.turn_number + 1}` }
  });
  capture({ consequence_fragment: structuredClone(
    resolved.consequence_fragment ?? null) });
  const startedResult = started({ execution: {
    ...execution,
    working_projection: resolved.working_projection
  }, temporal, profile: null, movement: null, property: null,
  minutes: registeredOwnerMinutes(resolved, temporal) });
  return Object.freeze({ ...startedResult,
    summary: `${startedResult.summary}; ${resolved.summary}`,
    write_fragments: structuredClone(resolved.write_fragments ?? []),
    ...phase7OwnerOutputs(resolved)
  });
}

function registeredOwnerMinutes(resolved, temporal) {
  const minutes = resolved?.duration_minutes ?? 0;
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    fail('TRACE_PHASE_7_OWNER_TIME_INVALID');
  }
  return minutes;
}
function executeActivity({ execution, state, contracts, temporal,
  capabilities }) {
  const operation = execution.operation;
  if (operation.actor_ref !== contracts.zhdanko.instance_id
      || !matchesAllowed(capabilities.activity_allowed, operation)) {
    fail('TRACE_PHASE_7_DOMAIN_REQUEST_NOT_APPLICABLE');
  }
  const selection = selectApplicableNpcActivityExecution({
    operation,
    activity_profiles: contracts.scheduleActivityProfiles,
    execution_bindings: Object.values(contracts.scheduleExecutions),
    movement_bindings: [contracts.localTransition],
    property_transition_profiles: tracePhase7PropertyTransitions(contracts)
  });
  if (!selection.pass) {
    fail(selection.errors[0].code, selection.errors);
  }
  const profile = selection.execution_binding;
  const owned = resolveTracePhase7DomainProposals({ operation, state,
    contracts, profile });
  return started({ execution, temporal, profile,
    movement: owned.movement, property: owned.property });
}

function executeItem({ execution, state, contracts, temporal, capabilities }) {
  const operation = execution.operation;
  if (operation.actor_ref !== contracts.zhdanko.instance_id
      || !matchesAllowed(capabilities.item_allowed, operation)
      || operation.target_refs.length !== 1) {
    fail('TRACE_PHASE_7_ITEM_REQUEST_NOT_APPLICABLE');
  }
  const { property } = resolveTracePhase7DomainProposals({
    operation, state, contracts
  });
  return started({ execution, temporal, profile: null, movement: null,
    property });
}

function executeMovement({ execution, state, contracts, temporal,
  capabilities }) {
  const operation = execution.operation;
  const movementCap = capabilities.movement;
  if (movementCap == null
      || operation.actor_ref !== contracts.zhdanko.instance_id
      || !movementCap.movement_kinds.includes(operation.movement_kind)
      || !movementCap.target_refs.includes(operation.target_ref)) {
    fail('TRACE_PHASE_7_DOMAIN_REQUEST_NOT_APPLICABLE');
  }
  const owned = resolveTracePhase7DomainProposals({
    operation, state, contracts
  });
  return started({
    execution, temporal, profile: null,
    movement: owned.movement, property: owned.property,
    minutes: Number(owned.movement.exact_elapsed.exact_minutes.numerator)
  });
}

function matchesAllowed(allowed, operation) {
  return allowed.some((entry) => {
    if (operation.op === 'request_activity') {
      return entry.activity_kind === operation.activity_kind
        && sameSet(entry.target_refs, operation.target_refs);
    }
    if (operation.op === 'request_item_use') {
      return entry.item_ref === operation.item_ref
        && entry.use_kind === operation.use_kind
        && sameSet(entry.target_refs, operation.target_refs);
    }
    return false;
  });
}

function started({ execution, temporal, profile, movement, property,
  minutes = null, npcRef = null }) {
  const ownDuration = minutes == null
    ? profileMinutes(profile) ?? remainingMinutes(temporal) : Number(minutes);
  if (!Number.isSafeInteger(ownDuration) || ownDuration < 0) {
    fail('TRACE_PHASE_7_SCHEDULE_TIME_PROFILE_INVALID');
  }
  return startNpcActorStep({
    execution,
    started_at: temporal.result.clock_after,
    actor_ref: npcRef ?? execution.operation.actor_ref,
    duration_minutes: ownDuration,
    execution_binding_ref: profile?.execution_binding_id ?? null,
    schedule_option_id: profile?.schedule_option_id ?? null,
    activity_profile_ref: profile?.activity_profile_ref ?? null,
    movement_proposal: movement,
    property_proposal: property
  });
}

function remainingMinutes(temporal) {
  const exact = subtractGameTimestamp(
    temporal.limit_timestamp, temporal.result.clock_after);
  if (exact.denominator !== '1') fail('TRACE_PHASE_7_TEMPORAL_FRACTION_GAP');
  const value = Number(exact.numerator);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('TRACE_PHASE_7_TEMPORAL_INTERVAL_INVALID');
  }
  return value;
}

function profileMinutes(profile) {
  if (profile == null) return null;
  return (profile.elapsed_plan?.stages ?? []).reduce(
    (sum, stage) => sum + stage.duration_minutes, 0);
}

function sameSet(left, right) {
  return left.length === right.length
    && new Set(left).size === left.length
    && left.every((value) => right.includes(value));
}

function fail(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
