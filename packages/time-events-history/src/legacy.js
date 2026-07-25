import { deepFreeze } from '@rus/kernel';

/**
 * Frozen v2 compatibility surface.
 *
 * This module intentionally preserves the old rounded integer-minute behavior
 * for the production-v2 pipeline until the versioned production activation
 * cutover. Historical P28 evidence did not activate v3. Target-v3 code must import the
 * exact root API instead.
 */
export function normalizeClock(clock = {}) {
  const day = integer(clock.day, 0);
  const hour = boundedInteger(clock.hour, 0, 23, 0);
  const minute = boundedInteger(clock.minute, 0, 59, 0);
  return deepFreeze({
    year: integerOrNull(clock.year),
    month: integerOrNull(clock.month),
    day,
    hour,
    minute,
    total_minutes: day * 1440 + hour * 60 + minute,
    season: text(clock.season) || null
  });
}

export function addMinutes(clock = {}, minutes = 0) {
  const current = normalizeClock(clock);
  const delta = Number(minutes);
  if (!Number.isFinite(delta)) throw new TypeError('minutes must be finite');
  const total = Math.max(0, current.total_minutes + Math.round(delta));
  const day = Math.floor(total / 1440);
  const rest = total % 1440;
  return deepFreeze({ ...current, day, hour: Math.floor(rest / 60), minute: rest % 60, total_minutes: total });
}

export function normalizeDelayedEvent(event = {}) {
  return deepFreeze({
    id: text(event.id) || null,
    due_at_minutes: finite(event.due_at_minutes ?? event.trigger_at_minutes),
    status: text(event.status) || 'scheduled',
    visibility: text(event.visibility) || 'hidden',
    reason: text(event.reason) || null,
    visible_clue: text(event.visible_clue ?? event.visibleClue) || null,
    payload: plainObject(event.payload) ? structuredClone(event.payload) : {}
  });
}

export function dueTimers(clock = {}, timers = []) {
  const now = normalizeClock(clock).total_minutes;
  return deepFreeze((Array.isArray(timers) ? timers : []).map(normalizeDelayedEvent).filter((event) => event.status === 'scheduled' && event.due_at_minutes != null && event.due_at_minutes <= now));
}

export function activeHistoricalPhases(clock = {}, events = []) {
  const now = normalizeClock(clock).total_minutes;
  return deepFreeze((Array.isArray(events) ? events : []).map((event) => {
    const phases = Array.isArray(event.phases) ? event.phases : [];
    const eligible = phases.filter((phase) => finite(phase.start_at_minutes) != null && finite(phase.start_at_minutes) <= now)
      .sort((a, b) => finite(a.start_at_minutes) - finite(b.start_at_minutes));
    const phase = eligible.at(-1) ?? null;
    return phase ? { event_id: text(event.id) || null, phase: structuredClone(phase) } : null;
  }).filter(Boolean));
}

export function buildTimeDrivenUpdateRequest(previousClock = {}, durationMinutes = 0, state = {}) {
  const nextClock = addMinutes(previousClock, durationMinutes);
  return deepFreeze({
    previous_clock: normalizeClock(previousClock),
    next_clock: nextClock,
    duration_minutes: Math.round(Number(durationMinutes) || 0),
    due_events: dueTimers(nextClock, state.delayed_events ?? []),
    active_historical_phases: activeHistoricalPhases(nextClock, state.historical_events ?? []),
    update_domains: ['body_state', 'npcs', 'place', 'events', 'visible_scene']
  });
}

function boundedInteger(value, min, max, fallback) {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate >= min && candidate <= max ? candidate : fallback;
}
function integer(value, fallback) {
  const candidate = Number(value);
  return Number.isInteger(candidate) ? candidate : fallback;
}
function integerOrNull(value) {
  const candidate = Number(value);
  return Number.isInteger(candidate) ? candidate : null;
}
function finite(value) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}
function text(value) {
  return String(value ?? '').trim();
}
function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
