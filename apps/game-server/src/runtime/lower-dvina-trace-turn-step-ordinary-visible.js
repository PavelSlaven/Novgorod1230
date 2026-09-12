import { materializedOrdinaryPresenceChange } from
  './lower-dvina-trace-turn-step-current-scene.js';
import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';

const ORDINARY_PRESENCE_CHANGES = Object.freeze({
  absent: 'По этому вопросу отсутствие установлено',
  no_change: 'Результат по этому вопросу не установлен',
  authority_required: 'Имеющихся данных недостаточно для ответа'
});
export function ordinarySceneDetails(entries) {
  const seeds = entries.filter(([key]) => key === 'ordinary_scene_seed');
  if (seeds.length === 0) return [];
  if (seeds.length !== 1) ownerFail(
    'TRACE_TURN_STEP_ORDINARY_SCENE_VISIBLE_SEED_INVALID');
  const value = seeds[0][1], details = value?.sensory_details;
  if (!plain(value) || value.kind !== 'ordinary_scene_seed'
      || Object.keys(value).length !== 2 || !Array.isArray(details)
      || details.length === 0 || details.some((detail) => !text(detail))) {
    ownerFail('TRACE_TURN_STEP_ORDINARY_SCENE_VISIBLE_SEED_INVALID');
  }
  return details;
}
export function overlayOrdinaryScene(base, details) {
  if (details.length === 0) return base;
  return deepFreeze({ ...structuredClone(base),
    visible_changes: unique([...base.visible_changes, ...details]),
    sensory_details: unique([...base.sensory_details, ...details]) });
}
export function ordinaryPresenceResolution(entries) {
  const seeds = entries.filter(([key]) => key === 'ordinary_presence_seed');
  if (seeds.length === 0) return null;
  if (seeds.length !== 1) ownerFail(
    'TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
  const value = seeds[0][1];
  if (value?.resolution === 'materialized') {
    materializedOrdinaryPresenceChange(value);
    return value;
  }
  if (!plain(value) || value.kind !== 'ordinary_presence_seed'
      || Object.keys(value).length !== 3
      || typeof value.query !== 'string' || !value.query.trim()
      || !Object.hasOwn(ORDINARY_PRESENCE_CHANGES, value.resolution)) {
    ownerFail('TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
  }
  return value;
}
export function overlayOrdinaryPresence(base, presence) {
  if (presence == null) return base;
  const { resolution, query } = presence;
  const positive = resolution === 'materialized';
  const field = positive || resolution === 'absent'
    ? 'visible_changes' : 'uncertainties';
  const change = positive ? materializedOrdinaryPresenceChange(presence)
    : `${ORDINARY_PRESENCE_CHANGES[resolution]}: «${query}».`;
  return deepFreeze({ ...structuredClone(base), [field]: unique([
    ...(positive && !base[field].includes(change)
      ? [change, ...base[field]] : [...base[field], change])
  ]), do_not_imply: unique([...base.do_not_imply,
    'discovery_query_as_existence_ownership_or_executed_action']) });
}
function unique(values) { return [...new Set(values)]; }
function text(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}
