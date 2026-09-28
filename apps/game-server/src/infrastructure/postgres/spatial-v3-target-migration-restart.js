import {
  SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
  SPATIAL_V3_TARGET_MIGRATIONS,
  runSpatialV3TargetMigrations
} from './spatial-v3-target-migrations.js';

const CATALOG_MIGRATION_COVERED_TARGET_COUNT = 11;

const TARGET_CHAIN_HEAD_MARKERS = Object.freeze([
  `to_regclass('party_runtime.party_environment_transition_log') IS NOT NULL`,
  `EXISTS (
     SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'party_runtime'
        AND table_name = 'party_npc_spatial_schedules'
        AND column_name = 'candidate_profile_refs'
   )`
]);

export async function isTargetMigrationChainAtHead(client) {
  const result = await client.query(
    `SELECT ${TARGET_CHAIN_HEAD_MARKERS.join(' AND ')} AS at_head`
  );
  return result.rows[0]?.at_head === true;
}

async function hasExactAppliedMigration(client, expected) {
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

/**
 * Production restart path: skip re-applying 012-037 when the pinned chain
 * head is already present, but still run the in-transaction readiness gate.
 */
export async function runSpatialV3TargetMigrationsForProductionRestart(
  pool,
  options = {}
) {
  const { exactAppliedMigration = null, beforeCommit = null } = options;
  if (exactAppliedMigration == null) {
    return runSpatialV3TargetMigrations(pool, options);
  }
  const client = await pool.connect();
  try {
    const reuse = await hasExactAppliedMigration(client, exactAppliedMigration);
    if (!reuse || !await isTargetMigrationChainAtHead(client)) {
      client.release();
      return runSpatialV3TargetMigrations(pool, options);
    }
  } catch (error) {
    client.release();
    throw error;
  }
  client.release();

  let readiness = null;
  const probe = await pool.connect();
  try {
    await probe.query('BEGIN');
    readiness = beforeCommit ? await beforeCommit(probe) : null;
    await probe.query('COMMIT');
  } catch (error) {
    await probe.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    probe.release();
  }
  return Object.freeze({
    applied: SPATIAL_V3_TARGET_MIGRATIONS.length,
    newly_applied: 0,
    execution_mode: 'extended_existing_current',
    chain_digest: SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
    schema: 'party_runtime',
    schema_version: 'party_runtime_v3_target',
    readiness
  });
}
