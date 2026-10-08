import { readPostgresSchemaFingerprint } from
  '@rus/runtime-catalog/schema-fingerprint';
import {
  runSpatialV3TargetMigrations,
  SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
  SPATIAL_V3_TARGET_MIGRATIONS
} from './spatial-v3-target-migrations.js';

export function spatialV3TargetChainMigrationId(
  chainDigest = SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
) {
  return `spatial_v3_target_chain_${chainDigest}`;
}

export async function readSpatialV3TargetChainLedgerRow(
  client,
  chainDigest = SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
) {
  const exists = await client.query(
    `SELECT to_regclass(
       'party_runtime.schema_migrations'
     ) IS NOT NULL AS present`
  );
  if (exists.rows[0]?.present !== true) return null;
  const result = await client.query(
    `SELECT migration_id,migration_digest,source_schema_fingerprint,
            target_schema_fingerprint
     FROM party_runtime.schema_migrations
     WHERE migration_id=$1`,
    [spatialV3TargetChainMigrationId(chainDigest)]
  );
  return result.rows[0] ?? null;
}

export function assertSpatialV3TargetChainLedgerRow(
  row,
  chainDigest = SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST
) {
  if (!row
      || row.migration_id !== spatialV3TargetChainMigrationId(chainDigest)
      || row.migration_digest !== chainDigest) {
    const error = new Error(
      'Persisted party migration ledger conflicts with release'
    );
    error.code = 'SPATIAL_V3_MIGRATION_LEDGER_MISMATCH';
    throw error;
  }
}

export async function ensureSpatialV3TargetChainLedgerRow(
  client,
  sourceSchemaFingerprint,
  targetSchemaFingerprint
) {
  const exists = await client.query(
    `SELECT to_regclass(
       'party_runtime.schema_migrations'
     ) IS NOT NULL AS present`
  );
  if (exists.rows[0]?.present !== true) return null;
  await client.query(
    `INSERT INTO party_runtime.schema_migrations (
       migration_id,migration_digest,source_schema_fingerprint,
       target_schema_fingerprint,applied_by
     ) VALUES ($1,$2,$3,$4,current_user)
     ON CONFLICT (migration_id) DO NOTHING`,
    [
      spatialV3TargetChainMigrationId(),
      SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
      sourceSchemaFingerprint,
      targetSchemaFingerprint
    ]
  );
  const row = await readSpatialV3TargetChainLedgerRow(client);
  assertSpatialV3TargetChainLedgerRow(row);
  return row;
}

export async function readPartyRuntimeSchemaFingerprint(client) {
  return readPostgresSchemaFingerprint(client, 'party_runtime');
}

// ponytail: runner is hashed in fresh-schema request; exactAppliedMigration lives there.
export async function hasExactAppliedMigration(client, expected) {
  if (!expected
      || ![
        expected.migration_id,
        expected.migration_digest,
        expected.target_schema_fingerprint
      ].every((value) =>
        typeof value === 'string' && value.length > 0)) {
    throw new TypeError(
      'exactAppliedMigration requires id, digest and target fingerprint'
    );
  }
  const exists = await client.query(
    `SELECT to_regclass(
       'party_runtime.schema_migrations'
     ) IS NOT NULL AS present`
  );
  if (exists.rows[0]?.present !== true) return false;
  const result = await client.query(
    `SELECT migration_id,migration_digest,target_schema_fingerprint
     FROM party_runtime.schema_migrations
     WHERE migration_id=$1`,
    [expected.migration_id]
  );
  if (result.rows.length === 0) return false;
  const row = result.rows[0];
  if (result.rows.length !== 1
      || row.migration_digest !== expected.migration_digest
      || row.target_schema_fingerprint
        !== expected.target_schema_fingerprint) {
    const error = new Error(
      'Persisted party migration ledger conflicts with release'
    );
    error.code = 'SPATIAL_V3_MIGRATION_LEDGER_MISMATCH';
    throw error;
  }
  return true;
}

export async function evaluateSpatialV3TargetChainRestartSkip(
  client,
  exactAppliedMigration
) {
  if (!await hasExactAppliedMigration(client, exactAppliedMigration)) {
    return null;
  }
  const chainRow = await readSpatialV3TargetChainLedgerRow(client);
  if (!chainRow) return null;
  assertSpatialV3TargetChainLedgerRow(chainRow);
  const currentSchemaFingerprint = await readPartyRuntimeSchemaFingerprint(
    client
  );
  if (currentSchemaFingerprint !== chainRow.target_schema_fingerprint) {
    return null;
  }
  return chainRow;
}

function buildMigrationResult({
  executionMode,
  chainRow,
  readiness,
  newlyApplied
}) {
  return Object.freeze({
    applied: SPATIAL_V3_TARGET_MIGRATIONS.length,
    newly_applied: newlyApplied,
    execution_mode: executionMode,
    chain_digest: chainRow.migration_digest,
    source_schema_fingerprint: chainRow.source_schema_fingerprint,
    target_schema_fingerprint: chainRow.target_schema_fingerprint,
    schema: 'party_runtime',
    schema_version: 'party_runtime_v3_target',
    readiness
  });
}

export async function runSpatialV3TargetMigrationsWithChainLedger(
  pool,
  {
    beforeCommit = null,
    exactAppliedMigration = null
  } = {}
) {
  const probeClient = await pool.connect();
  let sourceSchemaFingerprint;
  try {
    sourceSchemaFingerprint = await readPartyRuntimeSchemaFingerprint(
      probeClient
    );
  } finally {
    probeClient.release();
  }
  let chainRow = null;
  const migration = await runSpatialV3TargetMigrations(pool, {
    exactAppliedMigration,
    beforeCommit: async (client) => {
      const targetSchemaFingerprint = await readPartyRuntimeSchemaFingerprint(
        client
      );
      chainRow = await ensureSpatialV3TargetChainLedgerRow(
        client,
        sourceSchemaFingerprint,
        targetSchemaFingerprint
      );
      return beforeCommit ? beforeCommit(client) : null;
    }
  });
  if (chainRow == null) {
    return migration;
  }
  return buildMigrationResult({
    executionMode: migration.execution_mode,
    chainRow,
    readiness: migration.readiness,
    newlyApplied: migration.newly_applied
  });
}
