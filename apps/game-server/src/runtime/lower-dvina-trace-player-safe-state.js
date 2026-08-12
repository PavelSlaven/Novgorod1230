import {
  compact,
  freezeJson,
  plain,
  projectionError
} from './lower-dvina-trace-player-safe-json.js';
import {
  projectActor,
  projectInteractions,
  projectNpcs
} from './lower-dvina-trace-player-safe-entities.js';
import { playerSafeItemIds, projectInventory, projectItems } from
  './lower-dvina-trace-player-safe-items.js';
import {
  projectClock,
  projectClockWeatherLight,
  projectDestinationRefs,
  projectKnowledge,
  projectPosition,
  projectRouteHistory,
  projectRouteKnowledge,
  projectRoutes,
  projectVisibleContext
} from './lower-dvina-trace-player-safe-world.js';
import { applyLowerDvinaTraceWorkingProjection } from
  './lower-dvina-trace-player-safe-working.js';

export function projectLowerDvinaTracePlayerSafeState({
  committed_state: committedState,
  working_projection: workingProjection,
  working_projection_authority: workingProjectionAuthority,
  actor_id: actorId
} = {}) {
  assertProjectionInput(committedState, actorId);
  const profile = committedState.player_profile ?? {};
  const clockWeatherLight = committedState.clock_weather_light ?? {};
  const position = projectPosition(committedState.position);
  const items = projectItems([...(committedState.items ?? []),
    ...containerItems(committedState.containers)], { actorId, position });
  const base = compact({
    actor_id: actorId,
    position,
    destination_refs: projectDestinationRefs(committedState, position),
    clock: projectClock(committedState.clock ?? clockWeatherLight.clock),
    clock_weather_light: projectClockWeatherLight(
      clockWeatherLight,
      committedState.clock
    ),
    inventory: projectInventory(committedState.inventory ?? profile.inventory, {
      allowedItemIds: playerSafeItemIds(items)
    }),
    items,
    visible_npcs: projectNpcs(committedState.visible_npcs, {
      position, explicitlyVisible: true
    }),
    scene_npcs: projectNpcs(committedState.scene_npcs, {
      position, explicitlyVisible: true
    }),
    npcs: projectNpcs(committedState.npcs, { position }),
    interactions: projectInteractions(committedState.interactions),
    routes: projectRoutes(committedState.routes),
    available_routes: projectRoutes(committedState.available_routes),
    route_history: projectRouteHistory(committedState.route_history),
    route_knowledge: projectRouteKnowledge(committedState.route_knowledge),
    knowledge: projectKnowledge(committedState.knowledge),
    visible_context: projectVisibleContext(committedState.visible_context),
    visible_context_package: projectVisibleContext(
      committedState.visible_context_package,
      { path: 'visible_context_package' }
    ),
    current_visible_context: projectVisibleContext(
      committedState.current_visible_context,
      { path: 'current_visible_context' }
    ),
    case_evidence_ref: typeof committedState.phase9?.case_evidence_ref
      === 'string' ? committedState.phase9.case_evidence_ref : undefined,
    combat_sessions: projectCombatSessions(committedState.combat_sessions)
  });
  const playerSafeState = applyLowerDvinaTraceWorkingProjection({
    base,
    workingProjection,
    committedState,
    actorId,
    authority: workingProjectionAuthority
  });
  return freezeJson({
    actor: projectActor({
      profile,
      body: committedState.body_state ?? profile.body,
      actorId
    }),
    player_safe_state: playerSafeState
  });
}

function containerItems(containers = []) {
  return (containers ?? []).map((container) => ({
    item_id: container.container_id,
    template_id: container.template_id,
    closure_state: container.closure_state,
    placement: {
      container_id: container.parent_container_id
        ?? container.state?.parent_container_id,
      holder_character_id: container.holder_character_id
        ?? container.state?.holder_character_id,
      holder_npc_id: container.holder_npc_id
        ?? container.state?.holder_npc_id,
      location_ref: container.location_ref ?? container.state?.location_ref,
      anchor_id: container.anchor_id ?? container.state?.anchor_id,
      zone_ref: container.zone_ref ?? container.state?.zone_ref
    },
    access_state: container.access_state,
    visibility_state: container.visibility_state,
    open_state: container.open_state ?? container.closure_state,
    contents_state: container.contents_state,
    visible: container.visibility_state !== 'concealed'
  }));
}

function projectCombatSessions(sessions = []) {
  return (sessions ?? []).filter(({ status }) => status !== 'ended').map(
    (session) => ({ combat_id: session.combat_id, status: session.status,
      scope_ref: structuredClone(session.scope_ref),
      participant_refs: structuredClone(session.participant_refs),
      participant_states: session.participant_states.map((participant) => ({
        actor_ref: structuredClone(participant.actor_ref),
        combat_status: participant.combat_status
      })), exchange_ordinal: session.exchange_ordinal,
      player_response_required: session.player_response_required }));
}

function assertProjectionInput(state, actorId) {
  if (!plain(state) || typeof actorId !== 'string' || actorId.length === 0) {
    throw projectionError(
      'TRACE_PLAYER_SAFE_PROJECTION_INPUT_INVALID',
      'Committed state and actor_id are required for player-safe projection.'
    );
  }
  if (typeof state.actor_id !== 'string' || state.actor_id.length === 0
      || state.actor_id !== actorId) {
    throw projectionError(
      'TRACE_PLAYER_SAFE_PROJECTION_ACTOR_MISMATCH',
      'The requested actor does not own the committed player state.'
    );
  }
}
