import { digestValue, stableStringify } from './digest.js';

export const LEGACY_CLASSIFICATION_FIELD_REGISTRY = Object.freeze({
  item_templates: Object.freeze([
    field('item_type', true), field('function', true), field('typical_material', true),
    field('weight_band', true), field('size_band', true), field('durability', false),
    field('quality_band', true), field('value_band', false), field('rarity', false),
    field('legal_status', false), field('social_status_signal', false),
    field('typical_owner_roles', false), field('typical_holder_roles', false),
    field('typical_locations', false), field('typical_containers', false),
    field('visibility_default', false), field('access_default', false),
    field('marking_default', false), field('risk_default', false)
  ]),
  container_templates: Object.freeze([
    field('container_type', true), field('typical_material', true), field('capacity_band', true),
    field('closure_type', true), field('access_model', true), field('portability', true),
    field('content_compatibility', true), field('condition', false)
  ])
});

export function buildLegacyClassificationInventory({ source, rows_by_table = {}, existing_resolutions = [], approved_category_ids = [], field_registry = LEGACY_CLASSIFICATION_FIELD_REGISTRY, exported_at = null } = {}) {
  if (source?.verified !== true) return freeze({
    schema_version: 'rus.legacy_item_classification_inventory.v1',
    source: { kind: source?.kind ?? 'operator_database', verified: false, identity: source?.identity ?? null, verification_reason: source?.verification_reason ?? 'source_not_accessible' },
    exported_at, complete: false, source_snapshot_digest: null, legacy_field_row_count: null,
    resolution_counts: { mapped: null, data_gap: null, migration_conflict: null, deferred: null }, rows: [],
    issues: [issue('LEGACY_SOURCE_NOT_VERIFIED', 'The operator PostgreSQL/NocoDB source was not queried; no zero-row claim is made.', 'hard_block')]
  });
  if (!exported_at || !Number.isFinite(Date.parse(exported_at))) throw new TypeError('LEGACY_EXPORTED_AT_REQUIRED');
  if (!source.kind || !source.identity) throw new TypeError('LEGACY_SOURCE_IDENTITY_REQUIRED');
  const normalizedSource = { kind: source.kind, verified: true, identity: structuredClone(source.identity) };
  const approved = new Set(approved_category_ids);
  const flattened = flattenLegacyRows(rows_by_table, field_registry);
  const resolutionIndex = indexResolutions(existing_resolutions);
  const rows = flattened.map((record) => classifyRecord(record, resolutionIndex.get(record.key) ?? [], approved)).sort(compareRows);
  const resolutionCounts = { mapped: 0, data_gap: 0, migration_conflict: 0, deferred: 0 };
  for (const row of rows) resolutionCounts[row.resolution_status] += 1;
  return freeze({
    schema_version: 'rus.legacy_item_classification_inventory.v1', source: normalizedSource, exported_at, complete: true,
    source_snapshot_digest: digestValue({ source: normalizedSource, rows: flattened.map(({ key, ...row }) => row) }),
    legacy_field_row_count: rows.length, resolution_counts: resolutionCounts, rows, issues: []
  });
}

export function flattenLegacyRows(rowsByTable = {}, fieldRegistry = LEGACY_CLASSIFICATION_FIELD_REGISTRY) {
  const rows = [];
  for (const tableName of Object.keys(fieldRegistry).sort()) {
    const definitions = new Map(fieldRegistry[tableName].map((definition) => [definition.name, definition]));
    for (const record of [...(rowsByTable[tableName] ?? [])].sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))) {
      if (!record?.id) continue;
      for (const fieldName of [...definitions.keys()].sort()) {
        const value = record[fieldName];
        if (value == null || value === '' || Array.isArray(value) && value.length === 0 || isObject(value) && Object.keys(value).length === 0) continue;
        rows.push({ key: `${tableName}\u0000${record.id}\u0000${fieldName}`, legacy_table_name: tableName, legacy_record_id: String(record.id), legacy_field_name: fieldName, legacy_value: typeof value === 'string' ? value : stableStringify(value), field_required_for_classification: definitions.get(fieldName).required_for_classification === true });
      }
    }
  }
  return rows;
}

function classifyRecord(record, decisions, approved) {
  const matching = decisions.filter((decision) => decision.legacy_value === record.legacy_value);
  const stale = decisions.filter((decision) => decision.legacy_value !== record.legacy_value);
  let resolution_status; let resolved_category_id; let report_note;
  if (decisions.length > 1 || stale.length > 0) {
    resolution_status = 'migration_conflict';
    report_note = stale.length ? 'Existing resolution is bound to a different legacy value.' : 'Multiple migration resolutions exist for one legacy field.';
  } else if (matching.length === 1) {
    const decision = matching[0];
    if (decision.resolution_status === 'mapped' && decision.resolved_category_id && approved.has(decision.resolved_category_id)) {
      resolution_status = 'mapped'; resolved_category_id = decision.resolved_category_id; report_note = decision.report_note ?? 'Existing reviewed migration resolution reused.';
    } else if (decision.resolution_status === 'mapped') {
      resolution_status = 'migration_conflict'; report_note = 'Mapped resolution references a missing or non-approved category.';
    } else if (['data_gap', 'migration_conflict', 'deferred'].includes(decision.resolution_status)) {
      resolution_status = decision.resolution_status; report_note = decision.report_note ?? 'Existing migration decision reused.';
    } else {
      resolution_status = 'migration_conflict'; report_note = 'Existing migration resolution has an invalid status.';
    }
  } else if (record.field_required_for_classification) {
    resolution_status = 'data_gap'; report_note = 'No reviewed mapping exists for a required legacy classification field.';
  } else {
    resolution_status = 'deferred'; report_note = 'Legacy field is preserved for later editorial treatment and does not receive an inferred mapping.';
  }
  return { id: `legacy_item_classification_${digestValue([record.legacy_table_name, record.legacy_record_id, record.legacy_field_name, record.legacy_value]).slice(0, 24)}`, legacy_table_name: record.legacy_table_name, legacy_record_id: record.legacy_record_id, legacy_field_name: record.legacy_field_name, legacy_value: record.legacy_value, resolution_status, ...(resolved_category_id ? { resolved_category_id } : {}), report_note };
}

function indexResolutions(values) { const index = new Map(); for (const value of values ?? []) { if (!value?.legacy_table_name || !value?.legacy_record_id || !value?.legacy_field_name) continue; const key = `${value.legacy_table_name}\u0000${value.legacy_record_id}\u0000${value.legacy_field_name}`; index.set(key, [...(index.get(key) ?? []), structuredClone(value)]); } return index; }
function compareRows(a, b) { return [a.legacy_table_name, a.legacy_record_id, a.legacy_field_name, a.legacy_value].join('\u0000').localeCompare([b.legacy_table_name, b.legacy_record_id, b.legacy_field_name, b.legacy_value].join('\u0000')); }
function field(name, required_for_classification) { return Object.freeze({ name, required_for_classification }); }
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function issue(code, message, severity) { return Object.freeze({ code, message, severity }); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
