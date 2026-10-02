import { deepFreeze } from '@rus/kernel';
import { compareGameTimestamp, normalizeGameTimestamp } from './index.js';

const DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const SIGNED_DECIMAL = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/;
const DAY_MINUTES = 1440n;

function gap() {
  const error = new RangeError('calendar profile is missing or malformed');
  error.code = 'time_calendar_profile_gap';
  throw error;
}

function object(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) gap();
  return value;
}

function decimal(value, positive = false) {
  if (typeof value !== 'string' || !(positive ? /^[1-9][0-9]*$/ : DECIMAL).test(value)) gap();
  return BigInt(value);
}

function signedDecimal(value) {
  if (typeof value !== 'string' || !SIGNED_DECIMAL.test(value)) gap();
  return BigInt(value);
}

function id(value) {
  if (typeof value !== 'string' || value.length === 0) gap();
  return value;
}

function floorDiv(value, divisor) {
  if (value >= 0n) return value / divisor;
  return -((-value + divisor - 1n) / divisor);
}

function modulo(value, divisor) {
  const remainder = value % divisor;
  return remainder < 0n ? remainder + divisor : remainder;
}

function timestampRational(value) {
  const timestamp = normalizeGameTimestamp(value);
  const denominator = BigInt(timestamp.subminute_denominator);
  return [BigInt(timestamp.whole_minutes) * denominator + BigInt(timestamp.subminute_numerator), denominator];
}

function localDayAndTime(timestamp, offset, dayStart) {
  const [numerator, denominator] = timestampRational(timestamp);
  const local = numerator + offset * denominator;
  const dayAdjusted = local - dayStart * denominator;
  const day = floorDiv(dayAdjusted, DAY_MINUTES * denominator);
  const localMinuteNumerator = modulo(local, DAY_MINUTES * denominator);
  return { day, numerator: localMinuteNumerator, denominator };
}

function normalizeRanges(value, limit) {
  if (!Array.isArray(value) || value.length === 0) gap();
  const ranges = value.map((entry) => {
    object(entry, ['id', 'start_minute', 'end_minute']);
    const start = decimal(entry.start_minute);
    const end = decimal(entry.end_minute, true);
    if (start >= end || end > limit) gap();
    return { id: id(entry.id), start, end };
  }).sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
  let cursor = 0n;
  for (const range of ranges) {
    if (range.start !== cursor) gap();
    cursor = range.end;
  }
  if (cursor !== limit) gap();
  return ranges;
}

function normalizeDayRanges(value, maxDay) {
  if (!Array.isArray(value) || value.length === 0) gap();
  const ranges = value.map((entry) => {
    object(entry, ['id', 'start_day', 'end_day']);
    const start = decimal(entry.start_day, true);
    const end = decimal(entry.end_day, true);
    if (start > end || end > maxDay) gap();
    return { id: id(entry.id), start, end };
  }).sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
  let cursor = 1n;
  for (const range of ranges) {
    if (range.start !== cursor) gap();
    cursor = range.end + 1n;
  }
  if (cursor !== maxDay + 1n) gap();
  return ranges;
}

function selectMinuteRange(ranges, numerator, denominator) {
  return ranges.find((range) => numerator >= range.start * denominator && numerator < range.end * denominator)?.id ?? gap();
}

function selectDayRange(ranges, value) {
  return ranges.find((range) => value >= range.start && value <= range.end)?.id ?? gap();
}

function normalizeProfile(profile) {
  object(profile, [
    'profile_id', 'version', 'status', 'provenance', 'epoch', 'calendar_system', 'month_rules',
    'leap_rules', 'day_start_rule', 'local_offset_rule', 'daypart_rule', 'season_rule', 'daylight_rule'
  ]);
  if (profile.status !== 'approved') gap();
  object(profile.provenance, ['source_id', 'source_version']);
  object(profile.epoch, ['game_timestamp', 'year', 'month', 'day']);
  object(profile.month_rules, ['month_lengths']);
  object(profile.leap_rules, ['cycle_years', 'leap_year_indexes', 'leap_month', 'leap_days']);
  object(profile.day_start_rule, ['local_minute']);
  object(profile.local_offset_rule, ['offset_minutes']);
  object(profile.daypart_rule, ['ranges']);
  if (!profile.season_rule || typeof profile.season_rule !== 'object'
      || Array.isArray(profile.season_rule)
      || !Object.hasOwn(profile.season_rule, 'ranges')
      || Object.keys(profile.season_rule).some((key) => !['ranges', 'months_by_id'].includes(key))
      || ![1, 2].includes(Object.keys(profile.season_rule).length)) gap();
  object(profile.daylight_rule, ['ranges']);
  const months = profile.month_rules.month_lengths;
  if (!Array.isArray(months) || months.length === 0) gap();
  const monthLengths = months.map((entry) => decimal(entry, true));
  const cycleYears = decimal(profile.leap_rules.cycle_years, true);
  const leapIndexes = profile.leap_rules.leap_year_indexes;
  if (!Array.isArray(leapIndexes)) gap();
  const normalizedLeapIndexes = leapIndexes.map((entry) => {
    const index = decimal(entry);
    if (index >= cycleYears) gap();
    return index;
  }).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (new Set(normalizedLeapIndexes.map(String)).size !== normalizedLeapIndexes.length) gap();
  const leapYearIndexes = new Set(normalizedLeapIndexes.map(String));
  const leapMonth = decimal(profile.leap_rules.leap_month, true);
  if (leapMonth > BigInt(monthLengths.length)) gap();
  const leapDays = decimal(profile.leap_rules.leap_days);
  const yearDays = monthLengths.reduce((sum, length) => sum + length, 0n);
  const maxYearDays = yearDays + leapDays;
  const dayStart = decimal(profile.day_start_rule.local_minute);
  if (dayStart >= DAY_MINUTES) gap();
  const offset = signedDecimal(profile.local_offset_rule.offset_minutes);
  if ((leapDays === 0n) !== (leapYearIndexes.size === 0)) gap();
  const dayparts = normalizeRanges(profile.daypart_rule.ranges, DAY_MINUTES);
  const seasons = normalizeDayRanges(profile.season_rule.ranges, maxYearDays);
  const seasonMonths = profile.season_rule.months_by_id == null
    ? null : normalizeSeasonMonths(profile.season_rule.months_by_id, monthLengths.length);
  const daylight = normalizeDayRanges(profile.daylight_rule.ranges, maxYearDays);
  if (leapDays !== 0n && leapYearIndexes.size !== 0) {
    // Leap-only days must be explicitly classified instead of inheriting a fallback.
    if (seasons.at(-1).end !== maxYearDays || daylight.at(-1).end !== maxYearDays) gap();
  }
  const epochYear = decimal(profile.epoch.year, true);
  const epochMonth = decimal(profile.epoch.month, true);
  const epochDay = decimal(profile.epoch.day, true);
  if (epochMonth > BigInt(monthLengths.length)) gap();
  return {
    profile_id: id(profile.profile_id), version: id(profile.version), calendar_system: id(profile.calendar_system),
    provenance: { source_id: id(profile.provenance.source_id), source_version: id(profile.provenance.source_version) },
    epoch: { timestamp: normalizeGameTimestamp(profile.epoch.game_timestamp), year: epochYear, month: epochMonth, day: epochDay },
    monthLengths, cycleYears, leapYearIndexes, normalizedLeapIndexes, leapMonth, leapDays, yearDays, maxYearDays, dayStart, offset,
    dayparts, seasons, seasonMonths, daylight
  };
}

function calendarArithmetic(calendar) {
  const isLeapYear = (year) => calendar.leapYearIndexes.has(modulo(year, calendar.cycleYears).toString());
  const daysInYear = (year) => calendar.yearDays + (isLeapYear(year) ? calendar.leapDays : 0n);
  const leapIndexesBefore = (relativeYear) => {
    let low = 0;
    let high = calendar.normalizedLeapIndexes.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (calendar.normalizedLeapIndexes[middle] < relativeYear) low = middle + 1;
      else high = middle;
    }
    return BigInt(low);
  };
  const daysWithinCycleBeforeYear = (relativeYear) => (
    calendar.yearDays * relativeYear + calendar.leapDays * leapIndexesBefore(relativeYear)
  );
  const cycleDays = calendar.yearDays * calendar.cycleYears + calendar.leapDays * BigInt(calendar.leapYearIndexes.size);
  const daysBeforeYear = (year) => {
    const cycles = floorDiv(year, calendar.cycleYears);
    const relativeYear = year - cycles * calendar.cycleYears;
    return cycles * cycleDays + daysWithinCycleBeforeYear(relativeYear);
  };
  const dayOfYear = (year, month, day) => {
    if (month > BigInt(calendar.monthLengths.length)) gap();
    let total = day - 1n;
    let baseMonthDays;
    for (const [index, length] of calendar.monthLengths.entries()) {
      const ordinal = BigInt(index);
      if (ordinal < month - 1n) total += length;
      if (ordinal === month - 1n) baseMonthDays = length;
    }
    if (baseMonthDays === undefined) gap();
    const monthDays = baseMonthDays + (month === calendar.leapMonth && isLeapYear(year) ? calendar.leapDays : 0n);
    if (day > monthDays) gap();
    return total;
  };
  return { cycleDays, daysBeforeYear, dayOfYear, daysInYear, daysWithinCycleBeforeYear, isLeapYear };
}

function normalizeCalendarDateInput(value, calendar) {
  object(value, [
    'calendar_system',
    'year',
    'month',
    'day',
    'local_minute_of_day',
    'subminute_numerator',
    'subminute_denominator'
  ]);
  if (id(value.calendar_system) !== calendar.calendar_system) gap();
  const localTime = normalizeGameTimestamp({
    whole_minutes: value.local_minute_of_day,
    subminute_numerator: value.subminute_numerator,
    subminute_denominator: value.subminute_denominator
  });
  if (BigInt(localTime.whole_minutes) >= DAY_MINUTES) gap();
  return {
    year: decimal(value.year, true),
    month: decimal(value.month, true),
    day: decimal(value.day, true),
    localTime
  };
}

export function resolveGameTimestampFromCalendarDate(value, profile) {
  const calendar = normalizeProfile(profile);
  const target = normalizeCalendarDateInput(value, calendar);
  const { daysBeforeYear, dayOfYear } = calendarArithmetic(calendar);
  const epochSerial = daysBeforeYear(calendar.epoch.year)
    + dayOfYear(calendar.epoch.year, calendar.epoch.month, calendar.epoch.day);
  const targetSerial = daysBeforeYear(target.year) + dayOfYear(target.year, target.month, target.day);
  const epochLocal = localDayAndTime(calendar.epoch.timestamp, calendar.offset, calendar.dayStart);
  const targetCalendarDay = targetSerial - epochSerial + epochLocal.day;
  const denominator = BigInt(target.localTime.subminute_denominator);
  const localMinuteNumerator = BigInt(target.localTime.whole_minutes) * denominator
    + BigInt(target.localTime.subminute_numerator);
  const beforeDayStart = localMinuteNumerator < calendar.dayStart * denominator;
  const localMidnightDay = targetCalendarDay + (beforeDayStart ? 1n : 0n);
  const timestampNumerator = localMidnightDay * DAY_MINUTES * denominator
    + localMinuteNumerator
    - calendar.offset * denominator;
  if (timestampNumerator < 0n) gap();
  const wholeMinutes = timestampNumerator / denominator;
  const subminuteNumerator = timestampNumerator % denominator;
  const timestamp = normalizeGameTimestamp({
    whole_minutes: wholeMinutes.toString(),
    subminute_numerator: subminuteNumerator.toString(),
    subminute_denominator: denominator.toString()
  });
  const projected = projectCalendar(timestamp, profile);
  if (projected.calendar_system !== value.calendar_system
    || projected.year !== value.year
    || projected.month !== value.month
    || projected.day !== value.day
    || projected.local_time_of_day.numerator !== localMinuteNumerator.toString()
    || projected.local_time_of_day.denominator !== denominator.toString()) gap();
  return deepFreeze(timestamp);
}

export function projectCalendar(timestamp, profile) {
  const calendar = normalizeProfile(profile);
  return projectNormalizedCalendar(timestamp, calendar);
}

/** Return the next actual season change, at the calendar's local day start. */
export function nextCalendarSeasonBoundary(timestamp, profile) {
  const calendar = normalizeProfile(profile);
  const current = projectNormalizedCalendar(timestamp, calendar);
  if (calendar.seasonMonths) {
    for (let offset = 1; offset <= calendar.monthLengths.length; offset += 1) {
      const absoluteMonth = BigInt(current.month) - 1n + BigInt(offset);
      const year = BigInt(current.year) + absoluteMonth / BigInt(calendar.monthLengths.length);
      const month = absoluteMonth % BigInt(calendar.monthLengths.length) + 1n;
      const nextSeason = seasonForMonth(calendar, month);
      if (nextSeason === current.season_id) continue;
      const calendarDate = { year: year.toString(), month: month.toString(), day: '1' };
      const scheduledAt = resolveGameTimestampFromCalendarDate({
        calendar_system: calendar.calendar_system, ...calendarDate,
        local_minute_of_day: calendar.dayStart.toString(),
        subminute_numerator: '0', subminute_denominator: '1'
      }, profile);
      if (compareGameTimestamp(scheduledAt, timestamp) <= 0) gap();
      return deepFreeze({ scheduled_at: scheduledAt, season_id: nextSeason,
        calendar_date: deepFreeze({ calendar_system: calendar.calendar_system, ...calendarDate }) });
    }
    return null;
  }
  const year = BigInt(current.year);
  const arithmetic = calendarArithmetic(calendar);
  const ordinal = arithmetic.dayOfYear(
    year, BigInt(current.month), BigInt(current.day)
  ) + 1n;
  const next = calendar.seasons.find((range, index, ranges) => (
    range.start > ordinal
      && range.start <= arithmetic.daysInYear(year)
      && rangeChangesSeason(range, index, year, calendar, arithmetic)
  ));
  const following = next == null
    ? nextSeasonChangeAfterYear(year, calendar)
    : null;
  const targetYear = next == null ? following?.year : year;
  const targetRange = next ?? following?.range;
  if (targetRange == null) return null;
  const calendarDate = dateAtOrdinal(targetYear, targetRange.start, calendar);
  const scheduledAt = resolveGameTimestampFromCalendarDate({
    calendar_system: calendar.calendar_system,
    ...calendarDate,
    local_minute_of_day: calendar.dayStart.toString(),
    subminute_numerator: '0',
    subminute_denominator: '1'
  }, profile);
  if (compareGameTimestamp(scheduledAt, timestamp) <= 0
      || projectNormalizedCalendar(scheduledAt, calendar).season_id !== targetRange.id) gap();
  return deepFreeze({
    scheduled_at: scheduledAt,
    season_id: targetRange.id,
    calendar_date: deepFreeze({
      calendar_system: calendar.calendar_system,
      ...calendarDate
    })
  });
}

function rangeChangesSeason(range, index, year, calendar, arithmetic) {
  const previousSeason = range.start === 1n
    ? selectDayRange(calendar.seasons, arithmetic.daysInYear(year - 1n))
    : calendar.seasons[index - 1].id;
  return previousSeason !== range.id;
}

function nextSeasonChangeAfterYear(year, calendar) {
  const candidates = [];
  for (const [index, range] of calendar.seasons.entries()) {
    if (range.start === 1n) {
      for (const previousYearLeap of [false, true]) {
        const previousSeason = selectDayRange(calendar.seasons,
          previousYearLeap ? calendar.maxYearDays : calendar.yearDays);
        if (previousSeason === range.id) continue;
        const previousYear = nextYearWithLeapStatus(
          year, previousYearLeap, calendar
        );
        if (previousYear != null) candidates.push({ year: previousYear + 1n, range });
      }
      continue;
    }
    if (range.id === calendar.seasons[index - 1].id) continue;
    if (range.start <= calendar.yearDays) {
      candidates.push({ year: year + 1n, range });
    } else {
      const targetYear = nextYearWithLeapStatus(year + 1n, true, calendar);
      if (targetYear != null) candidates.push({ year: targetYear, range });
    }
  }
  candidates.sort((left, right) => left.year < right.year ? -1
    : left.year > right.year ? 1
      : left.range.start < right.range.start ? -1
        : left.range.start > right.range.start ? 1 : 0);
  return candidates[0] ?? null;
}

function nextYearWithLeapStatus(startYear, wantsLeap, calendar) {
  if (wantsLeap && calendar.normalizedLeapIndexes.length === 0) return null;
  const isLeap = (year) => calendar.leapYearIndexes.has(
    modulo(year, calendar.cycleYears).toString()
  );
  if (isLeap(startYear) === wantsLeap) return startYear;
  const startCycleIndex = modulo(startYear, calendar.cycleYears);
  if (wantsLeap) {
    const next = calendar.normalizedLeapIndexes.find((index) => index > startCycleIndex);
    const targetCycleIndex = next ?? calendar.normalizedLeapIndexes[0];
    return startYear + (next == null
      ? calendar.cycleYears - startCycleIndex + targetCycleIndex
      : targetCycleIndex - startCycleIndex);
  }
  if (BigInt(calendar.normalizedLeapIndexes.length) === calendar.cycleYears) return null;
  let targetCycleIndex = modulo(startCycleIndex + 1n, calendar.cycleYears);
  while (calendar.leapYearIndexes.has(targetCycleIndex.toString())) {
    targetCycleIndex = modulo(targetCycleIndex + 1n, calendar.cycleYears);
  }
  return startYear + modulo(targetCycleIndex - startCycleIndex, calendar.cycleYears);
}

function projectNormalizedCalendar(timestamp, calendar) {
  const {
    cycleDays,
    daysBeforeYear,
    dayOfYear,
    daysInYear,
    daysWithinCycleBeforeYear,
    isLeapYear
  } = calendarArithmetic(calendar);
  const epochSerial = daysBeforeYear(calendar.epoch.year) + dayOfYear(calendar.epoch.year, calendar.epoch.month, calendar.epoch.day);
  const current = localDayAndTime(timestamp, calendar.offset, calendar.dayStart);
  const epochLocal = localDayAndTime(calendar.epoch.timestamp, calendar.offset, calendar.dayStart);
  const serial = epochSerial + current.day - epochLocal.day;
  const cycle = floorDiv(serial, cycleDays);
  const cycleStartYear = cycle * calendar.cycleYears;
  const serialWithinCycle = serial - cycle * cycleDays;
  let low = 0n;
  let high = calendar.cycleYears;
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (daysWithinCycleBeforeYear(middle) <= serialWithinCycle) low = middle;
    else high = middle;
  }
  let year = cycleStartYear + low;
  let remaining = serialWithinCycle - daysWithinCycleBeforeYear(low);
  if (remaining >= daysInYear(year)) gap();
  let month = 1n;
  for (const baseLength of calendar.monthLengths) {
    const length = baseLength + (month === calendar.leapMonth && isLeapYear(year) ? calendar.leapDays : 0n);
    if (remaining < length) break;
    remaining -= length;
    month += 1n;
  }
  const ordinal = dayOfYear(year, month, remaining + 1n) + 1n;
  return deepFreeze({
    profile_id: calendar.profile_id,
    profile_version: calendar.version,
    calendar_system: calendar.calendar_system,
    provenance: deepFreeze(calendar.provenance),
    year: year.toString(), month: month.toString(), day: (remaining + 1n).toString(),
    local_time_of_day: deepFreeze({ numerator: current.numerator.toString(), denominator: current.denominator.toString() }),
    daypart_id: selectMinuteRange(calendar.dayparts, current.numerator, current.denominator),
    season_id: seasonForMonth(calendar, month, ordinal),
    daylight_phase_id: selectDayRange(calendar.daylight, ordinal)
  });
}

function normalizeSeasonMonths(value, monthCount) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length === 0) gap();
  const byMonth = new Map();
  for (const [season, values] of Object.entries(value)) {
    id(season);
    if (!Array.isArray(values) || values.length === 0) gap();
    for (const month of values) {
      if (typeof month !== 'string' || !/^[1-9][0-9]*$/.test(month)
          || BigInt(month) > BigInt(monthCount) || byMonth.has(month)) gap();
      byMonth.set(month, season);
    }
  }
  if (byMonth.size !== monthCount) gap();
  return byMonth;
}

function seasonForMonth(calendar, month, ordinal) {
  return calendar.seasonMonths?.get(month.toString())
    ?? selectDayRange(calendar.seasons, ordinal);
}

function dateAtOrdinal(year, ordinal, calendar) {
  let day = ordinal;
  const leap = calendar.leapYearIndexes.has(modulo(year, calendar.cycleYears).toString());
  for (let index = 0; index < calendar.monthLengths.length; index += 1) {
    const month = BigInt(index + 1);
    const length = calendar.monthLengths[index]
      + (month === calendar.leapMonth && leap ? calendar.leapDays : 0n);
    if (day <= length) {
      return { year: year.toString(), month: month.toString(), day: day.toString() };
    }
    day -= length;
  }
  return gap();
}
