import { applyStateDelta } from './delta.js';
import { recordWorldEvent } from './event-log.js';

export function normalizeDelayedEventList(events = [], context = {}) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => normalizeDelayedEvent(event, { ...context, index }))
    .filter(Boolean);
}

export function scheduleDelayedEvent(world, event = {}) {
  if (!world || typeof world !== 'object') return null;
  if (!Array.isArray(world.delayedEvents)) world.delayedEvents = [];

  const normalized = normalizeDelayedEvent(event, { clock: world.clock });
  if (!normalized) return null;

  const existingIndex = world.delayedEvents.findIndex((item) => item.id === normalized.id);
  if (existingIndex >= 0) {
    world.delayedEvents[existingIndex] = normalized;
  } else {
    world.delayedEvents.push(normalized);
  }
  world.delayedEvents.sort(compareDelayedEvents);
  return normalized;
}

export function processDelayedEvents(world) {
  if (!world || typeof world !== 'object') return [];
  if (!Array.isArray(world.delayedEvents)) world.delayedEvents = [];

  const now = toAbsoluteMinutes(world.clock);
  const triggered = [];

  for (const event of world.delayedEvents) {
    if (!event || event.status !== 'pending') continue;
    if (toAbsoluteMinutes(event.dueAt) > now) continue;

    const appliedAt = cloneClock(world.clock);
    try {
      if (event.effect && typeof event.effect === 'object') {
        applyStateDelta(world, event.effect);
      }
      event.status = 'applied';
      event.triggeredAt = appliedAt;
      event.appliedAt = appliedAt;
      if (event.result) {
        recordWorldEvent(world, {
          kind: 'delayed',
          source: 'time',
          visibility: 'public',
          status: 'recorded',
          at: appliedAt,
          relatedIds: [event.id],
          result: `Отложенное событие: ${event.result}`
        });
      }
      triggered.push(event);
    } catch (error) {
      event.status = 'failed';
      event.triggeredAt = appliedAt;
      event.appliedAt = appliedAt;
      event.error = error instanceof Error ? error.message : String(error ?? 'unknown error');
      recordWorldEvent(world, {
        kind: 'delayed',
        source: 'time',
        visibility: 'public',
        status: 'recorded',
        at: appliedAt,
        relatedIds: [event.id],
        result: `Отложенное событие не сработало: ${event.reason ?? event.id}`
      });
    }
  }

  return triggered;
}

function normalizeDelayedEvent(event = {}, context = {}) {
  if (!event || typeof event !== 'object') return null;

  const clock = normalizeClock(context.clock);
  const dueAt = normalizeDueAt(
    event.dueAt ?? event.due_at ?? null,
    clock,
    event.dueInMinutes ?? event.due_in_minutes ?? null
  );
  if (!dueAt) return null;

  const createdAt = normalizeClock(event.createdAt ?? event.created_at ?? clock) ?? cloneClock(clock);
  const triggeredAt = normalizeClock(event.triggeredAt ?? event.triggered_at ?? null);
  const appliedAt = normalizeClock(event.appliedAt ?? event.applied_at ?? null);

  return {
    id: String(event.id ?? buildDelayedEventId(context.index ?? 0, dueAt)),
    reason: trimText(event.reason ?? event.cause ?? event.note ?? 'отложенное событие'),
    dueAt,
    trigger: trimText(event.trigger ?? '') || null,
    result: trimText(event.result ?? event.outcome ?? ''),
    effect: event.effect && typeof event.effect === 'object' ? structuredClone(event.effect) : null,
    status: normalizeStatus(event.status, triggeredAt, appliedAt),
    visibility: normalizeDelayedVisibility(event.visibility),
    characterKnowledge: normalizeCharacterKnowledge(event.characterKnowledge ?? event.character_knowledge),
    visibleClue: trimText(event.visibleClue ?? event.visible_clue ?? '') || null,
    revealCondition: trimText(event.revealCondition ?? event.reveal_condition ?? '') || null,
    createdAt,
    triggeredAt,
    appliedAt,
    error: trimText(event.error ?? '') || null
  };
}

function normalizeDelayedVisibility(value) {
  const text = trimText(value).toLowerCase();
  if (text === 'known' || text === 'clue' || text === 'hidden') return text;
  return 'hidden';
}

function normalizeCharacterKnowledge(value) {
  const text = trimText(value).toLowerCase();
  if (['known', 'rumor', 'suspected', 'unknown'].includes(text)) return text;
  return 'unknown';
}

function normalizeStatus(value, triggeredAt = null, appliedAt = null) {
  const text = trimText(value).toLowerCase();
  if (text === 'applied' || text === 'done' || text === 'triggered' || text === 'completed') return 'applied';
  if (text === 'failed') return 'failed';
  if (appliedAt || triggeredAt) return 'applied';
  return 'pending';
}

function normalizeDueAt(value, clock, dueInMinutes = null) {
  const dueClock = normalizeClock(value);
  if (dueClock) return dueClock;

  const minutes = Number(dueInMinutes);
  if (!Number.isFinite(minutes)) return null;
  return addMinutes(clock ?? { day: 1, hour: 0, minute: 0 }, minutes);
}

function normalizeClock(value) {
  if (!value || typeof value !== 'object') return null;
  const day = Number(value.day);
  const hour = Number(value.hour);
  const minute = Number(value.minute);
  if (!Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return {
    day: Math.max(1, Math.floor(day)),
    hour: Math.max(0, Math.min(23, Math.floor(hour))),
    minute: Math.max(0, Math.min(59, Math.floor(minute)))
  };
}

function addMinutes(clock, minutes) {
  const base = normalizeClock(clock) ?? { day: 1, hour: 0, minute: 0 };
  const total = ((base.day - 1) * 1440) + (base.hour * 60) + base.minute + Math.max(0, Math.floor(minutes));
  const day = Math.floor(total / 1440) + 1;
  const remainder = total % 1440;
  return {
    day,
    hour: Math.floor(remainder / 60),
    minute: remainder % 60
  };
}

function toAbsoluteMinutes(clock) {
  const normalized = normalizeClock(clock) ?? { day: 1, hour: 0, minute: 0 };
  return ((normalized.day - 1) * 1440) + (normalized.hour * 60) + normalized.minute;
}

function compareDelayedEvents(left, right) {
  const leftAt = toAbsoluteMinutes(left?.dueAt);
  const rightAt = toAbsoluteMinutes(right?.dueAt);
  if (leftAt !== rightAt) return leftAt - rightAt;
  return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
}

function buildDelayedEventId(index, dueAt) {
  return `delayed:${dueAt.day}:${String(dueAt.hour).padStart(2, '0')}:${String(dueAt.minute).padStart(2, '0')}:${index}`;
}

function cloneClock(clock) {
  const normalized = normalizeClock(clock);
  return normalized ? { ...normalized } : null;
}

function trimText(value) {
  return String(value ?? '').trim();
}
