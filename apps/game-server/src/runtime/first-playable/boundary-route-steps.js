export function journeySegment(
  routeId,
  segmentId,
  actualExactElapsed,
  departureG5,
  arrivalG5
) {
  return {
    step_kind: 'timed_traversal',
    route_ref: {
      entity_kind: 'world_route',
      entity_id: routeId,
      version: 3
    },
    ...boundarySegment(
      segmentId,
      actualExactElapsed,
      canonicalG5(departureG5, 3),
      canonicalG5(arrivalG5, 3)
    )
  };
}

export function boundarySegment(
  id,
  actualExactElapsed,
  departureRef,
  arrivalRef
) {
  return {
    step_kind: 'timed_traversal',
    segment_ref: {
      entity_kind: 'world_route_segment',
      entity_id: id,
      version: 1
    },
    base_minutes: actualExactElapsed,
    actual_progress_fraction: 1,
    actual_exact_elapsed: actualExactElapsed,
    departure_ref: departureRef,
    arrival_ref: arrivalRef,
    dynamic_recheck_policy_ref: {
      entity_kind: 'dynamic_recheck_policy',
      entity_id: 'recheck.water_15m',
      version: 3
    },
    result_kind: 'segment_completed'
  };
}

export function journeyBinding(id, departureRef, arrivalRef) {
  return {
    step_kind: 'immediate_action',
    binding_ref: {
      entity_kind: 'canonical_g5_connection_binding',
      entity_id: id,
      version: 3
    },
    departure_ref: departureRef,
    arrival_ref: arrivalRef,
    actual_exact_elapsed: 0,
    actual_progress_fraction: 1,
    result_kind: 'completed'
  };
}

export function canonicalG5(id, version) {
  return {
    endpoint_kind: 'canonical_g5',
    endpoint_id: id,
    authoring_version: version
  };
}

export function boundaryAnchor() {
  return {
    endpoint_kind: 'boundary_anchor',
    endpoint_id: BOUNDARY_ANCHOR_ID
  };
}

export const BOUNDARY_ANCHOR_ID = 'BND_G1_001_R2_SOUTH_DVINA';
