import spatialSchema from '../../../schemas/materialization/pr17-spatial-records-v1.schema.json' with { type: 'json' };
import { digestValue } from './digest.js';
import {
  MATERIALIZATION_AUTHORING_TABLES,
  MATERIALIZATION_FOREIGN_KEYS,
  validateClassificationCatalog,
  validateItemContainerClassificationCatalog,
  validateJsonSchemaRecords
} from './materialization-readiness.js';

const SPATIAL_TABLES = Object.freeze(Object.keys(spatialSchema.$defs).filter((key) => /^[a-z].*_templates$|^room_templates$|^building_layout_nodes$|^g4_materialization_bindings$|^materialization_slot_rules$|^g4_(?:item|container)_materialization_rules$/u.test(key)));
const ALLOWED_TABLES = new Set([...MATERIALIZATION_AUTHORING_TABLES, 'building_templates', 'item_templates', 'item_template_quantity_profiles', 'quantity_unit_definitions', 'category_labels', 'world_revisions', 'universal_categories', 'universal_category_relations', 'container_content_category_relations', 'record_sources']);

export function validatePr17ItemContainerCandidateBundle({ manifest, records_by_table: records = {}, reports = {}, external_ids: externalIds = {} } = {}) {
  const errors = [];
  if (manifest?.schema_version !== 'rus.pr17.item_container_candidate.v1') errors.push('CANDIDATE_MANIFEST_SCHEMA_INVALID');
  if (manifest?.approval !== 'pending_approve_all_120') errors.push('CANDIDATE_APPROVAL_STATE_INVALID');
  if (manifest?.activation !== 'not_requested') errors.push('CANDIDATE_ACTIVATION_FORBIDDEN');
  if (manifest?.deletion_policy !== 'none') errors.push('CANDIDATE_DELETION_POLICY_INVALID');
  if (manifest?.cohort?.template_count !== 120 || manifest?.cohort?.item_template_count !== 102 || manifest?.cohort?.container_template_count !== 18 || manifest?.cohort?.context_profile_count !== 9 || manifest?.cohort?.imported_g4_count !== 9332) errors.push('CANDIDATE_COHORT_INVALID');
  const core = manifest ? (({ candidate_digest, ...value }) => value)(manifest) : null;
  if (!manifest?.candidate_digest || manifest.candidate_digest !== digestValue(core)) errors.push('CANDIDATE_DIGEST_MISMATCH');

  const declared = new Set();
  let previousOrder = -1;
  for (const dataset of manifest?.datasets ?? []) {
    if (!ALLOWED_TABLES.has(dataset.table)) errors.push(`CANDIDATE_TABLE_NOT_REGISTERED:${dataset.table}`);
    if (declared.has(dataset.table)) errors.push(`CANDIDATE_TABLE_DUPLICATE:${dataset.table}`);
    declared.add(dataset.table);
    if (!Number.isInteger(dataset.dependency_order) || dataset.dependency_order <= previousOrder) errors.push(`CANDIDATE_DEPENDENCY_ORDER_INVALID:${dataset.table}`);
    previousOrder = dataset.dependency_order;
    const values = records[dataset.table];
    if (!Array.isArray(values)) errors.push(`CANDIDATE_DATASET_MISSING:${dataset.table}`);
    else {
      if (values.length !== dataset.record_count) errors.push(`CANDIDATE_RECORD_COUNT_MISMATCH:${dataset.table}`);
      if (digestValue(values) !== dataset.sha256) errors.push(`CANDIDATE_DATASET_DIGEST_MISMATCH:${dataset.table}`);
    }
  }
  for (const [table, values] of Object.entries(records)) if (values.length > 0 && !declared.has(table)) errors.push(`CANDIDATE_DATASET_UNDECLARED:${table}`);

  const order = new Map((manifest?.datasets ?? []).map((dataset) => [dataset.table, dataset.dependency_order]));
  for (const [sourceTable, sourceColumn, targetTable] of MATERIALIZATION_FOREIGN_KEYS) {
    if (!order.has(sourceTable) || !order.has(targetTable) || sourceTable === targetTable) continue;
    if ((records[sourceTable] ?? []).some((record) => record[sourceColumn] != null) && order.get(targetTable) >= order.get(sourceTable)) errors.push(`CANDIDATE_FK_ORDER_INVALID:${sourceTable}:${targetTable}`);
  }
  errors.push(...validateReferences(records, externalIds));
  errors.push(...validateUniqueTuple(records.universal_categories, ['domain', 'facet', 'preferred_label'], 'CANDIDATE_UNIVERSAL_CATEGORY_LABEL_DUPLICATE'));
  const approvalView = structuredClone(records);
  for (const rows of Object.values(approvalView)) for (const record of rows ?? []) if (record.status === 'draft') record.status = 'approved';
  errors.push(...validateClassificationCatalog(approvalView));
  errors.push(...validateItemContainerClassificationCatalog(approvalView, { worldRevisionId: manifest?.world_revision_id, effectiveAt: '1230-01-01' }));
  for (const table of SPATIAL_TABLES) if (records[table]?.length) {
    errors.push(...validateJsonSchemaRecords(table, records[table], { ...spatialSchema.$defs[table], $defs: spatialSchema.$defs }));
  }

  const readiness = reports.editorial_readiness;
  if (readiness?.approval_cohort_ready !== true || readiness?.summary?.ready_for_editorial_approval_count !== 120) errors.push('CANDIDATE_EDITORIAL_READINESS_INCOMPLETE');
  const coverage = reports.g4_coverage;
  if (coverage?.pass !== true || coverage?.summary?.g4_count !== 9332 || coverage?.summary?.resolved_profile_count !== 9332 || coverage?.summary?.ambiguous_binding_count !== 0 || coverage?.summary?.unapproved_dependency_count !== 0) errors.push('CANDIDATE_G4_COVERAGE_INCOMPLETE');
  const compilation = reports.compilation;
  if (compilation?.pass !== true || compilation?.candidate_digest !== manifest?.candidate_digest || compilation?.activation_performed !== false) errors.push('CANDIDATE_COMPILATION_REPORT_INVALID');
  return deepFreeze({ pass: errors.length === 0, errors: [...new Set(errors)].sort(), candidate_digest: manifest?.candidate_digest ?? null });
}

function validateUniqueTuple(rows = [], fields, code) {
  const seen = new Set();
  const errors = [];
  for (const row of rows) {
    const key = fields.map((field) => JSON.stringify(row[field] ?? null)).join('|');
    if (seen.has(key)) errors.push(`${code}:${key}`);
    seen.add(key);
  }
  return errors;
}

export async function applyPr17ItemContainerCandidateBundle({ manifest, records_by_table: records = {}, reports = {}, external_ids: externalIds = {}, mode = 'dry-run', adapter = null } = {}) {
  const validation = validatePr17ItemContainerCandidateBundle({ manifest, records_by_table: records, reports, external_ids: externalIds });
  if (!validation.pass) throw new Error(`PR17_CANDIDATE_INVALID:${validation.errors.join(',')}`);
  if (!['dry-run', 'apply'].includes(mode)) throw new Error(`PR17_IMPORT_MODE_INVALID:${mode}`);
  const datasets = [...manifest.datasets].sort((left, right) => left.dependency_order - right.dependency_order);
  const plan = datasets.map((dataset) => Object.freeze({ table: dataset.table, record_count: dataset.record_count, payload_digest: dataset.sha256, dependency_order: dataset.dependency_order }));
  if (mode === 'dry-run') return deepFreeze({ applied: false, mode, candidate_digest: manifest.candidate_digest, activation_performed: false, plan });
  for (const method of ['begin', 'insert', 'readback', 'commit', 'rollback']) if (typeof adapter?.[method] !== 'function') throw new Error(`PR17_IMPORT_ADAPTER_INVALID:${method}`);
  await adapter.begin();
  try {
    for (const dataset of datasets) {
      const rows = records[dataset.table];
      await adapter.insert(dataset.table, orderSelfReferentialRows(dataset.table, rows));
      const readback = await adapter.readback(dataset.table, rows);
      if (readback?.record_count !== dataset.record_count || readback?.payload_digest !== dataset.sha256) {
        throw new Error(`PR17_READBACK_MISMATCH:${dataset.table}:expected=${dataset.record_count}/${dataset.sha256}:actual=${readback?.record_count}/${readback?.payload_digest}`);
      }
    }
    await adapter.commit();
    return deepFreeze({ applied: true, mode, candidate_digest: manifest.candidate_digest, activation_performed: false, plan });
  } catch (error) {
    await adapter.rollback();
    throw error;
  }
}

function orderSelfReferentialRows(table, rows) {
  const parentColumns = MATERIALIZATION_FOREIGN_KEYS
    .filter(([sourceTable, , targetTable]) => sourceTable === table && targetTable === table)
    .map(([, sourceColumn]) => sourceColumn);
  if (parentColumns.length === 0) return rows;
  const remaining = new Map(rows.map((record) => [record.id, record]));
  const emitted = new Set();
  const ordered = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((record) => parentColumns.every((column) => record[column] == null || !remaining.has(record[column]) || emitted.has(record[column]))).sort((left, right) => String(left.id).localeCompare(String(right.id)));
    if (ready.length === 0) throw new Error(`PR17_SELF_REFERENCE_CYCLE:${table}`);
    for (const record of ready) {
      remaining.delete(record.id);
      emitted.add(record.id);
      ordered.push(record);
    }
  }
  return ordered;
}

function validateReferences(records, externalIds) {
  const errors = [];
  const known = (table) => new Set([...(records[table] ?? []).map((record) => record.id).filter(Boolean), ...(externalIds[table] ?? [])]);
  for (const [sourceTable, sourceColumn, targetTable] of MATERIALIZATION_FOREIGN_KEYS) for (const record of records[sourceTable] ?? []) {
    const value = record[sourceColumn];
    if (value != null && !known(targetTable).has(value)) errors.push(`CANDIDATE_FK_UNKNOWN:${sourceTable}:${record.id}:${sourceColumn}:${value}`);
  }
  const custom = [
    ['item_templates', 'world_revision_id', 'world_revisions'], ['item_templates', 'source_id', 'source_records'],
    ['container_templates', 'source_id', 'source_records'], ['building_templates', 'region_id', 'regions']
  ];
  for (const [sourceTable, sourceColumn, targetTable] of custom) for (const record of records[sourceTable] ?? []) if (record[sourceColumn] != null && !known(targetTable).has(record[sourceColumn])) errors.push(`CANDIDATE_FK_UNKNOWN:${sourceTable}:${record.id}:${sourceColumn}:${record[sourceColumn]}`);
  return errors;
}
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
