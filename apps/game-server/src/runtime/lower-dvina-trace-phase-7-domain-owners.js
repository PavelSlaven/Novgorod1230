import {
  planApprovedItemVisibilityTransition,
  planApprovedItemZoneTransition
} from '@rus/items-property';
import { planApprovedLocalZoneTransition } from '@rus/movement-routes';
import { subtractGameTimestamp } from '@rus/time-events-history';

const ACTIVITY_KINDS = [
  'wait', 'sleep', 'work', 'recover', 'carry', 'other'
];

export function createTracePhase7DomainExecution({ state, contracts,
  temporal }) {
  const resources = contracts.autonomous.available_resource_refs;
  const transitions = propertyTransitions(contracts);
  return Object.freeze({
    handlers: {
      request_activity: (execution) => executeActivity({
        execution, state, contracts, temporal
      }),
      request_item_use: (execution) => executeItem({
        execution, state, contracts, temporal
      }),
      request_movement: (execution) => executeMovement({
        execution, state, contracts, temporal
      })
    },
    operation_contract: {
      request_activity: {
        owner: '@rus/turn', activity_kinds: ACTIVITY_KINDS,
        target_refs: structuredClone(resources),
        maximum_elapsed_minutes: remainingMinutes(temporal),
        factual_outcome_write: 'forbidden'
      },
      request_item_use: {
        owner: '@rus/items-property', item_refs: structuredClone(resources),
        use_kinds: ['operate', 'other'],
        target_refs: transitions.map(transitionTarget),
        factual_outcome_write: 'owner_only'
      },
      request_movement: {
        owner: '@rus/movement-routes', movement_kinds: ['local'],
        target_refs: [contracts.localTransition.destination_zone_ref],
        route_refs: [contracts.localTransition.transition_id],
        factual_outcome_write: 'owner_only'
      }
    }
  });
}

function executeActivity({ execution, state, contracts, temporal }) {
  const operation = execution.operation;
  requireActorAndTargets(operation, contracts, {
    kinds: ACTIVITY_KINDS,
    targetRefs: contracts.autonomous.available_resource_refs,
    kindField: 'activity_kind'
  });
  const carriesBag = operation.activity_kind === 'carry'
    && sameRefs(operation.target_refs, [contracts.roadBag.item_ref]);
  const profile = carriesBag
    ? contracts.scheduleExecutions.moveBag
    : operation.activity_kind === 'wait' && operation.target_refs.length === 0
      ? contracts.scheduleExecutions.wait : null;
  if (!carriesBag) {
    return started({ execution, temporal, profile, movement: null,
      property: null });
  }
  const owned = planMovementAndProperty({ state, contracts, profile });
  return started({ execution, temporal, profile,
    movement: owned.movement, property: owned.property });
}

function executeMovement({ execution, state, contracts, temporal }) {
  const operation = execution.operation;
  requireActorAndTargets(operation, contracts, {
    kinds: ['local'],
    targetRefs: [contracts.localTransition.destination_zone_ref],
    kindField: 'movement_kind', singleTargetField: 'target_ref'
  });
  const movement = planMovement({ state, contracts,
    parentExecutionRef:
      contracts.scheduleExecutions.moveBag.execution_binding_id });
  return started({ execution, temporal, profile: null, movement,
    property: null, minutes: movement.exact_elapsed.exact_minutes.numerator });
}

function executeItem({ execution, state, contracts, temporal }) {
  const operation = execution.operation;
  const transitions = propertyTransitions(contracts);
  requireActorAndTargets(operation, contracts, {
    kinds: ['operate', 'other'],
    targetRefs: transitions.map(transitionTarget), kindField: 'use_kind'
  });
  if (operation.item_ref !== contracts.roadBag.item_ref
      || operation.target_refs.length !== 1) {
    fail('TRACE_PHASE_7_ITEM_REQUEST_NOT_APPLICABLE');
  }
  const matches = transitions.filter((transition) =>
    transitionTarget(transition) === operation.target_refs[0]);
  if (matches.length !== 1) fail('TRACE_PHASE_7_ITEM_TRANSITION_AMBIGUOUS');
  const property = planProperty({ state, contracts, transition: matches[0] });
  return started({ execution, temporal, profile: null, movement: null,
    property });
}

function started({ execution, temporal, profile, movement, property,
  minutes = null }) {
  const duration = minutes == null
    ? profileMinutes(profile) ?? remainingMinutes(temporal) : Number(minutes);
  if (!Number.isSafeInteger(duration) || duration < 1
      || duration > remainingMinutes(temporal)) {
    fail('TRACE_PHASE_7_SCHEDULE_TIME_PROFILE_INVALID');
  }
  const operation = execution.operation;
  const active = {
    npc_ref: operation.actor_ref, status: 'started',
    started_at: structuredClone(temporal.result.clock_after),
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
      status: 'started', failure_code: null, npc_ref: operation.actor_ref,
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

function planMovementAndProperty({ state, contracts, profile }) {
  if (profile?.movement_ref !== contracts.localTransition.transition_id
      || !profile.property_transition_refs.includes(
        contracts.bagTransition.transition_profile_id)) {
    fail('TRACE_PHASE_7_ACTIVITY_PROFILE_OWNER_MISSING');
  }
  return {
    movement: planMovement({ state, contracts,
      parentExecutionRef: profile.execution_binding_id }),
    property: planProperty({ state, contracts,
      transition: contracts.bagTransition })
  };
}

function planMovement({ state, contracts, parentExecutionRef }) {
  const npc = contracts.zhdanko;
  const result = planApprovedLocalZoneTransition({
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    parent_execution_ref: parentExecutionRef,
    transition_binding: contracts.localTransition,
    actor: {
      actor_id: npc.instance_id,
      location_ref: npc.machine_state?.location_ref
        ?? npc.location_profile_ref,
      zone_ref: npc.machine_state?.spatial_zone_ref ?? npc.zone_ref
    }
  });
  if (!result.pass) fail('TRACE_PHASE_7_MOVEMENT_OWNER_REJECTED', result.errors);
  return result.proposal;
}

function planProperty({ state, contracts, transition }) {
  const bag = findBag(state, contracts);
  const plan = transition.writes.visibility_state == null
    ? planApprovedItemZoneTransition : planApprovedItemVisibilityTransition;
  const result = plan({
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    approved_transition: transition,
    item: bag,
    resolved_actor_refs: {
      zhdanko_storehouse_controller: contracts.zhdanko.instance_id
    },
    source: {
      location_ref: bag.state?.location_ref, zone_ref: bag.state?.zone_ref,
      holder_actor_id: bag.holder_npc_id,
      controller_actor_id: bag.state?.controller_npc_id
    }
  });
  if (!result.pass) fail('TRACE_PHASE_7_PROPERTY_OWNER_REJECTED', result.errors);
  return result.proposal;
}

function requireActorAndTargets(operation, contracts, {
  kinds, targetRefs, kindField, singleTargetField = null
}) {
  const refs = singleTargetField == null
    ? operation.target_refs : [operation[singleTargetField]];
  if (operation.actor_ref !== contracts.zhdanko.instance_id
      || !kinds.includes(operation[kindField])
      || refs.some((ref) => !targetRefs.includes(ref))) {
    fail('TRACE_PHASE_7_DOMAIN_REQUEST_NOT_APPLICABLE');
  }
}

function propertyTransitions(contracts) {
  return [contracts.bagTransition, contracts.bagConcealTransition]
    .filter(Boolean);
}

function transitionTarget(transition) {
  return transition.writes.visibility_state
    ?? transition.writes.zone_ref ?? transition.writes.location_ref;
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

function domainOwner(operation) {
  if (operation === 'request_movement') return '@rus/movement-routes';
  if (operation === 'request_item_use') return '@rus/items-property';
  return '@rus/turn';
}

function sameRefs(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function findBag(state, contracts) {
  const matches = (state.containers ?? []).filter(
    ({ template_id: id }) => id === contracts.roadBag.item_ref);
  if (matches.length !== 1) fail('TRACE_PHASE_7_ROAD_BAG_INSTANCE_MISSING');
  return matches[0];
}

function fail(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
