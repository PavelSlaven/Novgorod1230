const RUNTIME_MIGRATIONS = Object.freeze([
  `CREATE SCHEMA IF NOT EXISTS party_runtime`,
  `CREATE TABLE IF NOT EXISTS party_runtime.game_sessions (
    party_id TEXT PRIMARY KEY,
    session JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS party_runtime.delivery_attempts (
    delivery_attempt_id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    attempt JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS party_runtime.delivery_acknowledgements (
    message_id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    result JSONB NOT NULL,
    acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS party_runtime.commit_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    physical_plan_digest TEXT NOT NULL,
    status TEXT NOT NULL,
    committed_result JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
]);

export async function runPartyRuntimeMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of RUNTIME_MIGRATIONS) await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return Object.freeze({ applied: RUNTIME_MIGRATIONS.length, schema: 'party_runtime' });
}

export { RUNTIME_MIGRATIONS };
