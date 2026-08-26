import { createPeoplePanel } from '@rus/presentation';
import { runtimeItemRecordIsConcealed } from '@rus/items-property';
import { projectActiveConversationInterlocutor } from
  '@rus/visibility-knowledge-memory';

import { projectLowerDvinaTracePlayerSafeState } from
  '../../runtime/lower-dvina-trace-player-safe-state.js';

export function projectLowerDvinaTraceScreenPanels({ payload, screen }) {
  const projection = projectLowerDvinaTracePlayerSafeState({
    committed_state: payload,
    actor_id: payload.actor_id
  }).player_safe_state;
  const activeInterlocutor = projectActiveConversationInterlocutor({
    conversation_sessions: payload.conversation_sessions ?? [],
    player_ref: {
      entity_kind: 'player_character', entity_id: payload.actor_id
    },
    current_location_ref: projection.position?.location_ref,
    visible_npcs: playerSafeDisplayNamedNpcs({
      projectedNpcs: projection.npcs,
      visibleNpcs: screen.visible_context?.visible_npc,
      committedNpcs: payload.npcs,
      committedItems: payload.items
    })
  });
  const panels = structuredClone(screen.panels ?? {});
  const previousPeople = panels.people;
  const peopleData = plain(previousPeople?.data)
    ? structuredClone(previousPeople.data) : {};
  delete peopleData.active_interlocutor;
  if (activeInterlocutor !== null) {
    peopleData.active_interlocutor = decorateActiveInterlocutor({
      activeInterlocutor, committedNpcs: payload.npcs
    });
  }
  if (Object.keys(peopleData).length > 0) {
    panels.people = createPeoplePanel(peopleData, {
      visible: activeInterlocutor !== null || previousPeople?.visible !== false
    });
  } else {
    delete panels.people;
  }
  const projected = { ...screen, panels };
  const sceneAssetId = sceneAssetFor(projection.position);
  if (sceneAssetId === null) delete projected.scene_asset_id;
  else projected.scene_asset_id = sceneAssetId;
  return projected;
}

const SCENE_ASSET_BY_LOCATION = new Map([
  ['trace_ld_v1_loc_wreck_shore', 'lower-dvina-wreck-shore'],
  ['trace_ld_v1_loc_fishing_camp', 'lower-dvina-fishing-camp'],
  ['trace_ld_v1_loc_old_drying_shed', 'lower-dvina-old-drying-shed-exterior'],
  ['trace_ld_v1_loc_zhdanko_storehouse', 'lower-dvina-zhdanko-storehouse-exterior']
]);
const SCENE_ASSET_BY_ZONE = new Map([
  ['fire_rest_area', 'lower-dvina-fishing-camp-firepit'],
  ['shed_interior', 'lower-dvina-old-drying-shed-interior'],
  ['storehouse_interior', 'lower-dvina-zhdanko-storehouse-interior'],
  ['river_access', 'lower-dvina-zhdanko-river-descent']
]);
const PORTRAIT_ASSET_BY_SLOT = new Map([
  ['player_clerk', 'lower-dvina-mikula'],
  ['onisim_boatman', 'lower-dvina-onisim'],
  ['eremey_fisher', 'lower-dvina-eremey'],
  ['ratsha_storehouse_helper', 'lower-dvina-ratsha'],
  ['zhdanko_storehouse_controller', 'lower-dvina-zhdanko'],
  ['background_fisher_1', 'lower-dvina-fisher-1'],
  ['background_fisher_2', 'lower-dvina-fisher-2']
]);

function sceneAssetFor(position) {
  return SCENE_ASSET_BY_ZONE.get(position?.zone_ref)
    ?? SCENE_ASSET_BY_LOCATION.get(position?.location_ref) ?? null;
}

function decorateActiveInterlocutor({ activeInterlocutor, committedNpcs }) {
  const result = structuredClone(activeInterlocutor);
  const entityId = result.entity_ref?.entity_id;
  const matches = (committedNpcs ?? []).filter((npc) =>
    [npc?.instance_id, npc?.actor_id, npc?.npc_id].includes(entityId));
  const portraitAssetId = matches.length === 1
    ? PORTRAIT_ASSET_BY_SLOT.get(matches[0].participant_slot_ref)
    : null;
  if (portraitAssetId == null) delete result.portrait_asset_id;
  else result.portrait_asset_id = portraitAssetId;
  return result;
}

function playerSafeDisplayNamedNpcs({ projectedNpcs, visibleNpcs,
  committedNpcs, committedItems }) {
  if (!Array.isArray(projectedNpcs)) return [];
  const labels = Array.isArray(visibleNpcs) ? visibleNpcs : [];
  return projectedNpcs.map((npc) => {
    const ids = [npc?.instance_id, npc?.actor_id, npc?.npc_id]
      .filter(nonEmptyText);
    const publicNames = labels.filter((visibleNpc) =>
      visibleNpc?.entity_ref?.entity_kind === 'npc'
        && ids.includes(visibleNpc.entity_ref.entity_id)
        && nonEmptyText(visibleNpc.display_label))
      .map(({ display_label: displayLabel }) => displayLabel.trim());
    if (publicNames.length !== 1) return null;
    const committedMatches = (committedNpcs ?? []).filter((candidate) =>
      ids.some((id) => [candidate?.instance_id, candidate?.actor_id,
        candidate?.npc_id].includes(id)));
    const committed = committedMatches.length === 1 ? committedMatches[0] : null;
    return {
      instance_id: npc.instance_id,
      actor_id: npc.actor_id,
      npc_id: npc.npc_id,
      identity_state: sanitizeActorIdentity(
        committed?.identity_state, publicNames[0]),
      visible_equipment: sanitizeVisibleEquipment(committedItems, ids),
      presentation: sanitizePresentation(committed?.player_safe_presentation)
    };
  }).filter(Boolean);
}

function sanitizeActorIdentity(value, displayName) {
  return {
    display_name: displayName,
    sex_category: textValue(value?.sex_category),
    age_category: textValue(value?.age_category),
    appearance: {
      build: textValue(value?.appearance?.build),
      skin_tone: textValue(value?.appearance?.skin_tone),
      face_shape: textValue(value?.appearance?.face_shape),
      hair: {
        color: textValue(value?.appearance?.hair?.color),
        length: textValue(value?.appearance?.hair?.length),
        style: textValue(value?.appearance?.hair?.style),
        facial_hair: textValue(value?.appearance?.hair?.facial_hair)
      },
      eyes: { color: textValue(value?.appearance?.eyes?.color) }
    }
  };
}

function sanitizeVisibleEquipment(items, npcIds) {
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
      visual_profile_snapshot: sanitizeVisualProfile(snapshot)
    };
  }).filter((item) => item.visual_profile_snapshot !== null);
}

function sanitizeVisualProfile(value) {
  if (!plain(value)) return null;
  return {
    schema: textValue(value.schema), version: Number(value.version),
    equipment_slot: textValue(value.equipment_slot),
    neckline: textValue(value.neckline),
    sleeve_form: textValue(value.sleeve_form),
    outer_form: textValue(value.outer_form),
    visible_fabric: textValue(value.visible_fabric),
    trim: textValue(value.trim),
    main_visible_color: textValue(value.main_visible_color),
    secondary_visible_color: textValue(value.secondary_visible_color),
    headwear_kind: textValue(value.headwear_kind)
  };
}

function sanitizePresentation(value) {
  if (!plain(value)) return {};
  return Object.fromEntries(['emotion', 'intensity', 'gaze', 'body_pose',
    'head_pose', 'background'].map((key) => [key, textValue(value[key])])
    .filter(([, value]) => value !== null));
}

function textValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
