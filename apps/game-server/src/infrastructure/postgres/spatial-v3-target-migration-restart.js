import {
  SPATIAL_V3_TARGET_MIGRATIONS
} from './spatial-v3-target-migrations.js';
import {
  evaluateSpatialV3TargetChainRestartSkip,
  runSpatialV3TargetMigrationsWithChainLedger
} from './spatial-v3-target-chain-ledger.js';

/**
 * Production restart path: skip re-applying 012-037 when the pinned chain
 * ledger row is present and the live schema matches its target fingerprint,
 * but still run the in-transaction readiness gate.
 */
export async function runSpatialV3TargetMigrationsForProductionRestart(
  pool,
  options = {}
) {
  const { exactAppliedMigration = null, beforeCommit = null } = options;
  if (exactAppliedMigration == null) {
    return runSpatialV3TargetMigrationsWithChainLedger(pool, options);
  }
  let client = await pool.connect();
  try {
    await client.query('BEGIN');
    const chainRow = await evaluateSpatialV3TargetChainRestartSkip(
      client,
      exactAppliedMigration
    );
    if (!chainRow) {
      await client.query('ROLLBACK');
      client.release();
      client = null;
      return runSpatialV3TargetMigrationsWithChainLedger(pool, options);
    }
    const readiness = beforeCommit ? await beforeCommit(client) : null;
    await client.query('COMMIT');
    return Object.freeze({
      applied: SPATIAL_V3_TARGET_MIGRATIONS.length,
      newly_applied: 0,
      execution_mode: 'extended_existing_current',
      chain_digest: chainRow.migration_digest,
      source_schema_fingerprint: chainRow.source_schema_fingerprint,
      target_schema_fingerprint: chainRow.target_schema_fingerprint,
      schema: 'party_runtime',
      schema_version: 'party_runtime_v3_target',
      readiness
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client) client.release();
  }
}
