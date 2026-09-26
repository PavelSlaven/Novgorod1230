import { deepFreeze } from '@rus/kernel';
import { normalizeGameTimestamp } from './exact-time.js';

/**
 * Events and phases that have already begun by the party clock.
 * Main API owner for D18 date gating (not ./legacy). Accepts GameTimestamp
 * or legacy { total_minutes } clock; events use start_at_minutes phases.
 */
export function startedHistoricalEventsAndPhases(clock, events = []) {
  const now = clockMinutes(clock);
  return deepFreeze((Array.isArray(events) ? events : []).map((event) => {
    const phases = Array.isArray(event?.phases) ? event.phases : [];
    const eligible = phases
      .filter((phase) => finiteMinutes(phase?.start_at_minutes) != null
        && finiteMinutes(phase.start_at_minutes) <= now)
      .sort((a, b) => finiteMinutes(a.start_at_minutes)
        - finiteMinutes(b.start_at_minutes));
    const phase = eligible.at(-1) ?? null;
    if (phase == null) return null;
    const eventId = typeof event.id === 'string' && event.id
      ? event.id
      : (typeof event.event_id === 'string' && event.event_id
        ? event.event_id : null);
    return { event_id: eventId, phase: structuredClone(phase) };
  }).filter(Boolean));
}

export function startedHistoricalEventIds(clock, events = []) {
  return deepFreeze([...new Set(startedHistoricalEventsAndPhases(clock, events)
    .map(({ event_id }) => event_id)
    .filter((id) => typeof id === 'string' && id))]);
}

function clockMinutes(clock) {
  if (typeof clock === 'number' && Number.isFinite(clock)) return Math.trunc(clock);
  if (clock != null && typeof clock === 'object') {
    if (Number.isFinite(clock.total_minutes)) return Math.trunc(clock.total_minutes);
    if (clock.whole_minutes != null) {
      return Number(normalizeGameTimestamp(clock).whole_minutes);
    }
  }
  throw new TypeError('startedHistoricalEventsAndPhases clock is invalid');
}

function finiteMinutes(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
