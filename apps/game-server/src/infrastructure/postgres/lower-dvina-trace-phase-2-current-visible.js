import { canonicalDigest } from '@rus/materialization';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { assertLowerDvinaTracePublicScreen } from
  '../../runtime/lower-dvina-trace-opening.js';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { scenePresentationForLocation } from
  '../../runtime/lower-dvina-trace-scene-presentation.js';
import { projectG4NaturalPerception } from '../../runtime/g4-natural-perception.js';
import { serverError } from '../../errors.js';

const ARRAY_FIELDS = [
  'visible_changes', 'sensory_details', 'visible_npc', 'visible_objects',
  'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'
];

export function phase2InitialCurrentVisibleContext({
  screen,
  openingScreenDigest,
  initialState,
  scenePresentation = null,
  canonicalInitialState = false,
  naturalScenePerceptionInput = null
}) {
  try {
    assertLowerDvinaTracePublicScreen(screen);
  } catch {
    throw phase2IntegrityError();
  }
  if (canonicalDigest(screen) !== openingScreenDigest) {
    throw phase2IntegrityError();
  }
  if (canonicalInitialState) {
    const binding = naturalScenePerceptionInput?.canonical_source_binding;
    const currentSceneSource = binding?.schema === 'rus.verified_canonical_scene_natural_source.v1'
      && binding.g5_site_id === naturalScenePerceptionInput.scene?.site_id
      && binding.baseline_id === naturalScenePerceptionInput.scene?.baseline_id
      && typeof binding.source_slot_key === 'string' && binding.source_slot_key.length > 0;
    const initialSource = binding?.schema === 'rus.verified_canonical_initial_natural_source.v1'
      && binding.scenario_id === initialState.scenario_id;
    if ((!currentSceneSource && !initialSource)
      || binding.verified !== true || binding.party_id !== initialState.party_id
      || binding.actor_id !== initialState.actor_id
      || binding.position_id !== initialState.position?.position_id) {
      throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
        'Canonical initial turn projection requires exact current perception.',
        { status: 409, details: { reason: 'canonical_initial_perception_required' } });
    }
    const perception = projectG4NaturalPerception({ input: naturalScenePerceptionInput,
      partyId: initialState.party_id, actorId: initialState.actor_id,
      positionId: initialState.position.position_id });
    return requirePhase2CurrentVisibleContext(perception.visible_context);
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
    visible_changes: initialEnvironmentChange(initialState),
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

function initialEnvironmentChange(state) {
  const value = state?.environment_snapshot;
  if (value?.schema !== 'rus.approved_initial_environment.v1') return [];
  return [{ change_kind: 'environment_state', season: value.season,
    day_part: value.day_part, light_state: value.light_state,
    weather_state_id: value.weather_state?.weather_state_id }];
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

export async function withPhase2CurrentLocalEdges(state, readLocalEdgeDisclosure,
  readCurrentExitDisclosure = null) {
  if (typeof readLocalEdgeDisclosure !== 'function'
    && typeof readCurrentExitDisclosure !== 'function') return state;
  const input = { partyId: state.party_id, actorId: state.actor_id, state };
  const disclosed = typeof readLocalEdgeDisclosure === 'function'
    ? await readLocalEdgeDisclosure(input) : [];
  const exits = typeof readCurrentExitDisclosure === 'function'
    ? await readCurrentExitDisclosure(input) : [];
  const context = requirePhase2CurrentVisibleContext(state.current_visible_context);
  return withPhase2CurrentVisibleContext(state, { ...context,
    visible_objects: [
      ...context.visible_objects.filter((row) =>
        !['scene_movement_edge', 'g4_directional_exit'].includes(row?.entity_ref?.entity_kind)),
      ...disclosed.map(({ edge_id, display_label }) => ({
        entity_ref: { entity_kind: 'scene_movement_edge', entity_id: edge_id },
        display_label, recognition: 'known' })),
      ...exits.map(({ directional_exit_id, display_label }) => ({
        entity_ref: { entity_kind: 'g4_directional_exit', entity_id: directional_exit_id },
        display_label, recognition: 'known' }))
    ] });
}

export function withoutPhase2CurrentVisibleContext(state) {
  delete state.current_visible_context;
  return state;
}
