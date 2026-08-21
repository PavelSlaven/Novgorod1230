import { validatePortraitSpecV1 } from '../portrait-lab/contract.js';

const INTERLOCUTOR_KEYS = new Set([
  'entity_ref', 'display_label', 'role_label', 'portrait_asset_id',
  'portrait_spec_v1'
]);
const ENTITY_REF_KEYS = new Set(['entity_kind', 'entity_id']);
export const LANDSCAPE_ENVIRONMENT_PROFILES = Object.freeze([
  'env.local_variable',
  'env.main_river_channel',
  'env.side_channel',
  'env.land_path',
  'env.forest_track',
  'env.wetland',
  'env.offroad',
  'env.shore_transition'
]);
export const LANDSCAPE_NODE_CATEGORIES = Object.freeze([
  'spatial.g3.natural_feature',
  'spatial.g3.route_site',
  'spatial.g3.settlement',
  'spatial.g3.built_site',
  'spatial.g3.resource_site',
  'spatial.g3.recurrent_site'
]);

const ENVIRONMENT_PROFILE = new Map([
  ...LANDSCAPE_ENVIRONMENT_PROFILES.map((profile) => [profile, profile]),
  ['trace_ld_v1_env_cold_wet_shore', 'env.shore_transition']
]);
const NODE_CATEGORIES = new Set(LANDSCAPE_NODE_CATEGORIES);
const ENVIRONMENT_FACTS = new Set(['cold', 'wet', 'exposed']);
const WEATHER = vocabulary([
  ['clear', 'ясно'], ['cloudy', 'облачно'], ['overcast', 'пасмурно'],
  ['rain', 'дождь'], ['snow', 'снег'], ['fog', 'туман']
]);
const DAY_PART = vocabulary([
  ['dawn', 'рассвет'], ['morning', 'утро'], ['day', 'день'],
  ['evening', 'вечер'], ['dusk', 'сумерки'], ['night', 'ночь']
]);

export function validCurrentTask(value) {
  return nonEmptyText(value);
}

export function validActiveInterlocutor(value) {
  if (!plain(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !INTERLOCUTOR_KEYS.has(key))
      || !keys.includes('entity_ref')
      || !keys.includes('display_label')
      || !exactNpcRef(value.entity_ref)
      || !nonEmptyText(value.display_label)) {
    return false;
  }
  if (Object.hasOwn(value, 'role_label')
      && !nonEmptyText(value.role_label)) return false;
  if (Object.hasOwn(value, 'portrait_asset_id')
      && !nonEmptyText(value.portrait_asset_id)) return false;
  return !Object.hasOwn(value, 'portrait_spec_v1')
    || validatePortraitSpecV1(value.portrait_spec_v1).length === 0;
}

export function validLandscapeContext(value) {
  if (!plain(value)) return false;
  if (Object.hasOwn(value, 'location_ref')) return false;
  const environment = value.environment;
  if (environment != null && !plain(environment)) return false;
  if (plain(environment)
      && Object.hasOwn(environment, 'profile_id')
      && normalizeLandscapeEnvironmentProfile(environment.profile_id) == null) {
    return false;
  }
  if (plain(environment)
      && Object.hasOwn(environment, 'node_category')
      && !NODE_CATEGORIES.has(environment.node_category)) return false;
  if (plain(environment) && Object.hasOwn(environment, 'facts')
      && (!Array.isArray(environment.facts)
        || environment.facts.some((fact) => !ENVIRONMENT_FACTS.has(fact)))) {
    return false;
  }
  return (!Object.hasOwn(value, 'weather')
      || normalizeLandscapeWeather(value.weather) != null)
    && (!Object.hasOwn(value, 'day_part')
      || normalizeLandscapeDayPart(value.day_part) != null);
}

export function normalizeLandscapeWeather(value) {
  return normalizedVocabularyValue(value, WEATHER);
}

export function normalizeLandscapeEnvironmentProfile(value) {
  return ENVIRONMENT_PROFILE.get(value) ?? null;
}

export function normalizeLandscapeDayPart(value) {
  return normalizedVocabularyValue(value, DAY_PART);
}

function exactNpcRef(value) {
  return plain(value)
    && Object.keys(value).length === ENTITY_REF_KEYS.size
    && Object.keys(value).every((key) => ENTITY_REF_KEYS.has(key))
    && value.entity_kind === 'npc'
    && nonEmptyText(value.entity_id);
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function vocabulary(rows) {
  return new Map(rows.flatMap(([canonical, russian]) => [
    [canonical, canonical], [russian, canonical]
  ]));
}

function normalizedVocabularyValue(value, values) {
  if (typeof value !== 'string') return null;
  return values.get(value.trim().toLocaleLowerCase('ru')) ?? null;
}
