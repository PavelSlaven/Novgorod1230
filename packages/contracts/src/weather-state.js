export const WEATHER_STATE_SCHEMA = 'weather_state';
export const WEATHER_KINDS = Object.freeze(['clear','cloudy','rain','snow','fog','storm','wind','thaw','frost','unknown']);
export const TEMPERATURE_BANDS = Object.freeze(['severe_cold','cold','cool','mild','warm','hot','unknown']);
export const PRECIPITATION_KINDS = Object.freeze(['none','rain','snow','sleet','hail','unknown']);
export const WIND_BANDS = Object.freeze(['none','weak','moderate','strong','dangerous','unknown']);
export const VISIBILITY_WEATHER_MODIFIERS = Object.freeze(['none','reduced','heavily_reduced','blocked','unknown']);
export const GROUND_STATES = Object.freeze(['dry','wet','mud','snow','ice','flooded','unknown']);
export const WEATHER_SOURCES = Object.freeze(['regional_rule','event_state','generated_and_audited','unknown']);

export function validateWeatherState(value) {
  const concerns = [];
  if (!isObject(value)) return [issue('WEATHER_STATE_INVALID','weather_state must be an object.','weather_state')];
  if (value.version !== 1) concerns.push(issue('WEATHER_STATE_SCHEMA_MISMATCH','weather_state.version must be 1.','version'));
  if (value.schema !== WEATHER_STATE_SCHEMA) concerns.push(issue('WEATHER_STATE_SCHEMA_MISMATCH','weather_state.schema must be weather_state.','schema'));
  checkEnum(concerns, value.weather_kind, WEATHER_KINDS, 'weather_kind');
  checkEnum(concerns, value.temperature_band, TEMPERATURE_BANDS, 'temperature_band');
  checkEnum(concerns, value.precipitation, PRECIPITATION_KINDS, 'precipitation');
  checkEnum(concerns, value.wind, WIND_BANDS, 'wind');
  checkEnum(concerns, value.visibility_weather_modifier, VISIBILITY_WEATHER_MODIFIERS, 'visibility_weather_modifier');
  checkEnum(concerns, value.ground_state, GROUND_STATES, 'ground_state');
  checkEnum(concerns, value.weather_source, WEATHER_SOURCES, 'weather_source');
  if (value.audit?.pass === false) concerns.push(issue('WEATHER_STATE_AUDIT_FAILED','weather_state audit must pass.','audit.pass'));
  return concerns;
}
function checkEnum(concerns, value, allowed, field) { if (!allowed.includes(value)) concerns.push(issue('WEATHER_STATE_SCHEMA_MISMATCH', `${field} has an invalid value.`, field, allowed, value)); }
function issue(code, message, field, expected = null, actual = null) { return { code, message, field, expected, actual }; }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
