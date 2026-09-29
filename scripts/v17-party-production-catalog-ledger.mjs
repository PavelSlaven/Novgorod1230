import { SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from
  '../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { PARTY_RUNTIME_CATALOG_MIGRATION } from
  '../tools/runtime-catalog-activation/src/forward-migrations.js';
import { readPostgresSchemaFingerprint } from
  '../tools/runtime-catalog-activation/src/forward-migration.js';

/**
 * Production root expects the v2 party catalog migration ledger row after v17 bootstrap
 * applies PARTY_SQL via party_runtime_catalog_pins_v17_bootstrap.
 *
 * Alias semantics: `source_schema_fingerprint` is the closed v16 forward-migration lineage
 * (PARTY_RUNTIME_CATALOG_MIGRATION.source_schema_fingerprint), not a live read of the
 * pre-cutover database. `target_schema_fingerprint` is the measured v17 party_runtime
 * schema after bootstrap. The row documents production cutover; it does not re-run the
 * v16→v17 forward migration SQL.
 */
export async function ensureV17PartyProductionCatalogLedger(pool) {
  const client = await pool.connect();
  try {
    const targetFingerprint = await readPostgresSchemaFingerprint(client, 'party_runtime');
    const release = SPATIAL_V3_TARGET_PRODUCTION_RELEASE;
    if (targetFingerprint !== release.party_runtime_catalog_target_fingerprint) {
      throw new Error(
        `V17_PARTY_PRODUCTION_FINGERPRINT_MISMATCH:${targetFingerprint}`,
      );
    }
    const existing = (await client.query(
      `SELECT migration_id, target_schema_fingerprint
         FROM party_runtime.schema_migrations WHERE migration_id=$1`,
      [release.party_runtime_catalog_migration_id],
    )).rows[0];
    if (existing) {
      if (existing.target_schema_fingerprint !== targetFingerprint) {
        throw new Error(
          `V17_PARTY_PRODUCTION_LEDGER_MISMATCH:${existing.target_schema_fingerprint}`,
        );
      }
      return targetFingerprint;
    }
    await client.query(
      `INSERT INTO party_runtime.schema_migrations (
         migration_id,migration_digest,source_schema_fingerprint,
         target_schema_fingerprint,applied_by
       ) VALUES ($1,$2,$3,$4,$5)`,
      [
        release.party_runtime_catalog_migration_id,
        release.party_runtime_catalog_migration_digest,
        PARTY_RUNTIME_CATALOG_MIGRATION.source_schema_fingerprint,
        targetFingerprint,
        'bootstrap-v17-production-cutover',
      ],
    );
    return targetFingerprint;
  } finally {
    client.release();
  }
}

export async function readV17PartyProductionCatalogLedger(pool) {
  const release = SPATIAL_V3_TARGET_PRODUCTION_RELEASE;
  const row = (await pool.query(
    `SELECT migration_id,migration_digest,target_schema_fingerprint
       FROM party_runtime.schema_migrations WHERE migration_id=$1`,
    [release.party_runtime_catalog_migration_id],
  )).rows[0];
  const fingerprint = await readPostgresSchemaFingerprint(pool, 'party_runtime');
  return { row, fingerprint, release };
}
