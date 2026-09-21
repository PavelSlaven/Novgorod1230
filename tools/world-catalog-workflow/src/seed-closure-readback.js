import { digestValue } from './digest.js';

const MUTABLE_DATABASE_COLUMNS = Object.freeze(['created_at', 'updated_at']);

export async function readCanonicalSeedTableClosure(client, tableNames) {
  const closure = [];
  for (const table of [...tableNames].sort()) {
    const primaryKey = (await client.query(`SELECT a.attname AS column
      FROM pg_index i
      JOIN pg_class c ON c.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN unnest(i.indkey) WITH ORDINALITY AS key(attnum,position) ON true
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.attnum
      WHERE n.nspname='world_base' AND c.relname=$1 AND i.indisprimary
      ORDER BY key.position`, [table])).rows.map(({ column }) => column);
    if (primaryKey.length === 0) {
      throw new Error(`GATE1_SEED_TABLE_PRIMARY_KEY_MISSING:${table}`);
    }
    const columns = (await client.query(`SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='world_base' AND table_name=$1
      ORDER BY ordinal_position`, [table])).rows.map(({ column_name }) =>
      column_name);
    if (columns.length === 0) {
      throw new Error(`GATE1_SEED_TABLE_MISSING:${table}`);
    }
    const excluded = MUTABLE_DATABASE_COLUMNS.filter((column) =>
      columns.includes(column));
    const projection = excluded.reduce((sql, _column, index) =>
      `${sql} - $${index + 1}::text`, 'to_jsonb(record)');
    const records = (await client.query(`SELECT ${projection} AS payload
      FROM world_base.${quoteIdentifier(table)} AS record
      ORDER BY ${primaryKey.map(quoteIdentifier).join(',')}`, excluded)).rows
      .map(({ payload }) => payload);
    closure.push(Object.freeze({ table, row_count: records.length,
      payload_sha256: digestValue(records),
      order_columns: Object.freeze(primaryKey),
      excluded_mutable_columns: Object.freeze(excluded) }));
  }
  return Object.freeze(closure);
}

export function assertCanonicalSeedTableClosure(actual, expected) {
  if (digestValue(actual) !== digestValue(expected)) {
    const byTable = new Map(actual.map((entry) => [entry.table, entry]));
    const mismatch = expected.find((entry) =>
      digestValue(byTable.get(entry.table)) !== digestValue(entry));
    throw new Error(`GATE1_SEED_TABLE_PAYLOAD_MISMATCH:${mismatch?.table
      ?? '<closure>'}`);
  }
  return true;
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) {
    throw new Error(`GATE1_SEED_SQL_IDENTIFIER_INVALID:${value}`);
  }
  return `"${value}"`;
}
