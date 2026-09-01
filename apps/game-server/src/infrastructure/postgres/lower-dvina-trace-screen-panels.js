import { createPeoplePanel } from '@rus/presentation';

import { projectLowerDvinaTracePlayerSafeState } from
  '../../runtime/lower-dvina-trace-player-safe-state.js';

export function projectLowerDvinaTraceScreenPanels({ payload, screen }) {
  const projection = projectLowerDvinaTracePlayerSafeState({
    committed_state: payload,
    actor_id: payload.actor_id
  }).player_safe_state;
  const activeInterlocutor = projection.active_interlocutor ?? null;
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

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
