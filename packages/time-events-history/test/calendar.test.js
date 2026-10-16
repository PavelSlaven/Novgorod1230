import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { nextCalendarSeasonBoundary, projectCalendar, resolveGameTimestampFromCalendarDate } from '../src/calendar.js';
import { addElapsedTime } from '../src/index.js';

const timestamp = (whole_minutes, subminute_numerator = '0', subminute_denominator = '1') => ({ whole_minutes, subminute_numerator, subminute_denominator });
const profile = () => ({
  profile_id: 'novgorod-calendar', version: '1', status: 'approved', provenance: { source_id: 'chronicle-x', source_version: '1' },
  epoch: { game_timestamp: timestamp('0'), year: '1', month: '1', day: '1' }, calendar_system: 'source-backed',
  month_rules: { month_lengths: ['30', '30'] },
  leap_rules: { cycle_years: '4', leap_year_indexes: ['3'], leap_month: '2', leap_days: '1' },
  day_start_rule: { local_minute: '360' }, local_offset_rule: { offset_minutes: '0' },
  daypart_rule: { ranges: [{ id: 'night', start_minute: '0', end_minute: '360' }, { id: 'day', start_minute: '360', end_minute: '1080' }, { id: 'evening', start_minute: '1080', end_minute: '1440' }] },
  season_rule: { ranges: [{ id: 'cold', start_day: '1', end_day: '30' }, { id: 'warm', start_day: '31', end_day: '61' }] },
  daylight_rule: { ranges: [{ id: 'dark', start_day: '1', end_day: '30' }, { id: 'light', start_day: '31', end_day: '61' }] }
});

test('calendar projects epoch, local day boundary, daypart and daylight from an approved profile', () => {
  assert.deepEqual(projectCalendar(timestamp('0'), profile()), {
    profile_id: 'novgorod-calendar', profile_version: '1', calendar_system: 'source-backed', provenance: { source_id: 'chronicle-x', source_version: '1' },
    year: '1', month: '1', day: '1', local_time_of_day: { numerator: '0', denominator: '1' }, daypart_id: 'night', season_id: 'cold', daylight_phase_id: 'dark'
  });
  const before = projectCalendar(timestamp('359'), profile());
  const after = projectCalendar(timestamp('360'), profile());
  assert.equal(before.day, '1'); assert.equal(after.day, '2'); assert.equal(after.daypart_id, 'day');
});

test('calendar owner resolves an exact calendar date and local time to one GameTimestamp', () => {
  const resolved = resolveGameTimestampFromCalendarDate({
    calendar_system: 'source-backed',
    year: '1',
    month: '2',
    day: '1',
    local_minute_of_day: '420',
    subminute_numerator: '0',
    subminute_denominator: '1'
  }, profile());
  assert.deepEqual(resolved, timestamp('42180'));
  assert.deepEqual(projectCalendar(resolved, profile()), {
    profile_id: 'novgorod-calendar',
    profile_version: '1',
    calendar_system: 'source-backed',
    provenance: { source_id: 'chronicle-x', source_version: '1' },
    year: '1',
    month: '2',
    day: '1',
    local_time_of_day: { numerator: '420', denominator: '1' },
    daypart_id: 'day',
    season_id: 'warm',
    daylight_phase_id: 'light'
  });
  assert.ok(Object.isFrozen(resolved));
});

test('calendar owner rejects unknown systems, impossible dates, and malformed local time', () => {
  for (const invalid of [
    { calendar_system: 'other', year: '1', month: '1', day: '1', local_minute_of_day: '0', subminute_numerator: '0', subminute_denominator: '1' },
    { calendar_system: 'source-backed', year: '1', month: '3', day: '1', local_minute_of_day: '0', subminute_numerator: '0', subminute_denominator: '1' },
    { calendar_system: 'source-backed', year: '1', month: '2', day: '31', local_minute_of_day: '0', subminute_numerator: '0', subminute_denominator: '1' },
    { calendar_system: 'source-backed', year: '1', month: '1', day: '1', local_minute_of_day: '1440', subminute_numerator: '0', subminute_denominator: '1' }
  ]) {
    assert.throws(
      () => resolveGameTimestampFromCalendarDate(invalid, profile()),
      (error) => error?.code === 'time_calendar_profile_gap'
    );
  }
});

test('calendar owner inverse preserves leap dates, non-zero local offsets, and subminutes', () => {
  const offsetProfile = profile();
  offsetProfile.local_offset_rule = { offset_minutes: '125' };
  const input = {
    calendar_system: 'source-backed',
    year: '3',
    month: '2',
    day: '31',
    local_minute_of_day: '200',
    subminute_numerator: '1',
    subminute_denominator: '2'
  };
  const resolved = resolveGameTimestampFromCalendarDate(input, offsetProfile);
  const projected = projectCalendar(resolved, offsetProfile);
  assert.deepEqual(
    {
      calendar_system: projected.calendar_system,
      year: projected.year,
      month: projected.month,
      day: projected.day,
      local_time_of_day: projected.local_time_of_day
    },
    {
      calendar_system: input.calendar_system,
      year: input.year,
      month: input.month,
      day: input.day,
      local_time_of_day: { numerator: '401', denominator: '2' }
    }
  );
});

test('calendar owner returns exact next season boundary strictly after timestamp', () => {
  const boundary = resolveGameTimestampFromCalendarDate({
    calendar_system: 'source-backed', year: '1', month: '2', day: '1',
    local_minute_of_day: '360', subminute_numerator: '0', subminute_denominator: '1'
  }, profile());
  const before = nextCalendarSeasonBoundary(timestamp('42119'), profile());
  assert.deepEqual(before, {
    scheduled_at: boundary,
    season_id: 'warm',
    calendar_date: {
      calendar_system: 'source-backed', year: '1', month: '2', day: '1'
    }
  });
  assert.equal(nextCalendarSeasonBoundary(boundary, profile()).season_id, 'cold');
  assert.equal(nextCalendarSeasonBoundary(timestamp('42121'), profile()).season_id, 'cold');
  assert.ok(Object.isFrozen(before));
});

test('calendar season boundary follows year wrap and leap-year month length', () => {
  const nextYear = nextCalendarSeasonBoundary(timestamp('42120'), profile());
  assert.deepEqual(nextYear.calendar_date, {
    calendar_system: 'source-backed', year: '2', month: '1', day: '1'
  });
  assert.equal(nextYear.season_id, 'cold');

  const leapProfile = profile();
  leapProfile.season_rule.ranges = [
    { id: 'warm', start_day: '1', end_day: '60' },
    { id: 'leap-cold', start_day: '61', end_day: '61' }
  ];
  const leapStart = resolveGameTimestampFromCalendarDate({
    calendar_system: 'source-backed', year: '2', month: '2', day: '30',
    local_minute_of_day: '361', subminute_numerator: '0', subminute_denominator: '1'
  }, leapProfile);
  const leapBoundary = nextCalendarSeasonBoundary(leapStart, leapProfile);
  assert.deepEqual(leapBoundary.calendar_date, {
    calendar_system: 'source-backed', year: '3', month: '2', day: '31'
  });
  assert.equal(leapBoundary.season_id, 'leap-cold');
  assert.equal(projectCalendar(leapBoundary.scheduled_at, leapProfile).season_id, 'leap-cold');
  const leapYearWrap = nextCalendarSeasonBoundary(leapBoundary.scheduled_at, leapProfile);
  assert.deepEqual(leapYearWrap.calendar_date, {
    calendar_system: 'source-backed', year: '4', month: '1', day: '1'
  });
  assert.equal(leapYearWrap.season_id, 'warm');
});

test('calendar finds in-year and year-wrap season boundaries without leap years', () => {
  const noLeap = profile();
  noLeap.leap_rules = { cycle_years: '1', leap_year_indexes: [], leap_month: '2', leap_days: '0' };
  noLeap.season_rule.ranges[1].end_day = '60';
  noLeap.daylight_rule.ranges[1].end_day = '60';
  const date = (year, month, day) => resolveGameTimestampFromCalendarDate({
    calendar_system: noLeap.calendar_system, year, month, day,
    local_minute_of_day: '360', subminute_numerator: '0', subminute_denominator: '1'
  }, noLeap);

  const inYear = nextCalendarSeasonBoundary(date('1', '1', '15'), noLeap);
  assert.deepEqual(inYear.scheduled_at, date('1', '2', '1'));
  assert.equal(inYear.season_id, 'warm');

  const yearWrap = nextCalendarSeasonBoundary(date('1', '2', '15'), noLeap);
  assert.deepEqual(yearWrap.scheduled_at, date('2', '1', '1'));
  assert.deepEqual(yearWrap.calendar_date,
    { calendar_system: 'source-backed', year: '2', month: '1', day: '1' });
  assert.equal(yearWrap.season_id, 'cold');
});

test('calendar owner projects gameplay seasons from pinned month rules and finds month-boundary changes', () => {
  const monthProfile = profile();
  monthProfile.season_rule.months_by_id = { cold: ['1'], warm: ['2'] };
  const current = resolveGameTimestampFromCalendarDate({
    calendar_system: 'source-backed', year: '1', month: '1', day: '10',
    local_minute_of_day: '500', subminute_numerator: '0', subminute_denominator: '1'
  }, monthProfile);
  assert.equal(projectCalendar(current, monthProfile).season_id, 'cold');
  const boundary = nextCalendarSeasonBoundary(current, monthProfile);
  assert.equal(boundary.season_id, 'warm');
  assert.deepEqual(boundary.calendar_date,
    { calendar_system: 'source-backed', year: '1', month: '2', day: '1' });
  assert.equal(projectCalendar(boundary.scheduled_at, monthProfile).season_id, 'warm');
  const yearWrap = resolveGameTimestampFromCalendarDate({
    calendar_system: 'source-backed', year: '1', month: '2', day: '30',
    local_minute_of_day: '500', subminute_numerator: '0', subminute_denominator: '1'
  }, monthProfile);
  assert.deepEqual(nextCalendarSeasonBoundary(yearWrap, monthProfile).calendar_date,
    { calendar_system: 'source-backed', year: '2', month: '1', day: '1' });
});

test('calendar owner returns null when approved calendar has no season changes', () => {
  const oneSeason = profile();
  oneSeason.season_rule.ranges = [{ id: 'same', start_day: '1', end_day: '61' }];
  assert.equal(nextCalendarSeasonBoundary(timestamp('0'), oneSeason), null);
});

test('calendar resolves finite leap cycles and never iterates by elapsed day or year', () => {
  const leap = projectCalendar(timestamp((3n * 60n * 1440n + 360n).toString()), profile());
  assert.deepEqual([leap.year, leap.month, leap.day], ['4', '1', '1']);
  const huge = projectCalendar(timestamp((10n ** 20n * 1440n + 360n).toString()), profile());
  assert.match(huge.year, /^\d+$/u); assert.doesNotThrow(() => JSON.stringify(huge));
});

test('calendar inverse counts leap days before later months and round-trips approved Julian dates', async () => {
  const marchProfile = profile();
  marchProfile.epoch.year = '4';
  marchProfile.month_rules.month_lengths = ['31', '28', '31'];
  marchProfile.leap_rules = { cycle_years: '4', leap_year_indexes: ['0'], leap_month: '2', leap_days: '1' };
  marchProfile.season_rule.ranges = [{ id: 'year', start_day: '1', end_day: '91' }];
  marchProfile.daylight_rule.ranges = [{ id: 'year', start_day: '1', end_day: '91' }];
  marchProfile.day_start_rule.local_minute = '0';

  const marchFirst = (year) => resolveGameTimestampFromCalendarDate({
    calendar_system: 'source-backed', year: String(year), month: '3', day: '1',
    local_minute_of_day: '0', subminute_numerator: '0', subminute_denominator: '1'
  }, marchProfile);
  assert.deepEqual(marchFirst(4), timestamp('86400'));
  marchProfile.leap_rules.leap_days = '2';
  marchProfile.season_rule.ranges[0].end_day = '92';
  marchProfile.daylight_rule.ranges[0].end_day = '92';
  assert.deepEqual(marchFirst(4), timestamp('87840'));

  const [record] = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json',
    import.meta.url), 'utf8'));
  const catalog = record.payload;
  const epoch = catalog.epoch_reference;
  const approvedProfile = {
    profile_id: catalog.calendar_profile_id,
    version: catalog.calendar_version,
    status: record.status,
    provenance: { source_id: record.record_id, source_version: record.version },
    epoch: {
      game_timestamp: epoch.game_timestamp_zero,
      year: epoch.calendar_date_at_zero.year,
      month: epoch.calendar_date_at_zero.month,
      day: epoch.calendar_date_at_zero.day
    },
    calendar_system: epoch.calendar_date_at_zero.calendar_system,
    month_rules: { month_lengths: catalog.day_month_leap_rules.month_lengths_common },
    leap_rules: { cycle_years: '4', leap_year_indexes: ['0'], leap_month: '2', leap_days: '1' },
    day_start_rule: { local_minute: '0' },
    local_offset_rule: { offset_minutes: '0' },
    daypart_rule: { ranges: [{ id: 'projection', start_minute: '0', end_minute: '1440' }] },
    season_rule: { ranges: [{ id: 'projection', start_day: '1', end_day: '366' }] },
    daylight_rule: { ranges: [{ id: 'projection', start_day: '1', end_day: '366' }] }
  };
  assert.equal(catalog.day_month_leap_rules.leap_rule, 'Julian year divisible by 4');
  for (const [year, month, day] of [
    ['1231', '2', '28'], ['1231', '3', '1'],
    ['1232', '2', '28'], ['1232', '2', '29'], ['1232', '3', '1'],
    ['1244', '2', '28'], ['1244', '2', '29'], ['1244', '3', '1'], ['1244', '7', '1']
  ]) {
    const input = {
      calendar_system: epoch.calendar_date_at_zero.calendar_system,
      year, month, day, local_minute_of_day: '0', subminute_numerator: '0', subminute_denominator: '1'
    };
    const resolved = resolveGameTimestampFromCalendarDate(input, approvedProfile);
    const projected = projectCalendar(resolved, approvedProfile);
    assert.deepEqual([projected.year, projected.month, projected.day], [year, month, day]);
  }
});

test('calendar projection is deterministic and slicing-consistent at exact subminute timestamps', () => {
  const input = timestamp('1800', '1', '2');
  const direct = addElapsedTime(input, { exact_minutes: { numerator: '3', denominator: '4' } });
  const sliced = addElapsedTime(addElapsedTime(input, { exact_minutes: { numerator: '1', denominator: '4' } }), { exact_minutes: { numerator: '1', denominator: '2' } });
  const first = projectCalendar(direct, profile());
  const second = projectCalendar(sliced, structuredClone(profile()));
  assert.deepEqual(first, second); assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.local_time_of_day));
});

test('calendar fails closed with the typed calendar profile data gap', () => {
  for (const invalid of [null, {}, { ...profile(), status: 'draft' }, { ...profile(), daypart_rule: { ranges: [] } }, { ...profile(), season_rule: { ranges: [{ id: 'x', start_day: '1', end_day: '59' }] } }, { ...profile(), leap_rules: { ...profile().leap_rules, leap_year_indexes: ['3', '3'] } }]) {
    assert.throws(() => projectCalendar(timestamp('0'), invalid), (error) => error?.code === 'time_calendar_profile_gap');
  }
});

test('calendar resolves a huge explicit leap cycle with logarithmic year selection', () => {
  const largeCycle = profile();
  largeCycle.leap_rules = { cycle_years: '100000000000000000000', leap_year_indexes: [], leap_month: '2', leap_days: '0' };
  largeCycle.season_rule = { ranges: [{ id: 'cold', start_day: '1', end_day: '30' }, { id: 'warm', start_day: '31', end_day: '60' }] };
  largeCycle.daylight_rule = { ranges: [{ id: 'dark', start_day: '1', end_day: '30' }, { id: 'light', start_day: '31', end_day: '60' }] };
  const projected = projectCalendar(timestamp((10n ** 30n * 1440n).toString()), largeCycle);
  assert.match(projected.year, /^\d+$/u);
});
