const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const ALLOWED_OPERATIONS = new Set(['insert_only', 'snapshot_insert', 'upsert_with_idempotency', 'update_only']);

export async function executePhysicalWritePlan(client, plan) {
  const ordered = new Map((plan.write_batches ?? []).map((batch) => [batch.batch_id, batch]));
  const results = [];
  for (const batchId of plan.transaction?.write_order ?? []) {
    const batch = ordered.get(batchId);
    if (!batch) throw sqlPlanError('BATCH_MISSING', `Missing batch ${batchId}.`);
    results.push(await executeBatch(client, batch));
  }
  return results;
}

async function executeBatch(client, batch) {
  const table = quoteIdentifier(batch.target_table);
  if (!ALLOWED_OPERATIONS.has(batch.operation_mode)) throw sqlPlanError('OPERATION_UNSUPPORTED', `Unsupported operation ${batch.operation_mode}.`);
  let affected = 0;
  for (const record of batch.records ?? []) {
    const entries = Object.entries(record);
    if (entries.length === 0) throw sqlPlanError('EMPTY_RECORD', `Batch ${batch.batch_id} contains an empty record.`);
    const columns = entries.map(([name]) => quoteIdentifier(name));
    const values = entries.map(([, value]) => value);
    if (batch.operation_mode === 'update_only') {
      if (!Object.hasOwn(record, 'id')) throw sqlPlanError('UPDATE_ID_REQUIRED', `Batch ${batch.batch_id} update_only requires id.`);
      const mutable = entries.filter(([name]) => name !== 'id');
      if (mutable.length === 0) continue;
      const assignments = mutable.map(([name], index) => `${quoteIdentifier(name)} = $${index + 1}`);
      const params = [...mutable.map(([, value]) => value), record.id];
      const result = await client.query(`UPDATE ${table} SET ${assignments.join(', ')} WHERE ${quoteIdentifier('id')} = $${params.length}`, params);
      affected += result.rowCount;
      continue;
    }
    const placeholders = values.map((_, index) => `$${index + 1}`);
    let conflict = '';
    if (batch.operation_mode === 'upsert_with_idempotency') {
      if (!Object.hasOwn(record, 'id')) throw sqlPlanError('UPSERT_ID_REQUIRED', `Batch ${batch.batch_id} upsert requires id.`);
      const mutable = entries.filter(([name]) => name !== 'id');
      conflict = mutable.length
        ? ` ON CONFLICT (${quoteIdentifier('id')}) DO UPDATE SET ${mutable.map(([name]) => `${quoteIdentifier(name)} = EXCLUDED.${quoteIdentifier(name)}`).join(', ')}`
        : ` ON CONFLICT (${quoteIdentifier('id')}) DO NOTHING`;
    }
    const result = await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})${conflict}`, values);
    affected += result.rowCount;
  }
  return Object.freeze({ batch_id: batch.batch_id, operation: batch.operation_mode, attempted_rows: (batch.records ?? []).length, affected_rows: affected });
}

function quoteIdentifier(value) {
  const name = String(value ?? '').trim();
  if (!IDENTIFIER.test(name)) throw sqlPlanError('IDENTIFIER_INVALID', `Unsafe SQL identifier: ${name || '<empty>'}.`);
  return `"${name}"`;
}
function sqlPlanError(code, message) { const error = new Error(message); error.code = code; return error; }
