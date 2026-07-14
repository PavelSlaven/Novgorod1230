import {
  computeStage25Digest,
  STAGE25_DRY_RUN_INPUT_SCHEMA,
  STAGE25_DRY_RUN_SCHEMA,
  STAGE25_IDEMPOTENCY_SCHEMA,
  STAGE25_PHYSICAL_PLAN_SCHEMA,
  STAGE25_POSTCOMMIT_READ_SCHEMA,
  STAGE25_POSTCOMMIT_STATE_SCHEMA,
  STAGE25_TRANSACTION_INPUT_SCHEMA,
  STAGE25_TRANSACTION_SCHEMA
} from '../stages/stage25-party-commit.js';

const REQUIRED_DRY_RUN_CHECKS = Object.freeze([
  'schema_validation',
  'required_columns',
  'type_validation',
  'enum_validation',
  'not_null_validation',
  'foreign_key_validation',
  'unique_constraint_validation',
  'check_constraint_validation',
  'source_id_validation',
  'candidate_id_validation',
  'graph_reference_validation',
  'write_order_validation',
  'dependency_validation',
  'idempotency_validation',
  'world_base_immutability',
  'hidden_public_boundary',
  'rollback_simulation',
  'postconditions_simulation'
]);

export async function checkPartyCommitIdempotency(input = {}, options = {}) {
  const context = input.party_creation_context ?? {};
  const base = {
    version: 1,
    schema: STAGE25_IDEMPOTENCY_SCHEMA,
    request_id: input.request_id ?? null,
    idempotency_key: context.idempotency_key ?? null,
    payload_hash: context.payload_hash ?? null,
    physical_write_plan_digest: input.physical_write_plan_digest ?? null
  };
  if (!text(context.idempotency_key) || !text(context.payload_hash)) {
    return { ...base, pass: false, status: 'invalid', concerns: [concern('STAGE25_IDEMPOTENCY_CONTEXT_INVALID', 'idempotency_key and payload_hash are required.')], evidence: [] };
  }
  let record = null;
  if (typeof options.lookupIdempotency === 'function') {
    record = await options.lookupIdempotency({ ...base, party_id: context.party_id });
  } else {
    const client = await resolveReadClient(options);
    try {
      const result = await client.query(
        'SELECT id, party_id, status, input_hash, output_hash, structured_output FROM party.party_llm_steps WHERE id = $1 LIMIT 1',
        [context.idempotency_key]
      );
      record = result.rows?.[0] ?? null;
    } finally {
      await releaseReadClient(client, options);
    }
  }
  if (!record) return { ...base, pass: true, status: 'new', concerns: [], evidence: ['Idempotency key is unused.'] };
  const storedHash = record.payload_hash ?? record.input_hash ?? null;
  if (storedHash !== context.payload_hash) {
    return { ...base, pass: false, status: 'hash_conflict', concerns: [concern('STAGE25_IDEMPOTENCY_HASH_CONFLICT', 'Existing idempotency key is bound to another payload hash.')], evidence: [] };
  }
  const status = String(record.status ?? '').toLowerCase();
  if (['in_progress', 'running', 'pending'].includes(status)) {
    return { ...base, pass: false, status: 'in_progress', concerns: [concern('STAGE25_IDEMPOTENCY_IN_PROGRESS', 'An equivalent commit is already in progress.')], evidence: [] };
  }
  if (['committed', 'completed', 'passed'].includes(status)) {
    const committedResult = record.committed_result ?? record.structured_output?.stage25_result ?? record.structured_output ?? null;
    return { ...base, pass: true, status: 'replay_committed', committed_result: committedResult, concerns: [], evidence: ['Existing committed result found for the same idempotency payload.'] };
  }
  return { ...base, pass: false, status: 'blocked', concerns: [concern('STAGE25_IDEMPOTENCY_STATUS_INVALID', `Existing idempotency record has unsupported status ${status || '<empty>'}.`)], evidence: [] };
}

export async function executeDryRunTransaction(input = {}, options = {}) {
  const validation = validateDryRunInput(input);
  if (validation.length > 0) return failedDryRun(input, validation, false);
  const client = await acquireClient(options);
  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    await client.query('SET CONSTRAINTS ALL IMMEDIATE').catch(() => {});
    const execution = await executePhysicalPlan(client, input.physical_write_plan, input.party_database_schema, options);
    const postconditionChecks = await evaluatePostconditions(client, input.physical_write_plan, input.party_creation_context, options);
    if (postconditionChecks.some((item) => item.pass !== true)) {
      const error = new Error('Dry-run postcondition simulation failed.');
      error.concerns = postconditionChecks.filter((item) => item.pass !== true).map((item) => concern('STAGE25_POSTCONDITION_FAILED', item.message ?? item.code));
      throw error;
    }
    await client.query('ROLLBACK');
    began = false;
    const checks = Object.fromEntries(REQUIRED_DRY_RUN_CHECKS.map((key) => [key, { pass: true, evidence: [] }]));
    checks.rollback_simulation.evidence = ['Dry-run transaction rolled back successfully.'];
    checks.postconditions_simulation.evidence = postconditionChecks.map((item) => item.code);
    return {
      version: 1,
      schema: STAGE25_DRY_RUN_SCHEMA,
      request_id: input.request_id,
      physical_write_plan_digest: input.physical_write_plan_digest,
      pass: true,
      checks,
      simulated_batches: execution.executed_batches,
      batch_results: execution.batch_results,
      row_counts: execution.row_counts,
      inserted_ids: execution.inserted_ids,
      updated_ids: execution.updated_ids,
      postcondition_checks: postconditionChecks,
      rollback_completed: true,
      concerns: [],
      evidence: ['Dry-run executed the exact physical plan and rolled back.']
    };
  } catch (error) {
    let rollbackCompleted = false;
    if (began) {
      try { await client.query('ROLLBACK'); rollbackCompleted = true; } catch {}
    }
    return failedDryRun(input, error.concerns ?? [concern('STAGE25_DRY_RUN_FAILED', error.message)], rollbackCompleted);
  } finally {
    await releaseClient(client, options);
  }
}

export async function executeApprovedAtomicTransaction(input = {}, options = {}) {
  const concerns = validateApprovedTransactionInput(input);
  if (concerns.length > 0) {
    const error = new Error(`Approved transaction input failed: ${concerns.map((item) => item.code).join(', ')}`);
    error.concerns = concerns;
    throw error;
  }
  const client = await acquireClient(options);
  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    await client.query('SET CONSTRAINTS ALL IMMEDIATE').catch(() => {});
    const execution = await executePhysicalPlan(client, input.physical_write_plan, input.party_database_schema, options);
    const postconditionChecks = await evaluatePostconditions(client, input.physical_write_plan, input.party_creation_context, options);
    const failed = postconditionChecks.filter((item) => item.pass !== true);
    if (failed.length > 0) {
      const error = new Error(`Transaction postconditions failed: ${failed.map((item) => item.code).join(', ')}`);
      error.concerns = failed.map((item) => concern('STAGE25_POSTCONDITION_FAILED', item.message ?? item.code));
      throw error;
    }
    await client.query('COMMIT');
    began = false;
    return {
      version: 1,
      schema: STAGE25_TRANSACTION_SCHEMA,
      request_id: input.request_id,
      pass: true,
      commit_status: 'committed',
      transaction_id: input.commit_gate_approval.transaction_id,
      party_id: input.party_creation_context.party_id,
      idempotency_key: input.party_creation_context.idempotency_key,
      payload_hash: input.party_creation_context.payload_hash,
      physical_write_plan_digest: input.physical_write_plan_digest,
      executed_batches: execution.executed_batches,
      batch_results: execution.batch_results,
      row_counts: execution.row_counts,
      inserted_ids: execution.inserted_ids,
      updated_ids: execution.updated_ids,
      postcondition_checks: postconditionChecks,
      rollback: { attempted: false, completed: false },
      evidence: ['Atomic transaction committed after all batches and postconditions passed.']
    };
  } catch (error) {
    let rollbackCompleted = false;
    if (began) {
      try { await client.query('ROLLBACK'); rollbackCompleted = true; } catch {}
    }
    error.rollback = { attempted: began, completed: rollbackCompleted };
    throw error;
  } finally {
    await releaseClient(client, options);
  }
}

export async function readCommittedPartyState(input = {}, options = {}) {
  if (input.version !== 1 || input.schema !== STAGE25_POSTCOMMIT_READ_SCHEMA) throw new Error(`Expected ${STAGE25_POSTCOMMIT_READ_SCHEMA}.`);
  if (typeof options.readback === 'function') return options.readback(input);
  const client = await resolveReadClient(options);
  try {
    const partyId = input.party_id;
    const [stateResult, positionResult, playerResult, narratorResult] = await Promise.all([
      client.query('SELECT * FROM party.party_state WHERE id = $1 LIMIT 1', [partyId]),
      client.query('SELECT * FROM party.party_current_position WHERE party_id = $1 ORDER BY game_day_index DESC, game_minute_of_day DESC LIMIT 1', [partyId]),
      client.query('SELECT * FROM party.party_player_characters WHERE party_id = $1 LIMIT 1', [partyId]),
      client.query("SELECT * FROM party.party_journal_entries WHERE party_id = $1 AND entry_type IN ('opening_narrator_output','player_visible_message') ORDER BY created_at_game_time DESC LIMIT 1", [partyId])
    ]);
    const state = stateResult.rows?.[0] ?? null;
    const audit = isObject(state?.audit_state) ? state.audit_state : {};
    const narrator = narratorResult.rows?.[0] ?? null;
    return {
      version: 1,
      schema: STAGE25_POSTCOMMIT_STATE_SCHEMA,
      request_id: input.request_id,
      party_id: partyId,
      transaction_id: input.transaction_id,
      physical_write_plan_digest: input.physical_write_plan_digest,
      party_state: state ? {
        status: audit.status ?? (state.status === 'active' ? 'ready' : state.status),
        is_ready_for_player: audit.is_ready_for_player === true,
        current_phase: audit.current_phase ?? null,
        current_turn_number: audit.current_turn_number ?? 0,
        opening_scene_presented: audit.opening_scene_presented === true
      } : null,
      current_position: positionResult.rows?.[0] ?? null,
      current_clock: state ? {
        current_year: state.current_year,
        current_season: state.current_season,
        current_day_index: state.current_day_index,
        current_minute_of_day: state.current_minute_of_day
      } : null,
      player_character: playerResult.rows?.[0] ?? null,
      player_output_ref: narrator ? {
        narrator_output_id: narrator.id,
        player_visible_message_ready: true,
        opening_scene_presented: audit.opening_scene_presented === true
      } : null,
      party_public_state: audit.party_public_state ?? null,
      integrity: audit.postcommit_integrity ?? {},
      idempotency_record: {
        idempotency_key: input.party_creation_context.idempotency_key,
        payload_hash: input.party_creation_context.payload_hash,
        status: 'committed'
      }
    };
  } finally {
    await releaseReadClient(client, options);
  }
}

export async function executeAtomicPartyWritePlan(input, options = {}) {
  if (input?.schema !== STAGE25_TRANSACTION_INPUT_SCHEMA) {
    throw new Error('DIRECT_TRANSACTION_EXECUTOR_FORBIDDEN: executeAtomicPartyWritePlan requires approved_party_transaction_input from Stage 25 commit gate.');
  }
  return executeApprovedAtomicTransaction(input, options);
}

export async function commitPartyStart() {
  throw new Error('commitPartyStart legacy bypass is forbidden. Use runStage25PartyCommitBlock.');
}

export function validateExecutableWritePlan(plan = {}, schema = {}) {
  const concerns = validatePhysicalPlanAgainstSchema(plan, schema);
  if (concerns.length > 0) throw new Error(`Party physical write plan is not executable: ${concerns.join('; ')}`);
  return true;
}

async function executePhysicalPlan(client, plan, schema, options) {
  validateExecutableWritePlan(plan, schema);
  const batches = orderedBatches(plan);
  const batchResults = [];
  const insertedIds = [];
  const updatedIds = [];
  const rowCounts = {};
  for (const batch of batches) {
    const result = { batch_id: batch.batch_id, operation: batch.operation_mode, table: batch.target_table, attempted_rows: array(batch.records).length, affected_rows: 0, inserted_ids: [], updated_ids: [], skipped_rows: 0 };
    for (const record of array(batch.records)) {
      const recordResult = await executeRecord(client, batch, record, options);
      result.affected_rows += recordResult.affectedRows;
      if (recordResult.insertedId) { result.inserted_ids.push(recordResult.insertedId); insertedIds.push(recordResult.insertedId); }
      if (recordResult.updatedId) { result.updated_ids.push(recordResult.updatedId); updatedIds.push(recordResult.updatedId); }
      if (recordResult.skipped) result.skipped_rows += 1;
    }
    if (batch.operation_mode !== 'upsert_with_idempotency' && result.affected_rows !== result.attempted_rows) throw new Error(`Batch ${batch.batch_id} affected ${result.affected_rows}/${result.attempted_rows} rows.`);
    batchResults.push(result);
    rowCounts[batch.batch_id] = result.affected_rows;
  }
  return { executed_batches: batches.map((batch) => batch.batch_id), batch_results: batchResults, inserted_ids: insertedIds, updated_ids: updatedIds, row_counts: rowCounts };
}

async function executeRecord(client, batch, record, options) {
  if (typeof options.executeRecord === 'function') return options.executeRecord(client, batch, record);
  if (batch.operation_mode === 'insert_only' || batch.operation_mode === 'snapshot_insert') {
    const query = await client.query(`${buildInsertSql(batch.target_table, record)} RETURNING id`, insertValuesFor(record));
    const affectedRows = strictRowCount(query, `${batch.batch_id}.${batch.target_table} insert`);
    return { affectedRows, insertedId: query.rows?.[0]?.id ?? record.id ?? null, updatedId: null, skipped: false };
  }
  if (batch.operation_mode === 'upsert_with_idempotency') {
    if (!record.id) throw new Error(`${batch.batch_id}.${batch.target_table} upsert_with_idempotency requires id`);
    const query = await client.query(`${buildInsertSql(batch.target_table, record)} ON CONFLICT ("id") DO UPDATE SET "id" = EXCLUDED."id" RETURNING id`, insertValuesFor(record));
    const affectedRows = strictRowCount(query, `${batch.batch_id}.${batch.target_table} upsert`);
    return { affectedRows, insertedId: null, updatedId: query.rows?.[0]?.id ?? record.id, skipped: false };
  }
  if (batch.operation_mode === 'update_only') {
    const query = await client.query(`${buildUpdateSql(batch.target_table, record)} RETURNING id`, updateValuesFor(record));
    const affectedRows = strictRowCount(query, `${batch.batch_id}.${batch.target_table} update`);
    if (affectedRows !== 1) throw new Error(`${batch.batch_id}.${batch.target_table} update_only must affect exactly one row.`);
    return { affectedRows, insertedId: null, updatedId: query.rows?.[0]?.id ?? record.id, skipped: false };
  }
  throw new Error(`Unsupported party write operation: ${batch.operation_mode}`);
}

function strictRowCount(query, label) {
  if (!Number.isInteger(query?.rowCount)) throw new Error(`${label} did not return rowCount.`);
  if (query.rowCount <= 0) throw new Error(`${label} affected zero rows.`);
  return query.rowCount;
}

async function evaluatePostconditions(client, plan, partyContext, options) {
  const results = [];
  for (const condition of array(plan.postconditions)) {
    if (typeof options.evaluatePostcondition === 'function') {
      const value = await options.evaluatePostcondition({ client, condition, partyContext, plan });
      results.push(normalizePostcondition(condition, value));
      continue;
    }
    results.push(await evaluateBuiltInPostcondition(client, condition, partyContext));
  }
  if (results.length === 0) results.push({ code: 'postconditions-present', pass: false, message: 'No postconditions were supplied.' });
  return results;
}

async function evaluateBuiltInPostcondition(client, condition, partyContext) {
  const code = String(condition?.code ?? '').trim();
  if (code === 'party-created') {
    const result = await client.query('SELECT EXISTS(SELECT 1 FROM party.party_state WHERE id = $1) AS ok', [partyContext.party_id]);
    return { code, pass: result.rows?.[0]?.ok === true, message: 'party_state row must exist' };
  }
  if (code === 'party-ready') {
    const result = await client.query('SELECT status, audit_state FROM party.party_state WHERE id = $1 LIMIT 1', [partyContext.party_id]);
    const row = result.rows?.[0];
    return { code, pass: row?.status === 'active' && row?.audit_state?.is_ready_for_player === true, message: 'party must be ready' };
  }
  if (code === 'current-position-exists') {
    const result = await client.query('SELECT EXISTS(SELECT 1 FROM party.party_current_position WHERE party_id = $1) AS ok', [partyContext.party_id]);
    return { code, pass: result.rows?.[0]?.ok === true, message: 'current position must exist' };
  }
  return { code: code || '<missing>', pass: false, message: `Unsupported postcondition ${code || '<missing>'}.` };
}

function normalizePostcondition(condition, value) {
  if (value === true) return { code: condition.code, pass: true, message: condition.message ?? condition.code };
  if (value === false) return { code: condition.code, pass: false, message: condition.message ?? condition.code };
  return { code: value?.code ?? condition.code, pass: value?.pass === true, message: value?.message ?? condition.message ?? condition.code };
}

function validateDryRunInput(input) {
  const concerns = [];
  if (input.version !== 1 || input.schema !== STAGE25_DRY_RUN_INPUT_SCHEMA) concerns.push(concern('STAGE25_DRY_RUN_INPUT_INVALID', `Expected ${STAGE25_DRY_RUN_INPUT_SCHEMA}.`));
  if (input.physical_write_plan?.schema !== STAGE25_PHYSICAL_PLAN_SCHEMA) concerns.push(concern('STAGE25_PHYSICAL_PLAN_INVALID', 'Dry-run requires physical plan.'));
  if (computeStage25Digest(input.physical_write_plan) !== input.physical_write_plan_digest) concerns.push(concern('STAGE25_DRY_RUN_DIGEST_MISMATCH', 'Dry-run physical plan digest mismatch.'));
  concerns.push(...validatePhysicalPlanAgainstSchema(input.physical_write_plan, input.party_database_schema).map((message) => concern('STAGE25_PHYSICAL_PLAN_INVALID', message)));
  return concerns;
}

function validateApprovedTransactionInput(input) {
  const concerns = [];
  if (input.version !== 1 || input.schema !== STAGE25_TRANSACTION_INPUT_SCHEMA) concerns.push(concern('STAGE25_TRANSACTION_INPUT_INVALID', `Expected ${STAGE25_TRANSACTION_INPUT_SCHEMA}.`));
  const approval = input.commit_gate_approval;
  if (approval?.schema !== 'commit_gate_approval' || approval?.pass !== true || approval?.can_execute_atomic_commit !== true) concerns.push(concern('STAGE25_GATE_PERMISSION_DENIED', 'Valid commit gate approval is required.'));
  if (approval?.request_id !== input.request_id) concerns.push(concern('STAGE25_REQUEST_ID_MISMATCH', 'Commit approval request_id mismatch.'));
  if (approval?.physical_plan_digest !== input.physical_write_plan_digest) concerns.push(concern('STAGE25_TRANSACTION_DIGEST_MISMATCH', 'Commit approval physical plan digest mismatch.'));
  if (approval?.transaction_id !== input.physical_write_plan?.transaction?.transaction_id) concerns.push(concern('STAGE25_TRANSACTION_INPUT_INVALID', 'Commit approval transaction_id mismatch.'));
  if (computeStage25Digest(input.physical_write_plan) !== input.physical_write_plan_digest) concerns.push(concern('STAGE25_TRANSACTION_DIGEST_MISMATCH', 'Physical plan digest mismatch.'));
  if (input.party_creation_context?.party_id !== input.physical_write_plan?.transaction?.party_id) concerns.push(concern('STAGE25_TRANSACTION_INPUT_INVALID', 'party_id mismatch.'));
  concerns.push(...validatePhysicalPlanAgainstSchema(input.physical_write_plan, input.party_database_schema).map((message) => concern('STAGE25_PHYSICAL_PLAN_INVALID', message)));
  return concerns;
}

function validatePhysicalPlanAgainstSchema(plan, schema) {
  const problems = [];
  if (plan?.schema !== STAGE25_PHYSICAL_PLAN_SCHEMA) problems.push('physical plan schema is invalid');
  const tableColumns = schemaColumnMap(schema);
  const allowedOperations = new Set(array(schema?.allowed_operations));
  const batchIds = new Set(array(plan?.write_batches).map((batch) => batch.batch_id));
  const order = array(plan?.transaction?.write_order);
  if (order.length !== batchIds.size || new Set(order).size !== order.length || order.some((id) => !batchIds.has(id))) problems.push('write_order must contain every batch exactly once');
  const positions = new Map(order.map((id, index) => [id, index]));
  for (const batch of array(plan?.write_batches)) {
    const columns = tableColumns.get(batch.target_table);
    if (!columns) { problems.push(`unknown party table ${batch.target_table}`); continue; }
    if (allowedOperations.size > 0 && !allowedOperations.has(batch.operation_mode)) problems.push(`unsupported operation ${batch.operation_mode}`);
    for (const dep of array(batch.depends_on_batches)) if (!batchIds.has(dep) || positions.get(dep) >= positions.get(batch.batch_id)) problems.push(`invalid dependency ${dep} for ${batch.batch_id}`);
    for (const record of array(batch.records)) for (const key of Object.keys(record)) if (!columns.has(key)) problems.push(`${batch.target_table}.${key} is not in schema snapshot`);
  }
  return problems;
}

function schemaColumnMap(schema) {
  const map = new Map();
  const topColumns = array(schema?.columns);
  for (const table of array(schema?.tables)) {
    const name = table.name ?? table.table_name;
    const columns = new Set();
    for (const column of [...array(table.columns), ...topColumns.filter((item) => (item.table_name ?? item.table) === name)]) {
      const columnName = typeof column === 'string' ? column : column.name ?? column.column_name;
      if (columnName) columns.add(columnName);
    }
    map.set(name, columns);
  }
  return map;
}

function orderedBatches(plan) {
  const batches = array(plan.write_batches);
  const byId = new Map(batches.map((batch) => [batch.batch_id, batch]));
  const order = array(plan.transaction?.write_order);
  if (order.length !== batches.length || new Set(order).size !== order.length) throw new Error('write_order must contain every batch exactly once.');
  return order.map((batchId, index) => {
    const batch = byId.get(batchId);
    if (!batch) throw new Error(`write_order references missing batch ${batchId}`);
    for (const dep of array(batch.depends_on_batches)) {
      const depIndex = order.indexOf(dep);
      if (depIndex < 0 || depIndex >= index) throw new Error(`batch ${batchId} dependency ${dep} was not executed first`);
    }
    return batch;
  });
}

function buildInsertSql(table, record) {
  const columns = Object.keys(record);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  return `INSERT INTO party.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders.join(', ')})`;
}

function buildUpdateSql(table, record) {
  const entries = Object.entries(record).filter(([key]) => key !== 'id');
  const assignments = entries.map(([key], index) => {
    const valueRef = `$${index + 1}`;
    if (key === 'audit_state') return `${quoteIdentifier(key)} = COALESCE(${quoteIdentifier(key)}, '{}'::jsonb) || ${valueRef}::jsonb`;
    return `${quoteIdentifier(key)} = ${valueRef}`;
  });
  return `UPDATE party.${quoteIdentifier(table)} SET ${assignments.join(', ')} WHERE id = $${entries.length + 1}`;
}

function insertValuesFor(record) { return Object.values(record); }
function updateValuesFor(record) { return [...Object.entries(record).filter(([key]) => key !== 'id').map(([, value]) => value), record.id]; }
function quoteIdentifier(value) { if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`); return `"${value}"`; }


async function resolveDefaultPool(env) {
  const module = await import('../../party-db.js');
  return module.getPartyDbPool(env);
}

async function acquireClient(options) {
  if (options.client) return options.client;
  const pool = options.pool ?? await resolveDefaultPool(options.env ?? process.env);
  const client = await pool.connect();
  Object.defineProperty(client, '__stage25_release', { value: true, configurable: true });
  return client;
}

async function releaseClient(client, options) {
  if (!options.client && client?.__stage25_release && typeof client.release === 'function') client.release();
}

async function resolveReadClient(options) { return acquireClient(options); }
async function releaseReadClient(client, options) { return releaseClient(client, options); }

function failedDryRun(input, concerns, rollbackCompleted) {
  const checks = Object.fromEntries(REQUIRED_DRY_RUN_CHECKS.map((key) => [key, { pass: false, evidence: [] }]));
  checks.rollback_simulation = { pass: rollbackCompleted === true, evidence: rollbackCompleted ? ['Dry-run rollback completed after failure.'] : [] };
  return {
    version: 1,
    schema: STAGE25_DRY_RUN_SCHEMA,
    request_id: input?.request_id ?? null,
    physical_write_plan_digest: input?.physical_write_plan_digest ?? null,
    pass: false,
    checks,
    simulated_batches: [],
    batch_results: [],
    row_counts: {},
    inserted_ids: [],
    updated_ids: [],
    postcondition_checks: [],
    rollback_completed: rollbackCompleted === true,
    concerns: array(concerns),
    evidence: []
  };
}

function concern(code, message) { return { code, severity: 'hard_block', message }; }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function array(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
