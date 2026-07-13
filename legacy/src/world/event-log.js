const RECENT_EVENT_LIMIT = 30;

export function ensureWorldLogs(world) {
  if (!world || typeof world !== 'object') return world;
  if (!Array.isArray(world.events)) world.events = [];
  if (!Array.isArray(world.journal)) {
    world.journal = Array.isArray(world.events) ? world.events.slice() : [];
  }
  return world;
}

export function recordWorldEvent(world, entry = {}, recentLimit = RECENT_EVENT_LIMIT) {
  ensureWorldLogs(world);
  if (!world || typeof world !== 'object') return null;

  const item = cloneEventEntry(entry);
  item.kind = item.kind ?? deriveEventKind(item);
  item.memoryClass = normalizeMemoryClass(item);
  item.at = cloneTemporalValue(item.at ?? world?.clock ?? null);
  item.time = cloneTemporalValue(item.time ?? item.at ?? null);
  item.source = normalizeEventSource(item.source, item.intent, item.kind);
  item.visibility = normalizeEventVisibility(item.visibility, item.kind);
  item.status = normalizeEventStatus(item.status, item.kind);
  item.confidence = normalizeEventConfidence(item.confidence);
  item.relatedIds = normalizeRelatedIds(item.relatedIds ?? item.related_ids);
  world.events.unshift(item);
  world.events = world.events.slice(0, recentLimit);
  if (!isTechnicalEventEntry(item)) {
    world.journal.unshift(item);
  }
  return item;
}

function cloneEventEntry(entry) {
  if (entry && typeof structuredClone === 'function') {
    try {
      return structuredClone(entry);
    } catch {
      // Structured clone is a best effort for logs.
    }
  }
  if (!entry || typeof entry !== 'object') return { value: entry ?? null };
  return {
    ...entry,
    at: entry.at && typeof entry.at === 'object' ? { ...entry.at } : entry.at ?? null
  };
}

function deriveEventKind(entry) {
  const intent = String(entry?.intent ?? '').toLowerCase();
  if (intent === 'world') return 'system';
  if (intent === 'audit' || intent === 'debug') return 'technical';
  if (intent === 'routine') return 'routine';
  if (intent) return intent;
  return 'event';
}

function normalizeMemoryClass(entry) {
  const kind = String(entry?.kind ?? '').trim().toLowerCase();
  const intent = String(entry?.intent ?? '').trim().toLowerCase();
  const source = String(entry?.source ?? '').trim().toLowerCase();

  if (kind === 'technical' || kind === 'system' || kind === 'audit' || intent === 'audit' || intent === 'debug' || source === 'audit') {
    return 'technical';
  }
  if (kind === 'place') return 'place';
  if (kind === 'rumor') return 'rumor';
  if (kind === 'obligation' || kind === 'claim' || intent === 'claim') return 'obligation';
  if (kind === 'person' || kind === 'npc') return 'person';
  if (kind === 'property' || kind === 'item' || source === 'property') return 'property';
  if (kind === 'assumption' || kind === 'hypothesis') return 'assumption';
  if (kind === 'memory' || kind === 'fact') return 'fact';
  return 'event';
}

function normalizeEventSource(source, intent, kind) {
  const text = String(source ?? intent ?? '').trim();
  if (text) return text;
  return kind === 'technical' || kind === 'system' ? 'world' : 'world';
}

function normalizeEventVisibility(value, kind) {
  const text = String(value ?? '').trim();
  if (text) return text;
  return kind === 'technical' || kind === 'system' ? 'hidden' : 'public';
}

function normalizeEventStatus(value, kind) {
  const text = String(value ?? '').trim();
  if (text) return text;
  return kind === 'technical' || kind === 'system' ? 'technical' : 'recorded';
}

function normalizeEventConfidence(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function normalizeRelatedIds(value) {
  const source = Array.isArray(value) ? value : value == null ? [] : [value];
  const relatedIds = [];
  const seen = new Set();

  for (const item of source) {
    const text = normalizeRelatedId(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    relatedIds.push(text);
  }

  return relatedIds;
}

function normalizeRelatedId(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value && typeof value === 'object') {
    return String(value.id ?? value.refId ?? value.key ?? '').trim();
  }
  return '';
}

function isTechnicalEventEntry(entry) {
  const kind = String(entry?.kind ?? '').trim().toLowerCase();
  const source = String(entry?.source ?? '').trim().toLowerCase();
  const visibility = String(entry?.visibility ?? '').trim().toLowerCase();
  const status = String(entry?.status ?? '').trim().toLowerCase();
  return kind === 'technical'
    || kind === 'system'
    || source === 'audit'
    || visibility === 'hidden'
    || status === 'technical';
}

function cloneTemporalValue(value) {
  if (!value || typeof value !== 'object') return value ?? null;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Best effort.
    }
  }
  return { ...value };
}
