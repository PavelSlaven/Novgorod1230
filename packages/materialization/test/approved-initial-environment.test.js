import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomSource, deriveApprovedInitialEnvironment } from '../src/index.js';

const calendar = { family_id: 'calendar_daylight_light_profiles',
  status: 'approved', payload: { calendar_profile_id: 'calendar',
    daylight_profile_id: 'daylight', daylight_boundary_rules: {
      year_daily_boundaries: { '1230': { '08-20': {
        civil_dawn_minute_of_day: '250', sunrise_minute_of_day: '300',
        sunset_minute_of_day: '1100', civil_dusk_minute_of_day: '1150' } } } } } };
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
  assert.equal(left.season, 'summer');
  assert.ok(['clear','rain'].includes(left.weather_state.weather_state_id));
});

test('initial environment fails closed outside approved daylight coverage', () => {
  assert.throws(() => deriveApprovedInitialEnvironment({ calendar_record: calendar,
    weather_record: weather, calendar_date: { year: 1234, month: 8, day: 20 },
    local_minute_of_day: 420, random: createRandomSource({ seed: 1 }) }),
  { code: 'INITIAL_ENVIRONMENT_DAYLIGHT_DATA_GAP' });
});
