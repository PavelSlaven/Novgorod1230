import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomSource, deriveApprovedInitialEnvironment, projectApprovedCurrentEnvironment } from '../src/index.js';

const calendar = { family_id: 'calendar_daylight_light_profiles',
  status: 'approved', payload: { calendar_profile_id: 'calendar',
    daylight_profile_id: 'daylight', daylight_boundary_rules: {
      year_daily_boundaries: { '1230': { '08-20': {
        civil_dawn_minute_of_day: '250', sunrise_minute_of_day: '300',
        sunset_minute_of_day: '1100', civil_dusk_minute_of_day: '1150' } } } },
    season_rule: { winter_months: ['12','1','2'],
      spring_months: ['3','4','5'], summer_months: ['6','7','8'],
      autumn_months: ['9','10','11'] } } };
const weather = { family_id: 'weather_transition_profiles_processes',
  status: 'approved', payload: { weather_profile_id: 'weather',
    region_season_applicability: { calendar_seasons: { summer: ['6','7','8'] } },
    weather_states: [{ weather_state_id: 'clear', sky: 'clear' },
      { weather_state_id: 'rain', sky: 'overcast' }], transition_rules: {
      seasonal_candidates: { summer: [{ weather_state_id: 'clear', weight: '2',
        weather_state_ref: { entity_ref: { entity_kind: 'weather_state',
          entity_id: 'clear' }, authoring_version: '1' } },
      { weather_state_id: 'rain', weight: '1', weather_state_ref: {
        entity_ref: { entity_kind: 'weather_state', entity_id: 'rain' },
        authoring_version: '1' } }] } } } };

test('initial environment derives exact daylight and weighted weather from owners', () => {
  const input = { calendar_record: calendar, weather_record: weather,
    calendar_date: { year: 1230, month: 8, day: 20 },
    local_minute_of_day: 420 };
  const left = deriveApprovedInitialEnvironment({ ...input,
    random: createRandomSource({ seed: 4 }) });
  const right = deriveApprovedInitialEnvironment({ ...input,
    random: createRandomSource({ seed: 4 }) });
  assert.deepEqual(left, right);
  assert.equal(left.light_state, 'daylight');
  assert.equal(left.day_part, 'daylight');
  assert.equal(left.season, 'summer');
  assert.ok(['clear','rain'].includes(left.weather_state.weather_state_id));
});

test('initial environment fails closed outside approved daylight coverage', () => {
  assert.throws(() => deriveApprovedInitialEnvironment({ calendar_record: calendar,
    weather_record: weather, calendar_date: { year: 1234, month: 8, day: 20 },
    local_minute_of_day: 420, random: createRandomSource({ seed: 1 }) }),
  { code: 'INITIAL_ENVIRONMENT_DAYLIGHT_DATA_GAP' });
});

test('current calendar projection preserves exact committed weather without a new draw', () => {
  const calendar_record = { ...calendar, record_id: 'calendar-record', version: 1 };
  const weather_record = { ...weather, record_id: 'weather-record', version: 1 };
  const args = { calendar_record, weather_record, calendar_date: { year: 1230, month: 8, day: 20 } };
  const initial = deriveApprovedInitialEnvironment({ ...args, local_minute_of_day: 420,
    random: createRandomSource({ seed: 4 }) });
  const projected = projectApprovedCurrentEnvironment({ ...args, current_environment: initial, local_minute_of_day: 1200 });
  assert.equal(projected.light_state, 'night');
  assert.equal(initial.light_state, 'daylight');
  assert.deepEqual(projected.weather_state, initial.weather_state);
  assert.equal(projected.rng_draw, initial.rng_draw);
  for (const current_environment of [null, { ...initial, weather_record_ref: { id: 'foreign', version: 1 } },
    { ...initial, weather_state: { ...initial.weather_state, sky: 'invented' } }]) {
    assert.throws(() => projectApprovedCurrentEnvironment({ ...args, current_environment, local_minute_of_day: 1200 }),
      { code: 'CURRENT_ENVIRONMENT_OWNER_DATA_GAP' });
  }
});
