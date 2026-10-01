import { isDeepStrictEqual } from 'node:util';
import { validateConsequencePackage } from '@rus/turn';
import { serverError } from '../errors.js';
import { actorMovementBlocked, available, mode } from
  './lower-dvina-trace-phase-3-command-shared.js';

export async function createTraceExpansionCommands({ state, requestId,
  inputDigest, spatialExpansionRuntime, spatialLocalSceneRuntime }) {
  if (spatialExpansionRuntime == null) return [];
  if (typeof spatialExpansionRuntime.listExpansionOptions !== 'function'
      || typeof spatialExpansionRuntime.listApproachOptions !== 'function') {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_UNAVAILABLE');
  }
  const identity = { partyId: state.party_id, actorId: state.actor_id };
  const candidates = await spatialExpansionRuntime.listExpansionOptions(identity);
  if (!Array.isArray(candidates)
      || candidates.some((candidate) => !text(candidate?.directional_exit_id)
        || !text(candidate.display_label))
      || new Set(candidates.map(({ directional_exit_id: id }) => id)).size
        !== candidates.length) {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
  }
  // F3: the first step of an approach is only ever an edge the local-scene owner itself
  // lists now (visible, eligible, admitted); its status and grounding travel with it.
  const localOptions = typeof spatialLocalSceneRuntime?.listLocalOptions === 'function'
    ? await spatialLocalSceneRuntime.listLocalOptions({ ...identity, state }) : [];
  if (!Array.isArray(localOptions)) fail('SPATIAL_V3_LOCAL_OPTIONS_INVALID');
  const localByEdge = new Map(localOptions.map((row) => [row?.edge_id, row]));
  const firstStepEdgeIds = [...localByEdge.keys()];
  const exitApproaches = await spatialExpansionRuntime.listApproachOptions({ ...identity, firstStepEdgeIds });
  // Canonical connections (intra-G4 passages) are optional for the runtime and follow the same rules.
  const connections = typeof spatialExpansionRuntime.listConnectionOptions === 'function'
    ? await spatialExpansionRuntime.listConnectionOptions(identity) : [];
  const connectionApproaches = typeof spatialExpansionRuntime.listConnectionApproachOptions === 'function'
    ? await spatialExpansionRuntime.listConnectionApproachOptions({ ...identity, firstStepEdgeIds }) : [];
  const approachValid = (rows, idKey, requirePath = false) => Array.isArray(rows)
    && rows.every((row) => text(row?.[idKey]) && text(row?.edge_id) && text(row?.display_label)
      && (!requirePath || Array.isArray(row.ordered_local_edge_path)
        && row.ordered_local_edge_path.length > 0
        && row.ordered_local_edge_path[0]?.edge_id === row.edge_id
        && row.ordered_local_edge_path.every((edge) => text(edge?.edge_id)
          && text(edge?.from_position_id) && text(edge?.to_position_id)))
      && ['open', 'occupied'].includes(localByEdge.get(row.edge_id)?.destination_status));
  if (!approachValid(exitApproaches, 'directional_exit_id', true)
      || !approachValid(connectionApproaches, 'connection_binding_id', true)
      || !Array.isArray(connections)
      || connections.some((row) => !text(row?.connection_binding_id) || !text(row.display_label))
      || new Set(connections.map((row) => row.connection_binding_id)).size !== connections.length) {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
  }
  const selectedExits = [
    ...candidates.map(({ directional_exit_id, display_label }) => ({ directional_exit_id,
      display_label, ordered_local_edge_path: [] })),
    ...exitApproaches.map(({ directional_exit_id, display_label, ordered_local_edge_path }) => ({
      directional_exit_id, display_label, ordered_local_edge_path }))];
  if (new Set(selectedExits.map((row) => row.directional_exit_id)).size !== selectedExits.length) {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
  }
  const selectedConnections = [
    ...connections.map((row) => ({ ...row, ordered_local_edge_path: [] })),
    ...connectionApproaches
  ];
  if (new Set(selectedConnections.map((row) => row.connection_binding_id)).size
    !== selectedConnections.length) fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
  const sourcePosition = structuredClone(state.position);
  const sourceVersion = state.party_state?.state_version;
  const currentSource = (current) => current?.party_id === identity.partyId
    && current.actor_id === identity.actorId
    && current.party_state?.state_version === sourceVersion
    && isDeepStrictEqual(current.position, sourcePosition);
  /** One crossing command: the route operation, its stale/blocked availability, and the two-stage
   * consequence (topology first, then the shared site traversal). `owner` names the runtime entry
   * points of the kind of passage: an exit of the G4 or a canonical connection inside it. */
  const crossingCommand = ({ routeId, label, commandKey, optionKey, selectedKey, prepare, traverse,
    ownerMissing, orderedLocalEdgePath = [] }) => {
    const operation = { op: 'request_movement', actor_ref: identity.actorId,
      target_ref: routeId, movement_kind: 'route', route_ref: routeId,
      description: label };
    return {
      command_id: `live_world.${commandKey}:${routeId}`,
      option_id: `${optionKey}:${routeId}`,
      label,
      target_id: routeId,
      approved_record: null,
      preconditions: [],
      expected_cost: { kind: 'owner_resolved' },
      known_risks: [],
      reason_visible_to_actor: label,
      mode: mode('movement_route', ['movement', 'route', 'time_progression']),
      matches: () => false,
      semantic_binding: {
        binding_id: `${optionKey}:${routeId}`,
        operation: 'request_movement',
        operation_dto: operation,
        matches: ({ operation: selected }) => selected != null
          && isDeepStrictEqual({ ...selected, description: label }, operation)
      },
      availability({ committed_state: current, retrievedState }) {
        const state = current ?? retrievedState;
        const sourceReady = currentSource(state);
        const blocked = sourceReady && actorMovementBlocked(state);
        return available(sourceReady && !blocked, [], !sourceReady
          ? ['directional_exit_stale'] : blocked ? ['actor_movement_blocked'] : []);
      },
      async consequence({ retrievedState: current, playerInput }) {
        if (!currentSource(current)) fail('LIVE_WORLD_EXPANSION_SOURCE_STALE');
        if (typeof traverse !== 'function') fail('LIVE_WORLD_TRAVERSAL_OWNER_MISSING');
        if (typeof prepare !== 'function') fail(ownerMissing);
        let orderedPath = orderedLocalEdgePath;
        if (commandKey === 'follow_directional_exit' && orderedPath.length === 0) {
          const currentLocalOptions = typeof spatialLocalSceneRuntime?.listLocalOptions === 'function'
            ? await spatialLocalSceneRuntime.listLocalOptions({ ...identity, state: current }) : [];
          if (!Array.isArray(currentLocalOptions)) fail('SPATIAL_V3_LOCAL_OPTIONS_INVALID');
          const currentApproaches = await runtime.listApproachOptions({ ...identity,
            firstStepEdgeIds: currentLocalOptions.map((row) => row?.edge_id) });
          if (!Array.isArray(currentApproaches)) fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
          const currentApproach = currentApproaches.find((row) => row.directional_exit_id === routeId);
          if (currentApproach) {
            if (currentApproach.display_label !== label || !Array.isArray(currentApproach.ordered_local_edge_path)
              || currentApproach.ordered_local_edge_path.length === 0
              || currentApproach.ordered_local_edge_path[0]?.edge_id !== currentApproach.edge_id
              || !currentApproach.ordered_local_edge_path.every((edge) => text(edge?.edge_id)
                && text(edge?.from_position_id) && text(edge?.to_position_id))) {
              fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
            }
            orderedPath = currentApproach.ordered_local_edge_path;
          }
        }
        const selected = { ...identity, [selectedKey]: routeId, requestId,
          ...(orderedPath.length ? { ordered_local_edge_path: orderedPath } : {}) };
        if (orderedPath.length
          && typeof spatialLocalSceneRuntime.prepareLocalLineApproach !== 'function') {
          fail('SPATIAL_V3_LOCAL_LINE_APPROACH_OWNER_MISSING');
        }
        const localEdgePathProofs = orderedPath.length
          ? await spatialLocalSceneRuntime.prepareLocalLineApproach({
            ...identity, state: current, orderedLocalEdgePath: orderedPath }) : [];
        const expansion = await prepare({ ...selected,
          ...(localEdgePathProofs.length ? { local_edge_path_proofs: localEdgePathProofs } : {}) });
        if (expansion?.ok !== true) {
          fail('LIVE_WORLD_EXPANSION_PREPARATION_FAILED', expansion?.error ?? null);
        }
        try {
          const consequence = await traverse({
            ...selected, state: current, playerInput, inputDigest, expansion,
            local_edge_path_proofs: localEdgePathProofs });
          if (!validateConsequencePackage(consequence).ok) {
            fail('LIVE_WORLD_TRAVERSAL_PREPARATION_FAILED');
          }
          return consequence;
        } catch (cause) {
          throw Object.assign(serverError(
            'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED',
            'Подготовка пути сохранена. Переход не состоялся: персонаж остался на месте, время не изменилось.',
            { status: 409, details: {
              topology_status: 'topology_committed',
              movement_status: 'movement_denied',
              actor_moved: false, time_advanced: false,
              reason_code: cause?.code ?? 'LIVE_WORLD_TRAVERSAL_PREPARATION_FAILED'
            } }), { cause });
        }
      },
      writeTargets: () => []
    };
  };
  const runtime = spatialExpansionRuntime;
  return [...selectedExits.map(({ directional_exit_id: exitId, display_label: label,
    ordered_local_edge_path: orderedLocalEdgePath }) => crossingCommand({
      routeId: exitId, label, commandKey: 'follow_directional_exit', optionKey: 'directional_exit',
      selectedKey: 'directionalExitId', ownerMissing: 'LIVE_WORLD_EXPANSION_OWNER_MISSING',
      prepare: runtime.prepareExpansion?.bind(runtime), traverse: runtime.prepareTraversal?.bind(runtime),
      orderedLocalEdgePath })),
    ...selectedConnections.map(({ connection_binding_id: bindingId, display_label: label,
      ordered_local_edge_path: orderedLocalEdgePath }) => crossingCommand({
      routeId: bindingId, label, commandKey: 'follow_canonical_connection', optionKey: 'canonical_connection',
      selectedKey: 'connectionBindingId', ownerMissing: 'LIVE_WORLD_EXPANSION_OWNER_MISSING',
      prepare: runtime.prepareConnection?.bind(runtime), traverse: runtime.prepareConnectionTraversal?.bind(runtime),
      orderedLocalEdgePath }))];
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function fail(code, details = null) {
  throw serverError(code, 'The approved directional exit cannot be traversed.',
    { status: 409, ...(details ? { details } : {}) });
}
