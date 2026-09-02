import {
  compact,
  freezeJson,
  plain,
  projectionError
} from './lower-dvina-trace-player-safe-json.js';
import { runtimeItemRecordIsConcealed } from '@rus/items-property';
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
import { projectActiveConversationInterlocutor } from
  '@rus/visibility-knowledge-memory';
import { validateActorBaseAppearance } from '@rus/actors';
import { PORTRAIT_SPEC_V1_ENUMS } from '@rus/contracts';
import { validateNpcOrdinarySemanticRemainder } from '@rus/npc-runtime';

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
  const visibleContext = projectVisibleContext(committedState.visible_context);
  const currentVisibleContext = projectVisibleContext(
    committedState.current_visible_context,
    { path: 'current_visible_context' }
  );
  const visibleContextPackage = projectVisibleContext(
    committedState.visible_context_package,
    { path: 'visible_context_package' }
  );
  const npcs = projectNpcs(committedState.npcs, { position });
  const visibleNpcIds = new Set((currentVisibleContext?.visible_npc ?? [])
    .flatMap(({ entity_ref: ref }) => ref?.entity_kind === 'npc'
      ? [ref.entity_id] : []).filter(Boolean));
  const items = projectItems([...(committedState.items ?? []),
    ...containerItems(committedState.containers,
      committedState.container_placements)], {
    actorId, position: committedState.position, visibleNpcIds
  });
  const activeInterlocutor = projectActiveConversationInterlocutor({
    conversation_sessions: committedState.conversation_sessions ?? [],
    conversation_statements: committedState.conversation_statements ?? [],
    player_ref: { entity_kind: 'player_character', entity_id: actorId },
    current_location_ref: position?.location_ref,
    visible_npcs: projectLowerDvinaTraceVisibleNpcDetails({
      visibleContext: currentVisibleContext ?? visibleContext ?? visibleContextPackage,
      projectedNpcs: npcs,
      committedNpcs: committedState.npcs,
      committedItems: committedState.items
    })
  });
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
    npcs,
    interactions: projectInteractions(committedState.interactions),
    routes: projectRoutes(committedState.routes),
    available_routes: projectRoutes(committedState.available_routes),
    route_history: projectRouteHistory(committedState.route_history),
    route_knowledge: projectRouteKnowledge(committedState.route_knowledge),
    knowledge: projectKnowledge(committedState.knowledge),
    visible_context: visibleContext,
    visible_context_package: visibleContextPackage,
    current_visible_context: currentVisibleContext,
    active_interlocutor: activeInterlocutor ?? undefined,
    case_evidence_ref: typeof committedState.phase9?.case_evidence_ref
      === 'string' ? committedState.phase9.case_evidence_ref : undefined,
    temporary_disposition_options: projectTemporaryDispositionOptions(
      committedState.phase9?.temporary_disposition_options),
    combat_sessions: projectCombatSessions(committedState.combat_sessions)
  });
  const playerSafeState = applyLowerDvinaTraceWorkingProjection({
    base,
    workingProjection,
    committedState,
    actorId,
    authority: workingProjectionAuthority
  });
  const { active_interlocutor: _staleActiveInterlocutor,
    ...withoutStaleInterlocutor } = playerSafeState;
  return freezeJson({
    actor: projectActor({
      profile,
      body: committedState.body_state ?? profile.body,
      actorId
    }),
    player_safe_state: playerSafeState.position?.location_ref
      === base.position?.location_ref ? playerSafeState : withoutStaleInterlocutor
  });
}
export function projectLowerDvinaTraceVisibleNpcDetails({ visibleContext, projectedNpcs,
  committedNpcs, committedItems }) {
  if (!Array.isArray(projectedNpcs)) return [];
  const labels = Array.isArray(visibleContext?.visible_npc)
    ? visibleContext.visible_npc : [];
  return projectedNpcs.map((npc) => {
    const ids = [npc?.instance_id, npc?.actor_id, npc?.npc_id]
      .filter(Boolean);
    const publicNames = labels.filter((visibleNpc) =>
      visibleNpc?.entity_ref?.entity_kind === 'npc'
        && ids.includes(visibleNpc.entity_ref.entity_id)
        && typeof visibleNpc.display_label === 'string'
        && visibleNpc.display_label.trim())
      .map(({ display_label: displayLabel }) => displayLabel.trim());
    const names = publicNames.length === 1 ? publicNames : [];
    if (names.length !== 1) return null;
    const committedMatches = (committedNpcs ?? []).filter((candidate) =>
      ids.some((id) => [candidate?.instance_id, candidate?.actor_id,
        candidate?.npc_id].includes(id)));
    const committed = committedMatches.length === 1 ? committedMatches[0] : null;
    return {
      instance_id: npc.instance_id,
      actor_id: npc.actor_id,
      npc_id: npc.npc_id,
      identity_state: safeConversationIdentity(
        committed?.identity_state, names[0]),
      visible_equipment: safeConversationEquipment(committedItems, ids),
      presentation: safeConversationPresentation(committed?.player_safe_presentation),
      ordinary_remainder: safeOrdinaryRemainder(
        committed?.semantic_state?.n1_remainder)
    };
  }).filter(Boolean);
}

function safeOrdinaryRemainder(value) {
  if (!validateNpcOrdinarySemanticRemainder(value)) return null;
  return {
    ordinary_descriptor: value.ordinary_descriptor,
    ordinary_activity: value.ordinary_activity
  };
}
function safeConversationIdentity(value, displayName) {
  if (!validateActorBaseAppearance(value, { requireComplete: true }).ok) {
    return { display_name: displayName };
  }
  return {
    display_name: displayName,
    sex_category: safeText(value?.sex_category),
    age_category: value?.age_category === 'young_adult'
      ? 'young' : safeText(value?.age_category),
    appearance: {
      build: safeText(value?.appearance?.build),
      skin_tone: safeText(value?.appearance?.skin_tone),
      face_shape: safeText(value?.appearance?.face_shape),
      hair: {
        color: safeText(value?.appearance?.hair?.color),
        length: safeText(value?.appearance?.hair?.length),
        style: safeText(value?.appearance?.hair?.style),
        facial_hair: safeText(value?.appearance?.hair?.facial_hair)
      },
      eyes: { color: safeText(value?.appearance?.eyes?.color) }
    }
  };
}
function safeConversationEquipment(items, npcIds) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const placement = plain(item?.placement) ? item.placement : item;
    return npcIds.includes(placement?.holder_npc_id)
      && ['worn', 'equipped'].includes(placement?.physical_position)
      && !runtimeItemRecordIsConcealed(item, { includeAccess: false });
  }).map((item) => {
    const placement = plain(item.placement) ? item.placement : item;
    const snapshot = item?.state?.visual_profile_snapshot
      ?? item?.visual_profile_snapshot;
    return {
      physical_position: placement.physical_position,
      equipment_slot_category_id: placement.equipment_slot_category_id,
      visual_profile_snapshot: safeVisualProfile(snapshot)
    };
  }).filter((item) => item.visual_profile_snapshot !== null);
}
function safeVisualProfile(value) {
  if (!plain(value)
      || value.schema !== 'item_visual_profile_snapshot_v1'
      || value.version !== 1
      || !['base_garment', 'base', 'outer_garment', 'outer',
        'headwear'].includes(value.equipment_slot)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.neckline.includes(value.neckline)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.sleeve.includes(value.sleeve_form)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.outer.includes(value.outer_form)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.fabric.includes(value.visible_fabric)
      || !['none', null].includes(value.trim)
        && !PORTRAIT_SPEC_V1_ENUMS.clothing.trim.includes(value.trim)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.main_color.includes(
        value.main_visible_color)
      || value.secondary_visible_color != null
        && !PORTRAIT_SPEC_V1_ENUMS.clothing.secondary_color.includes(
          value.secondary_visible_color)
      || !PORTRAIT_SPEC_V1_ENUMS.clothing.headwear.includes(
        value.headwear_kind)) return null;
  return {
    schema: safeText(value.schema), version: Number(value.version),
    equipment_slot: safeText(value.equipment_slot), neckline: safeText(value.neckline),
    sleeve_form: safeText(value.sleeve_form), outer_form: safeText(value.outer_form),
    visible_fabric: safeText(value.visible_fabric), trim: safeText(value.trim),
    main_visible_color: safeText(value.main_visible_color),
    secondary_visible_color: safeText(value.secondary_visible_color),
    headwear_kind: safeText(value.headwear_kind)
  };
}

function safeConversationPresentation(value) {
  if (!plain(value)) return {};
  const allowed = {
    emotion: PORTRAIT_SPEC_V1_ENUMS.expression.emotion,
    intensity: PORTRAIT_SPEC_V1_ENUMS.expression.intensity,
    gaze: PORTRAIT_SPEC_V1_ENUMS.eyes.gaze,
    body_pose: PORTRAIT_SPEC_V1_ENUMS.pose.body,
    head_pose: PORTRAIT_SPEC_V1_ENUMS.pose.head,
    background: PORTRAIT_SPEC_V1_ENUMS.background
  };
  return Object.fromEntries(Object.entries(allowed).flatMap(([key, values]) => {
    const candidate = safeText(value[key]);
    return candidate !== null && values.includes(candidate)
      ? [[key, candidate]] : [];
  }));
}

function safeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function projectTemporaryDispositionOptions(value) {
  if (value?.schema !== 'temporary_disposition_option_set_v1') return undefined;
  return { schema: value.schema, contract_ref: value.contract_ref,
    selection_source: value.selection_source,
    custody_option_refs: structuredClone(
      value.eligible_option_ids.custody),
    property_option_refs: structuredClone(
      value.eligible_option_ids.property),
    promise_option_refs: structuredClone(
      value.eligible_option_ids.promise) };
}

function containerItems(containers = [], placements = []) {
  const placementById = new Map((placements ?? []).map((placement) => [
    placement.container_id, placement
  ]));
  return (containers ?? []).map((container) => {
    const placement = placementById.get(container.container_id) ?? container;
    return ({
    item_id: container.container_id,
    template_id: container.template_id,
    closure_state: container.closure_state,
    placement: {
      container_id: placement.parent_container_id
        ?? container.parent_container_id
        ?? container.state?.parent_container_id,
      holder_character_id: placement.holder_character_id
        ?? container.holder_character_id
        ?? container.state?.holder_character_id,
      holder_npc_id: placement.holder_npc_id ?? container.holder_npc_id
        ?? container.state?.holder_npc_id,
      physical_position: placement.physical_position
        ?? container.physical_position,
      equipment_slot_category_id: placement.equipment_slot_category_id
        ?? container.equipment_slot_category_id,
      location_ref: placement.location_ref ?? container.location_ref
        ?? container.state?.location_ref,
      anchor_id: placement.anchor_id ?? container.anchor_id
        ?? container.state?.anchor_id,
      zone_ref: container.zone_ref ?? container.state?.zone_ref
    },
    access_state: container.access_state ?? container.state?.access_state,
    visibility_state: container.visibility_state
      ?? container.state?.visibility_state,
    open_state: container.open_state ?? container.closure_state,
    contents_state: container.contents_state,
    visible: container.visible,
    is_visible: container.is_visible
  });
  });
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
