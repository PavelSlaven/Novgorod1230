import { spawnSync } from 'node:child_process';

import {
  LOCAL_PLAY_RESOURCES,
  validateLocalDockerResources
} from './local-play-contracts.js';

const POSTGRES_PASSWORD = 'novgorod1230_local_only';
const WORLD_ROLE = 'world_operator';
const PARTY_ROLE = 'party_operator';

export function createDockerClient({ execute = spawnSync } = {}) {
  return Object.freeze({
    run(args, {
      allowFailure = false,
      allowMissing = false,
      timeout = 30_000
    } = {}) {
      const result = execute('docker', args, {
        encoding: 'utf8', timeout, windowsHide: true
      });
      if (allowMissing && result.status !== 0
          && /no such (container|volume|object)/iu.test(result.stderr ?? '')) {
        return null;
      }
      if (allowFailure && result.status !== 0) return null;
      if (result.status !== 0) {
        fail('LOCAL_PLAY_DOCKER_COMMAND_FAILED',
          result.stderr?.trim() || `docker ${args[0]} failed`);
      }
      return String(result.stdout ?? '').trim();
    }
  });
}

export async function ensureLocalPostgres({
  docker = createDockerClient(),
  log = () => {}
} = {}) {
  docker.run(['version'], { timeout: 30_000 });
  let volume = inspectVolume(docker);
  let container = inspectContainer(docker);
  const action = validateLocalDockerResources({ container, volume });
  if (action.createVolume) {
    log('Creating persistent local PostgreSQL volume...');
    docker.run([
      'volume', 'create', '--label', resourceLabel(),
      LOCAL_PLAY_RESOURCES.volumeName
    ]);
    volume = inspectVolume(docker);
  }
  if (action.createContainer) {
    log('Creating localhost-only local PostgreSQL container...');
    docker.run([
      'run', '-d', '--name', LOCAL_PLAY_RESOURCES.containerName,
      '--label', resourceLabel(), '--restart', 'unless-stopped',
      '-p', '127.0.0.1::5432',
      '-e', `POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`,
      '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=postgres',
      '-v', `${LOCAL_PLAY_RESOURCES.volumeName}:/var/lib/postgresql/data`,
      LOCAL_PLAY_RESOURCES.postgresImage
    ], { timeout: 120_000 });
    container = inspectContainer(docker);
  } else if (container.status !== 'running') {
    log('Starting existing local PostgreSQL container...');
    docker.run(['start', LOCAL_PLAY_RESOURCES.containerName], {
      timeout: 90_000
    });
  }
  validateLocalDockerResources({
    container: inspectContainer(docker),
    volume: inspectVolume(docker)
  });
  await waitForPostgres(docker);
  ensureDatabasePair(docker);
  const port = publishedPort(docker);
  return Object.freeze({
    containerName: LOCAL_PLAY_RESOURCES.containerName,
    volumeName: LOCAL_PLAY_RESOURCES.volumeName,
    host: '127.0.0.1',
    port,
    worldUrl: connectionUrl(WORLD_ROLE,
      LOCAL_PLAY_RESOURCES.worldDatabase, port),
    partyUrl: connectionUrl(PARTY_ROLE,
      LOCAL_PLAY_RESOURCES.partyDatabase, port)
  });
}

function inspectVolume(docker) {
  const output = docker.run([
    'volume', 'inspect', LOCAL_PLAY_RESOURCES.volumeName
  ], { allowMissing: true });
  if (output == null) return null;
  const value = JSON.parse(output)[0];
  return Object.freeze({ labels: value?.Labels ?? {} });
}

function inspectContainer(docker) {
  const output = docker.run([
    'container', 'inspect', LOCAL_PLAY_RESOURCES.containerName
  ], { allowMissing: true });
  if (output == null) return null;
  const value = JSON.parse(output)[0];
  const mount = value?.Mounts?.find(
    ({ Destination }) => Destination === '/var/lib/postgresql/data');
  const port = value?.NetworkSettings?.Ports?.['5432/tcp']?.[0]
    ?? value?.HostConfig?.PortBindings?.['5432/tcp']?.[0];
  return Object.freeze({
    labels: value?.Config?.Labels ?? {},
    image: value?.Config?.Image ?? null,
    volumeName: mount?.Name ?? null,
    hostIp: port?.HostIp ?? null,
    status: value?.State?.Status ?? null
  });
}

async function waitForPostgres(docker) {
  let consecutiveReady = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = docker.run([
      'exec', LOCAL_PLAY_RESOURCES.containerName,
      'pg_isready', '-U', 'postgres', '-d', 'postgres'
    ], { allowFailure: true });
    consecutiveReady = ready == null ? 0 : consecutiveReady + 1;
    if (consecutiveReady >= 6) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail('LOCAL_PLAY_POSTGRES_NOT_READY',
    'Local PostgreSQL did not become ready.');
}

function ensureDatabasePair(docker) {
  const counts = docker.run(psqlArgs(
    `SELECT
       (SELECT count(*) FROM pg_roles WHERE rolname='${WORLD_ROLE}') || '|' ||
       (SELECT count(*) FROM pg_roles WHERE rolname='${PARTY_ROLE}') || '|' ||
       (SELECT count(*) FROM pg_database WHERE datname='${LOCAL_PLAY_RESOURCES.worldDatabase}') || '|' ||
       (SELECT count(*) FROM pg_database WHERE datname='${LOCAL_PLAY_RESOURCES.partyDatabase}')`
  )).split('|').map(Number);
  if (counts.every((value) => value === 0)) {
    docker.run(psqlArgs(
      `CREATE ROLE ${WORLD_ROLE} LOGIN SUPERUSER PASSWORD '${POSTGRES_PASSWORD}';
       CREATE ROLE ${PARTY_ROLE} LOGIN SUPERUSER PASSWORD '${POSTGRES_PASSWORD}';`
    ));
    docker.run(['exec', LOCAL_PLAY_RESOURCES.containerName, 'createdb',
      '-U', 'postgres', '-O', WORLD_ROLE, LOCAL_PLAY_RESOURCES.worldDatabase]);
    docker.run(['exec', LOCAL_PLAY_RESOURCES.containerName, 'createdb',
      '-U', 'postgres', '-O', PARTY_ROLE, LOCAL_PLAY_RESOURCES.partyDatabase]);
    return;
  }
  if (!counts.every((value) => value === 1)) {
    fail('LOCAL_PLAY_DATABASE_CLUSTER_PARTIAL',
      'Local PostgreSQL contains only part of the required role/database pair.');
  }
  const roleAttributes = docker.run(psqlArgs(
    `SELECT string_agg(rolname || ':' || rolsuper::text, ',' ORDER BY rolname)
       FROM pg_roles WHERE rolname IN ('${WORLD_ROLE}','${PARTY_ROLE}')`
  ));
  if (roleAttributes !== `${PARTY_ROLE}:true,${WORLD_ROLE}:true`) {
    fail('LOCAL_PLAY_DATABASE_CLUSTER_INCOMPATIBLE',
      'Local PostgreSQL operator roles are incompatible.');
  }
  const owners = docker.run(psqlArgs(
    `SELECT string_agg(datname || ':' || pg_get_userbyid(datdba), ',' ORDER BY datname)
       FROM pg_database
      WHERE datname IN ('${LOCAL_PLAY_RESOURCES.worldDatabase}',
                        '${LOCAL_PLAY_RESOURCES.partyDatabase}')`
  ));
  const expected = [
    `${LOCAL_PLAY_RESOURCES.partyDatabase}:${PARTY_ROLE}`,
    `${LOCAL_PLAY_RESOURCES.worldDatabase}:${WORLD_ROLE}`
  ].sort().join(',');
  if (owners !== expected) {
    fail('LOCAL_PLAY_DATABASE_CLUSTER_INCOMPATIBLE',
      'Local PostgreSQL database ownership is incompatible.');
  }
}

function psqlArgs(sql) {
  return ['exec', LOCAL_PLAY_RESOURCES.containerName, 'psql',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
    '-At', '-c', sql];
}

function publishedPort(docker) {
  const output = docker.run([
    'port', LOCAL_PLAY_RESOURCES.containerName, '5432/tcp'
  ]);
  const entries = output.split(/\r?\n/u).filter(Boolean);
  if (entries.length !== 1 || !entries[0].startsWith('127.0.0.1:')) {
    fail('LOCAL_PLAY_POSTGRES_PORT_UNSAFE',
      'Local PostgreSQL must publish exactly one localhost-only port.');
  }
  const port = Number(entries[0].slice(entries[0].lastIndexOf(':') + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('LOCAL_PLAY_POSTGRES_PORT_INVALID',
      'Docker returned an invalid PostgreSQL port.');
  }
  return port;
}

function connectionUrl(role, database, port) {
  return `postgresql://${role}:${POSTGRES_PASSWORD}@127.0.0.1:${port}/${database}`;
}

function resourceLabel() {
  return `${LOCAL_PLAY_RESOURCES.resourceLabel}=${LOCAL_PLAY_RESOURCES.resourceLabelValue}`;
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
