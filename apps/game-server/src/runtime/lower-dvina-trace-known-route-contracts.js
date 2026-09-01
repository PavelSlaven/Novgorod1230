export function resolveGenericKnownRouteContracts({ state, phase3Contracts,
  factual, fail }) {
  if (factual?.consequence?.generic_known_route !== true) return phase3Contracts;
  const movement = factual.consequence.movement;
  const route = phase3Contracts?.routeBindings?.find(({ route_id: id }) => id === movement?.route_ref);
  const sourceEndpoint = phase3Contracts?.endpoints?.find(({ endpoint_id: id }) => id === route?.source_endpoint);
  const destinationEndpoint = phase3Contracts?.endpoints?.find(({ endpoint_id: id }) => id === route?.destination_endpoint);
  const scene = (state.prepared_scenes ?? []).find(({ location_profile_ref: id }) => id === movement?.destination?.location_ref)
    ?? (state.first_entry_preparation?.spatial_v3?.target?.status === 'prepared' && state.first_entry_preparation.scene?.location_profile_ref === movement?.destination?.location_ref ? state.first_entry_preparation.scene : null);
  const access = phase3Contracts?.accessPolicies?.find(({ policy_id: id }) => id === scene?.anchor?.state?.access_policy_ref);
  const capacity = phase3Contracts?.capacityContracts?.find(({ contract_id: id }) => id === scene?.anchor?.state?.capacity_contract_ref);
  const routePin = phase3Contracts?.routePins?.find(({ id }) => id === route?.route_id);
  const destinationProfile = phase3Contracts?.locationProfiles?.find(({ location_profile_id: id }) => id === movement?.destination?.location_ref);
  const bounds = capacity?.admission_model?.entry_group_bounds;
  const zone = capacity?.zones?.find(({ zone_id: id }) => id === movement?.destination?.zone_ref);
  const targetPositionId = state.first_entry_preparation?.spatial_v3?.target?.status === 'prepared' && state.first_entry_preparation.scene?.location_profile_ref === movement?.destination?.location_ref ? state.first_entry_preparation.spatial_v3.target.position_id ?? null : null;
  const targetPosition = state.first_entry_preparation?.spatial_v3?.target?.base_static_template?.position;
  const actors = destinationRouteActors(state, scene);
  if (!route || !routePin || !sourceEndpoint || !destinationEndpoint || !scene?.anchor?.instance_id || !access || !capacity || !(state.route_knowledge ?? []).includes(route.route_id) || sourceEndpoint.location_profile_id !== state.position?.location_ref || destinationEndpoint.location_profile_id !== movement.destination.location_ref || route.terminal_position_outcome !== movement.destination.location_ref || movement.source?.location_ref !== state.position?.location_ref || movement.destination?.g5_anchor_id !== scene.anchor.instance_id || movement.destination?.zone_ref !== scene.anchor.state?.zone_ref || movement.destination?.display_name !== destinationProfile?.display_name || movement.destination?.scene_position_id !== targetPositionId || movement.destination?.scene_capacity !== (targetPositionId == null ? null : targetPosition?.capacity ?? null) || movement.destination?.scene_access_class !== (targetPositionId == null ? null : targetPosition?.access_class_id ?? null) || movement.reverse_route_ref !== route.reverse_route_ref || access.policy_id !== scene.anchor.state?.access_policy_ref || capacity.contract_id !== scene.anchor.state?.capacity_contract_ref || route.participant_limits?.min > 1 || route.participant_limits?.max < 1 || bounds?.min > 1 || bounds?.max < 1 || zone?.max_actors < actors.length + 1 || !capacity.admission_model?.allowed_participant_slots?.includes('player_clerk') || actors.some((actor) => !capacity.admission_model.allowed_participant_slots?.includes(actor.ref))) fail('TRACE_KNOWN_ROUTE_COMMIT_ADMISSION_INVALID');
  return Object.freeze({ ...phase3Contracts, route, movement: { profile_id: route.route_id, duration_minutes: route.duration_minutes }, routeBodyEffect: null, sourceEndpoint, destinationEndpoint, access, capacity, ids: { ...phase3Contracts.ids, campLocation: movement.destination.location_ref }, campAnchor: scene.anchor.instance_id, destinationZone: scene.anchor.state.zone_ref, actors, activityPins: [...phase3Contracts.activityPins.filter(({ id }) => id !== route.route_id), routePin] });
}

export function destinationRouteActors(state, scene) {
  const anchorId = scene?.anchor?.instance_id, locationRef = scene?.location_profile_ref;
  if (!anchorId || !locationRef) return [];
  return [...(state.npcs ?? []), ...(state.first_entry_preparation?.npcs ?? [])].filter((npc) => npc?.instance_id && npc.anchor_id === anchorId && typeof npc.participant_slot_ref === 'string').map((npc) => ({ ref: npc.participant_slot_ref, ...structuredClone(npc) }));
}
