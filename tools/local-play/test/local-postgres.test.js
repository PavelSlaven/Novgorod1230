import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCAL_POSTGRES,
  assertLocalPostgresOwnership,
  classifyLocalDatabases,
  ensureLocalPostgres,
  parseDockerInspect
} from '../local-postgres.js';

const query = (count, sentinels) => async (sql, [name] = []) => ({ rows: [
  sql.includes('to_regclass') ? { present: sentinels.includes(name) } : { count }
] });

const worldSentinels = [
  'world_base.spatial_v3_world_revisions',
  'world_base.runtime_catalog_activation_events',
  'world_base.domain_catalog_revisions',
  'world_base.catalog_imports'
];
const partySentinels = [
  'party_runtime.schema_migrations',
  'party_runtime.parties',
  'party_runtime.party_catalog_pins'
];

test('classifyLocalDatabases distinguishes fresh, partial, and existing databases', async () => {
  assert.equal(await classifyLocalDatabases({ worldQuery: query(0, []), partyQuery: query(0, []) }), 'fresh');
  assert.equal(await classifyLocalDatabases({ worldQuery: query(1, worldSentinels), partyQuery: query(0, []) }), 'partial');
  assert.equal(await classifyLocalDatabases({ worldQuery: query(1, worldSentinels.slice(1)), partyQuery: query(1, partySentinels) }), 'partial');
  assert.equal(await classifyLocalDatabases({ worldQuery: query(1, worldSentinels), partyQuery: query(2, partySentinels) }), 'existing');
});

test('Docker inspect parsing and ownership reject foreign resources', () => {
  const volume = parseDockerInspect(JSON.stringify([{ Labels: { [LOCAL_POSTGRES.label]: '1' } }]), 'volume');
  const container = parseDockerInspect(JSON.stringify([{
    Config: { Image: LOCAL_POSTGRES.image, Labels: { [LOCAL_POSTGRES.label]: '1' } },
    Mounts: [{ Type: 'volume', Name: LOCAL_POSTGRES.volume, Destination: '/var/lib/postgresql/data' }],
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '54321' }] } }
  }]), 'container');
  assert.doesNotThrow(() => assertLocalPostgresOwnership({ volume, container }));
  assert.throws(() => assertLocalPostgresOwnership({ volume: { Labels: {} } }),
    { code: 'LOCAL_POSTGRES_VOLUME_CONFLICT' });
  assert.throws(() => assertLocalPostgresOwnership({ volume, container: { ...container,
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '54321' }] } }
  } }), { code: 'LOCAL_POSTGRES_CONTAINER_CONFLICT' });
});

test('existing database without a required role fails before opening pools', async () => {
  const container = {
    State: { Running: true },
    Config: { Image: LOCAL_POSTGRES.image, Labels: { [LOCAL_POSTGRES.label]: '1' } },
    Mounts: [{ Type: 'volume', Name: LOCAL_POSTGRES.volume, Destination: '/var/lib/postgresql/data' }],
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '54321' }] } }
  };
  const commandRunner = (args) => {
    if (args[0] === 'version' || args.includes('pg_isready')) return { status: 0, stdout: '' };
    if (args[0] === 'volume') return { status: 0, stdout: JSON.stringify([{ Labels: { [LOCAL_POSTGRES.label]: '1' } }]) };
    if (args[0] === 'container') return { status: 0, stdout: JSON.stringify([container]) };
    if (args.at(-1)?.includes('pg_database')) return { status: 0, stdout: `postgres\n${LOCAL_POSTGRES.worldDatabase}\n${LOCAL_POSTGRES.partyDatabase}\n` };
    if (args.at(-1)?.includes('pg_roles')) return { status: 0, stdout: `${LOCAL_POSTGRES.worldUser}\n` };
    throw new Error(`unexpected Docker command: ${args.join(' ')}`);
  };
  await assert.rejects(ensureLocalPostgres({ commandRunner }), { code: 'LOCAL_POSTGRES_PARTIAL' });
});
