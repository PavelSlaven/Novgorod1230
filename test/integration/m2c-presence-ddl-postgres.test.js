import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { testContainerLabel } from '../helpers/test-containers.js';
import { runSpatialV3TargetMigrations } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });

async function waitForPostgres(name) {
  for (let i = 0; i < 60; i += 1) {
    const r = docker(['exec', name, 'pg_isready', '-U', 'postgres']);
    if (r.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('postgres not ready');
}

test('27.sql + 037 apply on fresh DBs; 037 upgrades 001-036; constraints hold', {
  timeout: 600_000
}, async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker required');
    return;
  }
  const name = `m2c-presence-ddl-${randomUUID().slice(0, 8)}`;
  let admin;
  t.after(async () => {
    if (admin) await admin.end().catch(() => {});
    docker(['rm', '-fv', name]);
  });
  const started = docker([
    'run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  admin = new pg.Pool({
    host: '127.0.0.1', port, user: 'postgres', password: 'local_only',
    database: 'postgres', max: 2
  });
  await admin.query('CREATE DATABASE world_m2c_test');
  await admin.query('CREATE DATABASE party_m2c_fresh');
  await admin.query('CREATE DATABASE party_m2c_v16');

  // World: apply full schema (includes 27.sql).
  const world = new pg.Pool({
    host: '127.0.0.1', port, user: 'postgres', password: 'local_only',
    database: 'world_m2c_test', max: 2
  });
  t.after(async () => { await world.end().catch(() => {}); });
  const schemaSql = await readFile('infra/world-base/schema.sql', 'utf8');
  // schema.sql uses \ir — apply parts manually like bootstrap.
  const parts = [];
  for (let i = 1; i <= 27; i += 1) {
    const n = String(i).padStart(2, '0');
    parts.push(await readFile(`infra/world-base/schema/${n}.sql`, 'utf8'));
  }
  for (const sql of parts) await world.query(sql);
  const tables = await world.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema='world_base'`
  );
  assert.equal(tables.rows[0].n, 217);
  const primaryUq = await world.query(
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname='world_base'
       AND indexname='spatial_node_place_family_primary_uq'`
  );
  assert.match(primaryUq.rows[0].indexdef, /binding_role = 'primary'/u);
  assert.doesNotMatch(primaryUq.rows[0].indexdef, /status/u);
  // Behavioral: second primary on same node_version is rejected.
  await world.query(`INSERT INTO world_base.source_records(id,status) VALUES ('m2c-src','approved')`);
  await world.query(`
    INSERT INTO world_base.spatial_v3_world_revisions(id,catalog_digest,status,provenance_ref)
    VALUES ('m2c-rev', repeat('a',64), 'approved', 'm2c-src')
  `);
  await world.query(`
    INSERT INTO world_base.place_families(
      id, version, world_revision_id, status, confidence, payload
    ) VALUES
      ('pf_a', 1, 'm2c-rev', 'approved', 'high', '{}'::jsonb),
      ('pf_b', 1, 'm2c-rev', 'approved', 'high', '{}'::jsonb)
  `);
  await world.query(`
    INSERT INTO world_base.spatial_node_place_family_bindings(
      world_revision_id, node_id, node_version, place_family_id, place_family_version,
      binding_role, status, confidence
    ) VALUES ('m2c-rev', 'node-1', 1, 'pf_a', 1, 'primary', 'approved', 'high')
  `);
  await assert.rejects(() => world.query(`
    INSERT INTO world_base.spatial_node_place_family_bindings(
      world_revision_id, node_id, node_version, place_family_id, place_family_version,
      binding_role, status, confidence
    ) VALUES ('m2c-rev', 'node-1', 1, 'pf_b', 1, 'primary', 'approved', 'high')
  `));
  const wildCol = await world.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
     WHERE table_schema='world_base' AND table_name='presence_rules'
       AND column_name='wild_arrival_cause'`
  );
  assert.equal(wildCol.rows[0]?.data_type, 'text');
  assert.equal(wildCol.rows[0]?.is_nullable, 'YES');

  // Party fresh: full 001-037 via runner.
  const partyFresh = new pg.Pool({
    host: '127.0.0.1', port, user: 'postgres', password: 'local_only',
    database: 'party_m2c_fresh', max: 2
  });
  t.after(async () => { await partyFresh.end().catch(() => {}); });
  const applied = await runSpatialV3TargetMigrations(partyFresh);
  assert.equal(applied.applied, 37);

  // Party v16-era: 001-036 then 037.
  const partyV16 = new pg.Pool({
    host: '127.0.0.1', port, user: 'postgres', password: 'local_only',
    database: 'party_m2c_v16', max: 2
  });
  t.after(async () => { await partyV16.end().catch(() => {}); });
  const files = (await readdir('schemas/party-db'))
    .filter((f) => /^\d{3}_.*\.sql$/u.test(f)).sort();
  for (const file of files.slice(0, 36)) {
    await partyV16.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  await partyV16.query(await readFile(`schemas/party-db/${files[36]}`, 'utf8'));

  for (const pool of [partyFresh, partyV16]) {
    await pool.query(`
      INSERT INTO party_runtime.parties(
        party_id,schema_version,world_revision_id,world_catalog_digest,
        materializer_version,rng_version,command_catalog_digest,profile_bundle_digest
      ) VALUES ('p',2,'w','c','m','r','cmd','prof')
    `);
    await pool.query(`
      INSERT INTO party_runtime.party_environment_transition_log(
        party_id, g0_zone_ref, interval_index_6h,
        recorded_at_whole_minutes, recorded_at_subminute_numerator,
        recorded_at_subminute_denominator, transition_kind, payload
      ) VALUES ('p','g0', 0, 100, 0, 1, 'weather', '{}'::jsonb)
    `);
    await assert.rejects(() => pool.query(`
      UPDATE party_runtime.party_environment_transition_log
      SET payload='{"x":1}'::jsonb
      WHERE party_id='p'
    `));
    await assert.rejects(() => pool.query(`
      DELETE FROM party_runtime.party_environment_transition_log WHERE party_id='p'
    `));
    // g5 CHECK: real INSERT accepted; invalid scope rejected.
    await pool.query(`
      INSERT INTO party_runtime.party_ordinary_materialization_aggregates(
        party_id, scope_kind, scope_id, state_version, aggregate_payload
      ) VALUES ('p', 'g5', 'site-1', 0, '{}'::jsonb)
    `);
    await assert.rejects(() => pool.query(`
      INSERT INTO party_runtime.party_ordinary_materialization_aggregates(
        party_id, scope_kind, scope_id, state_version, aggregate_payload
      ) VALUES ('p', 'g4', 'site-bad', 0, '{}'::jsonb)
    `));

    // schedule_profile_ref / candidate_profile_refs immutable via real UPDATE.
    await pool.query(`
      ALTER TABLE party_runtime.party_npc_spatial_schedules
        DISABLE TRIGGER party_npc_schedule_party_reference_valid
    `);
    await pool.query(`
      INSERT INTO party_runtime.party_npc_spatial_schedules(
        id, party_id, npc_id, current_position_node_id,
        schedule_profile_ref, dependency_pins, causal_state_ref,
        status, state_version, updated_change_set_id,
        next_transition_at_whole_minutes, next_transition_at_subminute_numerator,
        next_transition_at_subminute_denominator
      ) VALUES (
        'sched', 'p', 'npc-1', NULL,
        '{"entity_ref":{"entity_kind":"schedule_profile","entity_id":"watch"},"authoring_version":"r1"}'::jsonb,
        '{"canonical_digest":"pin"}'::jsonb,
        '{"entity_ref":{"entity_kind":"npc_causal_state","entity_id":"watch"}}'::jsonb,
        'active', 1, 'cs', 10, 0, 1
      )
    `);
    await pool.query(`
      ALTER TABLE party_runtime.party_npc_spatial_schedules
        ENABLE TRIGGER party_npc_schedule_party_reference_valid
    `);
    await assert.rejects(() => pool.query(`
      UPDATE party_runtime.party_npc_spatial_schedules
      SET candidate_profile_refs='["x"]'::jsonb, state_version=state_version+1
      WHERE id='sched'
    `));
    await assert.rejects(() => pool.query(`
      UPDATE party_runtime.party_npc_spatial_schedules
      SET schedule_profile_ref='{}'::jsonb, state_version=state_version+1
      WHERE id='sched'
    `));

    // Re-apply 037 is idempotent on already-migrated party DB.
    await pool.query(await readFile('schemas/party-db/037_party_runtime_m2c_presence_routines.sql', 'utf8'));
  }
});
