import pg from 'pg';
import { resolvePartyDatabaseConfig } from './new-game-prerequisites.js';

const { Pool } = pg;

let pool = null;
let poolUrl = null;

export function isPartyDbEnabled(env = process.env) {
  return Boolean(resolvePartyDatabaseConfig(env).url);
}

export function getPartyDbConfig(env = process.env) {
  return resolvePartyDatabaseConfig(env);
}

export function getPartyDbPool(env = process.env) {
  const config = getPartyDbConfig(env);
  if (!config.url) throw new Error('PARTY_DATABASE_URL or documented fallback is required for party DB runtime.');
  if (!pool || poolUrl !== config.url) {
    pool = new Pool({ connectionString: config.url });
    poolUrl = config.url;
  }
  return pool;
}

export async function withPartyTransaction(fn, { env = process.env, pool: providedPool = null, client: providedClient = null } = {}) {
  if (typeof fn !== 'function') throw new TypeError('withPartyTransaction requires a callback.');

  if (providedClient) {
    await providedClient.query('BEGIN');
    try {
      const result = await fn(providedClient);
      await providedClient.query('COMMIT');
      return result;
    } catch (error) {
      await providedClient.query('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  const dbPool = providedPool ?? getPartyDbPool(env);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function resetPartyDbPool() {
  if (pool) {
    await pool.end();
    pool = null;
    poolUrl = null;
  }
}
