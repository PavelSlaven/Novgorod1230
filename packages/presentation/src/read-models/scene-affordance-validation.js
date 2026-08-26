import { validatePortraitSpecV1 } from '@rus/contracts';

const INTERLOCUTOR_KEYS = new Set([
  'entity_ref', 'display_label', 'role_label', 'portrait_asset_id', 'portrait_spec_v1'
]);
const ENTITY_REF_KEYS = new Set(['entity_kind', 'entity_id']);
const PLAYER_SAFE_ENVIRONMENT_PROFILES = new Set([
  'env.local_variable', 'env.main_river_channel', 'env.side_channel',
  'env.land_path', 'env.forest_track', 'env.wetland', 'env.offroad',
  'env.shore_transition', 'trace_ld_v1_env_cold_wet_shore'
]);
const NODE_CATEGORIES = new Set([
  'spatial.g3.natural_feature', 'spatial.g3.route_site',
  'spatial.g3.settlement', 'spatial.g3.built_site',
  'spatial.g3.resource_site', 'spatial.g3.recurrent_site'
]);
const ENVIRONMENT_FACTS = new Set(['cold', 'wet', 'exposed']);
const WEATHER = vocabulary([
  ['clear', 'ясно'], ['cloudy', 'облачно'], ['overcast', 'пасмурно'],
  ['rain', 'дождь'], ['snow', 'снег'], ['fog', 'туман']
]);
const DAY_PART = vocabulary([
  ['dawn', 'рассвет'], ['morning', 'утро'], ['day', 'день'],
  ['evening', 'вечер'], ['dusk', 'сумерки'], ['night', 'ночь']
]);

export function sceneAffordancePanelErrors(panels) {
  if (!plain(panels)) return [];
  const errors = [];
  const journal = panels.journal?.data;
  if (plain(journal) && Object.hasOwn(journal, 'current_task')
      && !nonEmptyText(journal.current_task)) {
    errors.push('journal current_task must be a non-empty string');
  }
  const people = panels.people?.data;
  if (plain(people) && Object.hasOwn(people, 'active_interlocutor')
      && !validActiveInterlocutor(people.active_interlocutor)) {
    errors.push('people active_interlocutor is invalid');
  }
  return errors;
}

export function sceneAffordanceContextErrors(context) {
  if (!plain(context)) return ['visible_context must be an object'];
  const errors = [];
  if (Object.hasOwn(context, 'location_ref')) {
    errors.push('location_ref has no approved player-safe owner');
  }
  const environment = context.environment;
  if (environment != null && !plain(environment)) {
    errors.push('environment must be an object');
    return errors;
  }
  if (plain(environment)
      && Object.hasOwn(environment, 'profile_id')
      && !PLAYER_SAFE_ENVIRONMENT_PROFILES.has(environment.profile_id)) {
    errors.push('environment profile_id is not player-safe');
  }
  if (plain(environment)
      && Object.hasOwn(environment, 'node_category')
      && !NODE_CATEGORIES.has(environment.node_category)) {
    errors.push('environment node_category is invalid');
  }
  if (plain(environment) && Object.hasOwn(environment, 'facts')
      && (!Array.isArray(environment.facts)
        || environment.facts.some((fact) => !ENVIRONMENT_FACTS.has(fact)))) {
    errors.push('environment facts are invalid');
  }
  if (Object.hasOwn(context, 'weather')
      && !vocabularyValue(context.weather, WEATHER)) {
    errors.push('weather is invalid');
  }
  if (Object.hasOwn(context, 'day_part')
      && !vocabularyValue(context.day_part, DAY_PART)) {
    errors.push('day_part is invalid');
  }
  return errors;
}

export function assertJournalPanelAffordances(data) {
  if (!plain(data)) return;
  if (Object.hasOwn(data, 'current_task') && !nonEmptyText(data.current_task)) {
    throw presentationError(
      'PRESENTATION_CURRENT_TASK_INVALID',
      'Journal current_task must be a non-empty string.'
    );
  }
}

export function assertPeoplePanelAffordances(data) {
  if (!plain(data)) return;
  if (Object.hasOwn(data, 'active_interlocutor')
      && !validActiveInterlocutor(data.active_interlocutor)) {
    throw presentationError(
      'PRESENTATION_ACTIVE_INTERLOCUTOR_INVALID',
      'People active_interlocutor must use the exact player-safe shape.'
    );
  }
}

function validActiveInterlocutor(value) {
  if (!plain(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !INTERLOCUTOR_KEYS.has(key))
      || !keys.includes('entity_ref')
      || !keys.includes('display_label')
      || !exactEntityRef(value.entity_ref)
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

function exactEntityRef(value) {
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

function presentationError(code, message) {
  return Object.assign(new TypeError(message), { code });
}

function vocabulary(rows) {
  return new Set(rows.flat());
}

function vocabularyValue(value, values) {
  return typeof value === 'string'
    && values.has(value.trim().toLocaleLowerCase('ru'));
}
