import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';

export function additionalPreparationRoute({ member, spatial, binding, routePlan, step,
  partyId, playerId, changeSetId, idempotencyKey, ordinal }) {
  const route = `route:${partyId}:first-entry:${ordinal}`;
  const execution = `route-execution:${partyId}:first-entry:${ordinal}`;
  const claim = `preparation-claim:${partyId}:first-entry:${ordinal}`;
  const source = { endpoint_kind: 'scene_position',
    endpoint_id: 'trace_ld_v1_ep_camp_ridge_to_drying_shed' };
  const target = { endpoint_kind: 'scene_position',
    endpoint_id: 'trace_ld_v1_ep_drying_shed_ridge_to_camp' };
  if (ordinal !== 1 || binding?.route_ref !== 'trace_ld_v1_route_camp_to_shed'
      || binding.destination?.location_profile_ref !== 'trace_ld_v1_loc_old_drying_shed') {
    throw new Error('LOWER_DVINA_TRACE_FIRST_ENTRY_PREPARATION_INVALID');
  }
  const nextStep = structuredClone(step);
  nextStep.route_plan_id = route;
  nextStep.departure_endpoint_snapshot = { ...nextStep.departure_endpoint_snapshot,
    endpoint_ref: source };
  nextStep.arrival_endpoint_snapshot = { ...nextStep.arrival_endpoint_snapshot,
    endpoint_ref: target, resolved_scene_baseline_id: spatial.target.scene_baseline_id,
    resolved_position_id: spatial.target.position_id };
  nextStep.static_contract_snapshot = withDigest(nextStep.static_contract_snapshot);
  const immutable = { ...structuredClone(routePlan), id: route,
    planning_request_id: binding.route_command_id, option_id: binding.route_ref,
    source_endpoint_snapshot: nextStep.departure_endpoint_snapshot,
    target_request: { target_kind: 'factual_spatial', factual_target_ref: {
      spatial_kind: 'party_g5_site', spatial_id: spatial.target.g5_site_id } },
    resolved_factual_target_ref: { spatial_kind: 'party_g5_site',
      spatial_id: spatial.target.g5_site_id } };
  delete immutable.canonical_serialization_digest;
  const nextRoute = { ...immutable,
    canonical_serialization_digest: canonicalDigest({
      plan: routeImmutable(immutable), steps: [nextStep] }) };
  const nextExecution = { id: execution, party_id: partyId, route_plan_id: route,
    journey_owner_ref: { entity_kind: 'actor', entity_id: playerId },
    journey_scope: 'world_travel', status: 'planned', current_step_ordinal: 0,
    current_endpoint_ref: nextStep.departure_endpoint_snapshot, state_version: 1,
    updated_change_set_id: changeSetId };
  const event = { execution_id: execution, event_ordinal: 0,
    event_kind: 'planned', to_status: 'planned', step_ordinal: 0,
    location_snapshot: { location: { location_kind: 'scene',
      scene_position_id: spatial.source.position_id },
    endpoint_snapshot: nextExecution.current_endpoint_ref }, causal_result_ref: null,
    change_set_id: changeSetId, idempotency_record_id: idempotencyKey,
    occurred_at_turn: 0 };
  const nextClaim = { id: claim, preparation_snapshot_id: member.preparation_snapshot_id,
    preparation_member_ordinal: ordinal, route_plan_execution_id: execution,
    claim_status: 'reserved', state_version: 1, reserved_change_set_id: changeSetId,
    terminal_change_set_id: null };
  return { routePlan: nextRoute, step: nextStep, execution: nextExecution, event, claim: nextClaim,
    spatial_v3: { ...spatial, route_plan_id: route,
      route_plan_digest: nextRoute.canonical_serialization_digest,
      route_plan_execution_id: execution, preparation_claim_id: claim,
      preparation_snapshot_id: member.preparation_snapshot_id,
      preparation_member_digest: member.member_digest,
      preparation_snapshot_digest: routePlan.preparation_snapshot_digest,
      journey_location_id: `journey-location:${partyId}:${playerId}`,
      source: { ...spatial.source, endpoint_ref: source },
      target: { ...spatial.target, endpoint_ref: target } } };
}

function routeImmutable(value) { const copy = structuredClone(value); delete copy.id;
  delete copy.party_id; delete copy.status; delete copy.lifecycle_state_version;
  delete copy.created_change_set_id; delete copy.lifecycle_change_set_id;
  delete copy.created_at_turn; return copy; }
function withDigest(value) { const copy = structuredClone(value);
  delete copy.canonical_digest; return { ...copy,
    canonical_digest: canonicalDigest(copy) }; }
function canonicalDigest(value) {
  return computeSpatialV3CanonicalDigest(value);
}
