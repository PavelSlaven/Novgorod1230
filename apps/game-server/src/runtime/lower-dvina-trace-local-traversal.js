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
  executionProfile = null,
  sourceEndpoint,
  destinationEndpoint,
  destinationLocationRef,
  destinationAnchorId,
  accessPolicy,
  capacityContract,
  inventoryLoad,
  participantGroup,
  exactElapsedMinutes = route.duration_minutes,
  clockCommitMode = 'direct_party_clock',
  synchronizedTimeSliceResultId = null,
  interruptionKind = null,
  existingTraversal = null
}) {
  const turnNumber = Number(state.party_state.turn_number) + 1;
  const ids = existingTraversal?.ids ?? {
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
  const executionPin = executionProfile == null ? {
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
  } : {
    dependency_role: 'movement_execution_profile',
    entity_ref: {
      entity_kind: executionProfile.entity_kind,
      entity_id: executionProfile.entity_id
    },
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: String(executionProfile.version),
      state_version: null
    }
  };
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
    }, executionPin]
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
  const started = existingTraversal == null ? engine.startTraversal({
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
  }) : { ok: true,
    travel_state: structuredClone(existingTraversal.final_travel_state) };
  if (!started.ok) fail('TRACE_LOCAL_ROUTE_START_REJECTED');
  if (!Number.isSafeInteger(exactElapsedMinutes)
      || exactElapsedMinutes <= 0
      || !['direct_party_clock', 'shared_root_transport_clock']
        .includes(clockCommitMode)) {
    fail('TRACE_LOCAL_ROUTE_INTERVAL_REJECTED');
  }
  const cumulativeBefore = Number(
    started.travel_state.cumulative_actual_time.numerator)
    / Number(started.travel_state.cumulative_actual_time.denominator);
  const remainingMinutes = Number(route.duration_minutes) - cumulativeBefore;
  if (!Number.isSafeInteger(cumulativeBefore) || remainingMinutes <= 0
      || exactElapsedMinutes > remainingMinutes) {
    fail('TRACE_LOCAL_ROUTE_INTERVAL_REJECTED');
  }
  const stranded = interruptionKind === 'stranded';
  const terminal = !stranded && exactElapsedMinutes === remainingMinutes;
  const progressAfter = terminal ? 1_000_000 : Math.floor(
    ((cumulativeBefore + exactElapsedMinutes) / route.duration_minutes)
      * 1_000_000);
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
    idempotency_key: `${playerInput.idempotency_key}:interval:${
      started.travel_state.next_interval_ordinal}`,
    change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    step_ordinal: 0,
    interval_ordinal: started.travel_state.next_interval_ordinal,
    clock_commit_mode: clockCommitMode,
    ...(clockCommitMode === 'shared_root_transport_clock' ? {
      synchronized_time_slice_result_id: synchronizedTimeSliceResultId
    } : {}),
    world_time_before: structuredClone(state.clock),
    travel_state: started.travel_state,
    progress_before_ppm: started.travel_state.progress_ppm,
    planned_progress_after_ppm: progressAfter,
    actual_progress_after_ppm: progressAfter,
    planned_time: {
      numerator: String(exactElapsedMinutes),
      denominator: '1'
    },
    actual_time: {
      numerator: String(exactElapsedMinutes),
      denominator: '1'
    },
    cumulative_before: structuredClone(
      started.travel_state.cumulative_actual_time),
    dynamic_snapshot: dynamicSnapshot,
    dynamic_dependency_pins: dependencyPins,
    execution_context_snapshot: context,
    delay_occurrence_history: seal({
      id: `${namespace}-route-delay-history:${inputDigest}`,
      committed_occurrence_keys: []
    }),
    source_signals: seal({ dependency_pins: dependencyPins,
      ...(terminal ? {} : stranded ? { stranded: true } : { pause: true }) })
  });
  if (!interval.ok
      || interval.result.result_kind !== (terminal
        ? 'segment_completed' : stranded ? 'stranded' : 'paused_in_transit')
      || interval.result.clock_commit_mode !== clockCommitMode
      || interval.result.actual_time_numerator
        !== String(exactElapsedMinutes)
      || interval.result.actual_time_denominator !== '1'
      || (clockCommitMode === 'shared_root_transport_clock'
        && interval.clock_update !== null)) {
    fail('TRACE_LOCAL_ROUTE_INTERVAL_REJECTED');
  }
  return {
    owner: '@rus/movement-routes',
    duration_minutes: route.duration_minutes,
    interval_duration_minutes: exactElapsedMinutes,
    started_new: existingTraversal == null,
    started_at_turn: existingTraversal?.started_at_turn ?? turnNumber,
    terminal,
    stranded,
    ids: {
      ...ids,
      interval_id: interval.result.id
    },
    dependency_pins: dependencyPins,
    source_endpoint: source,
    target_endpoint: target,
    context_snapshot: context,
    planning_state_version: existingTraversal?.planning_state_version
      ?? state.party_state.state_version,
    inventory_load: structuredClone(inventoryLoad),
    participant_group: [...participantGroup],
    start_travel_state_digest: existingTraversal?.start_travel_state_digest
      ?? started.travel_state.canonical_digest,
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
