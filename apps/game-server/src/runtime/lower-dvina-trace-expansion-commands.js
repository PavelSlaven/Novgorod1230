import { isDeepStrictEqual } from 'node:util';
import { validateConsequencePackage } from '@rus/turn';
import { serverError } from '../errors.js';
import { actorMovementBlocked, available, mode } from
  './lower-dvina-trace-phase-3-command-shared.js';

export async function createTraceExpansionCommands({ state, requestId,
  inputDigest, spatialExpansionRuntime }) {
  if (spatialExpansionRuntime == null) return [];
  if (typeof spatialExpansionRuntime.listExpansionOptions !== 'function') {
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
  const sourcePosition = structuredClone(state.position);
  const sourceVersion = state.party_state?.state_version;
  const currentSource = (current) => current?.party_id === identity.partyId
    && current.actor_id === identity.actorId
    && current.party_state?.state_version === sourceVersion
    && isDeepStrictEqual(current.position, sourcePosition);
  return candidates.map(({ directional_exit_id: exitId,
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
        if (expansion?.ok !== true) fail('LIVE_WORLD_EXPANSION_PREPARATION_FAILED');
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
  });
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function fail(code) {
  throw serverError(code, 'The approved directional exit cannot be traversed.',
    { status: 409 });
}
