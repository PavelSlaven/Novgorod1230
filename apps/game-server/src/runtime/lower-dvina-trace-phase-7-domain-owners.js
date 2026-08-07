import { selectApplicableNpcActivityExecution } from '@rus/npc-runtime';
import { subtractGameTimestamp } from '@rus/time-events-history';
import {
  resolveTracePhase7DomainProposals,
  tracePhase7ItemUseTransitions,
  tracePhase7PropertyTransitions,
  tracePhase7TransitionTarget
} from './lower-dvina-trace-phase-7-owner-proposals.js';
import { resolveTracePhase7SemanticActivity } from
  './lower-dvina-trace-phase-7-semantic-activity.js';

export function createTracePhase7DomainExecution({ state, contracts,
  temporal, semanticActivityScheduleOwner }) {
  const capabilities = ownerCapabilities(contracts);
  return Object.freeze({
    semantic_activity_handler: async (execution) => {
      const semantic = await resolveTracePhase7SemanticActivity({
        execution, contracts, semanticActivityScheduleOwner
      });
      return started({ execution, temporal, ...semantic,
        movement: null, property: null });
    },
    handlers: {
      request_activity: (execution) => executeActivity({
        execution, state, contracts, temporal, capabilities
      }),
      request_item_use: (execution) => executeItem({
        execution, state, contracts, temporal, capabilities
      }),
      request_movement: (execution) => executeMovement({
        execution, state, contracts, temporal, capabilities
      })
    },
    operation_contract: capabilities.operation_contract
  });
}

function ownerCapabilities(contracts) {
  const activityAllowed = exactActivityAllowed(contracts);
  const itemAllowed = exactItemAllowed(contracts);
  const movement = contracts.localTransition == null ? null : Object.freeze({
    owner: '@rus/movement-routes',
    movement_kinds: Object.freeze(['local']),
    target_refs: Object.freeze([
      contracts.localTransition.destination_zone_ref
    ]),
    route_refs: Object.freeze([contracts.localTransition.transition_id]),
    factual_outcome_write: 'owner_only'
  });
  const operationContract = {
    request_activity: {
      owner: '@rus/turn',
      allowed: activityAllowed,
      factual_outcome_write: 'forbidden'
    },
    request_item_use: {
      owner: '@rus/items-property',
      allowed: itemAllowed,
      factual_outcome_write: 'owner_only'
    }
  };
  if (movement != null) operationContract.request_movement = movement;
  return Object.freeze({
    activity_allowed: activityAllowed,
    item_allowed: itemAllowed,
    movement,
    operation_contract: Object.freeze(operationContract)
  });
}

function exactActivityAllowed(contracts) {
  const profiles = new Map(contracts.scheduleActivityProfiles.map(
    (profile) => [profile.profile_id, profile]
  ));
  const movements = new Map([
    [contracts.localTransition.transition_id, contracts.localTransition]
  ]);
  const transitions = new Map(tracePhase7PropertyTransitions(contracts).map(
    (profile) => [profile.transition_profile_id, profile]
  ));
  return Object.freeze(Object.values(contracts.scheduleExecutions).map(
    (binding) => {
      const profile = profiles.get(binding.activity_profile_ref);
      const activityKind = activityKindFor(profile, binding);
      if (activityKind == null) fail('TRACE_PHASE_7_EXECUTION_PROFILE_GAP');
      const required = new Set(profile.resource_refs ?? []);
      if (binding.movement_ref != null) {
        const movement = movements.get(binding.movement_ref);
        if (!movement) fail('TRACE_PHASE_7_EXECUTION_PROFILE_GAP');
        required.add(movement.destination_zone_ref);
      }
      for (const ref of binding.property_transition_refs ?? []) {
        const transition = transitions.get(ref);
        if (!transition) fail('TRACE_PHASE_7_EXECUTION_PROFILE_GAP');
        required.add(transition.subject_ref);
        required.add(transition.writes?.zone_ref
          ?? transition.writes?.location_ref);
      }
      return Object.freeze({
        activity_kind: activityKind,
        target_refs: Object.freeze([...required])
      });
    }
  ));
}

function exactItemAllowed(contracts) {
  const targets = tracePhase7ItemUseTransitions(contracts)
    .map(tracePhase7TransitionTarget);
  return Object.freeze(['operate', 'other'].flatMap((useKind) =>
    targets.map((target) => Object.freeze({
      item_ref: contracts.roadBag.item_ref,
      use_kind: useKind,
      target_refs: Object.freeze([target])
    }))));
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
  const owned = resolveTracePhase7DomainProposals({
    operation, state, contracts, profile
  });
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

function activityKindFor(profile, binding) {
  if (profile?.activity_type === 'autonomous_wait'
      && binding.movement_ref === null
      && binding.property_transition_refs?.length === 0) {
    return 'wait';
  }
  if (profile?.activity_type === 'autonomous_local_property_transfer'
      && binding.movement_ref != null
      && binding.property_transition_refs?.length > 0) {
    return 'carry';
  }
  return null;
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
  const duration = minutes == null
    ? profileMinutes(profile) ?? remainingMinutes(temporal) : Number(minutes);
  // ponytail: allow planned duration past remaining Mikula rest; temporal owner
  // keeps unfinished actor-step active after T+30. Ceiling: no interrupt policy.
  if (!Number.isSafeInteger(duration) || duration < 1) {
    fail('TRACE_PHASE_7_SCHEDULE_TIME_PROFILE_INVALID');
  }
  const operation = execution.operation;
  const decisionTraceRef = {
    entity_kind: 'npc_decision_trace',
    entity_id: execution.request.request_id
  };
  const active = {
    npc_ref: npcRef ?? operation.actor_ref, status: 'started',
    started_at: structuredClone(temporal.result.clock_after),
    decision_trace_ref: decisionTraceRef,
    semantic_operation: structuredClone(operation),
    planned_exact_elapsed: {
      exact_minutes: { numerator: String(duration), denominator: '1' }
    }
  };
  return {
    working_projection: {
      ...structuredClone(execution.working_projection),
      active_npc_actor_step: active
    },
    summary: `npc_actor_step:${operation.op}`,
    consequence_fragment: Object.freeze({
      owner: '@rus/turn/actor-step', domain_owner: domainOwner(operation.op),
      status: 'started', failure_code: null,
      npc_ref: npcRef ?? operation.actor_ref,
      decision_trace_ref: structuredClone(active.decision_trace_ref),
      semantic_operation: structuredClone(operation),
      execution_binding_ref: profile?.execution_binding_id ?? null,
      schedule_option_id: profile?.schedule_option_id ?? null,
      activity_profile_ref: profile?.activity_profile_ref ?? null,
      exact_elapsed: structuredClone(active.planned_exact_elapsed),
      clock_before: structuredClone(temporal.result.clock_after),
      clock_after: structuredClone(temporal.result.clock_after),
      root_clock_write_count: 0, movement_proposal: movement,
      property_proposal: property,
      factual_result_source: 'code_owned_actor_step_domain_execution',
      parent_state_version: execution.request.committed_state_version
    }),
    goal_result: execution.plan.goal_result,
    continuation: null,
    player_response_boundary: true
  };
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

function domainOwner(operation) {
  if (operation === 'apply_semantic_activity') return '@rus/turn';
  if (operation === 'request_item_use') return '@rus/items-property';
  if (operation === 'request_movement') return '@rus/movement-routes';
  return '@rus/turn';
}

function fail(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
