const BOUNDARY_ANCHOR = 'BND_G1_001_R2_SOUTH_DVINA';

export function endpointForBoundaryState(partyId, location) {
  if (location === 'landing_edge') {
    return {
      endpoint_kind: 'scene_position',
      endpoint_id: `position:${partyId}:landing`
    };
  }
  if (location === 'yp026_boundary_anchor') {
    return {
      endpoint_kind: 'transit_anchor',
      endpoint_id: `anchor:${partyId}:lower-dvina-boundary`,
      boundary_id: BOUNDARY_ANCHOR
    };
  }
  const suffix = location === 'yp025_navigation_corridor'
    ? 'yp025-navigation'
    : 'yp026-south-entry';
  return {
    endpoint_kind: 'scene_position',
    endpoint_id: `position:${partyId}:${suffix}:arrival`
  };
}

export function boundaryStepIdentity(step) {
  return step.segment_ref ?? step.binding_ref;
}
