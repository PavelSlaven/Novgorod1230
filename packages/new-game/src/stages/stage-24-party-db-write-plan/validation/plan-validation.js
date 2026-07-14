import {
  ALLOWED_PLAN_KEYS,
  HIDDEN_FIELD_PATTERN,
  PLAYER_OUTPUT_FIELD_PATTERN,
  PUBLIC_TABLE_PATTERN,
  STAGE24_PLAN_SCHEMA,
  STAGE24_PRECHECK_SCHEMA,
  WORLD_BASE_PATTERN
} from '../policy/constants.js';
import {
  array,
  canonicalJson,
  computePartyDbWritePlanDigest,
  isObject,
  issue,
  tableName,
  text,
  walk
} from '../shared/utils.js';
import { buildApprovedReferenceIndex, findCurrentPosition, findFirstField, referenceRule } from '../references/reference-index.js';

export function validatePartyDbWritePlan(plan = {}, input = {}, precheck = null) {
  const concerns = [];
  const evidence = [];
  if (!isObject(plan)) return [issue('WRITE_PLAN_FORMAT_INVALID', 'party_db_write_plan must be an object.', 'plan')];
  for (const key of Object.keys(plan)) if (!ALLOWED_PLAN_KEYS.has(key)) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', `Unexpected write plan field: ${key}.`, key));
  if (plan.version !== 1 || plan.schema !== STAGE24_PLAN_SCHEMA) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', `Expected ${STAGE24_PLAN_SCHEMA} version 1.`, 'schema'));
  if (plan.request_id !== input.request_id) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Plan request_id must match Stage 24 input.', 'request_id'));
  if (plan.plan_status !== 'formed') concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'plan_status must be formed.', 'plan_status'));
  if (precheck?.schema !== STAGE24_PRECHECK_SCHEMA || precheck?.pass !== true) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Stage 24 code precheck must pass before validating a plan.', 'precheck'));
  for (const [key, expected] of [
    ['source_input_digest', input.party_db_write_plan_input_digest],
    ['party_database_schema_digest', input.party_database_schema_digest],
    ['world_base_reference_digest', input.world_base_reference_digest],
    ['approved_pipeline_manifest_digest', input.approved_pipeline_manifest_digest]
  ]) if (plan[key] !== expected) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', `${key} mismatch.`, key));

  concerns.push(...validateTransaction(plan.transaction, input));
  concerns.push(...validateBatchGraph(plan));
  concerns.push(...validatePlanAgainstDatabaseSchema(plan, input.party_database_schema));
  concerns.push(...validateApprovedReferences(plan, input));
  concerns.push(...validateKnowledgeProjection(plan, input));
  concerns.push(...validateHiddenVisibleBoundary(plan));
  concerns.push(...validateSourceTrace(plan));
  concerns.push(...validateRollback(plan));
  concerns.push(...validateAuditSnapshots(plan, input));
  concerns.push(...validateForbiddenWrites(plan));
  concerns.push(...validateSelfAudit(plan));

  if (concerns.length === 0) evidence.push('Write plan passed structural, schema, approved-reference, knowledge, boundary, trace and rollback validation.');
  return concerns;
}
function validateTransaction(transaction, input) {
  const concerns = [];
  if (!isObject(transaction)) return [issue('WRITE_PLAN_TRANSACTION_INVALID', 'transaction is required.', 'transaction')];
  for (const key of ['transaction_id', 'party_id', 'idempotency_key', 'rollback_strategy']) if (!text(transaction[key])) concerns.push(issue('WRITE_PLAN_TRANSACTION_INVALID', `transaction.${key} is required.`, `transaction.${key}`));
  if (transaction.party_id !== input.party_creation_context.party_id) concerns.push(issue('WRITE_PLAN_TRANSACTION_INVALID', 'transaction.party_id must match party_creation_context.', 'transaction.party_id'));
  if (transaction.idempotency_key !== input.party_creation_context.idempotency_key) concerns.push(issue('WRITE_PLAN_IDEMPOTENCY_INVALID', 'transaction.idempotency_key must match party_creation_context.', 'transaction.idempotency_key'));
  if (transaction.is_atomic !== true) concerns.push(issue('WRITE_PLAN_NON_ATOMIC', 'transaction.is_atomic must be true.', 'transaction.is_atomic'));
  if (transaction.is_dry_run_first !== true) concerns.push(issue('WRITE_PLAN_TRANSACTION_INVALID', 'transaction.is_dry_run_first must be true.', 'transaction.is_dry_run_first'));
  if (transaction.rollback_strategy !== 'full_transaction_rollback') concerns.push(issue('WRITE_PLAN_ROLLBACK_INCOMPLETE', 'rollback_strategy must be full_transaction_rollback.', 'transaction.rollback_strategy'));
  if (!Array.isArray(transaction.write_order) || transaction.write_order.length === 0) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'transaction.write_order must be non-empty.', 'transaction.write_order'));
  return concerns;
}

function validateBatchGraph(plan) {
  const concerns = [];
  const batches = array(plan.write_batches);
  if (!Array.isArray(plan.write_batches) || batches.length === 0) return [issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'write_batches must be a non-empty array.', 'write_batches')];
  const ids = new Set();
  const orders = new Set();
  for (const [index, batch] of batches.entries()) {
    if (!text(batch?.batch_id)) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'batch_id is required.', `write_batches[${index}].batch_id`));
    else if (ids.has(batch.batch_id)) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', `Duplicate batch_id: ${batch.batch_id}.`, `write_batches[${index}].batch_id`));
    else ids.add(batch.batch_id);
    if (!Number.isInteger(batch?.order)) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'batch order must be integer.', `write_batches[${index}].order`));
    else if (orders.has(batch.order)) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', `Duplicate batch order: ${batch.order}.`, `write_batches[${index}].order`));
    else orders.add(batch.order);
    if (!text(batch?.target_table)) concerns.push(issue('WRITE_PLAN_UNKNOWN_TABLE', 'target_table is required.', `write_batches[${index}].target_table`));
    if (!text(batch?.operation_mode)) concerns.push(issue('WRITE_PLAN_INVALID_OPERATION', 'operation_mode is required.', `write_batches[${index}].operation_mode`));
    if (!Array.isArray(batch?.records)) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'batch.records must be an array.', `write_batches[${index}].records`));
  }
  const order = array(plan.transaction?.write_order);
  if (order.length !== ids.size || new Set(order).size !== ids.size || [...ids].some((id) => !order.includes(id))) concerns.push(issue('WRITE_PLAN_WRITE_ORDER_INVALID', 'transaction.write_order must contain every batch exactly once.', 'transaction.write_order'));
  const byId = new Map(batches.map((batch) => [batch.batch_id, batch]));
  for (const batch of batches) for (const dependency of array(batch.depends_on_batches)) if (dependency !== 'all_previous_batches' && !byId.has(dependency)) concerns.push(issue('WRITE_PLAN_DEPENDENCY_INVALID', `${batch.batch_id} depends on missing batch ${dependency}.`, `write_batches.${batch.batch_id}.depends_on_batches`));
  concerns.push(...detectDependencyCycles(byId));
  return concerns;
}

function detectDependencyCycles(byId) {
  const concerns = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (!byId.has(id) || visited.has(id)) return;
    if (visiting.has(id)) {
      concerns.push(issue('WRITE_PLAN_DEPENDENCY_CYCLE', `Dependency cycle contains ${id}.`, `write_batches.${id}`));
      return;
    }
    visiting.add(id);
    for (const dep of array(byId.get(id)?.depends_on_batches)) if (dep !== 'all_previous_batches') visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  return concerns;
}

function validatePlanAgainstDatabaseSchema(plan, snapshot) {
  const concerns = [];
  const tables = new Map(array(snapshot?.tables).map((table) => [tableName(table), table]));
  const globalOperations = new Set(array(snapshot?.allowed_operations));
  const enums = new Map(array(snapshot?.enum_definitions).map((item) => [item.name ?? item.enum_name, new Set(array(item.values))]));
  for (const [batchIndex, batch] of array(plan.write_batches).entries()) {
    const table = tables.get(batch.target_table);
    if (!table) {
      concerns.push(issue('WRITE_PLAN_UNKNOWN_TABLE', `Unknown target table: ${batch.target_table}.`, `write_batches[${batchIndex}].target_table`));
      continue;
    }
    const allowedOps = new Set(array(table.allowed_operations).length ? array(table.allowed_operations) : [...globalOperations]);
    if (!allowedOps.has(batch.operation_mode)) concerns.push(issue('WRITE_PLAN_INVALID_OPERATION', `Operation ${batch.operation_mode} is not allowed for ${batch.target_table}.`, `write_batches[${batchIndex}].operation_mode`));
    const columns = new Map(array(table.columns).map((column) => [column.name ?? column.column_name, column]));
    for (const [recordIndex, record] of array(batch.records).entries()) {
      if (!isObject(record)) {
        concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'Each record must be an object.', `write_batches[${batchIndex}].records[${recordIndex}]`));
        continue;
      }
      for (const [key, value] of Object.entries(record)) {
        const column = columns.get(key);
        if (!column) {
          concerns.push(issue('WRITE_PLAN_UNKNOWN_COLUMN', `Unknown column ${batch.target_table}.${key}.`, `write_batches[${batchIndex}].records[${recordIndex}].${key}`));
          continue;
        }
        const enumName = column.enum_name ?? column.enum;
        if (enumName && enums.has(enumName) && value != null && !enums.get(enumName).has(value)) concerns.push(issue('WRITE_PLAN_ENUM_INVALID', `Invalid enum value for ${batch.target_table}.${key}.`, `write_batches[${batchIndex}].records[${recordIndex}].${key}`));
      }
      for (const column of columns.values()) {
        const name = column.name ?? column.column_name;
        if ((column.required === true || column.nullable === false) && column.default == null && record[name] == null) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', `Required column missing: ${batch.target_table}.${name}.`, `write_batches[${batchIndex}].records[${recordIndex}].${name}`));
      }
    }
  }
  return concerns;
}

function validateApprovedReferences(plan, input) {
  const concerns = [];
  const refs = buildApprovedReferenceIndex(input);
  walk(plan.write_batches, (key, value, path) => {
    if (!text(value)) return;
    const rule = referenceRule(key);
    if (!rule) return;
    const set = refs[rule.set];
    if (set.size > 0 && !set.has(value)) concerns.push(issue(rule.code, `${key} is not present in approved Stage 24 inputs: ${value}.`, path));
  }, 'write_batches');
  const expectedPosition = findCurrentPosition(input.approved_pipeline_outputs);
  if (expectedPosition) {
    for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) {
      const planned = findFirstField(plan.write_batches, key, /position|party_state/i);
      if (planned != null && expectedPosition[key] != null && planned !== expectedPosition[key]) concerns.push(issue('WRITE_PLAN_POSITION_MISMATCH', `Planned ${key} differs from approved current position.`, `write_batches.${key}`));
    }
  }
  return concerns;
}

function validateKnowledgeProjection(plan, input) {
  const concerns = [];
  const expected = input.approved_pipeline_outputs?.character_knowledge_write_projection?.projection_manifest;
  const actual = plan.knowledge_projection_validation;
  if (!isObject(expected) || !isObject(actual)) return [issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'knowledge projection validation is required.', 'knowledge_projection_validation')];
  if (actual.source_content_hash !== expected.source_content_hash) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'Knowledge source_content_hash mismatch.', 'knowledge_projection_validation.source_content_hash'));
  if (canonicalJson(actual.expected_counts) !== canonicalJson(expected.expected_counts)) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'Knowledge expected_counts mismatch.', 'knowledge_projection_validation.expected_counts'));
  if (canonicalJson(array(actual.expected_record_keys).slice().sort()) !== canonicalJson(array(expected.expected_record_keys).slice().sort())) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'Knowledge expected_record_keys mismatch.', 'knowledge_projection_validation.expected_record_keys'));
  if (canonicalJson(actual.planned_counts) !== canonicalJson(expected.expected_counts)) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_INCOMPLETE', 'Knowledge planned_counts must equal expected_counts.', 'knowledge_projection_validation.planned_counts'));
  if (canonicalJson(array(actual.planned_record_keys).slice().sort()) !== canonicalJson(array(expected.expected_record_keys).slice().sort())) concerns.push(issue('WRITE_PLAN_KNOWLEDGE_PROJECTION_EXTRA', 'Knowledge planned_record_keys must exactly equal expected_record_keys.', 'knowledge_projection_validation.planned_record_keys'));
  return concerns;
}

function validateHiddenVisibleBoundary(plan) {
  const concerns = [];
  for (const [batchIndex, batch] of array(plan.write_batches).entries()) {
    if (WORLD_BASE_PATTERN.test(batch.target_table ?? '')) concerns.push(issue('WRITE_PLAN_WORLD_BASE_MUTATION', 'Stage 24 cannot write to world_base.', `write_batches[${batchIndex}].target_table`));
    if (PUBLIC_TABLE_PATTERN.test(batch.target_table ?? '')) {
      walk(batch.records, (key, value, path) => {
        if (HIDDEN_FIELD_PATTERN.test(key) && value != null && value !== '' && !(Array.isArray(value) && value.length === 0)) concerns.push(issue('WRITE_PLAN_HIDDEN_PUBLIC_LEAK', 'Hidden-only field cannot be written to player-facing table.', `write_batches[${batchIndex}].${path}`));
      });
    }
    walk(batch.records, (key, value, path) => {
      if (PLAYER_OUTPUT_FIELD_PATTERN.test(key) && value === true) concerns.push(issue('WRITE_PLAN_PLAYER_OUTPUT_BEFORE_COMMIT', 'Player output cannot be marked committed inside Stage 24 plan.', `write_batches[${batchIndex}].${path}`));
    });
  }
  return concerns;
}

function validateSourceTrace(plan) {
  const concerns = [];
  if (!Array.isArray(plan.source_trace) || plan.source_trace.length === 0) concerns.push(issue('WRITE_PLAN_SOURCE_TRACE_INCOMPLETE', 'Top-level source_trace must be non-empty.', 'source_trace'));
  for (const [batchIndex, batch] of array(plan.write_batches).entries()) {
    const batchTrace = array(batch.source_trace);
    for (const [recordIndex, record] of array(batch.records).entries()) {
      const recordTrace = array(record?.source_trace);
      if (batchTrace.length === 0 && recordTrace.length === 0) concerns.push(issue('WRITE_PLAN_SOURCE_TRACE_INCOMPLETE', 'Every record requires record or batch source_trace.', `write_batches[${batchIndex}].records[${recordIndex}].source_trace`));
    }
  }
  return concerns;
}

function validateRollback(plan) {
  const concerns = [];
  const rollback = plan.rollback_plan;
  if (!isObject(rollback) || rollback.strategy !== 'full_transaction_rollback') concerns.push(issue('WRITE_PLAN_ROLLBACK_INCOMPLETE', 'rollback_plan.strategy must be full_transaction_rollback.', 'rollback_plan.strategy'));
  const covered = new Set(array(rollback?.covered_batch_ids));
  for (const batch of array(plan.write_batches)) if (!covered.has(batch.batch_id)) concerns.push(issue('WRITE_PLAN_ROLLBACK_INCOMPLETE', `Rollback does not cover batch ${batch.batch_id}.`, 'rollback_plan.covered_batch_ids'));
  return concerns;
}

function validateAuditSnapshots(plan, input) {
  const concerns = [];
  const snapshots = array(plan.audit_snapshots);
  if (snapshots.length === 0) return [issue('WRITE_PLAN_AUDIT_SNAPSHOT_INCOMPLETE', 'audit_snapshots must be non-empty.', 'audit_snapshots')];
  const stages = new Set(snapshots.map((item) => Number(item?.stage_id)).filter(Number.isFinite));
  for (const stageId of [10, 12, 14, 15, 16, 17, 18, 19, 21, 23]) if (!stages.has(stageId)) concerns.push(issue('WRITE_PLAN_AUDIT_SNAPSHOT_INCOMPLETE', `Missing audit snapshot for stage ${stageId}.`, 'audit_snapshots'));
  if (plan.source_input_digest !== input.party_db_write_plan_input_digest) concerns.push(issue('WRITE_PLAN_INPUT_BINDING_INVALID', 'Plan source input digest is stale.', 'source_input_digest'));
  return concerns;
}

function validateForbiddenWrites(plan) {
  const concerns = [];
  if (!Array.isArray(plan.forbidden_writes) || plan.forbidden_writes.length === 0) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'forbidden_writes must be non-empty.', 'forbidden_writes'));
  const serialized = canonicalJson(plan.forbidden_writes);
  if (!/world_base/i.test(serialized)) concerns.push(issue('WRITE_PLAN_WORLD_BASE_MUTATION', 'forbidden_writes must explicitly forbid world_base mutation.', 'forbidden_writes'));
  if (!/hidden/i.test(serialized)) concerns.push(issue('WRITE_PLAN_HIDDEN_PUBLIC_LEAK', 'forbidden_writes must explicitly forbid hidden-to-public writes.', 'forbidden_writes'));
  return concerns;
}

function validateSelfAudit(plan) {
  const concerns = [];
  if (plan.self_audit?.pass !== true) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'self_audit.pass must be true.', 'self_audit.pass'));
  if (!Array.isArray(plan.self_audit?.concerns) || plan.self_audit.concerns.length > 0) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'self_audit.concerns must be an empty array.', 'self_audit.concerns'));
  if (!Array.isArray(plan.self_audit?.evidence) || plan.self_audit.evidence.length === 0) concerns.push(issue('WRITE_PLAN_SCHEMA_INVALID', 'self_audit.evidence must be non-empty.', 'self_audit.evidence'));
  return concerns;
}

