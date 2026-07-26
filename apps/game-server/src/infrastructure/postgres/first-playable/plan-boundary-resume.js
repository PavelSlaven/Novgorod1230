import { hash } from '../../../runtime/first-playable/shared.js';
import { expected, row } from './plan-shared.js';
import { event } from './plan-traversal-evidence.js';
import {
  appendBoundaryIntervals
} from './plan-boundary-intervals.js';
import {
  boundaryPhysicalWrites
} from './plan-boundary-physical.js';

export function boundaryResumeWrites({
  partyId,
  previousState,
  state,
  changeSet,
  turnNumber,
  command,
  result,
  versions
}) {
  if (command.verb !== 'resume_boundary_traversal') return null;
  const paused = previousState.boundary_paused_execution;
  const traversal = result.summary.traversal;
  const segment = traversal.segments[0];
  const suffix = paused.travel_state_id.split(':').at(-2);
  const idemId =
    `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`;
  const appends = [];
  const intervalWrites = appendBoundaryIntervals({
    appends,
    intervals: segment.intervals,
    partyId,
    executionId: paused.execution_id,
    stepOrdinal: paused.step_ordinal,
    suffix,
    segment,
    command,
    state,
    changeSet,
    idemId,
    turnNumber,
    cumulativeElapsed: paused.cumulative_segment_elapsed,
    startingIntervalOrdinal: paused.next_interval_ordinal
  });
  appends.push(event(
    paused.execution_id,
    paused.next_event_ordinal,
    'completed',
    'active',
    'completed',
    segment.arrival_ref,
    changeSet,
    idemId,
    turnNumber,
    intervalWrites.terminalIntervalId,
    paused.step_ordinal
  ));
  const updates = [
    row('traveller_travel_states', paused.travel_state_id, {
      id: paused.travel_state_id,
      party_id: partyId,
      route_plan_execution_id: paused.execution_id,
      plan_step_ordinal: paused.step_ordinal,
      segment_progress_ppm: 1_000_000,
      cumulative_actual_time_numerator:
        intervalWrites.cumulativeElapsed,
      cumulative_actual_time_denominator: 1,
      next_interval_ordinal:
        paused.next_interval_ordinal + segment.intervals.length,
      last_confirmed_endpoint_ref: segment.arrival_ref,
      status: 'closed',
      closed_result: 'completed',
      updated_change_set_id: changeSet,
      closed_change_set_id: changeSet
    }),
    row('party_route_plan_executions', paused.execution_id, {
      id: paused.execution_id,
      party_id: partyId,
      status: 'completed',
      current_step_ordinal: null,
      current_endpoint_ref: null,
      active_travel_state_id: null,
      active_activity_execution_id: null,
      final_location_snapshot: segment.arrival_ref,
      terminal_at_turn: turnNumber,
      updated_change_set_id: changeSet
    })
  ];
  const physical = boundaryPhysicalWrites({
    partyId,
    previousState,
    state,
    changeSet,
    versions,
    boatId: state.boat.id,
    activeTravelStateId: null
  });
  return {
    inserts: physical.inserts,
    updates: [...updates, ...physical.updates],
    appends,
    deletes: physical.deletes,
    expected: [
      expected(
        'party_route_plan_executions',
        paused.execution_id,
        versions.boundaryExecution
      ),
      expected(
        'traveller_travel_states',
        paused.travel_state_id,
        versions.boundaryTravelState
      ),
      ...physical.expected
    ]
  };
}
