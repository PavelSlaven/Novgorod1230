import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';
import {
  applyOrdinaryAggregateTransition,
  createOrdinaryAggregate
} from '@rus/materialization';
import { createPostgresOrdinaryMaterializationAggregateStore } from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-aggregate-store.js';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60_000 });
const name = `ordinary-aggregate-${process.pid}`;
const identity = { party_id: 'party-a', scope_ref: { entity_kind: 'g6', entity_id: 'scope-a' } };
const seed = () => applyOrdinaryAggregateTransition({
  aggregate: createOrdinaryAggregate({ scope_ref: identity.scope_ref, resolution_record_cap: 3 }),
  transition: { kind: 'seed', request_identity: 'seed-a', expected_state_version: 0, density_band: 'sparse', identity_budget: 1, background_groups: [] }
});
const close = (aggregate, request_identity = 'close-a') => applyOrdinaryAggregateTransition({
  aggregate,
  transition: { kind: 'close_coverage', request_identity, expected_state_version: aggregate.state_version, coverage_key: `coverage-${request_identity}`, category_key: 'category-a', context_version: 'context-a', resolution: 'absent' }
});

test('ordinary aggregate PostgreSQL adapter is exact, CAS-only, and rollback-safe', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required for isolated PostgreSQL test');
  t.after(() => docker(['rm', '-f', name]));
  const started = docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=ordinary', '-e', 'POSTGRES_USER=ordinary', '-e', 'POSTGRES_DB=ordinary', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    if (docker(['exec', name, 'pg_isready', '-U', 'ordinary', '-d', 'ordinary']).status === 0) { ready = true; break; }
  }
  assert.equal(ready, true);
  await new Promise((done) => setTimeout(done, 750));
  const port = Number(docker(['port', name, '5432/tcp']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));
  const pool = new Pool({ host: '127.0.0.1', port, user: 'ordinary', password: 'ordinary', database: 'ordinary' });
  t.after(() => pool.end());
  await pool.query(await readFile('schemas/party-db/001_party_runtime.sql', 'utf8'));
  await pool.query(await readFile('schemas/party-db/021_party_runtime_ordinary_materialization.sql', 'utf8'));
  const insertParty = (party_id) => pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,2,'world','catalog','materializer','rng','commands','profiles')`, [party_id]);
  await Promise.all(['party-a', 'party-b', 'party-c'].map(insertParty));
  const store = createPostgresOrdinaryMaterializationAggregateStore();
  const inTransaction = async (action) => { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); } };
  const seeded = seed();
  assert.deepEqual(await inTransaction((transaction) => store.load({ transaction, ...identity })), { status: 'unseeded' });
  assert.deepEqual(await inTransaction((transaction) => store.compareAndSet({ transaction, ...identity, expected_state_version: 0, aggregate: seeded })), { status: 'committed', state_version: 1 });
  const loaded = await inTransaction((transaction) => store.load({ transaction, ...identity }));
  assert.equal(loaded.status, 'present'); assert.deepEqual(loaded.aggregate, seeded);
  const updated = close(seeded);
  assert.deepEqual(await inTransaction((transaction) => store.compareAndSet({ transaction, ...identity, expected_state_version: 1, aggregate: updated })), { status: 'committed', state_version: 2 });
  assert.deepEqual(await inTransaction((transaction) => store.compareAndSet({ transaction, ...identity, expected_state_version: 1, aggregate: updated })), { status: 'stale' });
  await assert.rejects(() => pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('party-a','g6','scope-a',2,$1)`, [updated]));
  const firstRaceAggregate = close(updated, 'race-a');
  const secondRaceAggregate = close(updated, 'race-b');
  const firstClient = await pool.connect(); const secondClient = await pool.connect();
  const racers = [
    { client: firstClient, aggregate: firstRaceAggregate, index: 0, open: true },
    { client: secondClient, aggregate: secondRaceAggregate, index: 1, open: true }
  ];
  let racedAggregate;
  try {
    await Promise.all(racers.map(({ client }) => client.query('BEGIN')));
    const attempts = racers.map((racer) => store.compareAndSet({
      transaction: racer.client, ...identity, expected_state_version: 2,
      aggregate: racer.aggregate
    }).then((result) => ({ ...racer, result })));
    const winner = await Promise.race(attempts);
    assert.equal(winner.result.status, 'committed');
    await winner.client.query('COMMIT'); racers[winner.index].open = false;
    const loser = await attempts[1 - winner.index];
    assert.equal(loser.result.status, 'stale');
    await loser.client.query('COMMIT'); racers[loser.index].open = false;
    racedAggregate = winner.aggregate;
  } finally {
    for (const racer of racers) {
      if (racer.open) await racer.client.query('ROLLBACK').catch(() => {});
      racer.client.release();
    }
  }
  assert.equal((await inTransaction((transaction) => store.load({ transaction, ...identity }))).aggregate.state_version, 3);
  const rollbackAggregate = close(racedAggregate, 'rollback-a');
  const rollbackClient = await pool.connect();
  await rollbackClient.query('BEGIN');
  assert.equal((await store.compareAndSet({ transaction: rollbackClient, ...identity, expected_state_version: 3, aggregate: rollbackAggregate })).status, 'committed');
  await rollbackClient.query('ROLLBACK'); rollbackClient.release(true);
  assert.equal((await inTransaction((transaction) => store.load({ transaction, ...identity }))).aggregate.state_version, 3);
  const missing = { party_id: 'party-b', scope_ref: identity.scope_ref };
  const missingClient = await pool.connect(); await missingClient.query('BEGIN');
  await store.compareAndSet({ transaction: missingClient, ...missing, expected_state_version: 0, aggregate: { ...seed(), scope_ref: missing.scope_ref } });
  await missingClient.query('ROLLBACK'); missingClient.release(true);
  assert.deepEqual(await inTransaction((transaction) => store.load({ transaction, ...missing })), { status: 'unseeded' });
  const semanticReload = await pool.query(`SELECT aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates WHERE party_id='party-a'`);
  assert.deepEqual(semanticReload.rows[0].aggregate_payload, racedAggregate);
  await assert.rejects(() => pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('missing-party','g6','orphan',1,$1)`, [seed()]));
  await assert.rejects(() => pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('party-a','g6','array-payload',1,'[]')`));
  await assert.rejects(() => pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('party-a','g6','scalar-payload',1,'true')`));
  await assert.rejects(() => pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('party-a','g6',' noncanonical ',1,$1)`, [seed()]));
  await assert.rejects(() => pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('party-a','g6',E'\\tscope',1,$1)`, [seed()]));
  await assert.rejects(() => pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('party-a','g6',E'scope\\n',1,$1)`, [seed()]));
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('party-b','g6','broken-version',9,$1)`, [seed()]);
  await assert.rejects(() => inTransaction((transaction) => store.load({ transaction, party_id: 'party-b', scope_ref: { entity_kind: 'g6', entity_id: 'broken-version' } })), (error) => error.code === 'ORDINARY_AGGREGATE_ROW_INVALID');
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates VALUES ('party-b','g6','broken-payload',1,$1)`, [{ malformed: true }]);
  await assert.rejects(() => inTransaction((transaction) => store.load({ transaction, party_id: 'party-b', scope_ref: { entity_kind: 'g6', entity_id: 'broken-payload' } })), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  const cascade = { party_id: 'party-c', scope_ref: identity.scope_ref };
  await inTransaction((transaction) => store.compareAndSet({ transaction, ...cascade, expected_state_version: 0, aggregate: seed() }));
  await pool.query(`DELETE FROM party_runtime.parties WHERE party_id='party-c'`);
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM party_runtime.party_ordinary_materialization_aggregates WHERE party_id='party-c'`)).rows[0].count, 0);
});
