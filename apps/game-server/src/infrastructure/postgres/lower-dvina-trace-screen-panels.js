import { createPeoplePanel, createCharacterPanel, createRoutePanel } from '@rus/presentation';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { projectTraceInventoryPanel } from './lower-dvina-trace-screen-inventory.js';

import { projectLowerDvinaTracePlayerSafeState } from
  '../../runtime/lower-dvina-trace-player-safe-state.js';

export function projectLowerDvinaTraceScreenPanels({ payload, screen, presentation = null }) {
  const { actor, player_safe_state: projection } = projectLowerDvinaTracePlayerSafeState({
    committed_state: screen.visible_context == null ? payload : {
      ...payload,
      current_visible_context: screen.visible_context
    },
    actor_id: payload.actor_id
  });
  const activeInterlocutor = projection.active_interlocutor ?? null;
  const panels = structuredClone(screen.panels ?? {});
  const previousPeople = panels.people;
  const peopleData = plain(previousPeople?.data)
    ? structuredClone(previousPeople.data) : {};
  delete peopleData.active_interlocutor;
  delete peopleData.visible_npcs;
  const nearbyNpcIds = new Set((projection.npcs ?? []).map((npc) =>
    npc.instance_id ?? npc.actor_id ?? npc.npc_id).filter(Boolean));
  const visibleNpcs = (projection.current_visible_context?.visible_npc ?? [])
    .filter((npc) => nearbyNpcIds.has(npc.entity_ref?.entity_id));
  if (visibleNpcs.length > 0) {
    peopleData.visible_npcs = visibleNpcs.map((npc) => ({
      display_label: npc.display_label,
      ...(typeof npc.visible_status === 'string'
        ? { status: npc.visible_status } : {})
    }));
  }
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
  if (actor.body != null || actor.name != null) panels.character = createCharacterPanel(Object.fromEntries(Object.entries({
    name: actor.name, role: actor.role, health: actor.body?.health,
    biography: actor.biography,
    memories: [...(actor.memory ?? []).map(record => typeof record === 'string' ? record : record.text),
      ...(projection.interactions ?? []).map(record => record.content)].filter(Boolean).join('\n'),
    knowledge: projection.knowledge?.map(record => typeof record === 'string' ? record : record.text).filter(Boolean).join('\n'),
    energy: actor.body?.energy, satiety: actor.body?.satiety,
    status: actor.body?.active_conditions?.map(condition => condition.label)
      .filter(Boolean).join('; ') || undefined
  }).filter(([, value]) => value !== undefined)));
  const inventory = projectTraceInventoryPanel({ payload, projection,
    itemLabels: presentation?.itemLabels ?? {} });
  if (inventory != null) panels.inventory = inventory;
  const visibleContext = {};
  const location = presentation?.scenePresentation?.locations.find(
    ({ location_ref: ref }) => ref === projection.position?.location_ref);
  const place = location?.display_name ?? projection.current_visible_context?.visible_scene;
  if (place) visibleContext.location_label = place;
  if (projection.clock != null && presentation?.calendarProfile != null) {
    const calendar = projectCalendar(projection.clock, presentation.calendarProfile);
    const minutes = BigInt(calendar.local_time_of_day.numerator)
      / BigInt(calendar.local_time_of_day.denominator);
    visibleContext.date_label = `${calendar.day}.${calendar.month}.${calendar.year}`;
    visibleContext.time_label = `${String(minutes / 60n).padStart(2, '0')}:${String(minutes % 60n).padStart(2, '0')}`;
  }
  if (place) {
    const routes = [...(projection.routes ?? []), ...(projection.available_routes ?? [])]
      .filter(route => route.from_ref === projection.position?.location_ref && route.label);
    panels.route = createRoutePanel({ current_place: place, movement: {
      options: routes.map(route => ({ label: route.label,
        knowledge_state: route.known === true ? 'known' : 'uncertain' }))
    } });
  }
  const projected = { ...screen, presentation_context: visibleContext, panels };
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
