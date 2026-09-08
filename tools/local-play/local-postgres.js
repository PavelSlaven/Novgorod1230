import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

import pg from 'pg';

export const LOCAL_POSTGRES = Object.freeze({ version: '16.14.0',
  worldDatabase: 'novgorod_world', partyDatabase: 'novgorod_party',
  worldUser: 'world_operator', partyUser: 'party_operator',
  adminUser: 'postgres', password: 'local_only' });
const WORLD_SENTINELS = Object.freeze([
  'world_base.spatial_v3_world_revisions',
  'world_base.runtime_catalog_activation_events',
  'world_base.domain_catalog_revisions', 'world_base.catalog_imports'
]);
const PARTY_SENTINELS = Object.freeze([
  'party_runtime.schema_migrations', 'party_runtime.parties',
  'party_runtime.party_catalog_pins'
]);

export function localPlayError(code, message, details = null) {
  const error = new Error(message); error.code = code;
  if (details) error.details = details;
  return error;
}
export function localDataRoot(env = process.env) {
  const root = String(env.LOCALAPPDATA ?? env.XDG_DATA_HOME ?? '').trim()
    || homedir();
  return join(root, 'Novgorod1230');
}
export async function classifyLocalDatabases({ worldQuery, partyQuery }) {
  const countSql = `SELECT count(*)::int AS count FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_type = 'BASE TABLE'`;
  const [worldTables, partyTables, worldSentinels, partySentinels] =
    await Promise.all([tableCount(worldQuery, countSql),
      tableCount(partyQuery, countSql),
      Promise.all(WORLD_SENTINELS.map((name) => exists(worldQuery, name))),
      Promise.all(PARTY_SENTINELS.map((name) => exists(partyQuery, name))) ]);
  if (worldTables === 0 && partyTables === 0) return 'fresh';
  if (worldTables === 0 || partyTables === 0
      || !worldSentinels.every(Boolean) || !partySentinels.every(Boolean)) {
    return 'partial';
  }
  return 'existing';
}

export async function ensureLocalPostgres({ settings = LOCAL_POSTGRES,
  dataRoot = localDataRoot(), createPool = (options) => new pg.Pool(options),
  reservePort = availablePort, command = spawnSync, spawnProcess = spawn,
  loadBinaries = defaultBinaries } = {}) {
  const databaseDir = join(dataRoot, 'data', `postgres-${settings.version}-utf8`);
  const runtimeDir = join(dataRoot, 'runtime', 'postgresql', settings.version);
  await mkdir(databaseDir, { recursive: true });
  const source = await loadBinaries();
  if (!existsSync(join(runtimeDir, 'bin', 'postgres.exe'))) {
    await mkdir(dirname(runtimeDir), { recursive: true });
    await cp(source.nativeDir, runtimeDir, { recursive: true });
  }
  const binaries = { initdb: join(runtimeDir, 'bin', 'initdb.exe'),
    postgres: join(runtimeDir, 'bin', 'postgres.exe'),
    pgCtl: join(runtimeDir, 'bin', 'pg_ctl.exe') };
  if (!existsSync(join(databaseDir, 'PG_VERSION'))) await initializeCluster({
    databaseDir, dataRoot, settings, binaries, command });
  const port = await reservePort();
  const process = spawnProcess(binaries.postgres, ['-D', databaseDir, '-p',
    String(port), '-h', '127.0.0.1'], { windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    await waitForPostgres({ port, settings, process, createPool });
    await ensureRolesAndDatabases({ port, settings, createPool });
    const worldUrl = databaseUrl(settings.worldUser,
      settings.worldDatabase, port, settings);
    const partyUrl = databaseUrl(settings.partyUser,
      settings.partyDatabase, port, settings);
    const worldPool = createPool({ connectionString: worldUrl, max: 1 });
    const partyPool = createPool({ connectionString: partyUrl, max: 1 });
    try {
      const state = await classifyLocalDatabases({
        worldQuery: (...args) => worldPool.query(...args),
        partyQuery: (...args) => partyPool.query(...args) });
      if (state === 'partial') throw localPlayError('LOCAL_POSTGRES_PARTIAL',
        'Local PostgreSQL schema is partially initialized.');
      let closed = false;
      return Object.freeze({ worldUrl, partyUrl, state,
        version: settings.version, databaseDir,
        async close() {
          if (closed) return; closed = true;
          command(binaries.pgCtl, ['stop', '-D', databaseDir, '-m', 'fast',
            '-w'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
        } });
    } finally { await Promise.all([worldPool.end(), partyPool.end()]); }
  } catch (error) {
    command(binaries.pgCtl, ['stop', '-D', databaseDir, '-m', 'fast', '-w'],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    if (error?.code) throw error;
    throw localPlayError('LOCAL_POSTGRES_START_FAILED',
      `Could not start managed PostgreSQL: ${error?.message ?? 'unknown error'}`);
  }
}

async function defaultBinaries() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw localPlayError(
    'LOCAL_POSTGRES_PLATFORM_UNSUPPORTED',
    'Managed PostgreSQL currently supports Windows x64.');
  const module = await import('@embedded-postgres/windows-x64');
  return { nativeDir: dirname(dirname(module.postgres)) };
}
async function initializeCluster({ databaseDir, dataRoot, settings, binaries,
  command }) {
  const passwordPath = join(dataRoot, 'runtime', 'postgresql', '.password');
  await writeFile(passwordPath, `${settings.password}\n`, { mode: 0o600 });
  try {
    requireSuccess(command(binaries.initdb, [`--pgdata=${databaseDir}`,
      '--auth=password', `--username=${settings.adminUser}`,
      `--pwfile=${passwordPath}`, '--lc-messages=C', '--locale=C',
      '--encoding=UTF8'], { cwd: dataRoot, encoding: 'utf8', windowsHide: true,
      timeout: 120_000, env: { ...process.env, LC_MESSAGES: 'C', TZ: 'UTC' } }),
    'LOCAL_POSTGRES_INITIALIZE_FAILED',
    'Could not initialize managed UTF-8 PostgreSQL.');
  } finally { await unlink(passwordPath).catch(() => {}); }
}
async function waitForPostgres({ port, settings, process, createPool }) {
  const url = databaseUrl(settings.adminUser, 'postgres', port, settings);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (process.exitCode != null) throw new Error(
      `PostgreSQL exited with code ${process.exitCode}.`);
    const pool = createPool({ connectionString: url, max: 1 });
    try { await pool.query('SELECT 1'); await pool.end(); return; }
    catch { await pool.end().catch(() => {}); }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgreSQL readiness timeout.');
}
async function ensureRolesAndDatabases({ port, settings, createPool }) {
  const client = createPool({ connectionString: databaseUrl(settings.adminUser,
    'postgres', port, settings), max: 1 });
  try {
    const roles = new Set((await client.query(
      'SELECT rolname FROM pg_roles WHERE rolname = ANY($1)',
      [[settings.worldUser, settings.partyUser]])).rows.map((row) => row.rolname));
    for (const user of [settings.worldUser, settings.partyUser]) {
      if (!roles.has(user)) await client.query(
        `CREATE ROLE ${user} LOGIN SUPERUSER PASSWORD '${settings.password}'`);
    }
    const names = [settings.worldDatabase, settings.partyDatabase];
    const databases = new Set((await client.query(
      'SELECT datname FROM pg_database WHERE datname = ANY($1)', [names]))
      .rows.map((row) => row.datname));
    for (const [name, owner] of [[names[0], settings.worldUser],
      [names[1], settings.partyUser]]) {
      if (!databases.has(name)) await client.query(
        `CREATE DATABASE ${name} OWNER ${owner}`);
    }
  } finally { await client.end(); }
}
function requireSuccess(result, code, message) {
  if (result?.status !== 0) throw localPlayError(code,
    `${message} ${String(result?.stderr ?? '').trim()}`.trim());
}
async function tableCount(query, sql) {
  return Number((await query(sql)).rows?.[0]?.count);
}
async function exists(query, name) {
  return (await query('SELECT to_regclass($1) IS NOT NULL AS present', [name]))
    .rows?.[0]?.present === true;
}
function databaseUrl(user, database, port, settings) {
  return `postgresql://${user}:${settings.password}@127.0.0.1:${port}/${database}`;
}
function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port)); });
  });
}
