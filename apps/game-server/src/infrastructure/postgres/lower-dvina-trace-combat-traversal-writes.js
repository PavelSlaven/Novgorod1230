import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { event } from './first-playable/plan-traversal-evidence.js';

export function appendCombatTraversalWrites({ inserts, updates, appends,
  partyId, state, factual, turnNumber, changeSetId, idemId }) {
  for (const position of factual.consequence.combat.position_transitions) {
    const movement = position?.movement_result;
    const traversal = movement?.traversal;
    if (movement?.movement_kind !== 'route_traversal') continue;
    validateTraversal(movement, traversal);
    appendTraversal({ inserts, updates, appends, partyId, state, factual,
      turnNumber, changeSetId, idemId, movement, traversal });
  }
}

function appendTraversal({ inserts, updates, appends, partyId, state, factual,
  turnNumber, changeSetId, idemId, movement, traversal }) {
  const { ids, interval_result: interval, final_travel_state: travel } =
    traversal;
  const route = traversal.route_binding;
  const first = traversal.started_new === true;
  const terminal = traversal.terminal === true;
  const stranded = traversal.stranded === true;
  if (first) {
    const staticContract = staticTraversalContract(route, traversal);
    const planningPayload = { party_id: partyId,
      planning_request_id: factual.player_input.request_id,
      source_endpoint: traversal.source_endpoint,
      target_endpoint: traversal.target_endpoint,
      static_contract: staticContract,
      dependency_pins: traversal.dependency_pins };
    inserts.push(row('party_route_plans', ids.plan_id, {
      id: ids.plan_id, party_id: partyId,
      journey_owner_ref: traversal.actor_ref,
      journey_scope: 'world_travel', request_kind: 'ordinary',
      planning_request_id: factual.player_input.request_id,
      path_query_digest: canonicalDigest({
        source_endpoint: traversal.source_endpoint,
        target_endpoint: traversal.target_endpoint }),
      option_id: route.route_id, knowledge_scope: 'factual',
      source_endpoint_snapshot: traversal.source_endpoint,
      target_request: traversal.target_endpoint,
      resolved_factual_target_ref: traversal.target_endpoint,
      target_resolution_dependency_pins: traversal.dependency_pins,
      world_revision_id: state.world_identity.world_revision_id,
      catalog_digest: state.world_identity.world_catalog_digest,
      planning_algorithm_version: 'exact-local-binding@1',
      planning_state_version: traversal.planning_state_version,
      planning_context_dependency_pins: traversal.dependency_pins,
      canonical_serialization_digest: canonicalDigest(planningPayload),
      status: 'ready', lifecycle_state_version: 1,
      created_change_set_id: changeSetId,
      lifecycle_change_set_id: changeSetId, created_at_turn: turnNumber
    }), row('party_route_plan_steps', `${ids.plan_id}:0`, {
      route_plan_id: ids.plan_id, ordinal: 0, step_kind: 'timed_traversal',
      departure_endpoint_snapshot: traversal.source_endpoint,
      arrival_endpoint_snapshot: traversal.target_endpoint,
      static_contract_snapshot: staticContract
    }));
    appends.push(event(ids.execution_id, 0, 'planned', null, 'planned',
      traversal.source_endpoint, changeSetId, idemId, turnNumber));
    appends.push(event(ids.execution_id, 1, 'activated', 'planned', 'active',
      traversal.source_endpoint, changeSetId, idemId, turnNumber));
  }
  appends.push(intervalRow(interval));
  appends.push(event(ids.execution_id, 2 + interval.interval_ordinal,
    terminal ? 'completed' : stranded ? 'stranded' : 'step_paused', 'active',
    terminal ? 'completed' : stranded ? 'stranded_in_transit' : 'active', terminal
      ? traversal.target_endpoint : traversal.source_endpoint,
    changeSetId, idemId, turnNumber, interval.id));
  const target = first ? inserts : updates;
  target.push(row('party_route_plan_executions', ids.execution_id, {
    id: ids.execution_id, party_id: partyId, route_plan_id: ids.plan_id,
    journey_owner_ref: traversal.actor_ref, journey_scope: 'world_travel',
    status: terminal ? 'completed'
      : stranded ? 'stranded_in_transit' : 'active',
    current_step_ordinal: terminal ? null : 0,
    current_endpoint_ref: null,
    active_travel_state_id: terminal ? null : ids.travel_state_id,
    active_activity_execution_id: null, suspension_endpoint_ref: null,
    final_location_snapshot: terminal ? traversal.target_endpoint : null,
    abort_reason_code: null,
    started_at_turn: first ? turnNumber
      : activeTraversal(state, ids.execution_id)?.started_at_turn,
    terminal_at_turn: terminal ? turnNumber : null,
    state_version: 3 + interval.interval_ordinal,
    updated_change_set_id: changeSetId
  }), row('traveller_travel_states', ids.travel_state_id, {
    id: ids.travel_state_id, party_id: partyId,
    route_plan_execution_id: ids.execution_id, plan_step_ordinal: 0,
    movement_carrier_ref: traversal.actor_ref,
    segment_progress_ppm: travel.progress_ppm,
    cumulative_actual_time_numerator:
      Number(travel.cumulative_actual_time.numerator),
    cumulative_actual_time_denominator:
      Number(travel.cumulative_actual_time.denominator),
    next_interval_ordinal: travel.next_interval_ordinal,
    intended_direction_id: route.route_id, navigation_state: 'on_course',
    last_confirmed_endpoint_ref: terminal
      ? traversal.target_endpoint : traversal.source_endpoint,
    last_dynamic_snapshot_digest: interval.dynamic_snapshot.canonical_digest,
    status: terminal ? 'closed'
      : stranded ? 'stranded_in_transit' : 'paused_in_transit',
    stranded_reason_code: stranded ? 'combat_actor_incapacitated' : null,
    closed_result: terminal ? 'completed' : null,
    state_version: interval.interval_ordinal + 1,
    updated_change_set_id: changeSetId,
    closed_change_set_id: terminal ? changeSetId : null
  }));
}

function staticTraversalContract(route, traversal) {
  return { snapshot_kind: 'timed_traversal', route_binding_ref: {
    entity_kind: 'movement_route_binding', entity_id: route.route_id,
    version: route.version }, connection_profile_ref: null,
  cost_kind: 'exact_time', action_units: null,
  base_minutes: route.duration_minutes, movement_method: route.movement_method,
  load_category: traversal.inventory_load.load_category,
  risk_profile_ref: null, temporal_boundary_owner: 'movement_route_owner' };
}

function intervalRow(interval) {
  return row('party_traversal_interval_results', interval.id, {
    id: interval.id,
    route_plan_execution_id: interval.route_plan_execution_id,
    plan_step_ordinal: interval.plan_step_ordinal,
    interval_ordinal: interval.interval_ordinal,
    progress_before_ppm: interval.progress_before_ppm,
    planned_progress_after_ppm: interval.planned_progress_after_ppm,
    actual_progress_after_ppm: interval.actual_progress_after_ppm,
    planned_time_numerator: Number(interval.planned_time_numerator),
    planned_time_denominator: Number(interval.planned_time_denominator),
    actual_time_numerator: Number(interval.actual_time_numerator),
    actual_time_denominator: Number(interval.actual_time_denominator),
    cumulative_time_before_numerator:
      Number(interval.cumulative_time_before_numerator),
    cumulative_time_before_denominator:
      Number(interval.cumulative_time_before_denominator),
    cumulative_time_after_numerator:
      Number(interval.cumulative_time_after_numerator),
    cumulative_time_after_denominator:
      Number(interval.cumulative_time_after_denominator),
    crossed_whole_minute_boundaries:
      Number(interval.crossed_whole_minute_boundaries),
    clock_commit_mode: interval.clock_commit_mode,
    synchronized_time_slice_result_id:
      interval.synchronized_time_slice_result_id,
    dynamic_snapshot: interval.dynamic_snapshot,
    result_kind: interval.result_kind, result_code: interval.result_code,
    navigation_resolution: interval.navigation_resolution,
    hazard_resolution: interval.hazard_resolution,
    outcome_composition_policy_version:
      interval.outcome_composition_policy_version,
    outcome_composition_trace_digest:
      interval.outcome_composition_trace_digest,
    interruption_anchor_id: interval.interruption_anchor_id,
    result_change_set_id: interval.result_change_set_id,
    idempotency_record_id: interval.idempotency_record_id,
    occurred_at_turn: interval.occurred_at_turn
  });
}

function validateTraversal(movement, traversal) {
  const route = traversal?.route_binding;
  const result = traversal?.interval_result;
  const terminal = traversal?.terminal === true;
  const stranded = traversal?.stranded === true;
  if (movement.execution_mode !== 'requires_traversal_runtime_completion'
      || traversal?.owner !== '@rus/movement-routes'
      || traversal.actor_ref?.entity_id !== movement.actor_ref.entity_id
      || route?.route_id !== movement.movement_ref
      || result?.result_kind !== (terminal
        ? 'segment_completed' : stranded ? 'stranded' : 'paused_in_transit')
      || result.clock_commit_mode !== 'shared_root_transport_clock'
      || typeof result.synchronized_time_slice_result_id !== 'string'
      || (terminal
        ? traversal.final_travel_state?.closed_result !== 'completed'
        : traversal.final_travel_state?.status !== (stranded
          ? 'stranded_in_transit' : 'paused_in_transit'))
      || result.actual_time_numerator
        !== traversal.interval_duration_minutes.toString()
      || result.actual_time_denominator !== '1') {
    throw new Error('TRACE_COMBAT_TRAVERSAL_PROOF_INVALID');
  }
}

function activeTraversal(state, executionId) {
  return (state.active_combat_traversals ?? []).find(
    ({ traversal }) => traversal?.ids?.execution_id === executionId)
    ?.traversal ?? null;
}
