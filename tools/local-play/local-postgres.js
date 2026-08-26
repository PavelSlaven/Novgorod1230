import { spawnSync } from 'node:child_process';

import pg from 'pg';

export const LOCAL_POSTGRES = Object.freeze({
  container: 'novgorod1230-local-postgres',
  volume: 'novgorod1230-local-postgres-data',
  image: 'postgres:16-alpine',
  label: 'com.pavelslaven.novgorod1230.local-play',
  labelValue: '1',
  worldDatabase: 'novgorod_world',
  partyDatabase: 'novgorod_party',
  worldUser: 'world_operator',
  partyUser: 'party_operator',
  password: 'local_only'
});

const WORLD_SENTINELS = Object.freeze([
  'world_base.spatial_v3_world_revisions',
  'world_base.runtime_catalog_activation_events',
  'world_base.domain_catalog_revisions',
  'world_base.catalog_imports'
]);
const PARTY_SENTINELS = Object.freeze([
  'party_runtime.schema_migrations',
  'party_runtime.parties',
  'party_runtime.party_catalog_pins'
]);
const POSTGRES_INITIALIZATION_MARKERS = Object.freeze([
  'PostgreSQL init process complete; ready for start up.',
  'PostgreSQL Database directory appears to contain a database; Skipping initialization'
]);

export function localPlayError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function parseDockerInspect(output, resource) {
  try {
    const parsed = JSON.parse(String(output));
    const value = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!value || typeof value !== 'object') throw new Error('empty inspect');
    return value;
  } catch {
    throw localPlayError(
      'LOCAL_POSTGRES_INSPECT_INVALID',
      `Docker returned invalid ${resource} inspect data.`
    );
  }
}

export function assertLocalPostgresOwnership({ volume, container, settings = LOCAL_POSTGRES }) {
  const owned = (labels) => labels?.[settings.label] === settings.labelValue;
  if (volume && !owned(volume.Labels)) {
    throw localPlayError('LOCAL_POSTGRES_VOLUME_CONFLICT',
      `Existing volume ${settings.volume} is not owned by local play.`);
  }
  if (!container) return;
  const mounted = container.Mounts?.some((mount) => mount.Type === 'volume'
    && mount.Name === settings.volume
    && mount.Destination === '/var/lib/postgresql/data');
  const bindings = container.HostConfig?.PortBindings?.['5432/tcp'];
  const loopback = Array.isArray(bindings) && bindings.length > 0 && bindings.every(
    (binding) => binding.HostIp === '127.0.0.1'
      && (binding.HostPort === '' || /^\d+$/u.test(binding.HostPort))
  );
  if (!owned(container.Config?.Labels)
      || container.Config?.Image !== settings.image
      || !mounted || !loopback) {
    throw localPlayError('LOCAL_POSTGRES_CONTAINER_CONFLICT',
      `Existing container ${settings.container} is not local-play PostgreSQL.`);
  }
}

export async function classifyLocalDatabases({ worldQuery, partyQuery }) {
  const tableCountSql = `SELECT count(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_type = 'BASE TABLE'`;
  const [worldTables, partyTables, worldSentinels, partySentinels] = await Promise.all([
    tableCount(worldQuery, tableCountSql),
    tableCount(partyQuery, tableCountSql),
    Promise.all(WORLD_SENTINELS.map((name) => exists(worldQuery, name))),
    Promise.all(PARTY_SENTINELS.map((name) => exists(partyQuery, name)))
  ]);
  if (worldTables === 0 && partyTables === 0) return 'fresh';
  if (worldTables === 0 || partyTables === 0
      || !worldSentinels.every(Boolean) || !partySentinels.every(Boolean)) {
    return 'partial';
  }
  return 'existing';
}

export async function ensureLocalPostgres({
  settings = LOCAL_POSTGRES,
  commandRunner = runCommand,
  createPool = (options) => new pg.Pool(options),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
} = {}) {
  assertDockerAvailable(commandRunner);
  const volume = inspect(commandRunner, ['volume', 'inspect', settings.volume], 'volume');
  const container = inspect(commandRunner, ['container', 'inspect', settings.container], 'container');
  assertLocalPostgresOwnership({ volume, container, settings });
  if (!volume) {
    requireSuccess(commandRunner(['volume', 'create', '--label',
      `${settings.label}=${settings.labelValue}`, settings.volume]),
    'LOCAL_POSTGRES_VOLUME_CREATE_FAILED', 'Could not create local PostgreSQL volume.');
  }
  if (!container) {
    requireSuccess(commandRunner([
      'run', '-d', '--name', settings.container,
      '--label', `${settings.label}=${settings.labelValue}`,
      '--mount', `type=volume,src=${settings.volume},dst=/var/lib/postgresql/data`,
      '-p', '127.0.0.1::5432', '-e', `POSTGRES_PASSWORD=${settings.password}`,
      settings.image
    ]), 'LOCAL_POSTGRES_CONTAINER_CREATE_FAILED', 'Could not create local PostgreSQL container.');
  } else if (!container.State?.Running) {
    requireSuccess(commandRunner(['container', 'start', settings.container]),
      'LOCAL_POSTGRES_CONTAINER_START_FAILED', 'Could not start local PostgreSQL container.');
  }
  await waitForPostgres(commandRunner, sleep, settings);
  const databases = listDatabases(commandRunner, settings);
  const hasWorld = databases.has(settings.worldDatabase);
  const hasParty = databases.has(settings.partyDatabase);
  if (!hasWorld && !hasParty && databases.size === 1) initializeFreshCluster(commandRunner, settings);
  else if (!hasWorld || !hasParty) throw localPlayError('LOCAL_POSTGRES_PARTIAL',
    'Local PostgreSQL has only part of required databases.');
  else if (!hasRequiredRoles(commandRunner, settings)) throw localPlayError('LOCAL_POSTGRES_PARTIAL',
    'Local PostgreSQL has only part of required roles.');

  const port = containerPort(inspect(commandRunner,
    ['container', 'inspect', settings.container], 'container'));
  const worldUrl = databaseUrl(settings.worldUser, settings.worldDatabase, port, settings);
  const partyUrl = databaseUrl(settings.partyUser, settings.partyDatabase, port, settings);
  const worldPool = createPool({ connectionString: worldUrl, max: 1 });
  const partyPool = createPool({ connectionString: partyUrl, max: 1 });
  try {
    const state = await classifyLocalDatabases({
      worldQuery: (...args) => worldPool.query(...args),
      partyQuery: (...args) => partyPool.query(...args)
    });
    if (state === 'partial') throw localPlayError('LOCAL_POSTGRES_PARTIAL',
      'Local PostgreSQL schema is partially initialized.');
    return Object.freeze({ worldUrl, partyUrl, state });
  } finally {
    await Promise.all([worldPool.end(), partyPool.end()]);
  }
}

export function assertDockerAvailable(commandRunner = runCommand) {
  requireSuccess(commandRunner(['version']), 'LOCAL_POSTGRES_DOCKER_UNAVAILABLE',
    'Docker is unavailable.');
}

async function tableCount(query, sql) {
  const result = await query(sql);
  return Number(result.rows?.[0]?.count);
}

async function exists(query, name) {
  const result = await query('SELECT to_regclass($1) IS NOT NULL AS present', [name]);
  return result.rows?.[0]?.present === true;
}

function inspect(commandRunner, args, resource) {
  const result = commandRunner(args);
  if (result.status !== 0) return null;
  return parseDockerInspect(result.stdout, resource);
}

function containerPort(container) {
  const bindings = container.NetworkSettings?.Ports?.['5432/tcp'];
  const loopback = Array.isArray(bindings) && bindings.length > 0 && bindings.every(
    (binding) => binding.HostIp === '127.0.0.1' && /^\d+$/u.test(binding.HostPort)
  );
  if (!loopback) throw localPlayError('LOCAL_POSTGRES_PORT_INVALID',
    'Local PostgreSQL has no loopback port.');
  return bindings[0].HostPort;
}

function listDatabases(commandRunner, settings) {
  const result = commandRunner(['exec', settings.container, 'psql', '-U', 'postgres',
    '-d', 'postgres', '-tAc', 'SELECT datname FROM pg_database WHERE datistemplate = false']);
  requireSuccess(result, 'LOCAL_POSTGRES_DATABASE_LIST_FAILED',
    'Could not inspect local PostgreSQL databases.');
  return new Set(String(result.stdout).split(/\r?\n/u).map((name) => name.trim()).filter(Boolean));
}

function initializeFreshCluster(commandRunner, settings) {
  for (const [user, database] of [
    [settings.worldUser, settings.worldDatabase],
    [settings.partyUser, settings.partyDatabase]
  ]) {
    requireSuccess(commandRunner(['exec', settings.container, 'psql', '-v', 'ON_ERROR_STOP=1',
      '-U', 'postgres', '-d', 'postgres', '-c',
      `CREATE ROLE ${user} LOGIN SUPERUSER PASSWORD '${settings.password}'`]),
    'LOCAL_POSTGRES_INITIALIZE_FAILED', 'Could not create local PostgreSQL role.');
    requireSuccess(commandRunner(['exec', settings.container, 'createdb', '-U', 'postgres',
      '-O', user, database]), 'LOCAL_POSTGRES_INITIALIZE_FAILED',
    'Could not create local PostgreSQL database.');
  }
}

function hasRequiredRoles(commandRunner, settings) {
  const result = commandRunner(['exec', settings.container, 'psql', '-U', 'postgres',
    '-d', 'postgres', '-tAc', `SELECT rolname FROM pg_roles WHERE rolname IN ('${settings.worldUser}', '${settings.partyUser}')`]);
  requireSuccess(result, 'LOCAL_POSTGRES_ROLE_LIST_FAILED',
    'Could not inspect local PostgreSQL roles.');
  const roles = new Set(String(result.stdout).split(/\r?\n/u).map((name) => name.trim()).filter(Boolean));
  return roles.has(settings.worldUser) && roles.has(settings.partyUser);
}

async function waitForPostgres(commandRunner, sleep, settings) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const logs = commandRunner(['logs', settings.container]);
    const initialized = POSTGRES_INITIALIZATION_MARKERS.some((marker) =>
      `${logs.stdout ?? ''}\n${logs.stderr ?? ''}`.includes(marker));
    if (initialized && commandRunner(['exec', settings.container, 'pg_isready', '-U',
      'postgres', '-d', 'postgres']).status === 0) return;
    if (attempt + 1 < 120) await sleep(250);
  }
  throw localPlayError('LOCAL_POSTGRES_NOT_READY', 'Local PostgreSQL did not become ready.');
}

function databaseUrl(user, database, port, settings) {
  return `postgresql://${user}:${settings.password}@127.0.0.1:${port}/${database}`;
}

function requireSuccess(result, code, message) {
  if (result.status !== 0) throw localPlayError(code, message);
}

function runCommand(args) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
}
