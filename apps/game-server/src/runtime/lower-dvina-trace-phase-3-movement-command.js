import {
  buildTraversalRequest,
  validateTraversalResult
} from '@rus/movement-routes';
import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  createSpatialV3ExecutionEngine
} from '@rus/turn/spatial-v3-execution';
import {
  getCommittedInventoryLoad
} from './lower-dvina-trace-committed-inventory.js';
import {
  available,
  exactMatcher,
  fail,
  mode,
  packageBase,
  phase3WriteTargets
} from './lower-dvina-trace-phase-3-command-shared.js';

export function createTracePhase3MovementCommand({
  contracts,
  inputDigest
}) {
  const { ids, movement, route } = contracts;
  return {
    command_id: 'lower_dvina_trace.follow_path_to_fishing_camp',
    option_id: ids.moveOption,
    label: 'Пройти по тропе к рыбацкому стану',
    target_id: ids.campLocation,
    approved_record: contracts.activityPins[0],
    preconditions: [{
      kind: 'committed_location',
      location_ref: movement.preconditions.location_ref
    }],
    expected_cost: { kind: 'exact_time', value: 8 },
    known_risks: [],
    reason_visible_to_actor: 'От берега к стану ведёт заметная местная тропа.',
    mode: mode('movement_route', [
      'movement', 'route', 'time_progression'
    ]),
    matches: exactMatcher(ids.moveOption),
    availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      const allowed = state.position?.location_ref
        === movement.preconditions.location_ref
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
      const traversal = executeApprovedTraversal({
        state,
        playerInput,
        contracts,
        inputDigest,
        inventoryLoad: {
          total_mass_grams: inventory.mass.total_mass_grams,
          hands_used: inventory.hands.hands_used,
          load_category: inventory.load.load_category
        }
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

function executeApprovedTraversal({
  state,
  playerInput,
  contracts,
  inputDigest,
  inventoryLoad
}) {
  const route = contracts.route;
  const turnNumber = state.party_state.turn_number + 1;
  const ids = {
    plan_id: `route-plan:${state.party_id}:trace-phase3:${turnNumber}`,
    execution_id:
      `route-execution:${state.party_id}:trace-phase3:${turnNumber}`,
    travel_state_id:
      `travel-state:${state.party_id}:trace-phase3:${turnNumber}`
  };
  const changeSetId =
    `change:${state.party_id}:trace-phase3:${turnNumber}`;
  const idemId = `idem:${state.party_id}:${canonicalDigest(
    playerInput.idempotency_key
  ).slice(0, 20)}`;
  const dependencyPins = seal({
    pins: [{
      dependency_role: 'route_binding',
      entity_ref: {
        entity_kind: 'movement_route_binding',
        entity_id: route.route_id
      },
      version_pin: {
        pin_kind: 'authoring_version',
        authoring_version: String(route.version),
        state_version: null
      }
    }, {
      dependency_role: 'activity_profile',
      entity_ref: {
        entity_kind: 'activity_profile',
        entity_id: contracts.movement.profile_id
      },
      version_pin: {
        pin_kind: 'authoring_version',
        authoring_version: String(contracts.movement.version),
        state_version: null
      }
    }]
  });
  const sourceEndpoint = seal({
    endpoint_kind: 'scene_position',
    endpoint_id: contracts.sourceEndpoint.endpoint_id,
    location_ref: state.position.location_ref,
    g5_anchor_id: state.position.g5_anchor_id
  });
  const targetEndpoint = seal({
    endpoint_kind: 'scene_position',
    endpoint_id: contracts.destinationEndpoint.endpoint_id,
    location_ref: contracts.ids.campLocation,
    g5_anchor_id: contracts.campAnchor
  });
  const context = seal({
    context_id: `trace-phase3-route:${inputDigest}`,
    route_ref: route.route_id,
    access_policy_ref: contracts.access.policy_id,
    capacity_contract_ref: contracts.capacity.contract_id,
    inventory_load: inventoryLoad
  });
  const engine = createSpatialV3ExecutionEngine();
  const started = engine.startTraversal({
    departure_valid: true,
    travel_state_id: ids.travel_state_id,
    execution_id: ids.execution_id,
    party_id: state.party_id,
    idempotency_key: playerInput.idempotency_key,
    idempotency_record_id: idemId,
    change_set_id: changeSetId,
    occurred_at_turn: turnNumber,
    step_ordinal: 0,
    departure_endpoint: sourceEndpoint,
    arrival_endpoint: targetEndpoint,
    segment_id: route.route_id,
    method_id: route.movement_method,
    capacity_units: 1,
    context_snapshot: context,
    dependency_pins: dependencyPins
  });
  if (!started.ok) fail('TRACE_PHASE_3_ROUTE_START_REJECTED');
  const dynamicSnapshot = seal({
    snapshot_id: `trace-phase3-route-snapshot:${inputDigest}`,
    resolved_factors: [],
    resolved_delays: [],
    inventory_load: inventoryLoad,
    access_policy_ref: contracts.access.policy_id,
    capacity_contract_ref: contracts.capacity.contract_id
  });
  const interval = engine.resolveTraversalInterval({
    party_id: state.party_id,
    execution_id: ids.execution_id,
    idempotency_key: `${playerInput.idempotency_key}:interval:0`,
    change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    step_ordinal: 0,
    interval_ordinal: 0,
    clock_commit_mode: 'direct_party_clock',
    world_time_before: structuredClone(state.clock),
    travel_state: started.travel_state,
    progress_before_ppm: 0,
    planned_progress_after_ppm: 1_000_000,
    actual_progress_after_ppm: 1_000_000,
    planned_time: {
      numerator: String(route.duration_minutes),
      denominator: '1'
    },
    actual_time: {
      numerator: String(route.duration_minutes),
      denominator: '1'
    },
    cumulative_before: { numerator: '0', denominator: '1' },
    dynamic_snapshot: dynamicSnapshot,
    dynamic_dependency_pins: dependencyPins,
    execution_context_snapshot: context,
    delay_occurrence_history: seal({
      id: `trace-phase3-route-delay-history:${inputDigest}`,
      committed_occurrence_keys: []
    }),
    source_signals: seal({ dependency_pins: dependencyPins })
  });
  if (!interval.ok
      || interval.result.result_kind !== 'segment_completed'
      || interval.result.clock_commit_mode !== 'direct_party_clock'
      || interval.result.actual_time_numerator
        !== String(route.duration_minutes)
      || interval.result.actual_time_denominator !== '1') {
    fail('TRACE_PHASE_3_ROUTE_INTERVAL_REJECTED');
  }
  return {
    ids: {
      ...ids,
      interval_id: interval.result.id
    },
    dependency_pins: dependencyPins,
    source_endpoint: sourceEndpoint,
    target_endpoint: targetEndpoint,
    context_snapshot: context,
    planning_state_version: state.party_state.state_version,
    inventory_load: structuredClone(inventoryLoad),
    start_travel_state_digest: started.travel_state.canonical_digest,
    interval_result: structuredClone(interval.result),
    final_travel_state: structuredClone(interval.travel_state),
    clock_before: structuredClone(state.clock),
    clock_update: structuredClone(interval.clock_update)
  };
}

function seal(payload) {
  return {
    ...payload,
    canonical_digest: computeSpatialV3CanonicalDigest(payload)
  };
}
