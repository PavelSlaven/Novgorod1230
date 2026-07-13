import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';
import { REQUIRED_PARTY_TABLES, resolvePartyDatabaseConfig } from '../src/world/new-game-prerequisites.js';

await loadLocalEnv();

const { Client } = pg;
const schemaName = process.env.PARTY_SCHEMA || 'party';
const databaseUrl = resolvePartyDatabaseConfig(process.env).url;

if (!databaseUrl) {
  console.error('PARTY_DATABASE_URL, WORLD_DB_ADMIN_URL, or DATABASE_URL is required.');
  process.exit(1);
}

const schemaPath = resolve(import.meta.dirname, '../infra/party-db/schema/party_database_schema_v1.sql');
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(readFileSync(schemaPath, 'utf8'));
  for (const table of REQUIRED_PARTY_TABLES) {
    await client.query('SELECT to_regclass($1) AS name', [`${schemaName}.${table}`]).then(({ rows }) => {
      if (!rows[0]?.name) throw new Error(`missing party table: ${schemaName}.${table}`);
    });
  }
  console.log(`party schema applied: ${schemaName}, required tables: ${REQUIRED_PARTY_TABLES.length}`);
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

