import {
  hash, ref
} from '../../../runtime/first-playable/shared.js';
import { expected, row } from './plan-shared.js';
import { event } from './plan-traversal-evidence.js';
import {
  boundaryPhysicalWrites
} from './plan-boundary-physical.js';
import {
  appendBoundaryIntervals
} from './plan-boundary-intervals.js';
import {
  endpointForBoundaryState,
  boundaryStepIdentity
} from './plan-boundary-endpoints.js';

export function boundaryTraversalWrites({
  previousState,
  state,
  changeSet,
  turnNumber,
  command,
  result,
  versions
}) {
  if (!['journey_to_boundary', 'cross_boundary'].includes(command.verb)) {
    return null;
  }
  const partyId = state.party_id;
  const traversal = result.summary.traversal;
  const suffix = hash(command.canonical_digest).slice(0, 24);
  const planId = `route-plan:${partyId}:${suffix}`;
  const executionId = `route-execution:${partyId}:${suffix}`;
  const idemId =
    `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`;
  const boatId = state.boat.id;
  const owner = ref('transport', boatId);
  const worldPin =
    state.exact_pins.pins.find(({ kind }) => kind === 'release');
  const physicalSource =
    endpointForBoundaryState(partyId, previousState.location);
  const physicalTarget =
    endpointForBoundaryState(partyId, state.location);
  const sourceEndpoint = traversal.segments[0].departure_ref;
  const targetEndpoint = traversal.segments.at(-1).arrival_ref;
  const inserts = [
    row('party_route_plans', planId, {
      id: planId,
      party_id: partyId,
      journey_owner_ref: owner,
      journey_scope: 'world_travel',
      request_kind: 'ordinary',
      planning_request_id: command.request_id,
      path_query_digest: hash(JSON.stringify({
        sourceEndpoint,
        targetEndpoint,
        physicalSource,
        physicalTarget,
        steps: traversal.segments.map(boundaryStepIdentity)
      })),
      option_id: command.route_binding_ref.entity_id,
      knowledge_scope: 'factual',
      source_endpoint_snapshot: sourceEndpoint,
      target_request: targetEndpoint,
      resolved_factual_target_ref: targetEndpoint,
      target_resolution_dependency_pins: state.exact_pins,
      world_revision_id: worldPin.world_revision_id,
      catalog_digest: worldPin.world_catalog_digest,
      planning_algorithm_version: 'exact-lower-dvina-chain@1',
      planning_state_version: command.base_state_version,
      planning_context_dependency_pins: state.exact_pins,
      canonical_serialization_digest: hash(JSON.stringify({
        party_id: partyId,
        command_digest: command.canonical_digest,
        source_endpoint: sourceEndpoint,
        target_endpoint: targetEndpoint,
        physical_source: physicalSource,
        physical_target: physicalTarget,
        step_refs: traversal.segments.map(boundaryStepIdentity)
      })),
      status: 'ready',
      lifecycle_state_version: 1,
      created_change_set_id: changeSet,
      lifecycle_change_set_id: changeSet,
      created_at_turn: turnNumber
    })
  ];
  const appends = [];
  let cumulativeElapsed = 0;
  let activeTravelStateId = null;
  let pausedStepOrdinal = null;
  let terminalIntervalId = null;
  traversal.segments.forEach((segment, ordinal) => {
    const departure = segment.departure_ref;
    const arrival = segment.arrival_ref;
    const actualElapsed = segment.actual_exact_elapsed;
    if (segment.step_kind === 'immediate_action') {
      inserts.push(row('party_route_plan_steps', `${planId}:${ordinal}`, {
        route_plan_id: planId,
        ordinal,
        step_kind: 'immediate_action',
        departure_endpoint_snapshot: departure,
        arrival_endpoint_snapshot: arrival,
        static_contract_snapshot: {
          snapshot_kind: 'immediate_action',
          action_kind: 'canonical_g5_connection_handoff',
          connection_binding_ref: segment.binding_ref,
          cost_kind: 'action'
        }
      }));
      const actionId = `action:${partyId}:${suffix}:${ordinal}`;
      appends.push(row('party_action_step_runs', actionId, {
        id: actionId,
        party_id: partyId,
        action_scope: 'route_step',
        execution_id: executionId,
        plan_step_ordinal: ordinal,
        attempt_ordinal: 0,
        action_snapshot: {
          action_kind: 'canonical_g5_connection_handoff',
          connection_binding_ref: segment.binding_ref
        },
        departure_endpoint_snapshot: departure,
        arrival_endpoint_snapshot: arrival,
        execution_context_snapshot: {
          carrier_ref: owner,
          exact_dependency_pins: state.exact_pins
        },
        result_kind: 'completed',
        result_code: 'canonical_g5_connection_completed',
        result_change_set_id: changeSet,
        idempotency_record_id: idemId,
        occurred_at_turn: turnNumber
      }));
      return;
    }
    const staticContract = {
      snapshot_kind: 'timed_traversal',
      route_binding_ref: segment.route_ref
        ?? command.route_binding_ref,
      segment_ref: segment.segment_ref,
      movement_method_ref: ref(
        'movement_method',
        'movement.small_river_craft',
        1
      ),
      base_minutes: segment.base_minutes ?? actualElapsed,
      dynamic_recheck_policy_ref:
        segment.dynamic_recheck_policy_ref
    };
    inserts.push(row('party_route_plan_steps', `${planId}:${ordinal}`, {
      route_plan_id: planId,
      ordinal,
      step_kind: 'timed_traversal',
      departure_endpoint_snapshot: departure,
      arrival_endpoint_snapshot: arrival,
      static_contract_snapshot: staticContract
    }));
    const travelStateId = `travel-state:${partyId}:${suffix}:${ordinal}`;
    const intervals = segment.intervals ?? [{
      elapsed_minutes: actualElapsed,
      planned_minutes: actualElapsed,
      progress_before_ppm: 0,
      planned_progress_after_ppm: 1_000_000,
      actual_progress_after_ppm: 1_000_000,
      result_kind: 'segment_completed',
      result_code: 'lower_dvina_segment_completed',
      condition_snapshot: null,
      check: null,
      consequence: null
    }];
    const terminalInterval = intervals.at(-1);
    const completed =
      terminalInterval.result_kind === 'segment_completed';
    const segmentElapsed = intervals.reduce(
      (total, interval) => total + interval.elapsed_minutes,
      0
    );
    if (!completed) {
      activeTravelStateId = travelStateId;
      pausedStepOrdinal = ordinal;
    }
    inserts.push(row('traveller_travel_states', travelStateId, {
      id: travelStateId,
      party_id: partyId,
      route_plan_execution_id: executionId,
      plan_step_ordinal: ordinal,
      movement_carrier_ref: owner,
      segment_progress_ppm:
        terminalInterval.actual_progress_after_ppm,
      cumulative_actual_time_numerator: segmentElapsed,
      cumulative_actual_time_denominator: 1,
      next_interval_ordinal: intervals.length,
      intended_direction_id:
        segment.segment_ref.entity_id,
      navigation_state: 'on_course',
      last_confirmed_endpoint_ref: completed ? arrival : departure,
      status: completed
        ? 'closed'
        : terminalInterval.result_kind,
      closed_result: completed ? 'completed' : null,
      state_version: 1,
      updated_change_set_id: changeSet,
      closed_change_set_id: completed ? changeSet : null
    }));
    const intervalWrites = appendBoundaryIntervals({
      appends,
      intervals,
      partyId,
      executionId,
      stepOrdinal: ordinal,
      suffix,
      segment,
      command,
      state,
      changeSet,
      idemId,
      turnNumber,
      cumulativeElapsed
    });
    cumulativeElapsed = intervalWrites.cumulativeElapsed;
    terminalIntervalId = intervalWrites.terminalIntervalId;
  });
  const completed = activeTravelStateId == null;
  inserts.push(row('party_route_plan_executions', executionId, {
    id: executionId,
    party_id: partyId,
    route_plan_id: planId,
    journey_owner_ref: owner,
    journey_scope: 'world_travel',
    status: completed ? 'completed' : 'active',
    current_step_ordinal: completed ? null : pausedStepOrdinal,
    current_endpoint_ref: null,
    active_travel_state_id: activeTravelStateId,
    final_location_snapshot: completed ? targetEndpoint : null,
    started_at_turn: turnNumber,
    terminal_at_turn: completed ? turnNumber : null,
    state_version: 3,
    updated_change_set_id: changeSet
  }));
  appends.unshift(
    event(executionId, 0, 'planned', null, 'planned',
      sourceEndpoint, changeSet, idemId, turnNumber),
    event(executionId, 1, 'activated', 'planned', 'active',
      sourceEndpoint, changeSet, idemId, turnNumber)
  );
  appends.push(event(
    executionId,
    2,
    completed ? 'completed' : 'step_paused',
    'active',
    completed ? 'completed' : 'active',
    completed ? targetEndpoint : sourceEndpoint,
    changeSet,
    idemId,
    turnNumber,
    terminalIntervalId,
    completed
      ? traversal.segments.length - 1
      : pausedStepOrdinal
  ));
  const physical = boundaryPhysicalWrites({
    partyId,
    previousState,
    state,
    changeSet,
    versions,
    boatId,
    activeTravelStateId
  });
  return {
    inserts: [...inserts, ...physical.inserts],
    updates: physical.updates,
    appends,
    deletes: physical.deletes,
    expected: physical.expected
  };
}
