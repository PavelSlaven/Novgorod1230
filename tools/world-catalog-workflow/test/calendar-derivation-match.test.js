import assert from 'node:assert/strict';
import test from 'node:test';
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
