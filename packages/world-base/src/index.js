const MUTATING_SQL = /\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i;

export function createWorldBaseReader({ query }) {
  if (typeof query !== 'function') throw new TypeError('query function is required.');
  return Object.freeze({
    async read(sql, params = []) {
      if (MUTATING_SQL.test(String(sql))) throw new Error('world_base is read-only.');
      return query(sql, params);
    }
  });
}
