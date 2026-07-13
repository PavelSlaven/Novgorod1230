import { deepFreeze } from '@rus/kernel';

export const BODY_METRICS = deepFreeze(['health', 'satiety', 'energy']);

export function clampBodyMetric(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric));
}

export function normalizeBodyState(state = {}) {
  const metrics = {};
  for (const key of BODY_METRICS) metrics[key] = clampBodyMetric(state[key]);
  return deepFreeze({
    ...metrics,
    active_conditions: normalizeConditions(state.active_conditions ?? state.conditions),
    body_parts: plainObject(state.body_parts) ? structuredClone(state.body_parts) : {},
    prose: text(state.prose) || null
  });
}

export function applyBodyStateChange(state = {}, change = {}) {
  const current = normalizeBodyState(state);
  const next = structuredClone(current);
  for (const key of BODY_METRICS) {
    const before = current[key];
    if (before == null) continue;
    const restore = finite(change?.restore?.[key]) ?? 0;
    const spend = finite(change?.spend?.[key]) ?? 0;
    const harm = finite(change?.harm?.[key]) ?? 0;
    next[key] = clampBodyMetric(before + restore - spend - harm);
  }
  if (Array.isArray(change.add_conditions)) {
    const byId = new Map(next.active_conditions.map((entry) => [entry.id, entry]));
    for (const condition of normalizeConditions(change.add_conditions)) byId.set(condition.id, condition);
    next.active_conditions = [...byId.values()];
  }
  if (Array.isArray(change.remove_condition_ids)) {
    const remove = new Set(change.remove_condition_ids.map(text));
    next.active_conditions = next.active_conditions.filter((entry) => !remove.has(entry.id));
  }
  return deepFreeze(next);
}

export function stateModifier(state = {}, relevantMetrics = BODY_METRICS) {
  const normalized = normalizeBodyState(state);
  let modifier = 0;
  for (const key of relevantMetrics) {
    const value = normalized[key];
    if (value == null) continue;
    if (value === 0) modifier = Math.min(modifier, -4);
    else if (value <= 20) modifier = Math.min(modifier, -2);
    else if (value <= 49) modifier = Math.min(modifier, -1);
  }
  for (const condition of normalized.active_conditions) {
    const value = finite(condition.modifier);
    if (value != null) modifier = Math.min(modifier, value);
  }
  return Math.max(-4, Math.min(0, modifier));
}

export function validateBodyState(state = {}) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return { ok: false, errors: ['body state must be an object'] };
  for (const key of BODY_METRICS) {
    if (state[key] == null) continue;
    const value = Number(state[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) errors.push(`${key} must be between 0 and 100`);
  }
  for (const condition of normalizeConditions(state.active_conditions ?? state.conditions)) {
    if (!condition.id) errors.push('active condition id is required');
  }
  return { ok: errors.length === 0, errors };
}

function normalizeConditions(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)).map((entry) => ({
    id: text(entry.id) || null,
    label: text(entry.label) || null,
    location: text(entry.location) || null,
    severity: finite(entry.severity),
    cause: text(entry.cause) || null,
    effect: text(entry.effect) || null,
    treatment: text(entry.treatment) || null,
    modifier: finite(entry.modifier)
  }));
}
function plainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
