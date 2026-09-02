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
  createTurnStepBackgroundNpcResolver,
  npcSemanticRemainderProfile,
  ordinaryDiscoveryEnablementMarker,
  ordinaryDiscoveryResolver,
  ordinaryDiscoveryScopeBinding,
  partyId,
  playerSafeStateProjector,
  workingProjectionAuthority
}) {
  if (typeof playerSafeStateProjector !== 'function') return null;
  return async (input) => {
    const committedState = structuredClone(input.committed_state);
    let projected = await playerSafeStateProjector({
      ...input,
      committed_state: committedState,
      working_projection_authority: workingProjectionAuthority
    });
    projected = projectLowerDvinaTraceO2aCapabilities({ projected,
      admission: admitAmbientOrdinaryPortion });
    const preparedOrdinaryPlan =
      input.prepared_ordinary_materialization_atomic_write_plan;
    const basePlayerSafeState = projectPreparedOrdinaryScene(
      projectPreparedOrdinaryItem(projected.player_safe_state,
        preparedOrdinaryPlan), preparedOrdinaryPlan?.next_aggregate);
    const { active_interlocutor: _staleActiveInterlocutor,
      current_visible_context: _presentationOnlyCurrentContext,
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
    const npcState = projectLowerDvinaTraceN1Capability({
      playerSafeState: spatialState,
      committedState,
      loadedProfile: npcSemanticRemainderProfile,
      resolverAvailable:
        typeof createTurnStepBackgroundNpcResolver === 'function'
    });
    const base = { ...projected,
      initial_working_projection: initialWorkingProjection };
    if (typeof ordinaryDiscoveryEnablementMarker !== 'function'
        || typeof ordinaryDiscoveryResolver !== 'function') {
      return { ...base, player_safe_state:
        projectLowerDvinaTraceTurnStepPlannerState(npcState) };
    }
    const scopeId = committedState.position?.g6_id
      ?? committedState.position?.g6_ref
      ?? (committedState.position?.location_ref
          === ordinaryDiscoveryScopeBinding?.position_ref
        ? ordinaryDiscoveryScopeBinding.g6_ref : null);
    if (typeof scopeId !== 'string' || !scopeId) {
      return { ...base, player_safe_state:
        projectLowerDvinaTraceTurnStepPlannerState(npcState) };
    }
    const enabled = await ordinaryDiscoveryEnablementMarker({ partyId,
      scopeRef: { entity_kind: 'g6', entity_id: scopeId } });
    if (enabled !== true && enabled?.discovery_available !== true) {
      return { ...base, player_safe_state:
        projectLowerDvinaTraceTurnStepPlannerState(npcState) };
    }
    const withSources = projectLowerDvinaTraceO2aDiscoverySources({
      projected:{...base,player_safe_state:npcState},
      sources:enabled === true ? [] : enabled.sources });
    const withScene = projectPreparedOrdinaryScene(
      withSources.player_safe_state,
      preparedOrdinaryPlan?.next_aggregate ?? {
        background_groups: enabled === true ? [] : (enabled.scene_details ?? [])
          .map((descriptor) => ({ descriptor }))
      });
    const capability = projectPlayerSafeOrdinaryResolutionCapability({
      ordinary_resolution:{discovery_available:true,
        container_resolution_available:false,
        scene_seed_available:enabled !== true
          && enabled.scene_seed_available === true}
    });
    return {...withSources,initial_working_projection:initialWorkingProjection,
      player_safe_state:projectLowerDvinaTraceTurnStepPlannerState({
        ...withScene,...capability})};
  };
}

export function projectLowerDvinaTraceTurnStepPlannerState(state) {
  const { npcs: _npcs, visible_npcs: _visibleNpcs,
    scene_npcs: _sceneNpcs, ...safe } = state;
  return safe;
}

function projectLowerDvinaTraceN1Capability({ playerSafeState,
  committedState, loadedProfile, resolverAvailable }) {
  if (!resolverAvailable
      || loadedProfile?.schema !== 'rus.lower_dvina_trace_n1_loaded_profile.v1'
      || loadedProfile.profile?.status !== 'approved') return playerSafeState;
  const eligible = new Set(loadedProfile.profile.eligible_participant_profiles
    .map(({ profile_id: id, revision }) => `${id}@${revision}`));
  const visible = new Set((playerSafeState.current_visible_context
    ?.visible_npc ?? []).flatMap((entry) =>
      entry?.entity_ref?.entity_kind === 'npc'
        ? [entry.entity_ref.entity_id] : []));
  const refs = (committedState.npcs ?? []).flatMap((npc) => {
    const id = npc.npc_id ?? npc.instance_id;
    const profileId = npc.profile_set_id ?? npc.profile_id;
    const revision = npc.semantic_state?.profile_revision
      ?? npc.profile_revision;
    return typeof id === 'string' && visible.has(id)
      && npc.profile_level === 'background'
      && eligible.has(`${profileId}@${revision}`)
      && npc.semantic_state?.n1_remainder == null ? [id] : [];
  });
  return refs.length === 0 ? playerSafeState : {
    ...playerSafeState,
    background_npc_remainder: {
      semantic_grounding_available: true,
      eligible_npc_refs: [...new Set(refs)].sort()
    }
  };
}

function projectPreparedOrdinaryScene(state, aggregate) {
  const details = (aggregate?.background_groups ?? [])
    .map((group) => group?.descriptor ?? group).filter(text);
  if (details.length === 0) return state;
  const contextKey = ['current_visible_context', 'visible_context',
    'visible_context_package'].find((key) => state[key] != null);
  if (contextKey == null) return state;
  const context = state[contextKey];
  return { ...state, [contextKey]: { ...context, sensory_details:
    [...new Set([...(context.sensory_details ?? []), ...details])] } };
}

export function projectPreparedOrdinaryItem(state, plan) {
  const item = plan?.resolution === 'materialize' ? plan.item : null;
  const descriptor = item?.item_proposal?.semantic_descriptor;
  if (!text(item?.item_id) || !text(descriptor?.name)
      || !text(descriptor?.semantic_type)) return state;
  const projectedItem = {
    item_id: item.item_id,
    name: descriptor.name,
    semantic_type: descriptor.semantic_type,
    ...(Array.isArray(descriptor.facts) && descriptor.facts.length
      ? { physical_facts: descriptor.facts.map((fact) => fact?.text ?? fact)
        .filter(text) } : {}),
    placement: structuredClone(item.runtime_placement ?? {})
  };
  const items = (state.items ?? []).some(({ item_id: id }) =>
    id === item.item_id) ? state.items : [...(state.items ?? []), projectedItem];
  const contextKey = ['current_visible_context', 'visible_context',
    'visible_context_package'].find((key) => state[key] != null);
  if (contextKey == null) return { ...state,
    items };
  const context = state[contextKey];
  const visibleObjects = (context.visible_objects ?? []).some(({ entity_ref: ref }) =>
    ref?.entity_kind === 'item' && ref.entity_id === item.item_id)
    ? context.visible_objects : [
        ...(context.visible_objects ?? []),
        { entity_ref: { entity_kind: 'item', entity_id: item.item_id },
          display_label: descriptor.name, recognition: 'recognized',
          visible_status: 'available' }
      ];
  return {
    ...state,
    items,
    [contextKey]: { ...context, visible_objects: visibleObjects }
  };
}

function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
