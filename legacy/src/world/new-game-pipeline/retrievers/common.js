import { getWorldBaseQueryable } from '../../world-base-db.js';

export const DEFAULT_ALLOWED_WORLD_BASE_STATUSES = Object.freeze(['approved', 'usable_with_caution']);

export const DEFAULT_LOAD_POLICY = Object.freeze({
  prefer_approved: true,
  allow_usable_with_caution: true,
  allow_draft: false,
  allow_needs_review: false,
  reject_conflict: true,
  reject_rejected: true,
  require_sources: true,
  max_records_per_group: 200,
  include_audit_notes: true
});

export function getRetrieverQueryable({ env = process.env, queryable = null } = {}) {
  return getWorldBaseQueryable(env, queryable);
}

export function normalizeLoadPolicy(policy = {}) {
  return {
    ...DEFAULT_LOAD_POLICY,
    ...(policy ?? {}),
    max_records_per_group: Number(policy?.max_records_per_group ?? DEFAULT_LOAD_POLICY.max_records_per_group)
  };
}

export function getAllowedStatuses(policy = {}) {
  const normalized = normalizeLoadPolicy(policy);
  const statuses = ['approved'];
  if (normalized.allow_usable_with_caution) statuses.push('usable_with_caution');
  if (normalized.allow_draft) statuses.push('draft');
  if (normalized.allow_needs_review) statuses.push('needs_review');
  return [...new Set(statuses)];
}

export function frameFromHistoricalFrame(historicalFrame = {}) {
  return {
    region_id: historicalFrame.region?.region_id ?? historicalFrame.regionId ?? historicalFrame.region_id ?? null,
    year: historicalFrame.year?.value ?? historicalFrame.year ?? null,
    season: historicalFrame.calendar?.season ?? historicalFrame.season ?? null,
    calendar: historicalFrame.calendar ?? {},
    clock: historicalFrame.clock ?? {}
  };
}

export function makeAudit(pass, concerns = [], evidence = []) {
  return { pass: pass === true, concerns, evidence };
}

export function sourceTrace(table, rows = []) {
  const qualifiedTable = table.startsWith('world_base.') ? table : `world_base.${table}`;
  return rows.map((row) => ({
    table: qualifiedTable,
    id: row.id ?? row.region_place_template_id ?? row.place_template_id ?? null,
    region_id: row.region_id ?? null,
    status: row.status ?? null,
    confidence: row.confidence ?? null,
    sources: normalizeSources(row.sources),
    game_use: row.game_use ?? row.regional_game_use ?? defaultGameUse(qualifiedTable),
    limits: row.limits ?? row.regional_limits_text ?? row.regional_limits ?? row.access_rule ?? row.seasonal_rule ?? row.do_not_use_when ?? row.hidden_truth_policy ?? defaultLimits(qualifiedTable),
    audit_notes: row.audit_notes ?? null
  }));
}

function defaultGameUse(table) {
  return `Loaded by stage 4 as regional context from ${table}.`;
}

function defaultLimits(table) {
  return `Use only as read-only regional context from ${table}; do not materialize downstream entities in stage 4.`;
}

export function normalizeSources(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return [value];
}

export function sourceIdsFromSources(value) {
  return normalizeSources(value)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object') return entry.source_id ?? entry.id ?? null;
      return null;
    })
    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

export function groupCount(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] ?? 'unknown';
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export function jsonArrayIncludes(value, needle) {
  if (!needle) return false;
  if (!Array.isArray(value)) return false;
  return value.includes(needle);
}
