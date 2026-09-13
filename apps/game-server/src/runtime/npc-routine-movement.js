import { buildTraversalRequest, validateTraversalResult } from
  '@rus/movement-routes';

export function routineRoute(runtime, currentPositionNodeId,
  endpointPositions = {}) {
  const phase = runtime.profile.phases[runtime.phase_index];
  const next = runtime.profile.phases[
    (runtime.phase_index + 1) % runtime.profile.phases.length];
  const handoff = runtime.movement_execution == null
    ? next.movement_handoff : phase.movement_handoff;
  if (handoff == null) return null;
  const source = endpointPositions?.[handoff.source_endpoint_ref];
  const destination = endpointPositions?.[handoff.destination_endpoint_ref];
  return { handoff, source_position_node_id: source?.position_id ?? null,
    destination_position_node_id: destination?.position_id ?? null,
    access_ok: source?.status === 'active' && destination?.status === 'active'
      && source.position_id != null && destination.position_id != null
      && currentPositionNodeId === source.position_id };
}
export function validateRoutineMovement(transition, route) {
  if (transition == null) return null;
  if (route == null || route.access_ok !== true) fail('npc_schedule_gap');
  const request = buildTraversalRequest({ id: route.handoff.route_ref,
    from_node_id: route.handoff.source_endpoint_ref,
    to_node_id: route.handoff.destination_endpoint_ref,
    base_time_minutes: route.handoff.duration_minutes }, {}, {
    knowledge_level: 'known' });
  if (!request.availability.available
      || request.time_cost.final_time_minutes !== route.handoff.duration_minutes) {
    fail('npc_schedule_gap');
  }
  if (transition.status === 'completed') {
    const result = { route_id: route.handoff.route_ref, status: 'completed',
      position_node_id: route.handoff.destination_endpoint_ref,
      elapsed_minutes: route.handoff.duration_minutes };
    if (!validateTraversalResult(result, request).ok) fail('npc_schedule_gap');
  }
  return { ...structuredClone(transition),
    source_position_node_id: route.source_position_node_id,
    destination_position_node_id: route.destination_position_node_id };
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
