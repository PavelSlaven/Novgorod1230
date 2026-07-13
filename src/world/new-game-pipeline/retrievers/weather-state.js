export const WEATHER_STATE_SCHEMA = 'weather_state';

const WEATHER_KINDS = new Set(['clear','cloudy','rain','snow','fog','storm','wind','thaw','frost','unknown']);
const TEMPERATURE_BANDS = new Set(['severe_cold','cold','cool','mild','warm','hot','unknown']);
const PRECIPITATION = new Set(['none','rain','snow','sleet','hail','unknown']);
const WINDS = new Set(['none','weak','moderate','strong','dangerous','unknown']);
const VISIBILITY = new Set(['none','reduced','heavily_reduced','blocked','unknown']);
const GROUND = new Set(['dry','wet','mud','snow','ice','flooded','unknown']);
const SOURCES = new Set(['regional_rule','event_state','generated_and_audited','unknown']);

export function validateWeatherState(value) {
  const concerns = [];
  if (!isObject(value)) return [issue('WEATHER_STATE_INVALID','weather_state must be an object.','weather_state')];
  if (value.version !== 1) concerns.push(issue('WEATHER_STATE_SCHEMA_MISMATCH','weather_state.version must be 1.','version'));
  if (value.schema !== WEATHER_STATE_SCHEMA) concerns.push(issue('WEATHER_STATE_SCHEMA_MISMATCH','weather_state.schema must be weather_state.','schema'));
  checkEnum(concerns, value.weather_kind, WEATHER_KINDS, 'weather_kind');
  checkEnum(concerns, value.temperature_band, TEMPERATURE_BANDS, 'temperature_band');
  checkEnum(concerns, value.precipitation, PRECIPITATION, 'precipitation');
  checkEnum(concerns, value.wind, WINDS, 'wind');
  checkEnum(concerns, value.visibility_weather_modifier, VISIBILITY, 'visibility_weather_modifier');
  checkEnum(concerns, value.ground_state, GROUND, 'ground_state');
  checkEnum(concerns, value.weather_source, SOURCES, 'weather_source');
  if (value.audit?.pass === false) concerns.push(issue('WEATHER_STATE_AUDIT_FAILED','weather_state audit must pass.','audit.pass'));
  return concerns;
}

export async function retrieveWeatherState(input = {}, { resolver, provided = null } = {}) {
  const candidate = provided ?? (typeof resolver === 'function' ? await resolver(structuredClone(input)) : null);
  if (!candidate) {
    const error = new Error('weather_state_retriever requires a provided weather_state or resolver.');
    error.semanticRecoveryRoute = { repair_kind:'retrieval', return_to_stage:'weather_state_retriever', rerun_from_stage:17, reason_code:'WEATHER_STATE_MISSING' };
    throw error;
  }
  const concerns = validateWeatherState(candidate);
  if (concerns.length > 0) {
    const error = new Error('weather_state_retriever returned invalid weather_state.');
    error.lifecycle = { stage_id:17, stage_slug:'weather_state_retriever', failed_gate:'structural_validation', concerns, terminal_status:'stage_failed' };
    error.semanticRecoveryRoute = { repair_kind:'retrieval', return_to_stage:'weather_state_retriever', rerun_from_stage:17, reason_code:'WEATHER_STATE_INVALID' };
    throw error;
  }
  return structuredClone(candidate);
}

function checkEnum(concerns, value, allowed, field) {
  if (!allowed.has(value)) concerns.push(issue('WEATHER_STATE_SCHEMA_MISMATCH', `${field} has an invalid value.`, field, [...allowed], value));
}
function issue(code, message, field, expected = null, actual = null) { return { code, message, field, expected, actual }; }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
