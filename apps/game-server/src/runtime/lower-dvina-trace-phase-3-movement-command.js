import {
  buildTraversalRequest,
  validateTraversalResult
} from '@rus/movement-routes';
import {
  getCommittedInventoryLoad
} from './lower-dvina-trace-committed-inventory.js';
import {
  executeTraceLocalTraversal
} from './lower-dvina-trace-local-traversal.js';
import {
  available,
  exactMatcher,
  fail,
  mode,
  packageBase,
  phase3WriteTargets
} from './lower-dvina-trace-phase-3-command-shared.js';
import { tracePhase3PreconditionSatisfied } from
  './lower-dvina-trace-phase-3-admission.js';

export function createTracePhase3MovementCommand({
  contracts,
  inputDigest
}) {
  const { ids, movement, route } = contracts;
  const preconditions = [{
    kind: 'committed_location',
    location_ref: movement.preconditions.location_ref
  }, ...(contracts.routeBodyEffect == null ? [] : [{
    kind: 'approved_route_body_source_state'
  }])];
  return {
    command_id: 'lower_dvina_trace.follow_path_to_fishing_camp',
    option_id: ids.moveOption,
    label: 'Пройти по тропе к рыбацкому стану',
    target_id: ids.campLocation,
    approved_record: contracts.activityPins[0],
    preconditions,
    expected_cost: { kind: 'exact_time', value: 8 },
    known_risks: [],
    reason_visible_to_actor: 'От берега к стану ведёт заметная местная тропа.',
    mode: mode('movement_route', [
      'movement', 'route', 'time_progression'
    ]),
    matches: exactMatcher(ids.moveOption),
    availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      const allowed = preconditions.every((precondition) =>
        tracePhase3PreconditionSatisfied(precondition, state, contracts))
        && Boolean(state.position?.g5_anchor_id);
      return available(allowed, [], allowed ? [] : ['wrong_location']);
    },
    consequence({ retrievedState: state, playerInput }) {
      const inventory = getCommittedInventoryLoad(state);
      if (!inventory.mass.pass || !inventory.hands.pass
          || !inventory.load.pass) {
        fail('TRACE_PHASE_3_INVENTORY_LOAD_INVALID');
      }
      const request = buildTraversalRequest({
        id: route.route_id,
        from_node_id: route.source_endpoint,
        to_node_id: route.destination_endpoint,
        base_time_minutes: route.duration_minutes
      }, {
        id: state.actor_id,
        load_category: inventory.load.load_category
      }, {
        knowledge_level: 'known'
      });
      const traversal = executeTraceLocalTraversal({
        state,
        playerInput,
        inputDigest,
        namespace: 'trace-phase3',
        route: contracts.route,
        activity: contracts.movement,
        sourceEndpoint: contracts.sourceEndpoint,
        destinationEndpoint: contracts.destinationEndpoint,
        destinationLocationRef: contracts.ids.campLocation,
        destinationAnchorId: contracts.campAnchor,
        accessPolicy: contracts.access,
        capacityContract: contracts.capacity,
        inventoryLoad: {
          total_mass_grams: inventory.mass.total_mass_grams,
          hands_used: inventory.hands.hands_used,
          load_category: inventory.load.load_category
        },
        participantGroup: [state.actor_id]
      });
      const result = {
        route_id: route.route_id,
        status: traversal.interval_result.result_kind === 'segment_completed'
          ? 'completed'
          : 'invalid',
        position_node_id: route.destination_endpoint,
        elapsed_minutes:
          Number(traversal.interval_result.actual_time_numerator)
      };
      if (!request.availability.available
          || request.orientation_check_request !== null
          || request.time_cost.final_time_minutes !== route.duration_minutes
          || !validateTraversalResult(result, request).ok) {
        fail('TRACE_PHASE_3_ROUTE_EXECUTION_INVALID');
      }
      return packageBase({
        inputDigest,
        duration: 8,
        kind: 'movement',
        ...(contracts.routeBodyEffect ? {
          body_effect_ref: contracts.routeBodyEffect.effect_profile_id
        } : {}),
        movement: {
          owner: '@rus/movement-routes',
          activity_ref: movement.profile_id,
          route_ref: route.route_id,
          source: {
            location_ref: state.position.location_ref,
            g5_anchor_id: state.position.g5_anchor_id
          },
          destination: {
            location_ref: ids.campLocation,
            g5_anchor_id: contracts.campAnchor,
            zone_ref: 'working_camp'
          },
          result,
          inventory_load: structuredClone(traversal.inventory_load),
          traversal,
          route_history_effects:
            structuredClone(route.route_history_effects)
        }
      });
    },
    writeTargets: phase3WriteTargets
  };
}
