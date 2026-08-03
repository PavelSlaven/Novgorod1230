import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const files = ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql', '007_party_runtime_temporal_world.sql', '008_party_runtime_pr8_first_entry.sql', '009_party_runtime_pr8_reaction_knowledge.sql', '010_party_runtime_pr8_reaction_options.sql', '011_party_runtime_first_playable.sql', '012_party_runtime_external_ownership.sql', '013_party_runtime_obligations.sql', '014_party_runtime_activity_resume_terminal.sql', '015_party_runtime_turn_step_items.sql'];
const CATALOG_MIGRATION_COVERED_TARGET_COUNT = 11;
export const SPATIAL_V3_TARGET_MIGRATIONS = Object.freeze(files.map((file) => readFileSync(new URL(`../../../../../schemas/party-db/${file}`, import.meta.url), 'utf8')));
export const SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST = createHash('sha256')
  .update(files.map((file, index) => (
    `${index + 1}:${file}\u0000${SPATIAL_V3_TARGET_MIGRATIONS[index]}`
  )).join('\u0000'))
  .digest('hex');

/**
 * Applies the immutable spatial-v3 production migration chain to the
 * caller-selected party database. Deployment is responsible for selecting a
 * non-operator database during validation and for completing reviewed backup
 * and rollback preparation before a production invocation.
 */
export async function runSpatialV3TargetMigrations(
  pool,
  {
    beforeCommit = null,
    exactAppliedMigration = null
  } = {}
) {
  const client = await pool.connect();
  let readiness = null;
  let executionMode = 'applied';
  try {
    await client.query('BEGIN');
    const reuse = exactAppliedMigration == null
      ? false
      : await hasExactAppliedMigration(
          client,
          exactAppliedMigration
        );
    const migrations = reuse
      ? SPATIAL_V3_TARGET_MIGRATIONS.slice(
          CATALOG_MIGRATION_COVERED_TARGET_COUNT
        )
      : SPATIAL_V3_TARGET_MIGRATIONS;
    executionMode = reuse ? 'extended_existing' : 'applied';
    for (const sql of migrations) {
      await client.query(sql);
    }
    if (beforeCommit) readiness = await beforeCommit(client);
    await client.query('COMMIT');
  }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
  return Object.freeze({
    applied: SPATIAL_V3_TARGET_MIGRATIONS.length,
    newly_applied: executionMode === 'applied'
      ? SPATIAL_V3_TARGET_MIGRATIONS.length
      : SPATIAL_V3_TARGET_MIGRATIONS.length
        - CATALOG_MIGRATION_COVERED_TARGET_COUNT,
    execution_mode: executionMode,
    chain_digest: SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
    schema: 'party_runtime',
    schema_version: 'party_runtime_v3_target',
    readiness
  });
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
