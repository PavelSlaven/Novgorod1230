import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { event } from './first-playable/plan-traversal-evidence.js';

export function buildLocalTraversalWriteSet({
  partyId,
  ids,
  owner,
  sourceEndpoint,
  targetEndpoint,
  route,
  dependencyPins,
  worldPin,
  planningRequestId,
  planningStateVersion,
  turnNumber,
  changeSetId,
  idempotencyRecordId,
  dynamicSnapshot,
  success = true,
  resultCode = 'local_passage_completed',
  failureResultCode = resultCode,
  staticContract: suppliedStaticContract = null,
  pathQueryDigest = null,
  canonicalSerializationDigest = null,
  outcomeCompositionTraceDigest = null,
  plannedTimeMinutes = route.duration_minutes,
  actualElapsedMinutes = route.duration_minutes
}) {
  const actualProgress = success ? 1_000_000 : 0;
  const finalEndpoint = success ? targetEndpoint : sourceEndpoint;
  const duration = Number(actualElapsedMinutes);
  const staticContract = suppliedStaticContract ?? {
    snapshot_kind: 'timed_traversal',
    route_binding_ref: route.route_binding_ref,
    connection_profile_ref: route.connection_profile_ref,
    cost_kind: route.cost_kind ?? 'exact_time',
    action_units: route.action_units ?? null,
    base_minutes: duration,
    movement_method: route.movement_method,
    load_category: route.load_category,
    risk_profile_ref: route.risk_profile_ref ?? null,
    temporal_boundary_owner: 'movement_route_owner'
  };
  const planningPayload = {
    party_id: partyId,
    planning_request_id: planningRequestId,
    source_endpoint: sourceEndpoint,
    target_endpoint: targetEndpoint,
    static_contract: staticContract,
    dependency_pins: dependencyPins
  };
  return {
    inserts: [
      row('party_route_plans', ids.planId, {
        id: ids.planId,
        party_id: partyId,
        journey_owner_ref: owner,
        journey_scope: 'world_travel',
        request_kind: 'ordinary',
        planning_request_id: planningRequestId,
        path_query_digest: pathQueryDigest ?? canonicalDigest({
          source_endpoint: sourceEndpoint,
          target_endpoint: targetEndpoint
        }),
        option_id: route.route_binding_ref.entity_id,
        knowledge_scope: 'factual',
        source_endpoint_snapshot: sourceEndpoint,
        target_request: targetEndpoint,
        resolved_factual_target_ref: targetEndpoint,
        target_resolution_dependency_pins: dependencyPins,
        world_revision_id: worldPin.world_revision_id,
        catalog_digest: worldPin.world_catalog_digest,
        planning_algorithm_version:
          route.planning_algorithm_version ?? 'exact-local-binding@1',
        planning_state_version: planningStateVersion,
        planning_context_dependency_pins: dependencyPins,
        canonical_serialization_digest:
          canonicalSerializationDigest ?? canonicalDigest(planningPayload),
        status: 'ready',
        lifecycle_state_version: 1,
        created_change_set_id: changeSetId,
        lifecycle_change_set_id: changeSetId,
        created_at_turn: turnNumber
      }),
      row('party_route_plan_steps', `${ids.planId}:0`, {
        route_plan_id: ids.planId,
        ordinal: 0,
        step_kind: 'timed_traversal',
        departure_endpoint_snapshot: sourceEndpoint,
        arrival_endpoint_snapshot: targetEndpoint,
        static_contract_snapshot: staticContract
      }),
      row('party_route_plan_executions', ids.executionId, {
        id: ids.executionId,
        party_id: partyId,
        route_plan_id: ids.planId,
        journey_owner_ref: owner,
        journey_scope: 'world_travel',
        status: success ? 'completed' : 'aborted',
        current_step_ordinal: null,
        current_endpoint_ref: null,
        active_travel_state_id: null,
        final_location_snapshot: finalEndpoint,
        abort_reason_code: success ? null : failureResultCode,
        started_at_turn: turnNumber,
        terminal_at_turn: turnNumber,
        state_version: 3,
        updated_change_set_id: changeSetId
      }),
      row('traveller_travel_states', ids.travelStateId, {
        id: ids.travelStateId,
        party_id: partyId,
        route_plan_execution_id: ids.executionId,
        plan_step_ordinal: 0,
        movement_carrier_ref: owner,
        segment_progress_ppm: actualProgress,
        cumulative_actual_time_numerator: duration,
        cumulative_actual_time_denominator: 1,
        next_interval_ordinal: 1,
        intended_direction_id: route.route_binding_ref.entity_id,
        navigation_state: 'on_course',
        last_confirmed_endpoint_ref: finalEndpoint,
        status: 'closed',
        closed_result: success
          ? 'completed'
          : 'interrupted_to_anchor',
        state_version: 1,
        updated_change_set_id: changeSetId,
        closed_change_set_id: changeSetId
      })
    ],
    updates: [],
    appends: [
      event(ids.executionId, 0, 'planned', null, 'planned',
        sourceEndpoint, changeSetId, idempotencyRecordId, turnNumber),
      event(ids.executionId, 1, 'activated', 'planned', 'active',
        sourceEndpoint, changeSetId, idempotencyRecordId, turnNumber),
      row('party_traversal_interval_results', ids.intervalId, {
        id: ids.intervalId,
        route_plan_execution_id: ids.executionId,
        plan_step_ordinal: 0,
        interval_ordinal: 0,
        progress_before_ppm: 0,
        planned_progress_after_ppm: 1_000_000,
        actual_progress_after_ppm: actualProgress,
        planned_time_numerator: Number(plannedTimeMinutes),
        planned_time_denominator: 1,
        actual_time_numerator: duration,
        actual_time_denominator: 1,
        cumulative_time_before_numerator: 0,
        cumulative_time_before_denominator: 1,
        cumulative_time_after_numerator: duration,
        cumulative_time_after_denominator: 1,
        crossed_whole_minute_boundaries: duration,
        clock_commit_mode: 'direct_party_clock',
        dynamic_snapshot: dynamicSnapshot,
        result_kind: success
          ? 'segment_completed'
          : 'blocked_before_progress',
        result_code: success ? resultCode : failureResultCode,
        hazard_resolution: route.hazard_resolution ?? null,
        outcome_composition_policy_version:
          route.outcome_composition_policy_version,
        outcome_composition_trace_digest:
          outcomeCompositionTraceDigest ?? canonicalDigest({
          interval_id: ids.intervalId,
          result_kind: success
            ? 'segment_completed'
            : 'blocked_before_progress',
          actual_progress: actualProgress,
          actual_elapsed: duration,
          dynamic_snapshot: dynamicSnapshot
          }),
        result_change_set_id: changeSetId,
        idempotency_record_id: idempotencyRecordId,
        occurred_at_turn: turnNumber
      }),
      event(ids.executionId, 2, success ? 'completed' : 'aborted',
        'active', success ? 'completed' : 'aborted', finalEndpoint,
        changeSetId, idempotencyRecordId, turnNumber,
        success ? ids.intervalId : null)
    ],
    deletes: [],
    expected: []
  };
}
