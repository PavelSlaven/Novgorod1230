import { readFileSync } from 'node:fs';

const PARTY_RUNTIME_V2_DDL = readFileSync(new URL('../../../../../schemas/party-db/001_party_runtime.sql', import.meta.url), 'utf8');
const PARTY_ENVIRONMENT_LANDMARKS_DDL = readFileSync(new URL('../../../../../schemas/party-db/002_environment_landmarks.sql', import.meta.url), 'utf8');
const PARTY_TRAVEL_RUNTIME_DDL = readFileSync(new URL('../../../../../schemas/party-db/003_travel_runtime.sql', import.meta.url), 'utf8');
const RUNTIME_MIGRATIONS = Object.freeze([PARTY_RUNTIME_V2_DDL, PARTY_ENVIRONMENT_LANDMARKS_DDL, PARTY_TRAVEL_RUNTIME_DDL]);

export async function runPartyRuntimeMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sql of RUNTIME_MIGRATIONS) await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return Object.freeze({ applied: RUNTIME_MIGRATIONS.length, schema: 'party_runtime', schema_version: 'party_runtime_v2' });
}

export { RUNTIME_MIGRATIONS };
