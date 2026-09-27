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
  `), (error) => {
    assert.equal(error.code, '23505', 'second primary must break the unique index');
    return true;
  });
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
    `), (error) => {
      assert.equal(error.code, '23514', 'g4 must break the scope_kind CHECK');
      return true;
    });

    // schedule_profile_ref / candidate_profile_refs immutable via real UPDATE.
    // The party reference trigger stays disabled for the whole block: with it
    // enabled it rejects every UPDATE of this row on its own, so immutability
    // would be proved by the wrong owner (REVIEW-069 N9).
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
    for (const assignment of [`candidate_profile_refs='["x"]'::jsonb`,
      `schedule_profile_ref='{}'::jsonb`, `dependency_pins='{}'::jsonb`]) {
      await assert.rejects(() => pool.query(`
        UPDATE party_runtime.party_npc_spatial_schedules
        SET ${assignment}, state_version=state_version+1
        WHERE id='sched'
      `), /npc schedule identity, pins or state version changed/u);
    }
    // Positive control: a permitted UPDATE with state_version+1 does pass.
    const bumped = await pool.query(`
      UPDATE party_runtime.party_npc_spatial_schedules
      SET causal_state_ref='{"entity_ref":{"entity_kind":"npc_causal_state","entity_id":"dusk"}}'::jsonb,
          state_version=state_version+1
      WHERE id='sched'
      RETURNING state_version
    `);
    assert.equal(Number(bumped.rows[0].state_version), 2);
    await pool.query(`
      ALTER TABLE party_runtime.party_npc_spatial_schedules
        ENABLE TRIGGER party_npc_schedule_party_reference_valid
    `);

    // Server start re-runs 012-037 through the runner over an existing party DB
    // that already holds rows (F13). Ledger row makes the runner reuse 001-011.
    await pool.query(await readFile(
      'tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql', 'utf8'));
    const ledger = { migration_id: 'm2c-ledger', migration_digest: 'a'.repeat(64),
      target_schema_fingerprint: 'b'.repeat(64) };
    await pool.query(`
      INSERT INTO party_runtime.schema_migrations(
        migration_id, migration_digest, source_schema_fingerprint,
        target_schema_fingerprint, applied_by
      ) VALUES ($1,$2,$3,$4,'m2c-presence-ddl-test')
    `, [ledger.migration_id, ledger.migration_digest, 'c'.repeat(64),
      ledger.target_schema_fingerprint]);
    const restart = await runSpatialV3TargetMigrations(pool, {
      exactAppliedMigration: ledger
    });
    assert.equal(restart.execution_mode, 'extended_existing');
    assert.equal(restart.newly_applied, 26);
    assert.equal((await pool.query(
      `SELECT count(*)::int AS n FROM party_runtime.party_npc_spatial_schedules`
    )).rows[0].n, 1);
  }
});
