import { isDeepStrictEqual } from 'node:util';
import { validateConsequencePackage } from '@rus/turn';
import { serverError } from '../errors.js';
import { actorMovementBlocked, available, mode } from
  './lower-dvina-trace-phase-3-command-shared.js';

export async function createTraceExpansionCommands({ state, requestId,
  inputDigest, spatialExpansionRuntime, spatialLocalSceneRuntime }) {
  if (spatialExpansionRuntime == null) return [];
  if (typeof spatialExpansionRuntime.listExpansionOptions !== 'function') {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_UNAVAILABLE');
  }
  const identity = { partyId: state.party_id, actorId: state.actor_id };
  // The first hidden route edge must be among the local movement owner's current admissions.
  const localOptions = typeof spatialLocalSceneRuntime?.listLocalOptions === 'function'
    ? await spatialLocalSceneRuntime.listLocalOptions({ ...identity, state }) : [];
  if (!Array.isArray(localOptions)) fail('SPATIAL_V3_LOCAL_OPTIONS_INVALID');
  const localByEdge = new Map(localOptions.map((row) => [row?.edge_id, row]));
  const firstStepEdgeIds = [...localByEdge.keys()];
  const candidates = await spatialExpansionRuntime.listExpansionOptions({ ...identity,
    state, firstStepEdgeIds });
  if (!Array.isArray(candidates)
      || candidates.some((candidate) => !text(candidate?.directional_exit_id)
        || !text(candidate.display_label))
      || new Set(candidates.map(({ directional_exit_id: id }) => id)).size
        !== candidates.length) {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
  }
  // Canonical G5 connections use the same hidden local-route resolution as G4 exits.
  const connections = typeof spatialExpansionRuntime.listConnectionOptions === 'function'
    ? await spatialExpansionRuntime.listConnectionOptions({ ...identity, state, firstStepEdgeIds }) : [];
  if (!Array.isArray(connections)
      || connections.some((row) => !text(row?.connection_binding_id) || !text(row.display_label))
      || new Set(connections.map((row) => row.connection_binding_id)).size !== connections.length) {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
  }
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
    ownerMissing }) => {
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
        const selected = { ...identity, [selectedKey]: routeId, requestId };
        const expansion = await prepare({ ...selected, state: current, firstStepEdgeIds });
        if (expansion?.ok !== true) {
          fail('LIVE_WORLD_EXPANSION_PREPARATION_FAILED', expansion?.error ?? null);
        }
        try {
          const consequence = await traverse({
            ...selected, state: current, playerInput, inputDigest, expansion, firstStepEdgeIds });
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
  return [...candidates.map(({ directional_exit_id: exitId, display_label: label }) => crossingCommand({
      routeId: exitId, label, commandKey: 'follow_directional_exit', optionKey: 'directional_exit',
      selectedKey: 'directionalExitId', ownerMissing: 'LIVE_WORLD_EXPANSION_OWNER_MISSING',
      prepare: runtime.prepareExpansion?.bind(runtime), traverse: runtime.prepareTraversal?.bind(runtime) })),
    ...connections.map(({ connection_binding_id: bindingId, display_label: label }) => crossingCommand({
      routeId: bindingId, label, commandKey: 'follow_canonical_connection', optionKey: 'canonical_connection',
      selectedKey: 'connectionBindingId', ownerMissing: 'LIVE_WORLD_EXPANSION_OWNER_MISSING',
      prepare: runtime.prepareConnection?.bind(runtime), traverse: runtime.prepareConnectionTraversal?.bind(runtime) }))];
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function fail(code, details = null) {
  throw serverError(code, 'The approved directional exit cannot be traversed.',
    { status: 409, ...(details ? { details } : {}) });
}
