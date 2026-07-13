/** Set world_reader password from DATABASE_URL. ponytail: tiny helper. */
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

await loadLocalEnv();

const url = String(process.env.DATABASE_URL ?? '').trim();
const match = url.match(/postgresql:\/\/world_reader:([^@]+)@/);
if (!match) {
  console.log('skip: DATABASE_URL has no world_reader');
  process.exit(0);
}

const password = decodeURIComponent(match[1]);
const adminUrl =
  String(process.env.WORLD_DB_ADMIN_URL ?? '').trim() ||
  `postgresql://${process.env.POSTGRES_USER || 'world_admin'}:${encodeURIComponent(process.env.POSTGRES_PASSWORD ?? '')}@${process.env.POSTGRES_HOST || '127.0.0.1'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'world_db'}`;

const client = new pg.Client({ connectionString: adminUrl });
await client.connect();
await client.query(`ALTER ROLE world_reader PASSWORD $pw$${password}$pw$`);
await client.query('GRANT CONNECT ON DATABASE world_db TO world_reader');
await client.end();
console.log('world_reader password set from DATABASE_URL');
