import { projectLowerDvinaTraceA1Capability } from
  './lower-dvina-trace-a1-player-safe.js';
import { projectPlayerSafeOrdinaryResolutionCapability } from
  '@rus/visibility-knowledge-memory/ordinary-resolution-capability';
import { projectLowerDvinaTraceO2aCapabilities,
  projectLowerDvinaTraceO2aDiscoverySources } from
  './lower-dvina-trace-o2a-player-safe.js';
import { projectLowerDvinaTraceF1Capability } from
  './releases/lower-dvina-trace-f1-production.js';
import { projectLowerDvinaTraceS1Capability } from
  './releases/lower-dvina-trace-s1-production.js';

export function createLowerDvinaTraceTurnStepPlayerSafeProjector({
  admitAmbientOrdinaryPortion,
  actionProductionProfile,
  createTurnStepActionProductionOwner,
  localFireProfile,
  createTurnStepWorldProcessResolver,
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
    let projected = await playerSafeStateProjector({
      ...input,
      committed_state: committedState,
      working_projection_authority: workingProjectionAuthority
    });
    projected = projectLowerDvinaTraceO2aCapabilities({ projected,
      admission: admitAmbientOrdinaryPortion });
    const basePlayerSafeState = projected.player_safe_state;
    const { active_interlocutor: _staleActiveInterlocutor,
      ...initialWorkingProjection } = basePlayerSafeState;
    const actionState = projectLowerDvinaTraceA1Capability({
      playerSafeState: basePlayerSafeState,
      loadedProfile: actionProductionProfile,
      resolverAvailable:
        typeof createTurnStepActionProductionOwner === 'function'
    });
    const playerSafeState = projectLowerDvinaTraceF1Capability({
      playerSafeState: actionState, committedState,
      localFirePlans: input.local_fire_atomic_write_plans,
      loadedProfile: localFireProfile,
      resolverAvailable: typeof createTurnStepWorldProcessResolver === 'function'
    });
    const spatialState = projectLowerDvinaTraceS1Capability({
      playerSafeState, committedState,
      resolverAvailable: typeof createTurnStepSpatialSemanticResolver === 'function'
    });
    const base = { ...projected,
      initial_working_projection: initialWorkingProjection };
    if (typeof ordinaryDiscoveryEnablementMarker !== 'function'
        || typeof ordinaryDiscoveryResolver !== 'function') {
      return { ...base, player_safe_state: spatialState };
    }
    const scopeId = committedState.position?.g6_id
      ?? committedState.position?.g6_ref
      ?? committedState.position?.location_ref;
    if (typeof scopeId !== 'string' || !scopeId) {
      return { ...base, player_safe_state: spatialState };
    }
    const enabled = await ordinaryDiscoveryEnablementMarker({ partyId,
      scopeRef: { entity_kind: 'g6', entity_id: scopeId } });
    if (enabled !== true && enabled?.discovery_available !== true) {
      return { ...base, player_safe_state: spatialState };
    }
    const withSources = projectLowerDvinaTraceO2aDiscoverySources({
      projected:{...base,player_safe_state:spatialState},
      sources:enabled === true ? [] : enabled.sources });
    const capability = projectPlayerSafeOrdinaryResolutionCapability({
      ordinary_resolution:{discovery_available:true,
        container_resolution_available:false}
    });
    return {...withSources,initial_working_projection:initialWorkingProjection,
      player_safe_state:{...withSources.player_safe_state,...capability}};
  };
}
