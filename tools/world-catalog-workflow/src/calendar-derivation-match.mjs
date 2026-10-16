// Six approved profiles retain provenance from the pre-fix source; their fixed
// 1230-08-20 derivation is unchanged and is still checked below.
export const HISTORICAL_TIME_CALENDAR_DIGESTS = Object.freeze([
  '4b82d6a4f4c07a047ad1a2e38061b3223002914744edc206a419adb14cd0c4c0'
]);

export function isCanonicalCalendarDerivationSource(derivation) {
  return derivation?.owner === '@rus/time-events-history'
    && derivation.entrypoint === '@rus/time-events-history/calendar:resolveGameTimestampFromCalendarDate'
    && derivation.path === 'packages/time-events-history/src/calendar.js';
}

export function calendarDerivationMatches({ recordedDigest, currentDigest, projected, expected }) {
  return (recordedDigest === currentDigest || HISTORICAL_TIME_CALENDAR_DIGESTS.includes(recordedDigest))
    && projected.calendar_system === expected.calendar_system
    && projected.year === expected.year
    && projected.month === expected.month
    && projected.day === expected.day
    && projected.local_time_of_day.numerator === expected.local_minute_of_day
    && projected.local_time_of_day.denominator === '1';
}
