import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, MaterializationError } from './core.js';
import { weightedCandidate } from './world-validation.js';

export function deriveApprovedInitialEnvironment({ calendar_record: calendar,
  weather_record: weather, calendar_date: date, local_minute_of_day: minute,
  random } = {}) {
  const resolved = resolveCalendarEnvironment({ calendar, weather, date, minute });
  const { season } = resolved;
  const candidates = weather.payload?.transition_rules?.seasonal_candidates?.[season];
  if (!Array.isArray(candidates) || candidates.length === 0
      || typeof random?.nextUint32 !== 'function') gap('INITIAL_ENVIRONMENT_WEATHER_DATA_GAP');
  const normalized = candidates.map((candidate) => ({ ...candidate,
    weight: Number(candidate.weight) })).sort((a, b) =>
    a.weather_state_id.localeCompare(b.weather_state_id));
  if (normalized.some(({ weight }) => !Number.isSafeInteger(weight)
      || weight <= 0)) gap('INITIAL_ENVIRONMENT_WEATHER_DATA_GAP');
  const draw = random.nextUint32();
  const selected = weightedCandidate(normalized, draw);
  const state = weather.payload.weather_states?.find(({ weather_state_id: id }) =>
    id === selected.weather_state_id);
  if (!state) gap('INITIAL_ENVIRONMENT_WEATHER_DATA_GAP');
  return deepFreeze({ ...resolved, weather_state: structuredClone(state),
    weather_candidate_ref: structuredClone(selected.weather_state_ref), rng_draw: draw });
}

/** Calendar projection of current committed weather; this never advances weather. */
export function projectApprovedCurrentEnvironment({ calendar_record: calendar,
  weather_record: weather, current_environment: current,
  calendar_date: date, local_minute_of_day: minute } = {}) {
  if (current?.schema !== 'rus.approved_initial_environment.v1' || current.version !== 1
    || !calendar?.record_id || !weather?.record_id
    || current.calendar_record_ref?.id !== calendar.record_id
    || String(current.calendar_record_ref?.version) !== String(calendar.version)
    || current.weather_record_ref?.id !== weather.record_id
    || String(current.weather_record_ref?.version) !== String(weather.version)) {
    gap('CURRENT_ENVIRONMENT_OWNER_DATA_GAP');
  }
  const states = weather.payload?.weather_states?.filter((state) =>
    state.weather_state_id === current.weather_state?.weather_state_id) ?? [];
  if (states.length !== 1 || canonicalDigest(states[0]) !== canonicalDigest(current.weather_state)) {
    gap('CURRENT_ENVIRONMENT_OWNER_DATA_GAP');
  }
  return deepFreeze({ ...structuredClone(current),
    ...resolveCalendarEnvironment({ calendar, weather, date, minute }) });
}

function resolveCalendarEnvironment({ calendar, weather, date, minute }) {
  if (calendar?.status !== 'approved' || weather?.status !== 'approved'
      || calendar.family_id !== 'calendar_daylight_light_profiles'
      || weather.family_id !== 'weather_transition_profiles_processes'
      || !Number.isInteger(minute) || minute < 0 || minute >= 1440
      || !Number.isInteger(date?.year) || !Number.isInteger(date?.month)
      || !Number.isInteger(date?.day)) invalid('INITIAL_ENVIRONMENT_INPUT_INVALID');
  const key = `${pad(date.month)}-${pad(date.day)}`;
  const boundary = calendar.payload?.daylight_boundary_rules
    ?.year_daily_boundaries?.[String(date.year)]?.[key];
  if (!boundary) gap('INITIAL_ENVIRONMENT_DAYLIGHT_DATA_GAP');
  const values = ['civil_dawn_minute_of_day','sunrise_minute_of_day',
    'sunset_minute_of_day','civil_dusk_minute_of_day']
    .map((field) => Number(boundary[field]));
  if (!values.every(Number.isSafeInteger)) gap(
    'INITIAL_ENVIRONMENT_DAYLIGHT_DATA_GAP');
  const [dawn, sunrise, sunset, dusk] = values;
  const lightState = minute < dawn || minute >= dusk ? 'night'
    : minute < sunrise ? 'civil_dawn'
      : minute < sunset ? 'daylight' : 'civil_dusk';
  const seasonRules = calendar.payload?.season_rule;
  const seasons = weather.payload?.region_season_applicability?.calendar_seasons;
  const month = String(date.month);
  const calendarMatches = Object.entries({ winter: seasonRules?.winter_months,
    spring: seasonRules?.spring_months, summer: seasonRules?.summer_months,
    autumn: seasonRules?.autumn_months }).filter(([, months]) =>
    Array.isArray(months) && months.includes(month));
  const weatherMatches = Object.entries(seasons ?? {}).filter(([, months]) =>
    Array.isArray(months) && months.includes(month));
  if (calendarMatches.length !== 1 || weatherMatches.length !== 1
      || calendarMatches[0][0] !== weatherMatches[0][0]) {
    gap('INITIAL_ENVIRONMENT_WEATHER_DATA_GAP');
  }
  const [season] = calendarMatches[0];
  return { schema: 'rus.approved_initial_environment.v1', version: 1,
    ...(calendar.record_id == null ? {} : { calendar_record_ref: {
      id: calendar.record_id, version: String(calendar.version) } }),
    ...(weather.record_id == null ? {} : { weather_record_ref: {
      id: weather.record_id, version: String(weather.version) } }),
    calendar_profile_ref: calendar.payload.calendar_profile_id,
    daylight_profile_ref: calendar.payload.daylight_profile_id,
    weather_profile_ref: weather.payload.weather_profile_id,
    calendar_date: structuredClone(date), local_minute_of_day: minute,
    season, day_part: lightState, light_state: lightState,
    daylight_boundary: structuredClone(boundary) };
}

function pad(value) { return String(value).padStart(2, '0'); }
function gap(code) { throw new MaterializationError(code, code); }
function invalid(code) { throw new MaterializationError(code, code); }
