import { deepFreeze } from '@rus/kernel';

/** Exact target-v3 minutes. Fractions are never rounded; legacy addMinutes remains compatibility-only. */
export function normalizeRational(value = {}) {
  if (!Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator) || value.denominator <= 0 || value.numerator < 0) throw new RangeError('rational must use non-negative safe integers with positive denominator');
  const divisor = gcd(value.numerator, value.denominator);
  return deepFreeze({ numerator: value.numerator / divisor, denominator: value.denominator / divisor });
}
const safe = (n) => { if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < 0n) throw new RangeError('exact rational exceeds safe persisted representation'); return Number(n); };
export function addRational(left, right) { const a = normalizeRational(left); const b = normalizeRational(right); return normalizeRational({ numerator: safe(BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator)), denominator: safe(BigInt(a.denominator) * BigInt(b.denominator)) }); }
export function subtractRational(left, right) { const a = normalizeRational(left); const b = normalizeRational(right); const numerator = BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator); if (numerator < 0n) throw new RangeError('exact time cannot be negative'); return normalizeRational({ numerator: safe(numerator), denominator: safe(BigInt(a.denominator) * BigInt(b.denominator)) }); }
export function compareRational(left, right) { const a = normalizeRational(left); const b = normalizeRational(right); return (BigInt(a.numerator) * BigInt(b.denominator) > BigInt(b.numerator) * BigInt(a.denominator)) - (BigInt(a.numerator) * BigInt(b.denominator) < BigInt(b.numerator) * BigInt(a.denominator)); }
export function advanceExactClock(previous, elapsed) { const before = normalizeRational(previous); const exact_minutes = addRational(before, elapsed); return deepFreeze({ exact_minutes, whole_minute_index: Math.floor(exact_minutes.numerator / exact_minutes.denominator), crossed_whole_minute_boundaries: Math.floor(exact_minutes.numerator / exact_minutes.denominator) - Math.floor(before.numerator / before.denominator) }); }

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
    update_domains: ['body_state','npcs','place','events','visible_scene']
  });
}

function boundedInteger(value, min, max, fallback) { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; }
function integer(value, fallback) { const n = Number(value); return Number.isInteger(n) ? n : fallback; }
function integerOrNull(value) { const n = Number(value); return Number.isInteger(n) ? n : null; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
function plainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function gcd(a, b) { let x = Math.abs(a); let y = Math.abs(b); while (y) [x, y] = [y, x % y]; return x || 1; }
