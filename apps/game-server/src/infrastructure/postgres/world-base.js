import { createWorldBaseReader } from '@rus/world-base';

export function createPostgresWorldBaseReader({ pool } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('world-base PostgreSQL pool is required.');
  return createWorldBaseReader({ query: (sql, params) => pool.query(sql, params) });
}
