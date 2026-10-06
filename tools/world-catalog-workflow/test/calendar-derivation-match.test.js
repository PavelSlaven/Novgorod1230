import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCalendar, resolveGameTimestampFromCalendarDate } from '@rus/time-events-history/calendar';
import { calendarDerivationMatches, HISTORICAL_TIME_CALENDAR_DIGESTS,
  isCanonicalCalendarDerivationSource } from
  '../src/calendar-derivation-match.mjs';

const currentDigest = 'current-calendar-sha';
const expected = { calendar_system: 'Julian', year: '1230', month: '8', day: '20', local_minute_of_day: '420' };
const projected = { calendar_system: 'Julian', year: '1230', month: '8', day: '20',
  local_time_of_day: { numerator: '420', denominator: '1' } };
const matches = (recordedDigest, actual = projected, exact = expected) => calendarDerivationMatches({
  recordedDigest, currentDigest, projected: actual, expected: exact
});

test('calendar checker accepts current and historical digests only for exact derived values', async (t) => {
  await t.test('current source digest', () => assert.equal(matches(currentDigest), true));
  await t.test('historical source digest with unchanged values', () => {
    assert.equal(matches(HISTORICAL_TIME_CALENDAR_DIGESTS[0]), true);
  });
  await t.test('historical source digest with changed profile value', () => {
    assert.equal(matches(HISTORICAL_TIME_CALENDAR_DIGESTS[0], projected,
      { ...expected, day: '21' }), false);
  });
  await t.test('unknown source digest', () => assert.equal(matches('unknown-calendar-sha'), false));
});

test('calendar checker rejects missing or non-canonical derivation paths before hashing', async (t) => {
  const canonical = {
    owner: '@rus/time-events-history',
    entrypoint: '@rus/time-events-history/calendar:resolveGameTimestampFromCalendarDate',
    path: 'packages/time-events-history/src/calendar.js'
  };
  await t.test('missing derivation', () => assert.equal(isCanonicalCalendarDerivationSource(undefined), false));
  await t.test('non-canonical path', () => assert.equal(isCanonicalCalendarDerivationSource({
    ...canonical, path: 'does-not-exist-review-file'
  }), false));
});

test('calendar digest compatibility checks values calculated with the supplied profile', async (t) => {
  const originalProfile = {
    profile_id: 'acceptance-julian', version: '1', status: 'approved',
    provenance: { source_id: 'acceptance-fixture', source_version: '1' },
    epoch: {
      game_timestamp: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      year: '1230', month: '1', day: '1'
    },
    calendar_system: 'Julian',
    month_rules: { month_lengths: ['31', '28', '31', '30', '31', '30', '31', '31', '30', '31', '30', '31'] },
    leap_rules: { cycle_years: '4', leap_year_indexes: ['0'], leap_month: '2', leap_days: '1' },
    day_start_rule: { local_minute: '0' },
    local_offset_rule: { offset_minutes: '0' },
    daypart_rule: { ranges: [{ id: 'all-day', start_minute: '0', end_minute: '1440' }] },
    season_rule: { ranges: [{ id: 'all-year', start_day: '1', end_day: '366' }] },
    daylight_rule: { ranges: [{ id: 'all-year', start_day: '1', end_day: '366' }] }
  };
  const changedProfile = structuredClone(originalProfile);
  changedProfile.epoch.game_timestamp.whole_minutes = '1440';
  const input = { ...expected, subminute_numerator: '0', subminute_denominator: '1' };
  const timestamp = resolveGameTimestampFromCalendarDate(input, originalProfile);
  const originalProjection = projectCalendar(timestamp, originalProfile);

  await t.test('original calculation accepts both permitted digests', () => {
    assert.equal(timestamp.whole_minutes, '333060');
    for (const digest of [currentDigest, HISTORICAL_TIME_CALENDAR_DIGESTS[0]]) {
      assert.equal(matches(digest, originalProjection), true);
    }
  });
  await t.test('resolver uses the changed profile instead of the original', () => {
    const changedTimestamp = resolveGameTimestampFromCalendarDate(input, changedProfile);
    const changedProjection = projectCalendar(changedTimestamp, originalProfile);
    assert.equal(matches(HISTORICAL_TIME_CALENDAR_DIGESTS[0], changedProjection), false);
    assert.equal(changedTimestamp.whole_minutes, '334500');
    assert.equal(changedProjection.day, '21');
  });
  await t.test('projector uses the changed profile for the original timestamp', () => {
    const changedProjection = projectCalendar(timestamp, changedProfile);
    assert.equal(matches(HISTORICAL_TIME_CALENDAR_DIGESTS[0], changedProjection), false);
    assert.equal(changedProjection.day, '19');
  });
});
