import { canonicalDigest } from '@rus/materialization';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { assertLowerDvinaTracePublicScreen } from
  '../../runtime/lower-dvina-trace-opening.js';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { scenePresentationForLocation } from
  '../../runtime/lower-dvina-trace-scene-presentation.js';

const ARRAY_FIELDS = [
  'visible_changes', 'sensory_details', 'visible_npc', 'visible_objects',
  'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'
];

export function phase2InitialCurrentVisibleContext({
  screen,
  openingScreenDigest,
  initialState,
  scenePresentation = null
}) {
  try {
    assertLowerDvinaTracePublicScreen(screen);
  } catch {
    throw phase2IntegrityError();
  }
  if (canonicalDigest(screen) !== openingScreenDigest) {
    throw phase2IntegrityError();
  }
  const visibleContext = screen.visible_context;
  const presented = scenePresentation == null ? null : scenePresentationForLocation({
    scenePresentation, locationRef: initialState?.position?.location_ref
  });
  const environmentFacts = presented?.player_visible_physical_facts
    ?? visibleContext?.environment?.facts;
  const visibleNpc = (initialState?.npcs ?? []).filter((npc) =>
    npc.anchor_id === initialState?.position?.g5_anchor_id).map((npc) => ({
      entity_ref: { entity_kind: 'npc', entity_id: npc.instance_id },
      display_label: npc.profile_level === 'background'
        ? npc.identity_state?.public_role_label ?? 'незнакомый человек'
        : npc.identity_state?.canonical_name
          ?? npc.identity_state?.public_role_label ?? 'человек',
      recognition: npc.profile_level === 'background'
        ? 'unrecognized' : 'recognized',
      visible_status: npc.machine_state?.current_activity?.summary ?? 'рядом',
      ...(npc.identity_state?.appearance == null ? {} : {
        observable_cues: { identity: {
          display_name: npc.identity_state?.public_role_label,
          sex_category: npc.identity_state?.sex_category,
          age_category: npc.identity_state?.age_category,
          appearance: structuredClone(npc.identity_state.appearance)
        }, equipment: visibleNpcEquipment(initialState, npc.instance_id),
        outward_presentation: {} }
      })
    }));
  return requirePhase2CurrentVisibleContext({
    version: 1,
    schema: 'visible_context_package',
    visible_scene: presented?.display_name ?? visibleContext?.place,
    visible_changes: [],
    sensory_details: Array.isArray(environmentFacts)
      ? environmentFacts.filter((value) =>
          typeof value === 'string' && value.length > 0)
      : [],
    visible_npc: visibleNpc,
    visible_objects: visibleInitialItems(initialState),
    known_context: [presented?.display_name ?? visibleContext?.place]
      .filter((value) => typeof value === 'string' && value.length > 0),
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: []
  });
}

function visibleInitialItems(state) {
  const actorId = state?.actor_id;
  const anchorId = state?.position?.g5_anchor_id;
  return (state?.items ?? []).filter((item) =>
    item.placement?.container_id == null
      && (item.placement?.holder_character_id === actorId
        || item.placement?.anchor_id === anchorId))
    .map((item) => ({ entity_ref: { entity_kind: 'item',
      entity_id: item.item_id },
    display_label: item.state?.display_name ?? item.template_id,
    recognition: 'known', visible_status: item.condition_state }));
}

function visibleNpcEquipment(state, npcId) {
  return (state?.items ?? []).filter((item) =>
    item.placement?.holder_npc_id === npcId
      && item.placement?.container_id == null).map((item) => ({
    item_ref: item.item_id,
    display_label: item.state?.display_name ?? item.template_id,
    physical_position: item.placement?.physical_position,
    ...(item.placement?.equipment_slot_category_id == null ? {} : {
      equipment_slot_category_id: item.placement.equipment_slot_category_id
    }),
    ...(item.state?.visual_profile_snapshot == null ? {} : {
      visual_profile_snapshot: structuredClone(
        item.state.visual_profile_snapshot)
    })
  }));
}

export function requirePhase2CurrentVisibleContext(value) {
  const validation = validateVisibleContext(value);
  if (!validation.ok
      || ARRAY_FIELDS.some((field) => !Array.isArray(value?.[field]))) {
    throw phase2IntegrityError();
  }
  return structuredClone(value);
}

export function withPhase2CurrentVisibleContext(state, currentVisibleContext) {
  return {
    ...state,
    current_visible_context:
      requirePhase2CurrentVisibleContext(currentVisibleContext)
  };
}

export function withoutPhase2CurrentVisibleContext(state) {
  delete state.current_visible_context;
  return state;
}
