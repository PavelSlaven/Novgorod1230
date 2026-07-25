import { readFileSync } from 'node:fs';

const files = ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql', '007_party_runtime_temporal_world.sql', '008_party_runtime_pr8_first_entry.sql', '009_party_runtime_pr8_reaction_knowledge.sql', '010_party_runtime_pr8_reaction_options.sql'];
export const SPATIAL_V3_TARGET_MIGRATIONS = Object.freeze(files.map((file) => readFileSync(new URL(`../../../../../schemas/party-db/${file}`, import.meta.url), 'utf8')));

/** Applies only to an explicitly selected disposable/upgrade test database. */
export async function runSpatialV3TargetMigrations(pool) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await client.query(sql); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
  return Object.freeze({ applied: SPATIAL_V3_TARGET_MIGRATIONS.length, schema: 'party_runtime', schema_version: 'party_runtime_v3_target' });
}
