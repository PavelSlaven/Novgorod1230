import { adaptPartyWritePlanTargets, validatePartyAdapterTargetSafety } from '@rus/party-store/stage-25';
import { computePartyDbWritePlanDigest } from '@rus/contracts';
import { SHA256_PATTERN, STAGE25_MAPPING_REPORT_SCHEMA, STAGE25_PHYSICAL_PLAN_SCHEMA } from '../policy/constants.js';
import { canonicalStage25Json, computeStage25Digest } from '../input/input-boundary.js';
import {
  array,
  hasDependencyCycle,
  isObject,
  issue,
  safeClone,
  sameScalarSet,
  stage25Error,
  text
} from '../shared/utils.js';
export function materializeStage25PhysicalPlan({ logical_plan, party_database_schema, world_base_reference_snapshot } = {}) {
  const logical = safeClone(logical_plan);
  const logicalDigest = computePartyDbWritePlanDigest(logical);
  const physical = adaptPartyWritePlanTargets(logical);
  physical.schema = STAGE25_PHYSICAL_PLAN_SCHEMA;
  physical.logical_plan_schema = logical.schema;
  physical.logical_plan_digest = logicalDigest;
  const mappingConcerns = validateMappingInvariants(logical, physical);
  const schemaConcerns = validatePhysicalWritePlan(physical, party_database_schema, world_base_reference_snapshot);
  const concerns = [...mappingConcerns, ...schemaConcerns];
  if (concerns.length > 0) throw stage25Error('preflight', concerns, 'Physical plan materialization failed.');
  const physicalDigest = computeStage25Digest(physical);
  return {
    physical_write_plan: physical,
    physical_write_plan_digest: physicalDigest,
    mapping_report: {
      version: 1,
      schema: STAGE25_MAPPING_REPORT_SCHEMA,
      logical_plan_digest: logicalDigest,
      physical_plan_digest: physicalDigest,
      batch_count: array(physical.write_batches).length,
      record_count: array(physical.write_batches).reduce((sum, batch) => sum + array(batch.records).length, 0),
      mappings: array(physical.write_batches).map((batch) => ({
        batch_id: batch.batch_id,
        spec_target_table: batch.spec_target_table ?? batch.target_table,
        physical_target_table: batch.target_table,
        adapter_version: batch.adapter_target?.version ?? null
      })),
      concerns: []
    }
  };
}

export function validatePhysicalMaterializationResult(result, input) {
  const concerns = [];
  if (!isObject(result?.physical_write_plan) || result.physical_write_plan.schema !== STAGE25_PHYSICAL_PLAN_SCHEMA) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'physical_write_plan is invalid.', 'physical_write_plan'));
  if (!SHA256_PATTERN.test(result?.physical_write_plan_digest ?? '') || result.physical_write_plan_digest !== computeStage25Digest(result.physical_write_plan)) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'physical_write_plan_digest mismatch.', 'physical_write_plan_digest'));
  if (result?.mapping_report?.schema !== STAGE25_MAPPING_REPORT_SCHEMA || result.mapping_report.physical_plan_digest !== result.physical_write_plan_digest || result.mapping_report.logical_plan_digest !== input.stage24_result_approval?.party_db_write_plan_digest) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'Physical plan mapping report is invalid.', 'mapping_report'));
  return concerns;
}

export function validateMappingInvariants(logical, physical) {
  const concerns = [];
  const logicalBatches = array(logical.write_batches);
  const physicalBatches = array(physical.write_batches);
  if (logicalBatches.length !== physicalBatches.length) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'Schema adapter changed batch count.', 'physical_write_plan.write_batches'));
  const physicalById = new Map(physicalBatches.map((batch) => [batch.batch_id, batch]));
  for (const batch of logicalBatches) {
    const adapted = physicalById.get(batch.batch_id);
    if (!adapted) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', `Schema adapter removed batch ${batch.batch_id}.`, 'physical_write_plan.write_batches'));
    else if (array(adapted.records).length !== array(batch.records).length) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', `Schema adapter changed record count for ${batch.batch_id}.`, 'physical_write_plan.write_batches'));
    else if (adapted.operation_mode !== batch.operation_mode || canonicalStage25Json(adapted.depends_on_batches ?? []) !== canonicalStage25Json(batch.depends_on_batches ?? [])) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', `Schema adapter changed operation/dependencies for ${batch.batch_id}.`, 'physical_write_plan.write_batches'));
  }
  if (canonicalStage25Json(physical.transaction?.write_order) !== canonicalStage25Json(logical.transaction?.write_order)) concerns.push(issue('STAGE25_PHYSICAL_PLAN_INVALID', 'Schema adapter changed write_order.', 'physical_write_plan.transaction.write_order'));
  return concerns;
}

export function validatePhysicalWritePlan(plan = {}, schema = {}, worldSnapshot = null) {
  const concerns = [];
  const schemaIndex = buildSchemaIndex(schema, worldSnapshot);
  const graph = validateBatchGraph(plan);
  concerns.push(...graph);
  const safety = validatePartyAdapterTargetSafety(plan);
  for (const item of array(safety.concerns)) concerns.push(issue(item.code === 'PARTY_ADAPTER_WORLD_BASE_WRITE_FORBIDDEN' ? 'STAGE25_WORLD_BASE_MUTATION' : 'STAGE25_HIDDEN_PUBLIC_LEAK', item.message, item.path ?? 'physical_write_plan'));

  for (const batch of array(plan.write_batches)) {
    const table = schemaIndex.tables.get(batch.target_table);
    if (!table) {
      concerns.push(issue('STAGE25_UNKNOWN_TABLE', `Unknown party table ${batch.target_table}.`, `write_batches.${batch.batch_id}.target_table`));
      continue;
    }
    const allowedOps = table.allowedOperations.size ? table.allowedOperations : schemaIndex.globalOperations;
    if (!allowedOps.has(batch.operation_mode)) concerns.push(issue('STAGE25_INVALID_OPERATION', `Operation ${batch.operation_mode} is not allowed for ${batch.target_table}.`, `write_batches.${batch.batch_id}.operation_mode`));
    for (const record of array(batch.records)) {
      for (const key of Object.keys(record)) if (!table.columns.has(key)) concerns.push(issue('STAGE25_UNKNOWN_COLUMN', `Unknown column ${batch.target_table}.${key}.`, `write_batches.${batch.batch_id}.records.${key}`));
      if (['insert_only', 'snapshot_insert', 'upsert_with_idempotency'].includes(batch.operation_mode)) {
        for (const required of table.requiredColumns) if (!(required in record) || record[required] == null) concerns.push(issue('STAGE25_CONSTRAINT_INVALID', `Required column ${batch.target_table}.${required} is missing.`, `write_batches.${batch.batch_id}.records.${required}`));
      }
      if (batch.operation_mode === 'update_only' && !text(record.id)) concerns.push(issue('STAGE25_CONSTRAINT_INVALID', `${batch.batch_id} update_only requires id.`, `write_batches.${batch.batch_id}.records.id`));
      concerns.push(...validateRecordTypes(record, batch.target_table, table.columns));
      concerns.push(...validateRecordEnums(record, batch.target_table, schemaIndex));
      concerns.push(...validateRecordChecks(record, batch.target_table, schemaIndex));
      concerns.push(...validateApprovedRecordRefs(record, schemaIndex.worldSnapshot));
    }
    if (array(batch.source_trace).length === 0) concerns.push(issue('STAGE25_SOURCE_TRACE_MISSING', `Batch ${batch.batch_id} requires source_trace.`, `write_batches.${batch.batch_id}.source_trace`));
  }
  concerns.push(...validatePlanUniqueConstraints(plan, schemaIndex));
  concerns.push(...validatePlanForeignKeys(plan, schemaIndex));
  const knowledge = plan.knowledge_projection_validation;
  if (!isObject(knowledge) || canonicalStage25Json(knowledge.expected_counts) !== canonicalStage25Json(knowledge.planned_counts) || canonicalStage25Json(knowledge.expected_record_keys) !== canonicalStage25Json(knowledge.planned_record_keys) || !text(knowledge.source_content_hash)) concerns.push(issue('STAGE25_KNOWLEDGE_PROJECTION_INVALID', 'Knowledge projection counts/keys/hash do not match.', 'knowledge_projection_validation'));
  const batchIds = array(plan.write_batches).map((batch) => batch.batch_id);
  if (!isObject(plan.rollback_plan) || plan.rollback_plan.strategy !== 'full_transaction_rollback' || !sameScalarSet(plan.rollback_plan.covered_batch_ids, batchIds)) concerns.push(issue('STAGE25_ROLLBACK_INVALID', 'Rollback plan must cover every batch.', 'rollback_plan'));
  if (array(plan.postconditions).length === 0) concerns.push(issue('STAGE25_POSTCONDITIONS_MISSING', 'Stage 25 requires write-plan postconditions.', 'postconditions'));
  if (array(plan.source_trace).length === 0) concerns.push(issue('STAGE25_SOURCE_TRACE_MISSING', 'Top-level source_trace is required.', 'source_trace'));
  return concerns;
}

function buildSchemaIndex(schema, worldSnapshot = null) {
  const tables = new Map();
  const globalOperations = new Set(array(schema.allowed_operations));
  const topColumns = array(schema.columns);
  for (const raw of array(schema.tables)) {
    const name = raw.name ?? raw.table_name;
    const embedded = array(raw.columns);
    const external = topColumns.filter((column) => (column.table_name ?? column.table) === name);
    const columns = new Map();
    const requiredColumns = new Set();
    for (const column of [...embedded, ...external]) {
      const columnName = typeof column === 'string' ? column : column.name ?? column.column_name;
      if (!columnName) continue;
      columns.set(columnName, column);
      const nullable = typeof column === 'string' ? true : column.nullable;
      const generated = typeof column === 'string' ? false : column.generated === true || column.default != null;
      if ((nullable === false || nullable === 'no') && !generated) requiredColumns.add(columnName);
    }
    tables.set(name, {
      raw,
      columns,
      requiredColumns,
      allowedOperations: new Set(array(raw.allowed_operations ?? raw.allowedOperations))
    });
  }
  const enumMap = new Map();
  for (const item of array(schema.enum_definitions ?? schema.enums)) {
    const key = item.column ? `${item.table ?? item.table_name}.${item.column ?? item.column_name}` : item.enum_name;
    const values = enumMap.get(key) ?? new Set();
    for (const value of array(item.values ?? [item.value])) if (value != null) values.add(value);
    enumMap.set(key, values);
  }
  return {
    tables,
    globalOperations,
    enumMap,
    foreignKeys: array(schema.foreign_keys ?? schema.relationships),
    uniqueConstraints: array(schema.unique_constraints),
    checkConstraints: array(schema.check_constraints ?? schema.validation_rules),
    worldSnapshot
  };
}

function validateRecordTypes(record, tableName, columns) {
  const concerns = [];
  for (const [key, value] of Object.entries(record)) {
    if (value == null) continue;
    const column = columns.get(key);
    if (!column || typeof column === 'string') continue;
    const type = String(column.data_type ?? column.type ?? '').toUpperCase();
    let valid = true;
    if (/^(?:SMALLINT|INTEGER|INT|BIGINT|NUMERIC|DECIMAL|REAL|DOUBLE)/u.test(type)) valid = typeof value === 'number' && Number.isFinite(value);
    else if (/^(?:BOOLEAN|BOOL)/u.test(type)) valid = typeof value === 'boolean';
    else if (/^(?:TEXT|VARCHAR|CHAR|UUID)/u.test(type)) valid = typeof value === 'string';
    else if (/^(?:JSON|JSONB)/u.test(type)) valid = typeof value === 'object' || typeof value === 'string';
    else if (/^(?:TIMESTAMP|DATE|TIME)/u.test(type)) valid = typeof value === 'string' || value instanceof Date;
    if (!valid) concerns.push(issue('STAGE25_TYPE_INVALID', `Invalid value type for ${tableName}.${key}; expected ${type}.`, `${tableName}.${key}`));
  }
  return concerns;
}

function validateRecordEnums(record, tableName, schemaIndex) {
  const concerns = [];
  for (const [key, value] of Object.entries(record)) {
    const values = schemaIndex.enumMap.get(`${tableName}.${key}`);
    if (values?.size && value != null && !values.has(value)) concerns.push(issue('STAGE25_ENUM_INVALID', `Invalid enum ${tableName}.${key}=${String(value)}.`, `${tableName}.${key}`));
  }
  return concerns;
}

function validateRecordChecks(record, tableName, schemaIndex) {
  const concerns = [];
  for (const check of schemaIndex.checkConstraints) {
    const checkTable = check.table ?? check.table_name;
    if (checkTable && checkTable !== tableName) continue;
    const column = check.column ?? check.column_name;
    if (!column || !(column in record) || record[column] == null) continue;
    const value = record[column];
    const allowed = array(check.allowed_values ?? check.values);
    if (allowed.length > 0 && !allowed.includes(value)) concerns.push(issue('STAGE25_CHECK_CONSTRAINT_INVALID', `Check constraint rejected ${tableName}.${column}.`, `${tableName}.${column}`));
    if (Number.isFinite(Number(check.min)) && Number(value) < Number(check.min)) concerns.push(issue('STAGE25_CHECK_CONSTRAINT_INVALID', `${tableName}.${column} is below minimum.`, `${tableName}.${column}`));
    if (Number.isFinite(Number(check.max)) && Number(value) > Number(check.max)) concerns.push(issue('STAGE25_CHECK_CONSTRAINT_INVALID', `${tableName}.${column} exceeds maximum.`, `${tableName}.${column}`));
  }
  return concerns;
}

function validatePlanUniqueConstraints(plan, schemaIndex) {
  const concerns = [];
  const byTable = recordsByTable(plan);
  for (const constraint of schemaIndex.uniqueConstraints) {
    const table = constraint.table ?? constraint.table_name;
    const columns = array(constraint.columns ?? constraint.column_names ?? (constraint.column ? [constraint.column] : []));
    if (!table || columns.length === 0) continue;
    const seen = new Set();
    for (const record of byTable.get(table) ?? []) {
      const values = columns.map((column) => record[column]);
      if (values.some((value) => value == null)) continue;
      const key = canonicalStage25Json(values);
      if (seen.has(key)) concerns.push(issue('STAGE25_UNIQUE_CONSTRAINT_INVALID', `Duplicate values for ${table} unique constraint (${columns.join(',')}).`, table));
      seen.add(key);
    }
  }
  return concerns;
}

function validatePlanForeignKeys(plan, schemaIndex) {
  const concerns = [];
  const byTable = recordsByTable(plan);
  for (const fk of schemaIndex.foreignKeys) {
    const fromTable = fk.from_table ?? fk.table ?? fk.source_table;
    const fromColumn = fk.from_column ?? fk.column ?? fk.source_column;
    const toTable = fk.to_table ?? fk.references_table ?? fk.target_table;
    const toColumn = fk.to_column ?? fk.references_column ?? fk.target_column ?? 'id';
    if (!fromTable || !fromColumn || !toTable || !byTable.has(fromTable) || !byTable.has(toTable)) continue;
    const targets = new Set((byTable.get(toTable) ?? []).map((record) => record[toColumn]).filter((value) => value != null));
    for (const record of byTable.get(fromTable) ?? []) {
      const value = record[fromColumn];
      if (value != null && !targets.has(value)) concerns.push(issue('STAGE25_FK_INVALID', `In-plan FK ${fromTable}.${fromColumn}=${String(value)} does not resolve to ${toTable}.${toColumn}.`, `${fromTable}.${fromColumn}`));
    }
  }
  return concerns;
}

function recordsByTable(plan) {
  const map = new Map();
  for (const batch of array(plan.write_batches)) {
    const list = map.get(batch.target_table) ?? [];
    list.push(...array(batch.records));
    map.set(batch.target_table, list);
  }
  return map;
}

function validateApprovedRecordRefs(record, worldSnapshot) {
  if (!isObject(worldSnapshot)) return [];
  const concerns = [];
  const checks = [
    ['region_id', 'allowed_region_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['world_base_region_id', 'allowed_region_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['canonical_node_id', 'allowed_graph_node_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['canonical_edge_id', 'allowed_graph_edge_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['route_id', 'allowed_graph_edge_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['anchor_id', 'allowed_graph_node_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['canonical_anchor_id', 'allowed_graph_node_ids', 'STAGE25_GRAPH_REFERENCE_INVALID'],
    ['npc_candidate_id', 'allowed_npc_candidate_ids', 'STAGE25_NPC_REFERENCE_INVALID'],
    ['canonical_npc_id', 'allowed_npc_candidate_ids', 'STAGE25_NPC_REFERENCE_INVALID'],
    ['item_profile_id', 'allowed_item_profile_ids', 'STAGE25_ITEM_CONTAINER_REFERENCE_INVALID'],
    ['canonical_item_template_id', 'allowed_item_profile_ids', 'STAGE25_ITEM_CONTAINER_REFERENCE_INVALID'],
    ['container_profile_id', 'allowed_container_profile_ids', 'STAGE25_ITEM_CONTAINER_REFERENCE_INVALID'],
    ['property_rule_id', 'allowed_property_rule_ids', 'STAGE25_ITEM_CONTAINER_REFERENCE_INVALID'],
    ['source_id', 'allowed_source_ids', 'STAGE25_SOURCE_ID_INVALID']
  ];
  for (const [key, allowKey, code] of checks) {
    if (record[key] == null) continue;
    const allowed = new Set(array(worldSnapshot[allowKey]));
    if (allowed.size > 0 && !allowed.has(record[key])) concerns.push(issue(code, `Unapproved reference ${key}=${record[key]}.`, key));
  }
  return concerns;
}

function validateBatchGraph(plan) {
  const concerns = [];
  const batches = array(plan.write_batches);
  const byId = new Map();
  for (const batch of batches) {
    if (!text(batch.batch_id) || byId.has(batch.batch_id)) concerns.push(issue('STAGE25_WRITE_ORDER_INVALID', `Duplicate or missing batch_id ${String(batch.batch_id)}.`, 'write_batches'));
    else byId.set(batch.batch_id, batch);
  }
  const order = array(plan.transaction?.write_order);
  if (order.length !== batches.length || new Set(order).size !== order.length || !sameScalarSet(order, [...byId.keys()])) concerns.push(issue('STAGE25_WRITE_ORDER_INVALID', 'write_order must contain every batch exactly once.', 'transaction.write_order'));
  const positions = new Map(order.map((id, index) => [id, index]));
  for (const batch of batches) {
    for (const dep of array(batch.depends_on_batches)) {
      if (!byId.has(dep) || positions.get(dep) >= positions.get(batch.batch_id)) concerns.push(issue('STAGE25_DEPENDENCY_INVALID', `Dependency ${dep} must exist and precede ${batch.batch_id}.`, `write_batches.${batch.batch_id}.depends_on_batches`));
    }
  }
  if (hasDependencyCycle(byId)) concerns.push(issue('STAGE25_DEPENDENCY_INVALID', 'Batch dependency graph contains a cycle.', 'write_batches'));
  return concerns;
}

