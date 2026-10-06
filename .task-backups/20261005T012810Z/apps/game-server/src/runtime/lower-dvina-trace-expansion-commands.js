import { isDeepStrictEqual } from 'node:util';
import { validateConsequencePackage } from '@rus/turn';
import { serverError } from '../errors.js';
import { actorMovementBlocked, available, mode } from
  './lower-dvina-trace-phase-3-command-shared.js';
import { localEdgeOccupiedLabel } from './local-edge-occupancy.js';
import { passagePhrases } from
  '../../../../data/world-catalogs/novgorod/m2c-pass-target-labels/approved-labels.mjs';

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
  const approachValid = (rows, idKey) => Array.isArray(rows)
    && rows.every((row) => text(row?.[idKey]) && text(row?.edge_id) && text(row?.display_label)
      && ['open', 'occupied'].includes(localByEdge.get(row.edge_id)?.destination_status));
  if (!approachValid(exitApproaches, 'directional_exit_id')
      || !approachValid(connectionApproaches, 'connection_binding_id')
      || !Array.isArray(connections)
      || connections.some((row) => !text(row?.connection_binding_id) || !text(row.display_label))
      || new Set(connections.map((row) => row.connection_binding_id)).size !== connections.length) {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
  }
  const approaches = [
    ...exitApproaches.map(({ directional_exit_id: routeId, ...row }) => ({ ...row, routeId,
      commandKey: 'approach_directional_exit', optionKey: 'directional_exit_approach' })),
    ...connectionApproaches.map(({ connection_binding_id: routeId, ...row }) => ({ ...row, routeId,
      commandKey: 'approach_canonical_connection', optionKey: 'canonical_connection_approach' }))];
  const sourcePosition = structuredClone(state.position);
  const sourceVersion = state.party_state?.state_version;
  const currentSource = (current) => current?.party_id === identity.partyId
    && current.actor_id === identity.actorId
    && current.party_state?.state_version === sourceVersion
    && isDeepStrictEqual(current.position, sourcePosition);
  const approachCommands = approaches.length === 0
    || typeof spatialLocalSceneRuntime?.prepareLocalMovement !== 'function' ? [] : approaches.map(
    ({ routeId: exitId, edge_id: edgeId, display_label: exitLabel, commandKey, optionKey }) => {
      const { destination_status: status } = localByEdge.get(edgeId);
      // One neutral approved phrase for every exit: the target class is already in the exit
      // label, the way of going (foot, boat) is not the label's business.
      const approach = `${exitLabel} — ${passagePhrases.approach}`;
      const label = status === 'occupied' ? localEdgeOccupiedLabel(approach) : approach;
      // route_ref (the exit) keeps this structurally distinct from the plain local-scene
      // operation for the same edge: bindings match structurally, so without it both commands
      // would claim the same chosen operation (TURN_STEP_DOMAIN_BINDING_AMBIGUOUS).
      const operation = { op: 'request_movement', actor_ref: identity.actorId,
        target_ref: edgeId, movement_kind: 'local', route_ref: exitId, description: label };
      return {
        command_id: `live_world.${commandKey}:${exitId}`,
        option_id: `${optionKey}:${exitId}`,
        label, target_id: edgeId,
        // Same structural signal as the plain local edge: the first step's own admission
        // status, read from the local-scene owner, never from the text above.
        semantic_grounding: { destination_status: status },
        approved_record: null, preconditions: [],
        expected_cost: { kind: 'owner_resolved' }, known_risks: [],
        reason_visible_to_actor: label,
        mode: mode('movement_route', ['movement']),
        matches: () => false,
        semantic_binding: {
          binding_id: `${optionKey}:${exitId}`,
          operation: 'request_movement', operation_dto: operation,
          matches: ({ operation: selected }) => selected != null
            && isDeepStrictEqual({ ...selected, description: label }, operation)
        },
        // Structural refusal, checked by turnStepBlockPlan before the attempt runs: the movement
        // owner's full-occupancy verdict, which may cover occupants the actor cannot perceive.
        async attemptRefusal({ committed_state: current }) {
          if (typeof spatialLocalSceneRuntime.localEdgeAttemptStatus !== 'function') return null;
          return await spatialLocalSceneRuntime.localEdgeAttemptStatus({ ...identity,
            state: current, edgeId }) === 'occupied' ? 'destination_occupied' : null;
        },
        availability({ committed_state: current, retrievedState }) {
          const state = current ?? retrievedState;
          const sourceReady = currentSource(state);
          const blocked = sourceReady && actorMovementBlocked(state);
          return available(sourceReady && !blocked, [], !sourceReady
            ? ['directional_exit_stale'] : blocked ? ['actor_movement_blocked'] : []);
        },
        // Same local-scene movement owner and the same edge a plain local-scene command
        // would offer for this edge (A-B1-06) - only the description differs, naming the
        // reachable exit so a "переправлюсь"/"иду к руслу" intent can name the approach
        // directly; the framework's own multi-step turn plans the crossing as step 2 once
        // this hop commits and the actor is genuinely at departure.
        async consequence({ retrievedState: current, playerInput }) {
          if (!currentSource(current)) fail('LIVE_WORLD_EXPANSION_SOURCE_STALE');
          return spatialLocalSceneRuntime.prepareLocalMovement({ ...identity,
            state: current, edgeId, playerInput, inputDigest });
        },
        writeTargets: () => []
      };
    });
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
        const expansion = await prepare(selected);
        if (expansion?.ok !== true) {
          fail('LIVE_WORLD_EXPANSION_PREPARATION_FAILED', expansion?.error ?? null);
        }
        try {
          const consequence = await traverse({
            ...selected, state: current, playerInput, inputDigest, expansion });
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
  return [...approachCommands,
    ...candidates.map(({ directional_exit_id: exitId, display_label: label }) => crossingCommand({
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
