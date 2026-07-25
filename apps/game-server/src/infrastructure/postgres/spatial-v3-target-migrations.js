import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const files = ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql', '007_party_runtime_temporal_world.sql', '008_party_runtime_pr8_first_entry.sql', '009_party_runtime_pr8_reaction_knowledge.sql', '010_party_runtime_pr8_reaction_options.sql'];
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
  { beforeCommit = null } = {}
) {
  const client = await pool.connect();
  let readiness = null;
  try {
    await client.query('BEGIN');
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await client.query(sql);
    if (beforeCommit) readiness = await beforeCommit(client);
    await client.query('COMMIT');
  }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
  return Object.freeze({
    applied: SPATIAL_V3_TARGET_MIGRATIONS.length,
    chain_digest: SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
    schema: 'party_runtime',
    schema_version: 'party_runtime_v3_target',
    readiness
  });
}
