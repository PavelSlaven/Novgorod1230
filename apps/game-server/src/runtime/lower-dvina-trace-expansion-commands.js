import { isDeepStrictEqual } from 'node:util';
import { validateConsequencePackage } from '@rus/turn';
import { serverError } from '../errors.js';
import { actorMovementBlocked, available, mode } from
  './lower-dvina-trace-phase-3-command-shared.js';
import { localEdgeOccupiedLabel } from './local-edge-occupancy.js';
import { NEUTRAL_APPROACH_PHRASE } from './spatial-v3-pass-target-disclosure.js';

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
  const approaches = await spatialExpansionRuntime.listApproachOptions({ ...identity,
    firstStepEdgeIds: [...localByEdge.keys()] });
  if (!Array.isArray(approaches)
      || approaches.some((row) => !text(row?.directional_exit_id) || !text(row?.edge_id)
        || !text(row?.display_label) || !['open', 'occupied'].includes(
          localByEdge.get(row.edge_id)?.destination_status))) {
    fail('LIVE_WORLD_EXPANSION_OPTIONS_INVALID');
  }
  const sourcePosition = structuredClone(state.position);
  const sourceVersion = state.party_state?.state_version;
  const currentSource = (current) => current?.party_id === identity.partyId
    && current.actor_id === identity.actorId
    && current.party_state?.state_version === sourceVersion
    && isDeepStrictEqual(current.position, sourcePosition);
  const approachCommands = approaches.length === 0
    || typeof spatialLocalSceneRuntime?.prepareLocalMovement !== 'function' ? [] : approaches.map(
    ({ directional_exit_id: exitId, edge_id: edgeId, display_label: exitLabel,
      approach_phrase: phrase = NEUTRAL_APPROACH_PHRASE }) => {
      const { destination_status: status } = localByEdge.get(edgeId);
      // The way-of-going phrase (water / land / neutral) is approved data resolved by the
      // exit disclosure owner - never composed from the exit kind in code.
      const approach = `${exitLabel} — ${phrase}`;
      const label = status === 'occupied' ? localEdgeOccupiedLabel(approach) : approach;
      // route_ref (the exit) keeps this structurally distinct from the plain local-scene
      // operation for the same edge: bindings match structurally, so without it both commands
      // would claim the same chosen operation (TURN_STEP_DOMAIN_BINDING_AMBIGUOUS).
      const operation = { op: 'request_movement', actor_ref: identity.actorId,
        target_ref: edgeId, movement_kind: 'local', route_ref: exitId, description: label };
      return {
        command_id: `live_world.approach_directional_exit:${exitId}`,
        option_id: `directional_exit_approach:${exitId}`,
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
          binding_id: `directional_exit_approach:${exitId}`,
          operation: 'request_movement', operation_dto: operation,
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
  return [...approachCommands, ...candidates.map(({ directional_exit_id: exitId,
    display_label: label }) => {
    const operation = { op: 'request_movement', actor_ref: identity.actorId,
      target_ref: exitId, movement_kind: 'route', route_ref: exitId,
      description: label };
    return {
      command_id: `live_world.follow_directional_exit:${exitId}`,
      option_id: `directional_exit:${exitId}`,
      label,
      target_id: exitId,
      approved_record: null,
      preconditions: [],
      expected_cost: { kind: 'owner_resolved' },
      known_risks: [],
      reason_visible_to_actor: label,
      mode: mode('movement_route', ['movement', 'route', 'time_progression']),
      matches: () => false,
      semantic_binding: {
        binding_id: `directional_exit:${exitId}`,
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
        if (typeof spatialExpansionRuntime.prepareTraversal !== 'function') {
          fail('LIVE_WORLD_TRAVERSAL_OWNER_MISSING');
        }
        if (typeof spatialExpansionRuntime.prepareExpansion !== 'function') {
          fail('LIVE_WORLD_EXPANSION_OWNER_MISSING');
        }
        const selected = { ...identity, directionalExitId: exitId, requestId };
        const expansion = await spatialExpansionRuntime.prepareExpansion(selected);
        if (expansion?.ok !== true) {
          fail('LIVE_WORLD_EXPANSION_PREPARATION_FAILED', expansion?.error ?? null);
        }
        try {
          const consequence = await spatialExpansionRuntime.prepareTraversal({
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
  })];
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function fail(code, details = null) {
  throw serverError(code, 'The approved directional exit cannot be traversed.',
    { status: 409, ...(details ? { details } : {}) });
}
