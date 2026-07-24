import { deepFreeze } from '@rus/kernel';
import { normalizeGameTimestamp } from './index.js';

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
  object(profile.season_rule, ['ranges']);
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
    dayparts, seasons, daylight
  };
}

export function projectCalendar(timestamp, profile) {
  const calendar = normalizeProfile(profile);
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
    season_id: selectDayRange(calendar.seasons, ordinal),
    daylight_phase_id: selectDayRange(calendar.daylight, ordinal)
  });
}
