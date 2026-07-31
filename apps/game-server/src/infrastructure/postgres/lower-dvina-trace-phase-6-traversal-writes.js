import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { row } from './first-playable/plan-shared.js';
import { event } from './first-playable/plan-traversal-evidence.js';
import { phase2ScreenDigest, phase2VisibleContextFromPayload } from
  './lower-dvina-trace-phase-2-projection.js';

export function appendTraversal({ inserts, updates, appends, partyId, state,
  factual, traversal, intent, first, terminal, turnNumber, changeSetId,
  idemId }) {
  const ids = traversal.ids;
  const interval = traversal.interval_result;
  if (first) {
    const staticContract = {
      snapshot_kind: 'timed_traversal',
      route_binding_ref: {
        entity_kind: 'movement_route_binding',
        entity_id: intent.route_ref
      },
      cost_kind: 'exact_time',
      base_minutes: 20,
      movement_method: 'stretcher_carry',
      load_category: 'committed_carrier_snapshots',
      temporal_boundary_owner: 'movement_route_owner'
    };
    const planningPayload = {
      party_id: partyId,
      planning_request_id: factual.player_input.request_id,
      source_endpoint: traversal.source_endpoint,
      target_endpoint: traversal.target_endpoint,
      static_contract: staticContract,
      dependency_pins: traversal.dependency_pins
    };
    inserts.push(row('party_route_plans', ids.plan_id, {
      id: ids.plan_id,
      party_id: partyId,
      journey_owner_ref: { entity_kind: 'actor', entity_id: state.actor_id },
      journey_scope: 'world_travel',
      request_kind: 'ordinary',
      planning_request_id: factual.player_input.request_id,
      path_query_digest: canonicalDigest({
        source_endpoint: traversal.source_endpoint,
        target_endpoint: traversal.target_endpoint
      }),
      option_id: intent.route_ref,
      knowledge_scope: 'factual',
      source_endpoint_snapshot: traversal.source_endpoint,
      target_request: traversal.target_endpoint,
      resolved_factual_target_ref: traversal.target_endpoint,
      target_resolution_dependency_pins: traversal.dependency_pins,
      world_revision_id: state.world_identity.world_revision_id,
      catalog_digest: state.world_identity.world_catalog_digest,
      planning_algorithm_version: 'exact-local-binding@1',
      planning_state_version: state.party_state.state_version,
      planning_context_dependency_pins: traversal.dependency_pins,
      canonical_serialization_digest: canonicalDigest(planningPayload),
      status: 'ready',
      lifecycle_state_version: 1,
      created_change_set_id: changeSetId,
      lifecycle_change_set_id: changeSetId,
      created_at_turn: turnNumber
    }), row('party_route_plan_steps', `${ids.plan_id}:0`, {
      route_plan_id: ids.plan_id,
      ordinal: 0,
      step_kind: 'timed_traversal',
      departure_endpoint_snapshot: traversal.source_endpoint,
      arrival_endpoint_snapshot: traversal.target_endpoint,
      static_contract_snapshot: staticContract
    }));
    appends.push(event(ids.execution_id, 0, 'planned', null, 'planned',
      traversal.source_endpoint, changeSetId, idemId, turnNumber));
    appends.push(event(ids.execution_id, 1, 'activated', 'planned', 'active',
      traversal.source_endpoint, changeSetId, idemId, turnNumber));
  }
  const eventOrdinal = 2 + intent.attempt.ordinal;
  appends.push(intervalRow(interval));
  appends.push(event(ids.execution_id, eventOrdinal,
    terminal ? 'completed' : 'step_paused', 'active',
    terminal ? 'completed' : 'active',
    terminal ? traversal.target_endpoint : traversal.source_endpoint,
    changeSetId, idemId, turnNumber, interval.id));
  const routeExecution = routeExecutionRecord({ partyId, state, traversal,
    intent, terminal, turnNumber, changeSetId, first });
  const travelState = travelStateRecord({ partyId, state, traversal, intent,
    terminal, changeSetId, first });
  (first ? inserts : updates).push(
    row('party_route_plan_executions', ids.execution_id, routeExecution),
    row('traveller_travel_states', ids.travel_state_id, travelState)
  );
}

function routeExecutionRecord({ partyId, state, traversal, intent, terminal,
  turnNumber, changeSetId, first }) {
  return {
    id: traversal.ids.execution_id,
    party_id: partyId,
    route_plan_id: traversal.ids.plan_id,
    journey_owner_ref: { entity_kind: 'actor', entity_id: state.actor_id },
    journey_scope: 'world_travel',
    status: terminal ? 'completed' : 'active',
    current_step_ordinal: terminal ? null : 0,
    current_endpoint_ref: null,
    active_travel_state_id: terminal ? null : traversal.ids.travel_state_id,
    active_activity_execution_id: null,
    suspension_endpoint_ref: null,
    final_location_snapshot:
      terminal ? traversal.target_endpoint : null,
    abort_reason_code: null,
    started_at_turn: first ? turnNumber
      : state.phase6_carry_execution.started_at_turn,
    terminal_at_turn: terminal ? turnNumber : null,
    state_version: 3 + intent.attempt.ordinal,
    updated_change_set_id: changeSetId
  };
}

function travelStateRecord({ partyId, state, traversal, intent, terminal,
  changeSetId, first }) {
  const resolved = traversal.final_travel_state;
  return {
    id: traversal.ids.travel_state_id,
    party_id: partyId,
    route_plan_execution_id: traversal.ids.execution_id,
    plan_step_ordinal: 0,
    movement_carrier_ref: { entity_kind: 'actor', entity_id: state.actor_id },
    segment_progress_ppm: resolved.progress_ppm,
    cumulative_actual_time_numerator:
      Number(resolved.cumulative_actual_time.numerator),
    cumulative_actual_time_denominator:
      Number(resolved.cumulative_actual_time.denominator),
    next_interval_ordinal: resolved.next_interval_ordinal,
    intended_direction_id: intent.route_ref,
    navigation_state: 'on_course',
    last_confirmed_endpoint_ref: terminal
      ? traversal.target_endpoint : traversal.source_endpoint,
    last_dynamic_snapshot_digest:
      traversal.interval_result.dynamic_snapshot.canonical_digest,
    status: terminal ? 'closed' : 'paused_in_transit',
    stranded_reason_code: null,
    closed_result: terminal ? 'completed' : null,
    state_version: first ? 1 : intent.attempt.ordinal + 1,
    updated_change_set_id: changeSetId,
    closed_change_set_id: terminal ? changeSetId : null
  };
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
    dynamic_snapshot: interval.dynamic_snapshot,
    result_kind: interval.result_kind,
    result_code: interval.result_code,
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
