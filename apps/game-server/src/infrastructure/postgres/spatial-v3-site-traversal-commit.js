import { row, sealedCheck } from './first-playable/plan-shared.js';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { serverError } from '../../errors.js';

export const SITE_TRAVERSAL_OWNER = '@rus/turn/spatial-v3-site-connection-traversal';

export function applySiteTraversalTransition({ snapshot, state, consequence }) {
  const transition = consequence?.position_transition;
  if (transition?.owner !== SITE_TRAVERSAL_OWNER) return false;
  const plan = consequence.spatial_v3_traversal?.plan;
  const result = consequence.spatial_v3_traversal?.result;
  const step = plan?.steps?.[0];
  const originPositionRef = transition?.origin_position_ref ?? transition?.from_position_ref;
  if (transition.actor_id !== state.actor_id || !state.journey_location?.id
    || !validOrderedApproach(transition.ordered_local_edge_path,
      originPositionRef, transition.from_position_ref)
    || state.journey_location.scene_position_id !== originPositionRef
    || state.position?.position_id !== originPositionRef
    || Number(state.journey_location.state_version) !== transition.expected_journey_state_version
    || plan?.party_id !== state.party_id || plan.steps.length !== 1
    || step.step_kind !== 'timed_traversal'
    || step.static_contract_snapshot?.traversal_snapshot?.physical_segment_ref?.segment_ref?.segment_id
      !== transition.connection_id
    || step.departure_endpoint_snapshot?.resolved_position_id !== transition.from_position_ref
    || step.arrival_endpoint_snapshot?.resolved_position_id !== transition.to_position_ref
    || !['segment_completed', 'returned_to_departure', 'interrupted_at_anchor',
      'paused_in_transit', 'progressed', 'stranded', 'blocked_before_progress'].includes(result?.result_kind)
    || result.route_plan_execution_id == null
    || ['segment_completed', 'returned_to_departure'].includes(result?.result_kind)
      && (!validateVisibleContext(consequence.visible_seed?.destination_visible_context).ok
        || ![transition.destination_g4_id, transition.destination_site_id,
          transition.destination_g6_instance_id, transition.to_position_ref].every(text))) fail();
  const endpoint = endpointForResult(result, step, snapshot);
  if (endpoint) {
    const atSource = ['returned_to_departure', 'interrupted_at_anchor'].includes(result.result_kind)
      && endpoint.endpoint.resolved_position_id === transition.from_position_ref;
    const positionId = endpoint.endpoint.resolved_position_id;
    const toSource = atSource || positionId === transition.from_position_ref;
    snapshot.position = toSource
      ? { ...state.position, position_id: transition.from_position_ref,
        site_id: transition.source_site_id, g4_id: transition.source_g4_id,
        g6_instance_id: transition.source_g6_instance_id }
      : { g4_id: transition.destination_g4_id, site_id: transition.destination_site_id,
        g6_instance_id: transition.destination_g6_instance_id, position_id: positionId };
    snapshot.journey_location = { ...state.journey_location,
      location_kind: 'scene', scene_position_id: positionId,
      transit_anchor_id: null, travel_state_id: null,
      g6_instance_id: toSource ? transition.source_g6_instance_id : transition.destination_g6_instance_id,
      state_version: Number(state.journey_location.state_version) + 1 };
  } else {
    snapshot.journey_location = { ...state.journey_location,
      location_kind: 'in_transit', scene_position_id: null, transit_anchor_id: null,
      travel_state_id: consequence.spatial_v3_traversal.final_travel_state.id,
      state_version: Number(state.journey_location.state_version) + 1 };
  }
  return true;
}

function validOrderedApproach(path, originPositionRef, departurePositionRef) {
  if (!Array.isArray(path) || !text(originPositionRef) || !text(departurePositionRef)) return false;
  if (originPositionRef === departurePositionRef) return path.length === 0;
  if (!path.length) return false;
  let current = originPositionRef;
  for (const edge of path) {
    const admission = edge?.movement_admission;
    if (!text(edge?.edge_id) || edge.from_position_id !== current
      || !text(edge.to_position_id) || admission?.edge_id !== edge.edge_id
      || admission.from_position_ref !== edge.from_position_id
      || admission.to_position_ref !== edge.to_position_id
      || admission.cost_kind !== 'action' || !Number.isSafeInteger(admission.action_units)
      || admission.action_units < 1 || admission.base_minutes != null
      || admission.destination_status !== 'open') return false;
    current = edge.to_position_id;
  }
  return current === departurePositionRef;
}

export function siteTraversalWrites({ partyId, envelope, changeSetId, idemId, turnNumber }) {
  const transition = envelope.consequence?.position_transition;
  if (transition?.owner !== SITE_TRAVERSAL_OWNER) return { writes: null, rechecks: [] };
  const traversal = envelope.consequence.spatial_v3_traversal;
  const plan = traversal?.plan;
  const result = traversal?.result;
  const step = plan?.steps?.[0];
  const intervals = traversal?.traversal_intervals;
  const travel = traversal?.final_travel_state;
  const suspendedInTransit = result?.result_kind === 'paused_in_transit'
    || result?.result_kind === 'stranded'
    || travel?.status === 'paused_in_transit'
    || travel?.status === 'stranded_in_transit';
  if (suspendedInTransit && (Number(travel?.progress_ppm) > 0
    || Number(result?.actual_progress_after_ppm) > 0)) fail();
  if (plan?.party_id !== partyId || plan?.created_change_set_id !== changeSetId
    || plan?.created_at_turn !== turnNumber || plan.steps?.length !== 1
    || !Array.isArray(intervals) || !intervals.length || !travel
    || result?.id !== intervals.at(-1)?.result?.id
    || travel.status !== 'closed'
    || intervals.some(({ result: interval }) => interval.result_change_set_id !== changeSetId
      || interval.idempotency_record_id !== idemId || interval.occurred_at_turn !== turnNumber
      || interval.plan_step_ordinal !== 0 || !text(interval.id)
      || interval.route_plan_execution_id == null || !text(interval.travel_state_id))
    || !text(plan.id) || !text(result?.route_plan_execution_id)
    || step?.step_kind !== 'timed_traversal'
    || travel.id !== intervals.at(-1).result.travel_state_id
    || travel.execution_id !== result.route_plan_execution_id
    || travel.next_interval_ordinal !== intervals.at(-1).result.interval_ordinal + 1) fail();
  const executionId = result.route_plan_execution_id;
  const travelStateId = travel.id;
  const terminalEndpoint = endpointForResult(result, step, null);
  const interrupted = result.result_kind === 'interrupted_at_anchor';
  const stranded = result.result_kind === 'stranded';
  const terminal = result.result_kind === 'segment_completed';
  const returned = result.result_kind === 'returned_to_departure';
  const suspended = interrupted && travel.progress_ppm > 0;
  const abortedAtAnchor = interrupted && !suspended;
  if (interrupted && !terminalEndpoint) fail();
  const routeStatus = result.result_kind === 'segment_completed' ? 'completed'
    : abortedAtAnchor ? 'aborted'
      : returned ? 'waiting_at_anchor'
      : suspended ? 'suspended_at_scene'
    : stranded ? 'stranded_in_transit' : 'active';
  const currentEndpoint = returned ? step.departure_endpoint_snapshot
    : interrupted ? endpointById(step, result.interruption_anchor_id)?.endpoint
      ?? step.departure_endpoint_snapshot : null;
  const waitingResult = returned || interrupted && !suspended;
  const event = (ordinal, kind, from, to, location, causal = null) => row(
    'party_route_plan_execution_events', `${executionId}:${ordinal}`, {
      execution_id: executionId, event_ordinal: ordinal, event_kind: kind,
      from_status: from, to_status: to, step_ordinal: 0,
      location_snapshot: location, causal_result_ref: causal,
      change_set_id: changeSetId, idempotency_record_id: idemId,
      occurred_at_turn: turnNumber });
  const origin = step.departure_endpoint_snapshot;
  const arrival = step.arrival_endpoint_snapshot;
  const destination = terminalEndpoint?.endpoint ?? (interrupted ? endpointById(step,
    result.interruption_anchor_id)?.endpoint : null);
  if (interrupted && !destination) fail();
  const travelRecord = travelStateRecord({ partyId, transition, plan, step, travel,
    intervals, changeSetId });
  const intervalWrites = intervals.map(({ result: interval }) => intervalRow(interval));
  const events = [event(0, 'planned', null, 'planned', origin),
    event(1, 'activated', 'planned', 'active', origin)];
  intervals.forEach(({ result: interval }, index) => {
    const ordinal = index + 2;
    const final = index === intervals.length - 1;
    if (final && terminal) events.push(event(ordinal, 'completed', 'active', 'completed', destination,
      { entity_kind: 'party_traversal_interval_result', entity_id: interval.id }));
    else if (final && waitingResult) events.push(event(ordinal, 'wait_started', 'active', 'waiting_at_anchor',
      destination ?? origin, { entity_kind: 'party_traversal_interval_result', entity_id: interval.id }));
    else if (final && suspended) events.push(event(ordinal, 'suspended', 'active', 'suspended_at_scene',
      destination, { entity_kind: 'party_traversal_interval_result', entity_id: interval.id }));
    else if (final && stranded) events.push(event(ordinal, 'stranded', 'active', 'stranded_in_transit',
      origin, { entity_kind: 'party_traversal_interval_result', entity_id: interval.id }));
    else events.push(event(ordinal, interval.result_kind === 'paused_in_transit'
      || interval.result_kind === 'blocked_before_progress' ? 'step_paused' : 'step_progressed',
    'active', 'active', origin, { entity_kind: 'party_traversal_interval_result', entity_id: interval.id }));
  });
  if (abortedAtAnchor) events.push(event(intervals.length + 2, 'aborted',
    'waiting_at_anchor', 'aborted', destination, {
      entity_kind: 'party_traversal_interval_result', entity_id: intervals.at(-1).result.id
    }));
  return { writes: {
    inserts: [row('party_route_plans', plan.id, {
      id: plan.id, party_id: partyId, journey_owner_ref: plan.journey_owner_ref,
      journey_scope: plan.journey_scope, request_kind: plan.request_kind,
      recovery_binding_id: null, administrative_authorization_pins: null,
      planning_request_id: plan.planning_request_id, path_query_digest: plan.path_query_digest,
      option_id: plan.option_id, knowledge_scope: plan.knowledge_scope,
      knowledge_subject_ref: plan.knowledge_subject_ref,
      source_endpoint_snapshot: plan.source_endpoint_snapshot,
      target_request: plan.target_request,
      resolved_factual_target_ref: plan.resolved_factual_target_ref,
      target_resolution_dependency_pins: plan.target_resolution_dependency_pins,
      intended_direction_id: plan.intended_direction_id,
      world_revision_id: plan.world_revision_id, catalog_digest: plan.catalog_digest,
      planning_algorithm_version: plan.planning_algorithm_version,
      planning_state_version: plan.planning_state_version,
      planning_context_dependency_pins: plan.planning_context_dependency_pins,
      preparation_snapshot_id: null, preparation_snapshot_digest: null,
      canonical_serialization_digest: plan.canonical_serialization_digest,
      status: 'ready', lifecycle_state_version: 1,
      created_change_set_id: changeSetId, lifecycle_change_set_id: changeSetId,
      created_at_turn: turnNumber }),
    row('party_route_plan_steps', `${plan.id}:0`, {
      route_plan_id: plan.id, ordinal: 0, step_kind: 'timed_traversal',
      departure_endpoint_snapshot: origin, arrival_endpoint_snapshot: arrival,
      static_contract_snapshot: step.static_contract_snapshot }),
    row('party_route_plan_executions', executionId, {
      id: executionId, party_id: partyId, route_plan_id: plan.id,
      journey_owner_ref: plan.journey_owner_ref, journey_scope: plan.journey_scope,
      status: routeStatus, current_step_ordinal: terminal || abortedAtAnchor ? null : 0,
      current_endpoint_ref: abortedAtAnchor ? null : currentEndpoint,
      active_travel_state_id: terminal || returned || interrupted ? null : travelStateId,
      active_activity_execution_id: null,
      suspension_endpoint_ref: suspended ? currentEndpoint : null,
      final_location_snapshot: terminal || abortedAtAnchor ? destination : null,
      abort_reason_code: abortedAtAnchor ? 'interrupted_at_anchor' : null, supersedes_execution_id: null,
      superseded_by_execution_id: null, started_at_turn: turnNumber,
      terminal_at_turn: terminal || abortedAtAnchor ? turnNumber : null,
      state_version: intervals.length + 2 + Number(abortedAtAnchor),
      updated_change_set_id: changeSetId }),
    row('traveller_travel_states', travelStateId, travelRecord)],
    updates: [],
    appends: [...intervalWrites, ...events],
    deletes: [] }, rechecks: [sealedCheck('site_connection_traversal', {
      party_id: partyId, actor_id: transition.actor_id,
      journey_location_id: envelope.consequence.spatial_v3_traversal
        .expected_state_versions.entries.find((entry) =>
          entry.entity_ref.entity_kind === 'party_journey_location')?.entity_ref.entity_id,
      ...transition })] };
}

function endpointForResult(result, step, snapshot) {
  let endpoint;
  if (result.result_kind === 'segment_completed') endpoint = step.arrival_endpoint_snapshot;
  else if (result.result_kind === 'returned_to_departure') endpoint = step.departure_endpoint_snapshot;
  else if (result.result_kind === 'interrupted_at_anchor') endpoint = endpointById(step,
    result.interruption_anchor_id)?.endpoint;
  if (!endpoint) return null;
  const positionId = endpoint.resolved_position_id;
  const position = snapshot?.scene_positions?.find((row) => row.id === positionId) ?? null;
  return position ? { endpoint, position } : { endpoint, position: null };
}

function endpointById(step, id) {
  if (!text(id)) return null;
  for (const endpoint of [step.departure_endpoint_snapshot, step.arrival_endpoint_snapshot]) {
    const ref = endpoint?.endpoint_ref;
    if (ref?.entity_id === id || ref?.endpoint_id === id || endpoint?.resolved_position_id === id) {
      return { endpoint, position: null };
    }
  }
  return null;
}

function travelStateRecord({ partyId, transition, plan, step, travel,
  changeSetId, intervals }) {
  const last = travel.last_confirmed_endpoint_ref ?? step.departure_endpoint_snapshot.endpoint_ref;
  const lastResult = intervals.at(-1).result;
  const status = travel.status;
  if (!['active', 'paused_in_transit', 'stranded_in_transit', 'closed'].includes(status)) fail();
  const closedResult = status !== 'closed' ? null : travel.closed_result;
  if (status === 'closed' && !['completed', 'interrupted_to_anchor', 'returned_to_departure'].includes(closedResult)) fail();
  return { id: travel.id, party_id: partyId,
    route_plan_execution_id: lastResult.route_plan_execution_id,
    plan_step_ordinal: lastResult.plan_step_ordinal,
    movement_carrier_ref: plan.journey_owner_ref,
    segment_progress_ppm: travel.progress_ppm,
    cumulative_actual_time_numerator: travel.cumulative_actual_time.numerator,
    cumulative_actual_time_denominator: travel.cumulative_actual_time.denominator,
    next_interval_ordinal: travel.next_interval_ordinal,
    intended_direction_id: transition.line_direction_id,
    navigation_state: 'on_course', last_confirmed_endpoint_ref: last,
    last_dynamic_snapshot_digest: lastResult.dynamic_snapshot?.canonical_digest ?? null,
    status, stranded_reason_code: status === 'stranded_in_transit' ? lastResult.result_code : null,
    closed_result: closedResult, state_version: 1,
    updated_change_set_id: changeSetId,
    closed_change_set_id: status === 'closed' ? changeSetId : null,
    mirrored: travel.mirrored === true };
}

function intervalRow(interval) {
  const fraction = (name) => interval[name];
  return row('party_traversal_interval_results', interval.id, {
    id: interval.id, travel_state_id: interval.travel_state_id,
    route_plan_execution_id: interval.route_plan_execution_id,
    plan_step_ordinal: interval.plan_step_ordinal,
    interval_ordinal: interval.interval_ordinal,
    progress_before_ppm: interval.progress_before_ppm,
    planned_progress_after_ppm: interval.planned_progress_after_ppm,
    actual_progress_after_ppm: interval.actual_progress_after_ppm,
    planned_time_numerator: fraction('planned_time_numerator'),
    planned_time_denominator: fraction('planned_time_denominator'),
    actual_time_numerator: fraction('actual_time_numerator'),
    actual_time_denominator: fraction('actual_time_denominator'),
    cumulative_time_before_numerator: fraction('cumulative_time_before_numerator'),
    cumulative_time_before_denominator: fraction('cumulative_time_before_denominator'),
    cumulative_time_after_numerator: fraction('cumulative_time_after_numerator'),
    cumulative_time_after_denominator: fraction('cumulative_time_after_denominator'),
    crossed_whole_minute_boundaries: interval.crossed_whole_minute_boundaries,
    clock_commit_mode: interval.clock_commit_mode,
    synchronized_time_slice_result_id: interval.synchronized_time_slice_result_id,
    dynamic_snapshot: { ...interval.dynamic_snapshot, resolved_factors: interval.resolved_factors,
      resolved_delays: interval.resolved_delays, dynamic_dependency_pins: interval.dynamic_dependency_pins,
      execution_context_snapshot: interval.execution_context_snapshot },
    result_kind: interval.result_kind, result_code: interval.result_code,
    navigation_resolution: interval.navigation_resolution,
    hazard_resolution: interval.hazard_resolution,
    outcome_composition_policy_version: interval.outcome_composition_policy_version,
    outcome_composition_trace_digest: interval.outcome_composition_trace_digest,
    interruption_anchor_id: interval.interruption_anchor_id,
    turn_back: interval.turn_back,
    result_change_set_id: interval.result_change_set_id,
    idempotency_record_id: interval.idempotency_record_id,
    occurred_at_turn: interval.occurred_at_turn });
}

const text = (value) => typeof value === 'string' && value.length > 0;
function fail() { throw serverError('SPATIAL_V3_SITE_TRAVERSAL_COMMIT_INVALID',
  'Site connection traversal failed its sealed turn contract.', { status: 409 }); }
