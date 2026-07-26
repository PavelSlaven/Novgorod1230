import {
  hash, ref
} from '../../../runtime/first-playable/shared.js';
import { actorRef, expected, row } from './plan-shared.js';
import {
  appendCheck, endpoint, event
} from './plan-traversal-evidence.js';

export function traversalWrites({
  previousState,
  state,
  changeSet,
  turnNumber,
  command,
  result,
  versions
}) {
  if (command.verb !== 'move') return null;
  const partyId = state.party_id;
  const traversal = result.summary.traversal;
  const suffix = hash(command.canonical_digest).slice(0, 24);
  const planId = `route-plan:${partyId}:${suffix}`;
  const executionId = `route-execution:${partyId}:${suffix}`;
  const travelStateId = `travel-state:${partyId}:${suffix}`;
  const intervalId = `traversal-interval:${partyId}:${suffix}`;
  const idemId =
    `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`;
  const fromHigh =
    command.destination_ref.entity_id === 'landing_edge';
  const sourceEndpoint = endpoint(partyId, fromHigh ? 'high' : 'landing');
  const targetEndpoint = endpoint(partyId, fromHigh ? 'landing' : 'high');
  const owner = actorRef(state);
  const staticContract = {
    snapshot_kind: 'timed_traversal',
    route_binding_ref: traversal.route_binding_ref,
    connection_profile_ref: ref(
      'canonical_g5_connection_profile',
      'cprofv3__site_connection__local_passage',
      2
    ),
    cost_kind: 'action',
    action_units: 1,
    base_minutes: null,
    risk_profile_ref: traversal.risk_profile_ref
  };
  const actualProgress = traversal.success ? 1_000_000 : 0;
  const actualElapsed = traversal.elapsed_minutes;
  const target = traversal.success ? targetEndpoint : sourceEndpoint;
  const worldPin =
    state.exact_pins.pins.find(({ kind }) => kind === 'release');
  const dynamicSnapshot = {
    schema: 'local_traversal_dynamic_snapshot.v1',
    risk_profile_ref: traversal.risk_profile_ref,
    roll: traversal.roll,
    exact_dependency_pins: state.exact_pins
  };
  const set = {
    inserts: [
      row('party_route_plans', planId, {
        id: planId,
        party_id: partyId,
        journey_owner_ref: owner,
        journey_scope: 'world_travel',
        request_kind: 'ordinary',
        planning_request_id: command.request_id,
        path_query_digest:
          hash(JSON.stringify({ sourceEndpoint, targetEndpoint })),
        option_id: traversal.route_binding_ref.entity_id,
        knowledge_scope: 'factual',
        source_endpoint_snapshot: sourceEndpoint,
        target_request: targetEndpoint,
        resolved_factual_target_ref: targetEndpoint,
        target_resolution_dependency_pins: state.exact_pins,
        world_revision_id: worldPin.world_revision_id,
        catalog_digest: worldPin.world_catalog_digest,
        planning_algorithm_version: 'exact-local-binding@1',
        planning_state_version: command.base_state_version,
        planning_context_dependency_pins: state.exact_pins,
        canonical_serialization_digest: hash(JSON.stringify({
          party_id: partyId,
          command_digest: command.canonical_digest,
          source_endpoint: sourceEndpoint,
          target_endpoint: targetEndpoint,
          static_contract: staticContract
        })),
        status: 'ready',
        lifecycle_state_version: 1,
        created_change_set_id: changeSet,
        lifecycle_change_set_id: changeSet,
        created_at_turn: turnNumber
      }),
      row('party_route_plan_steps', `${planId}:0`, {
        route_plan_id: planId,
        ordinal: 0,
        step_kind: 'timed_traversal',
        departure_endpoint_snapshot: sourceEndpoint,
        arrival_endpoint_snapshot: targetEndpoint,
        static_contract_snapshot: staticContract
      }),
      row('party_route_plan_executions', executionId, {
        id: executionId,
        party_id: partyId,
        route_plan_id: planId,
        journey_owner_ref: owner,
        journey_scope: 'world_travel',
        status: traversal.success ? 'completed' : 'aborted',
        current_step_ordinal: null,
        current_endpoint_ref: null,
        active_travel_state_id: null,
        final_location_snapshot: target,
        abort_reason_code:
          traversal.success ? null : 'landing_edge_slip',
        started_at_turn: turnNumber,
        terminal_at_turn: turnNumber,
        state_version: 3,
        updated_change_set_id: changeSet
      }),
      row('traveller_travel_states', travelStateId, {
        id: travelStateId,
        party_id: partyId,
        route_plan_execution_id: executionId,
        plan_step_ordinal: 0,
        movement_carrier_ref: owner,
        segment_progress_ppm: actualProgress,
        cumulative_actual_time_numerator: actualElapsed,
        cumulative_actual_time_denominator: 1,
        next_interval_ordinal: 1,
        intended_direction_id: traversal.route_binding_ref.entity_id,
        navigation_state: 'on_course',
        last_confirmed_endpoint_ref: target,
        status: 'closed',
        closed_result: traversal.success
          ? 'completed'
          : 'interrupted_to_anchor',
        state_version: 1,
        updated_change_set_id: changeSet,
        closed_change_set_id: changeSet
      })
    ],
    updates: [],
    appends: [
      event(executionId, 0, 'planned', null, 'planned',
        sourceEndpoint, changeSet, idemId, turnNumber),
      event(executionId, 1, 'activated', 'planned', 'active',
        sourceEndpoint, changeSet, idemId, turnNumber),
      row('party_traversal_interval_results', intervalId, {
        id: intervalId,
        route_plan_execution_id: executionId,
        plan_step_ordinal: 0,
        interval_ordinal: 0,
        progress_before_ppm: 0,
        planned_progress_after_ppm: 1_000_000,
        actual_progress_after_ppm: actualProgress,
        planned_time_numerator: 0,
        planned_time_denominator: 1,
        actual_time_numerator: actualElapsed,
        actual_time_denominator: 1,
        cumulative_time_before_numerator: 0,
        cumulative_time_before_denominator: 1,
        cumulative_time_after_numerator: actualElapsed,
        cumulative_time_after_denominator: 1,
        crossed_whole_minute_boundaries: actualElapsed,
        clock_commit_mode: 'direct_party_clock',
        dynamic_snapshot: dynamicSnapshot,
        result_kind: traversal.success
          ? 'segment_completed'
          : 'blocked_before_progress',
        result_code: traversal.success
          ? 'local_passage_completed'
          : 'landing_edge_slip',
        hazard_resolution: traversal.roll,
        outcome_composition_policy_version:
          traversal.risk_profile_ref?.entity_id
          ?? 'risk.local_cross_link@1',
        outcome_composition_trace_digest:
          hash(JSON.stringify({
            interval_id: intervalId,
            result_kind: traversal.success
              ? 'segment_completed'
              : 'blocked_before_progress',
            actual_progress: actualProgress,
            actual_elapsed: actualElapsed,
            dynamic_snapshot: dynamicSnapshot
          })),
        result_change_set_id: changeSet,
        idempotency_record_id: idemId,
        occurred_at_turn: turnNumber
      }),
      event(
        executionId,
        2,
        traversal.success ? 'completed' : 'aborted',
        'active',
        traversal.success ? 'completed' : 'aborted',
        target,
        changeSet,
        idemId,
        turnNumber,
        traversal.success ? intervalId : null
      )
    ],
    deletes: [],
    expected: []
  };
  if (traversal.roll) appendCheck(set, {
    partyId,
    intervalId,
    traversal,
    changeSet
  });
  if (traversal.success && !state.boat?.boarded) {
    set.updates.push(row(
      'party_journey_locations',
      `location:${partyId}:player`,
      {
        id: `location:${partyId}:player`,
        party_id: partyId,
        owner_kind: 'actor',
        owner_id: state.player.id,
        location_kind: 'scene',
        scene_position_id:
          `position:${partyId}:${fromHigh ? 'landing' : 'high'}`,
        updated_change_set_id: changeSet
      }
    ));
    set.expected.push(expected(
      'party_journey_locations',
      `location:${partyId}:player`,
      versions.actorLocation
    ));
  }
  if (!traversal.success
      && !previousState.player.conditions.includes('wet')) {
    set.inserts.push(row(
      'party_actor_active_conditions',
      `player_character:${state.player.id}:wet`,
      {
        party_id: partyId,
        actor_kind: 'player_character',
        actor_id: state.player.id,
        condition_id: 'wet',
        condition_profile_ref: ref('condition_profile', 'wet', 1),
        status: 'active',
        state_version: 1,
        created_change_set_id: changeSet
      }
    ));
  }
  return set;
}
