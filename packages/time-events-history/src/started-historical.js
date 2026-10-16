import { deepFreeze } from '@rus/kernel';
import {
  compareGameTimestamp,
  normalizeGameTimestamp
} from './exact-time.js';

export class StartedHistoricalError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StartedHistoricalError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

/**
 * Events and phases that have already begun by the party clock.
 * Main API owner for D18 date gating (not ./legacy).
 *
 * Clock: GameTimestamp, legacy `{ total_minutes }`, or finite number of minutes.
 * Phase start (either form):
 * - v3: `start_at` GameTimestamp (compared via compareGameTimestamp)
 * - legacy: `start_at_minutes` as a real finite number (not Number(null)/'')
 * Phase without a valid start never begins.
 */
export function startedHistoricalEventsAndPhases(clock, events = []) {
  const now = normalizeClock(clock);
  return deepFreeze((Array.isArray(events) ? events : []).map((event) => {
    const phases = Array.isArray(event?.phases) ? event.phases : [];
    const eligible = phases
      .map((phase) => ({ phase, start: phaseStart(phase) }))
      .filter((entry) => entry.start != null && startedBy(now, entry.start))
      .sort((a, b) => compareStarts(a.start, b.start));
    const chosen = eligible.at(-1) ?? null;
    if (chosen == null) return null;
    const eventId = typeof event.id === 'string' && event.id
      ? event.id
      : (typeof event.event_id === 'string' && event.event_id
        ? event.event_id : null);
    return { event_id: eventId, phase: structuredClone(chosen.phase) };
  }).filter(Boolean));
}

export function startedHistoricalEventIds(clock, events = []) {
  return deepFreeze([...new Set(startedHistoricalEventsAndPhases(clock, events)
    .map(({ event_id }) => event_id)
    .filter((id) => typeof id === 'string' && id))]);
}

function normalizeClock(clock) {
  if (typeof clock === 'number' && Number.isFinite(clock)) {
    return { kind: 'minutes', value: Math.trunc(clock) };
  }
  if (clock != null && typeof clock === 'object') {
    if (Number.isFinite(clock.total_minutes)) {
      return { kind: 'minutes', value: Math.trunc(clock.total_minutes) };
    }
    try {
      return { kind: 'ts', value: normalizeGameTimestamp(clock) };
    } catch (error) {
      throw new StartedHistoricalError(
        'STARTED_HISTORICAL_CLOCK_INVALID',
        'startedHistoricalEventsAndPhases clock is invalid',
        { cause: String(error?.message ?? error) });
    }
  }
  throw new StartedHistoricalError(
    'STARTED_HISTORICAL_CLOCK_INVALID',
    'startedHistoricalEventsAndPhases clock is invalid',
    { clock_type: clock == null ? 'null' : typeof clock });
}

function phaseStart(phase) {
  if (phase?.start_at != null) {
    try {
      return { kind: 'ts', value: normalizeGameTimestamp(phase.start_at) };
    } catch {
      return null;
    }
  }
  // N-1: only a real finite number; Number(null)/''/false must not become 0.
  if (typeof phase?.start_at_minutes === 'number'
      && Number.isFinite(phase.start_at_minutes)) {
    return { kind: 'minutes', value: phase.start_at_minutes };
  }
  return null;
}

function startedBy(now, start) {
  if (now.kind === 'ts' && start.kind === 'ts') {
    return compareGameTimestamp(start.value, now.value) <= 0;
  }
  return minutesOf(start) <= minutesOf(now);
}

function compareStarts(left, right) {
  if (left.kind === 'ts' && right.kind === 'ts') {
    return compareGameTimestamp(left.value, right.value);
  }
  return minutesOf(left) - minutesOf(right);
}

function minutesOf(value) {
  if (value.kind === 'minutes') return value.value;
  return Number(value.value.whole_minutes);
}
