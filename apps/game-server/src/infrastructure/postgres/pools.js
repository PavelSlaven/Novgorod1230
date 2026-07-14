import pg from 'pg';
import { assertPostgresConfig, readPostgresConfig } from './config.js';

const { Pool } = pg;

export function createPostgresPools({ env = process.env, config = readPostgresConfig(env), PoolClass = Pool } = {}) {
  assertPostgresConfig(config);
  const common = {
    ssl: config.ssl,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis
  };
  const worldPool = new PoolClass({ ...common, connectionString: config.worldUrl, max: config.worldMax });
  const partyPool = config.partyUrl === config.worldUrl
    ? worldPool
    : new PoolClass({ ...common, connectionString: config.partyUrl, max: config.partyMax });
  return Object.freeze({
    worldPool,
    partyPool,
    async close() {
      if (partyPool !== worldPool) await partyPool.end();
      await worldPool.end();
    }
  });
}

export async function probePostgresPool(pool, label) {
  const started = Date.now();
  const result = await pool.query('SELECT current_database() AS database_name, current_user AS user_name, 1 AS ok');
  return Object.freeze({ label, ok: result.rows?.[0]?.ok === 1, duration_ms: Date.now() - started, database_name: result.rows?.[0]?.database_name ?? null, user_name: result.rows?.[0]?.user_name ?? null });
}
