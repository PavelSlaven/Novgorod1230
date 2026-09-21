import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

import { ensureLocalPostgres, LOCAL_POSTGRES } from
  '../../tools/local-play/local-postgres.js';

export async function createPostgresTestBackend(prefix) {
  const adminUrl = resolveAdminUrl();
  if (!adminUrl && process.platform === 'win32')
    return createManagedBackend(prefix);
  if (!adminUrl) return null;
  const suffix = `${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const worldDatabase = `${prefix}_world_${suffix}`;
  const partyDatabase = `${prefix}_party_${suffix}`;
  assertIdentifier(worldDatabase);
  assertIdentifier(partyDatabase);
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await admin.query(`CREATE DATABASE ${worldDatabase}
      TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
    await admin.query(`CREATE DATABASE ${partyDatabase}
      TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
  } catch (error) {
    await admin.query(`DROP DATABASE IF EXISTS ${partyDatabase} WITH (FORCE)`)
      .catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${worldDatabase} WITH (FORCE)`)
      .catch(() => {});
    await admin.end();
    throw error;
  }
  return {
    kind: 'external',
    supportsServerRestart: false,
    worldDatabase,
    partyDatabase,
    worldUrl: databaseUrl(adminUrl, worldDatabase),
    partyUrl: databaseUrl(adminUrl, partyDatabase),
    async restart() {
      throw Object.assign(new Error(
        'External PostgreSQL test backend cannot restart its server'), {
        code: 'POSTGRES_SERVER_RESTART_UNSUPPORTED'
      });
    },
    async close() {
      await admin.query(`DROP DATABASE IF EXISTS ${partyDatabase} WITH (FORCE)`);
      await admin.query(`DROP DATABASE IF EXISTS ${worldDatabase} WITH (FORCE)`);
      await admin.end();
    }
  };
}

async function createManagedBackend(prefix) {
  const dataRoot = await mkdtemp(join(tmpdir(), `${prefix}-postgres-`));
  const settings = { ...LOCAL_POSTGRES,
    worldDatabase: `${prefix}_world_${process.pid}`,
    partyDatabase: `${prefix}_party_${process.pid}`,
    worldUser: 'postgres', partyUser: 'postgres' };
  let managed = await ensureLocalPostgres({ dataRoot, settings });
  return {
    kind: 'managed',
    supportsServerRestart: true,
    worldDatabase: settings.worldDatabase,
    partyDatabase: settings.partyDatabase,
    get worldUrl() { return managed.worldUrl; },
    get partyUrl() { return managed.partyUrl; },
    async restart() {
      await managed.close();
      managed = await ensureLocalPostgres({ dataRoot, settings });
    },
    async close() {
      await managed.close();
      await rm(dataRoot, { recursive: true, force: true });
    }
  };
}

function resolveAdminUrl() {
  if (process.env.RUS_TEST_POSTGRES_ADMIN_URL)
    return process.env.RUS_TEST_POSTGRES_ADMIN_URL;
  if (!process.env.PGHOST) return null;
  const url = new URL('postgresql://localhost/postgres');
  url.hostname = process.env.PGHOST;
  url.port = process.env.PGPORT ?? '5432';
  url.username = process.env.PGUSER ?? 'postgres';
  url.password = process.env.PGPASSWORD ?? '';
  return url.toString();
}

function databaseUrl(adminUrl, database) {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

function assertIdentifier(value) {
  if (!/^[a-z][a-z0-9_]+$/u.test(value))
    throw new Error(`Unsafe PostgreSQL test database name: ${value}`);
}
