import { projectLowerDvinaTraceA1Capability } from
  './lower-dvina-trace-a1-player-safe.js';
import { projectLowerDvinaTraceF1Capability } from
  './releases/lower-dvina-trace-f1-production.js';
import { projectLowerDvinaTraceS1Capability } from
  './releases/lower-dvina-trace-s1-production.js';

export function createLowerDvinaTraceTurnStepPlayerSafeProjector({
  actionProductionProfile,
  createTurnStepActionProducedResolver,
  localFireProfile,
  createTurnStepWorldProcessResolver,
  spatialSemanticProfile,
  createTurnStepSpatialSemanticResolver,
  ordinaryDiscoveryEnablementMarker,
  ordinaryDiscoveryResolver,
  partyId,
  playerSafeStateProjector,
  workingProjectionAuthority
}) {
  if (typeof playerSafeStateProjector !== 'function') return null;
  return async (input) => {
    const committedState = structuredClone(input.committed_state);
    delete committedState.current_visible_context;
    const projected = await playerSafeStateProjector({
      ...input,
      committed_state: committedState,
      working_projection_authority: workingProjectionAuthority
    });
    const initialWorkingProjection = projected.player_safe_state;
    const actionState = projectLowerDvinaTraceA1Capability({
      playerSafeState: initialWorkingProjection,
      loadedProfile: actionProductionProfile,
      resolverAvailable:
        typeof createTurnStepActionProducedResolver === 'function'
    });
    const fireState = projectLowerDvinaTraceF1Capability({
      playerSafeState: actionState, committedState,
      loadedProfile: localFireProfile,
      resolverAvailable: typeof createTurnStepWorldProcessResolver === 'function'
    });
    const playerSafeState = projectLowerDvinaTraceS1Capability({
      playerSafeState: fireState, committedState, loadedProfile: spatialSemanticProfile,
      resolverAvailable: typeof createTurnStepSpatialSemanticResolver === 'function' });
    const base = { ...projected,
      initial_working_projection: initialWorkingProjection };
    if (typeof ordinaryDiscoveryEnablementMarker !== 'function'
        || typeof ordinaryDiscoveryResolver !== 'function') {
      return { ...base, player_safe_state: playerSafeState };
    }
    const scopeId = committedState.position?.g6_id
      ?? committedState.position?.g6_ref
      ?? committedState.position?.location_ref;
    if (typeof scopeId !== 'string' || !scopeId) {
      return { ...base, player_safe_state: playerSafeState };
    }
    const enabled = await ordinaryDiscoveryEnablementMarker({ partyId,
      scopeRef: { entity_kind: 'g6', entity_id: scopeId } });
    return enabled === true ? { ...base, player_safe_state: {
      ...playerSafeState,
      ordinary_resolution: { discovery_available: true,
        container_resolution_available: false }
    } } : { ...base, player_safe_state: playerSafeState };
  };
}
