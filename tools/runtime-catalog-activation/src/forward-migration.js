import { createHash } from 'node:crypto';
import { readPostgresSchemaFingerprint } from
  '@rus/runtime-catalog/schema-fingerprint';
export { readPostgresSchemaFingerprint } from
  '@rus/runtime-catalog/schema-fingerprint';

const SCHEMAS = Object.freeze({
  world_base: Object.freeze({
    ledgerTable: 'world_base.schema_migrations',
    advisoryLockKey: '742019260001',
    securityRoles: Object.freeze([
      'runtime_catalog_activator',
      'runtime_catalog_importer',
      'world_reader'
    ])
  }),
  party_runtime: Object.freeze({
    ledgerTable: 'party_runtime.schema_migrations',
    advisoryLockKey: '742019260002',
    securityRoles: Object.freeze([])
  })
});
const SHA256 = /^[a-f0-9]{64}$/u;

export class ForwardMigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ForwardMigrationError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function createForwardMigration({
  migrationId,
  schemaName,
  sourceSchemaFingerprint,
  targetSchemaFingerprint,
  sql
}) {
  if (!SCHEMAS[schemaName]) throw new TypeError(`Unsupported migration schema: ${schemaName}`);
  if (!migrationId || !sql) throw new TypeError('Migration id and SQL are required.');
  for (const [field, value] of Object.entries({
    sourceSchemaFingerprint,
    targetSchemaFingerprint
  })) {
    if (!SHA256.test(value)) throw new TypeError(`${field} must be a SHA-256 digest.`);
  }
  const normalizedSql = sql.replaceAll('\r\n', '\n').trimEnd();
  return Object.freeze({
    migration_id: migrationId,
    schema_name: schemaName,
    source_schema_fingerprint: sourceSchemaFingerprint,
    target_schema_fingerprint: targetSchemaFingerprint,
    migration_digest: digest({
      schema: 'rus.forward_schema_migration.v1',
      migration_id: migrationId,
      schema_name: schemaName,
      source_schema_fingerprint: sourceSchemaFingerprint,
      target_schema_fingerprint: targetSchemaFingerprint,
      sql: normalizedSql
    }),
    sql: normalizedSql
  });
}

export function classifyForwardMigrationState({
  migration,
  actualSchemaFingerprint,
  ledgerRow
}) {
  if (actualSchemaFingerprint === migration.source_schema_fingerprint && !ledgerRow) {
    return Object.freeze({ status: 'ready' });
  }
  if (actualSchemaFingerprint === migration.target_schema_fingerprint && ledgerRow) {
    const fields = [
      'migration_id',
      'migration_digest',
      'source_schema_fingerprint',
      'target_schema_fingerprint'
    ];
    if (fields.every((field) => ledgerRow[field] === migration[field])) {
      return Object.freeze({ status: 'already_applied' });
    }
    fail('MIGRATION_LEDGER_CONFLICT', 'Migration ledger row does not match the versioned migration.');
  }
  if (actualSchemaFingerprint === migration.source_schema_fingerprint
      || actualSchemaFingerprint === migration.target_schema_fingerprint) {
    fail('MIGRATION_PARTIAL_STATE', 'Schema and migration ledger are not in one exact state.');
  }
  fail('MIGRATION_SCHEMA_FINGERPRINT_UNKNOWN', 'Schema fingerprint is neither exact legacy nor exact target.', {
    actual_schema_fingerprint: actualSchemaFingerprint
  });
}

export async function runForwardMigration({
  pool,
  migration,
  sourceBridge = null,
  readSchemaFingerprint = readPostgresSchemaFingerprint
}) {
  const sealed = createForwardMigration({
    migrationId: migration.migration_id,
    schemaName: migration.schema_name,
    sourceSchemaFingerprint: migration.source_schema_fingerprint,
    targetSchemaFingerprint: migration.target_schema_fingerprint,
    sql: migration.sql
  });
  if (sealed.migration_digest !== migration.migration_digest) {
    fail('MIGRATION_DESCRIPTOR_TAMPERED',
      'Migration SQL or descriptor differs from its recorded digest.');
  }
  if (sourceBridge && (
    sourceBridge.schema_name !== migration.schema_name
    || sourceBridge.target_schema_fingerprint !== migration.source_schema_fingerprint
  )) {
    throw new TypeError('Source bridge must end at the forward migration source fingerprint.');
  }
  const client = await pool.connect();
  const schema = SCHEMAS[migration.schema_name];
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [schema.advisoryLockKey]);
    let actualSchemaFingerprint = await readSchemaFingerprint(client, migration.schema_name);
    if (sourceBridge
        && actualSchemaFingerprint === sourceBridge.source_schema_fingerprint) {
      await client.query(sourceBridge.sql);
      actualSchemaFingerprint = await readSchemaFingerprint(client, migration.schema_name);
      if (actualSchemaFingerprint !== sourceBridge.target_schema_fingerprint) {
        fail('MIGRATION_TARGET_FINGERPRINT_MISMATCH', 'Source bridge did not produce the exact target schema.', {
          migration_id: sourceBridge.migration_id,
          expected_schema_fingerprint: sourceBridge.target_schema_fingerprint,
          actual_schema_fingerprint: actualSchemaFingerprint
        });
      }
    }
    const ledgerRow = await readLedgerRow(client, migration);
    const state = classifyForwardMigrationState({
      migration,
      actualSchemaFingerprint,
      ledgerRow
    });
    if (state.status === 'already_applied') {
      await client.query('COMMIT');
      return Object.freeze({
        status: state.status,
        migration_id: migration.migration_id,
        migration_digest: migration.migration_digest,
        schema_name: migration.schema_name,
        schema_fingerprint: actualSchemaFingerprint,
        source_schema_fingerprint: migration.source_schema_fingerprint,
        target_schema_fingerprint: migration.target_schema_fingerprint
      });
    }

    await client.query(migration.sql);
    const targetFingerprint = await readSchemaFingerprint(client, migration.schema_name);
    if (targetFingerprint !== migration.target_schema_fingerprint) {
      fail('MIGRATION_TARGET_FINGERPRINT_MISMATCH', 'Migration did not produce the exact target schema.', {
        expected_schema_fingerprint: migration.target_schema_fingerprint,
        actual_schema_fingerprint: targetFingerprint
      });
    }
    await insertLedgerRow(client, migration);
    await client.query('COMMIT');
    return Object.freeze({
      status: 'applied',
      migration_id: migration.migration_id,
      migration_digest: migration.migration_digest,
      schema_name: migration.schema_name,
      schema_fingerprint: targetFingerprint,
      source_schema_fingerprint: migration.source_schema_fingerprint,
      target_schema_fingerprint: migration.target_schema_fingerprint
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}


async function readLedgerRow(client, migration) {
  const schema = SCHEMAS[migration.schema_name];
  const existence = await client.query(
    'SELECT to_regclass($1) IS NOT NULL AS ledger_exists',
    [schema.ledgerTable]
  );
  if (!existence.rows[0]?.ledger_exists) return null;
  const sql = migration.schema_name === 'world_base'
    ? `SELECT migration_id, migration_digest, source_schema_fingerprint,
              target_schema_fingerprint
       FROM world_base.schema_migrations
       WHERE migration_id = $1`
    : `SELECT migration_id, migration_digest, source_schema_fingerprint,
              target_schema_fingerprint
       FROM party_runtime.schema_migrations
       WHERE migration_id = $1`;
  const result = await client.query(sql, [migration.migration_id]);
  return result.rows[0] ?? null;
}

async function insertLedgerRow(client, migration) {
  const sql = migration.schema_name === 'world_base'
    ? `INSERT INTO world_base.schema_migrations
         (migration_id, migration_digest, source_schema_fingerprint,
          target_schema_fingerprint, applied_by)
       VALUES ($1, $2, $3, $4, current_user)`
    : `INSERT INTO party_runtime.schema_migrations
         (migration_id, migration_digest, source_schema_fingerprint,
          target_schema_fingerprint, applied_by)
       VALUES ($1, $2, $3, $4, current_user)`;
  await client.query(sql, [
    migration.migration_id,
    migration.migration_digest,
    migration.source_schema_fingerprint,
    migration.target_schema_fingerprint
  ]);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(code, message, details) {
  throw new ForwardMigrationError(code, message, details);
}
