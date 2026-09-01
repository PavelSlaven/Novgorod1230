import { planApprovedActorDestinationTransition, buildTraversalRequest,
  validateTraversalResult } from '@rus/movement-routes';
import { getCommittedInventoryLoad } from
  './lower-dvina-trace-committed-inventory.js';
import { executeTraceLocalTraversal } from
  './lower-dvina-trace-local-traversal.js';
import { destinationRouteActors } from
  './lower-dvina-trace-known-route-contracts.js';
import { available, mode, packageBase, phase3WriteTargets } from
  './lower-dvina-trace-phase-3-command-shared.js';

const COMMAND_ID = 'lower_dvina_trace.follow_admitted_known_route';

// This is an adapter over the route owner, not authored scenario vocabulary.
export function createTraceKnownRouteCommands({ state, contracts, inputDigest,
  authoredCommands = [] }) {
  return routeCandidates({ state, contracts }).map((candidate) => ({
    command_id: `${COMMAND_ID}:${candidate.route.route_id}`,
    option_id: `known_route:${candidate.route.route_id}`,
    label: `Пройти известным путём к ${candidate.destination.display_name}`,
    target_id: candidate.destination.location_ref,
    approved_record: null,
    preconditions: [{ kind: 'approved_known_route' }],
    expected_cost: { kind: 'exact_time', value: candidate.route.duration_minutes },
    known_risks: [],
    reason_visible_to_actor: `Этот путь уже известен и ведёт к ${candidate.destination.display_name}.`,
    mode: mode('movement_route', ['movement', 'route', 'time_progression']),
    matches: () => false,
    semantic_binding: {
      binding_id: `known_route:${candidate.route.route_id}`,
      operation: 'request_movement',
      operation_dto: movementOperation(state, candidate),
      matches: ({ operation }) => operation?.op === 'request_movement'
        && operation.actor_ref === state.actor_id
        && operation.target_ref === candidate.destination.location_ref
        && operation.route_ref === candidate.route.route_id
        && operation.movement_kind === 'route'
    },
    async availability({ committed_state: current, retrievedState }) {
      const currentState = current ?? retrievedState;
      const resolved = routeCandidates({ state: currentState, contracts })
        .find(({ route }) => route.route_id === candidate.route.route_id);
      if (resolved == null || await authoredRouteApplies({ authoredCommands,
        targetRef: candidate.destination.location_ref, state: currentState })) {
        return available(false, [], ['known_route_not_currently_admitted']);
      }
      return available(true, [], []);
    },
    consequence({ retrievedState: current, playerInput }) {
      const resolved = routeCandidates({ state: current, contracts })
        .find(({ route }) => route.route_id === candidate.route.route_id);
      if (resolved == null) fail('TRACE_KNOWN_ROUTE_NOT_ADMITTED');
      const inventory = getCommittedInventoryLoad(current);
      if (!inventory.mass.pass || !inventory.hands.pass || !inventory.load.pass) {
        fail('TRACE_KNOWN_ROUTE_INVENTORY_INVALID');
      }
      const request = buildTraversalRequest({ id: resolved.route.route_id,
        from_node_id: resolved.route.source_endpoint,
        to_node_id: resolved.route.destination_endpoint,
        base_time_minutes: resolved.route.duration_minutes }, {
        id: current.actor_id, load_category: inventory.load.load_category
      }, { knowledge_level: 'known' });
      const traversal = executeTraceLocalTraversal({ state: current, playerInput,
        inputDigest, namespace: 'trace-phase3', route: resolved.route,
        executionProfile: { entity_kind: 'movement_route_binding',
          entity_id: resolved.route.route_id, version: resolved.route.version },
        sourceEndpoint: resolved.sourceEndpoint,
        destinationEndpoint: resolved.destinationEndpoint,
        destinationLocationRef: resolved.destination.location_ref,
        destinationAnchorId: resolved.destination.anchor_id,
        accessPolicy: resolved.access, capacityContract: resolved.capacity,
        inventoryLoad: { total_mass_grams: inventory.mass.total_mass_grams,
          hands_used: inventory.hands.hands_used,
          load_category: inventory.load.load_category },
        participantGroup: [current.actor_id] });
      const result = { route_id: resolved.route.route_id,
        status: traversal.interval_result.result_kind === 'segment_completed'
          ? 'completed' : 'invalid',
        position_node_id: resolved.route.destination_endpoint,
        elapsed_minutes: Number(traversal.interval_result.actual_time_numerator) };
      if (!request.availability.available || request.orientation_check_request !== null
          || !validateTraversalResult(result, request).ok) {
        fail('TRACE_KNOWN_ROUTE_EXECUTION_INVALID');
      }
      return packageBase({ inputDigest, duration: resolved.route.duration_minutes,
        kind: 'movement', generic_known_route: true, movement: {
          owner: '@rus/movement-routes', activity_ref: resolved.route.route_id,
          route_ref: resolved.route.route_id,
          source: { location_ref: current.position.location_ref,
            g5_anchor_id: current.position.g5_anchor_id },
          destination: structuredClone(resolved.destination), result,
          traversal, inventory_load: structuredClone(traversal.inventory_load),
          reverse_route_ref: resolved.route.reverse_route_ref,
          route_history_effects: structuredClone(resolved.route.route_history_effects) } });
    },
    writeTargets: phase3WriteTargets
  }));
}

export function routeCandidates({ state, contracts }) {
  const actor = { actor_ref: { entity_kind: 'player_character', entity_id: state?.actor_id },
    location_ref: state?.position?.location_ref, zone_ref: state?.position?.zone_ref ?? 'working' };
  if (!actor.actor_ref.entity_id || !actor.location_ref || !actor.zone_ref) return [];
  const scenes = admittedScenes(state, contracts);
  const known = state.route_knowledge ?? [];
  return scenes.flatMap((destination) => {
    const access = contracts.accessPolicies?.find(({ location_ref: ref }) =>
      ref === destination.location_ref);
    const capacity = contracts.capacityContracts?.find(({ location_ref: ref }) =>
      ref === destination.location_ref);
    const actors = destinationRouteActors(state, {
      location_profile_ref: destination.location_ref,
      anchor: { instance_id: destination.anchor_id }
    });
    return contracts.routeBindings.flatMap((route) => {
      const reverse = contracts.routeBindings.find(({ route_id: id }) =>
        id === route.reverse_route_ref);
      const routeResult = planApprovedActorDestinationTransition({
        state_version: state.party_state?.state_version,
        expected_state_version: state.party_state?.state_version,
        actor, destination, route_bindings: reverse == null ? [] : [route, reverse],
        known_route_refs: known, allowed_movement_refs: [route.route_id] });
      const sourceEndpoint = contracts.endpoints?.find(({ endpoint_id: id }) =>
        id === route.source_endpoint);
      const destinationEndpoint = contracts.endpoints?.find(({ endpoint_id: id }) =>
        id === route.destination_endpoint);
      const routePin = contracts.routePins?.find(({ id }) => id === route.route_id);
      return routeResult.pass && admitted({ actor, destination, access, capacity, route,
        sourceEndpoint, destinationEndpoint, actors }) && routePin ? [{ route, destination,
        sourceEndpoint, destinationEndpoint, access, capacity, routePin }] : [];
    });
  });
}

function admittedScenes(state, contracts) {
  const prepared = [...(state.prepared_scenes ?? [])];
  const first = state.first_entry_preparation;
  if (first?.spatial_v3?.target?.status === 'prepared' && first.scene != null
      && !prepared.some(({ location_profile_ref: ref }) =>
        ref === first.scene.location_profile_ref)) prepared.push(first.scene);
  return prepared.map((scene) => ({ location_ref: scene.location_profile_ref,
    anchor_id: scene.anchor?.instance_id, g5_anchor_id: scene.anchor?.instance_id,
    zone_ref: scene.anchor?.state?.zone_ref, access_policy_ref:
      scene.anchor?.state?.access_policy_ref, capacity_contract_ref:
      scene.anchor?.state?.capacity_contract_ref, entity_ref: {
      entity_kind: 'location', entity_id: scene.location_profile_ref },
    scene_position_id: state.first_entry_preparation?.spatial_v3?.target?.status
        === 'prepared'
      && state.first_entry_preparation.scene?.location_profile_ref
        === scene.location_profile_ref
      ? state.first_entry_preparation.spatial_v3.target.position_id ?? null : null,
    scene_capacity: state.first_entry_preparation?.spatial_v3?.target?.status
        === 'prepared'
      && state.first_entry_preparation.scene?.location_profile_ref
        === scene.location_profile_ref
      ? state.first_entry_preparation.spatial_v3.target.base_static_template?.position
        ?.capacity ?? null : null,
    scene_access_class: state.first_entry_preparation?.spatial_v3?.target?.status
        === 'prepared'
      && state.first_entry_preparation.scene?.location_profile_ref
        === scene.location_profile_ref
      ? state.first_entry_preparation.spatial_v3.target.base_static_template?.position
        ?.access_class_id ?? null : null,
    display_name: null }))
    .map((scene) => ({ ...scene, display_name: contracts.locationProfiles?.find(
      ({ location_profile_id: id }) => id === scene.location_ref)?.display_name }))
    .filter(({ location_ref, anchor_id, zone_ref, display_name }) =>
      location_ref && anchor_id && zone_ref && display_name);
}

function admitted({ actor, destination, access, capacity, route, sourceEndpoint,
  destinationEndpoint, actors }) {
  const bounds = capacity?.admission_model?.entry_group_bounds;
  const zone = capacity?.zones?.find(({ zone_id: id }) => id === destination.zone_ref);
  return access?.policy_id === destination.access_policy_ref
    && capacity?.contract_id === destination.capacity_contract_ref
    && sourceEndpoint?.location_profile_id === actor.location_ref
    && destinationEndpoint?.location_profile_id === destination.location_ref
    && route.terminal_position_outcome === destination.location_ref
    && route.participant_limits?.min <= 1 && route.participant_limits?.max >= 1
    && bounds?.min <= 1 && bounds?.max >= 1
    && capacity.admission_model?.allowed_participant_slots?.includes('player_clerk')
    && zone?.max_actors >= actors.length + 1
    && actors.every(({ ref }) => capacity.admission_model
      ?.allowed_participant_slots?.includes(ref));
}

function movementOperation(state, candidate) {
  return { op: 'request_movement', actor_ref: state.actor_id,
    target_ref: candidate.destination.location_ref, movement_kind: 'route',
    route_ref: candidate.route.route_id,
    description: `Известный путь к ${candidate.destination.display_name}.` };
}

async function authoredRouteApplies({ authoredCommands, targetRef, state }) {
  for (const command of authoredCommands) {
    if (command.semantic_binding?.operation !== 'request_movement'
        || command.semantic_binding.operation_dto?.target_ref !== targetRef) continue;
    if ((await command.availability?.({ committed_state: state,
      retrievedState: state, action_set_evaluation: true }))?.can_attempt === true) return true;
  }
  return false;
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
