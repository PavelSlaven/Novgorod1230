import { isDeepStrictEqual } from 'node:util';
import { available, mode, phase3WriteTargets } from
  './lower-dvina-trace-phase-3-command-shared.js';
import { serverError } from '../errors.js';

export async function createTraceLocalSceneCommands({ state, inputDigest,
  spatialLocalSceneRuntime }) {
  if (spatialLocalSceneRuntime == null) return [];
  if (typeof spatialLocalSceneRuntime.listLocalOptions !== 'function'
      || typeof spatialLocalSceneRuntime.prepareLocalMovement !== 'function') {
    fail('SPATIAL_V3_LOCAL_RUNTIME_MISSING');
  }
  const identity = { partyId: state.party_id, actorId: state.actor_id };
  const options = await spatialLocalSceneRuntime.listLocalOptions({ ...identity, state });
  if (!Array.isArray(options) || options.some(({ edge_id: id, display_label: label,
    action_units: actionUnits } = {}) =>
    !text(id) || !text(label) || !Number.isSafeInteger(actionUnits) || actionUnits < 1)
      || new Set(options.map(({ edge_id: id }) => id)).size !== options.length) {
    fail('SPATIAL_V3_LOCAL_OPTIONS_INVALID');
  }
  const sourcePosition = structuredClone(state.position);
  const sourceVersion = state.party_state?.state_version;
  const currentSource = (current) => current?.party_id === identity.partyId
    && current.actor_id === identity.actorId
    && current.party_state?.state_version === sourceVersion
    && isDeepStrictEqual(current.position, sourcePosition);
  return options.map(({ edge_id: edgeId, display_label: label,
    action_units: actionUnits }) => {
    const operation = { op: 'request_movement', actor_ref: identity.actorId,
      target_ref: edgeId, movement_kind: 'local', description: label };
    return {
      command_id: `live_world.follow_local_scene_edge:${edgeId}`,
      option_id: `local_scene_edge:${edgeId}`,
      label, target_id: edgeId,
      approved_record: null, preconditions: [],
      expected_cost: { kind: 'action', units: actionUnits }, known_risks: [],
      reason_visible_to_actor: label,
      mode: mode('movement_route', ['movement']),
      matches: () => false,
      semantic_binding: { binding_id: `local_scene_edge:${edgeId}`,
        operation: 'request_movement', operation_dto: operation,
        matches: ({ operation: selected }) => isDeepStrictEqual(selected, operation) },
      availability({ committed_state: current, retrievedState }) {
        const admitted = currentSource(current ?? retrievedState);
        return available(admitted, [], admitted ? [] : ['local_scene_source_stale']);
      },
      async consequence({ retrievedState: current, playerInput }) {
        if (!currentSource(current)) fail('SPATIAL_V3_LOCAL_SOURCE_STALE');
        return spatialLocalSceneRuntime.prepareLocalMovement({ ...identity,
          state: current, edgeId, playerInput, inputDigest });
      },
      writeTargets: phase3WriteTargets
    };
  });
}

const text = (value) => typeof value === 'string' && value.trim() === value && value.length > 0;
function fail(code) { throw serverError(code, 'Current local scene movement is unavailable.', { status: 409 }); }
