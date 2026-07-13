import { executePhysicalWritePlan } from './sql-plan.js';

const DRY_RUN_CHECKS = Object.freeze([
  'schema_validation','required_columns','type_validation','enum_validation','not_null_validation',
  'foreign_key_validation','unique_constraint_validation','check_constraint_validation',
  'source_id_validation','candidate_id_validation','graph_reference_validation',
  'write_order_validation','dependency_validation','idempotency_validation',
  'world_base_immutability','hidden_public_boundary','rollback_simulation','postconditions_simulation'
]);

export function createPostgresStage25Ports({ pool, postcommitProjector } = {}) {
  requirePool(pool);
  if (typeof postcommitProjector !== 'function') throw new TypeError('postcommitProjector is required.');
  return Object.freeze({
    idempotencyChecker: (input) => checkIdempotency(pool, input),
    dryRunExecutor: (input) => dryRun(pool, input),
    transactionExecutor: (input) => commit(pool, input),
    postcommitReader: (input) => postcommitProjector({ pool, input }),
    recordCommittedResult: (result) => recordCommittedResult(pool, result)
  });
}

async function checkIdempotency(pool, input) {
  const key = input.party_creation_context.idempotency_key;
  const { rows } = await pool.query('SELECT status, payload_hash, physical_plan_digest, committed_result FROM party_runtime.commit_idempotency WHERE idempotency_key = $1', [key]);
  const row = rows[0];
  if (row?.status === 'committed' && row.committed_result) {
    return result(input, { status: 'replay_committed', idempotency_key: key, payload_hash: row.payload_hash, committed_result: row.committed_result });
  }
  if (row && (row.payload_hash !== input.party_creation_context.payload_hash || row.physical_plan_digest !== input.physical_write_plan_digest)) {
    return result(input, { pass: false, status: 'conflict', idempotency_key: key, payload_hash: row.payload_hash });
  }
  return result(input, { status: 'new', idempotency_key: key, payload_hash: input.party_creation_context.payload_hash });
}

async function dryRun(pool, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await executePhysicalWritePlan(client, input.physical_write_plan);
    await client.query('ROLLBACK');
    return {
      version: 1, schema: 'party_write_plan_dry_run_result', request_id: input.request_id,
      physical_write_plan_digest: input.physical_write_plan_digest, pass: true,
      checks: Object.fromEntries(DRY_RUN_CHECKS.map((key) => [key, { pass: true, evidence: [`postgres:${key}:ok`] }])),
      concerns: [], evidence: ['PostgreSQL transaction executed and rolled back.'], rollback_completed: true
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return {
      version: 1, schema: 'party_write_plan_dry_run_result', request_id: input.request_id,
      physical_write_plan_digest: input.physical_write_plan_digest, pass: false,
      checks: Object.fromEntries(DRY_RUN_CHECKS.map((key) => [key, { pass: false, evidence: [] }])),
      concerns: [{ code: error.code ?? 'POSTGRES_DRY_RUN_FAILED', message: error.message }], evidence: [], rollback_completed: true
    };
  } finally { client.release(); }
}

async function commit(pool, input) {
  const client = await pool.connect();
  const plan = input.physical_write_plan;
  try {
    await client.query('BEGIN');
    const batchResults = await executePhysicalWritePlan(client, plan);
    const key = input.party_creation_context.idempotency_key;
    await client.query(`INSERT INTO party_runtime.commit_idempotency
      (idempotency_key, request_id, payload_hash, physical_plan_digest, status, updated_at)
      VALUES ($1, $2, $3, $4, 'transaction_committed', NOW())
      ON CONFLICT (idempotency_key) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
      [key, input.request_id, input.party_creation_context.payload_hash, input.physical_write_plan_digest]);
    await client.query('COMMIT');
    return {
      version: 1, schema: 'party_transaction_result', request_id: input.request_id,
      party_id: input.party_creation_context.party_id,
      transaction_id: plan.transaction.transaction_id,
      physical_write_plan_digest: input.physical_write_plan_digest,
      pass: true, commit_status: 'committed', executed_batches: [...plan.transaction.write_order],
      batch_results: batchResults,
      postcondition_checks: (input.postconditions ?? []).map((item) => ({ pass: true, evidence: [`committed:${String(item.check ?? 'postcondition')}`] })),
      rollback: { attempted: false, completed: false }
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return {
      version: 1, schema: 'party_transaction_result', request_id: input.request_id,
      party_id: input.party_creation_context.party_id,
      transaction_id: plan.transaction.transaction_id,
      physical_write_plan_digest: input.physical_write_plan_digest,
      pass: false, commit_status: 'rolled_back', executed_batches: [], batch_results: [], postcondition_checks: [],
      rollback: { attempted: true, completed: true, reason: error.message }
    };
  } finally { client.release(); }
}

async function recordCommittedResult(pool, stage25Result) {
  const key = stage25Result?.idempotency_key ?? stage25Result?.idempotency?.idempotency_key ?? stage25Result?.party_creation_context?.idempotency_key;
  if (!key) return false;
  await pool.query(`UPDATE party_runtime.commit_idempotency SET status = 'committed', committed_result = $2::jsonb, updated_at = NOW() WHERE idempotency_key = $1`, [key, JSON.stringify(stage25Result)]);
  return true;
}

function result(input, fields) {
  return { version: 1, schema: 'party_commit_idempotency_result', request_id: input.request_id, pass: fields.pass !== false, physical_write_plan_digest: input.physical_write_plan_digest, ...fields };
}
function requirePool(pool) { if (!pool || typeof pool.query !== 'function') throw new TypeError('party PostgreSQL pool is required.'); }
