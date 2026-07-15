import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';
import { PARTY_RUNTIME_SCHEMA, checkPartyDbSeed, resolvePartyDatabaseConfig } from '../src/world/new-game-prerequisites.js';

await loadLocalEnv();

const { Client } = pg;
const databaseUrl = resolvePartyDatabaseConfig(process.env).url;

if (!databaseUrl) {
  console.error('PARTY_DATABASE_URL, WORLD_DB_ADMIN_URL, or DATABASE_URL is required.');
  process.exit(1);
}

const schemaPaths = [
  resolve(import.meta.dirname, '../schemas/party-db/001_party_runtime.sql'),
  resolve(import.meta.dirname, '../schemas/party-db/002_environment_landmarks.sql'),
  resolve(import.meta.dirname, '../schemas/party-db/003_travel_runtime.sql')
];
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  for (const schemaPath of schemaPaths) await client.query(readFileSync(schemaPath, 'utf8'));
  const result = await checkPartyDbSeed(databaseUrl);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  console.log(`party schema applied: ${PARTY_RUNTIME_SCHEMA} (party_runtime_v2), required tables: ${result.requiredTables}`);
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
