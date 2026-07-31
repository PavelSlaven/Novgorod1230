import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import { canonicalDigest } from '@rus/materialization';
import {
  createSpatialV3ExecutionEngine
} from '@rus/turn/spatial-v3-execution';
import { serverError } from '../errors.js';

export function executeTraceLocalTraversal({
  state,
  playerInput,
  inputDigest,
  namespace,
  route,
  activity,
  sourceEndpoint,
  destinationEndpoint,
  destinationLocationRef,
  destinationAnchorId,
  accessPolicy,
  capacityContract,
  inventoryLoad,
  participantGroup
}) {
  const turnNumber = Number(state.party_state.turn_number) + 1;
  const ids = {
    plan_id: `route-plan:${state.party_id}:${namespace}:${turnNumber}`,
    execution_id:
      `route-execution:${state.party_id}:${namespace}:${turnNumber}`,
    travel_state_id:
      `travel-state:${state.party_id}:${namespace}:${turnNumber}`
  };
  const changeSetId =
    `change:${state.party_id}:${namespace}:${turnNumber}`;
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
        entity_id: activity.profile_id
      },
      version_pin: {
        pin_kind: 'authoring_version',
        authoring_version: String(activity.version),
        state_version: null
      }
    }]
  });
  const source = seal({
    endpoint_kind: 'scene_position',
    endpoint_id: sourceEndpoint.endpoint_id,
    location_ref: state.position.location_ref,
    g5_anchor_id: state.position.g5_anchor_id
  });
  const target = seal({
    endpoint_kind: 'scene_position',
    endpoint_id: destinationEndpoint.endpoint_id,
    location_ref: destinationLocationRef,
    g5_anchor_id: destinationAnchorId
  });
  const context = seal({
    context_id: `${namespace}-route:${inputDigest}`,
    route_ref: route.route_id,
    access_policy_ref: accessPolicy.policy_id,
    capacity_contract_ref: capacityContract.contract_id,
    inventory_load: inventoryLoad,
    participant_group: [...participantGroup]
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
    departure_endpoint: source,
    arrival_endpoint: target,
    segment_id: route.route_id,
    method_id: route.movement_method,
    capacity_units: participantGroup.length,
    context_snapshot: context,
    dependency_pins: dependencyPins
  });
  if (!started.ok) fail('TRACE_LOCAL_ROUTE_START_REJECTED');
  const dynamicSnapshot = seal({
    snapshot_id: `${namespace}-route-snapshot:${inputDigest}`,
    resolved_factors: [],
    resolved_delays: [],
    inventory_load: inventoryLoad,
    participant_group: [...participantGroup],
    access_policy_ref: accessPolicy.policy_id,
    capacity_contract_ref: capacityContract.contract_id
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
      id: `${namespace}-route-delay-history:${inputDigest}`,
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
    fail('TRACE_LOCAL_ROUTE_INTERVAL_REJECTED');
  }
  return {
    owner: '@rus/movement-routes',
    duration_minutes: route.duration_minutes,
    ids: {
      ...ids,
      interval_id: interval.result.id
    },
    dependency_pins: dependencyPins,
    source_endpoint: source,
    target_endpoint: target,
    context_snapshot: context,
    planning_state_version: state.party_state.state_version,
    inventory_load: structuredClone(inventoryLoad),
    participant_group: [...participantGroup],
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

function fail(code) {
  throw serverError(
    code,
    'The approved local traversal could not be resolved exactly.',
    { status: 409 }
  );
}
