import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args, input = null) => spawnSync(
  'docker', args, { input, encoding: 'utf8', timeout: 60_000 }
);

test('038 adds local-line party schema without rewriting legacy connections', async (t) => {
  const migrationPath = new URL(
    '../../schemas/party-db/038_party_runtime_local_lines.sql', import.meta.url
  );
  const migration = await readFile(migrationPath, 'utf8');
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated party DDL validation');
    return;
  }

  const name = `m2c-lines-party-ddl-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-fv', name]);
  });

  const started = docker([
    'run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=lines_local',
    '-e', 'POSTGRES_USER=lines',
    '-e', 'POSTGRES_DB=lines',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);

  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));
  pool = new pg.Pool({
    host: '127.0.0.1', port, user: 'lines', password: 'lines_local',
    database: 'lines', max: 2
  });

  const files = (await readdir(new URL('../../schemas/party-db/', import.meta.url)))
    .filter((file) => /^\d+_.*\.sql$/u.test(file)
      && Number.parseInt(file, 10) >= 1
      && Number.parseInt(file, 10) <= 37)
    .sort();
  assert.equal(files.length, 37, 'fixture must contain exactly migrations 001–037');
  for (const file of files) {
    await pool.query(await readFile(
      new URL(`../../schemas/party-db/${file}`, import.meta.url), 'utf8'
    ));
  }

  await pool.query(`
    INSERT INTO party_runtime.parties(
      party_id,schema_version,world_revision_id,world_catalog_digest,
      materializer_version,rng_version,command_catalog_digest,profile_bundle_digest
    ) VALUES ('legacy-party',3,'world','catalog','materializer','rng','commands','profiles');
    INSERT INTO party_runtime.party_g5_sites(
      id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
      created_change_set_id,updated_change_set_id
    ) VALUES
      ('legacy-from','legacy-party','canonical','same-g4','{"entity_id":"from"}',
       'active',0,'seed','seed'),
      ('legacy-to','legacy-party','canonical','same-g4','{"entity_id":"to"}',
       'active',0,'seed','seed');
    INSERT INTO party_runtime.g5_site_connections(
      id,party_id,from_site_id,to_site_id,passage_type_id,
      transition_environment_profile_ref,movement_orientation_profile_ref,
      cost_kind,action_units,status,state_version,created_change_set_id,
      updated_change_set_id
    ) VALUES (
      'legacy-action-connection','legacy-party','legacy-from','legacy-to',
      'passage.path','{"entity_id":"environment"}',
      '{"entity_id":"orientation"}','action',1,'active',0,'seed','seed'
    );
  `);

  const baseline = await pool.query(`
    SELECT count(*)::integer AS count,
      coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) AS rows
    FROM party_runtime.g5_site_connections c
  `);
  const legacyBefore = baseline.rows[0];
  assert.equal(legacyBefore.count, 1);
  const preflight = await pool.query(`
    SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE cost_kind='action')::integer AS legacy_action,
      count(*) FILTER (WHERE cost_kind='time')::integer AS legacy_timed
    FROM party_runtime.g5_site_connections
  `);
  assert.deepEqual(preflight.rows[0], { total: 1, legacy_action: 1, legacy_timed: 0 },
    'fixture preflight counts must be exact before changing constraints');

  await pool.query(migration);

  const legacyAfter = await pool.query(`
    SELECT count(*)::integer AS count,
      coalesce(jsonb_agg(to_jsonb(c) - ARRAY[
        'line_kind_id','line_kind_profile_ref','line_name','line_discriminator',
        'line_direction_id','line_toponym','source_canonical_connection_ref'
      ]::text[] ORDER BY c.id), '[]'::jsonb) AS rows
    FROM party_runtime.g5_site_connections c
  `);
  assert.deepEqual(legacyAfter.rows[0], legacyBefore,
    '038 must preserve legacy action-cost rows and row count exactly');

  const lineColumns = await pool.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema='party_runtime' AND table_name='g5_site_connections'
  `);
  const lineColumnMap = new Map(lineColumns.rows.map((row) => [
    row.column_name, row.is_nullable
  ]));
  for (const column of [
    'line_kind_id', 'line_kind_profile_ref', 'line_name', 'line_discriminator',
    'line_direction_id', 'line_toponym', 'source_canonical_connection_ref'
  ]) {
    assert.ok(lineColumnMap.has(column), `g5_site_connections.${column} is required`);
  }
  for (const column of [
    'line_kind_id', 'line_kind_profile_ref', 'line_name', 'line_discriminator',
    'line_direction_id', 'line_toponym', 'source_canonical_connection_ref'
  ]) {
    assert.equal(lineColumnMap.get(column), 'YES',
      `${column} must stay nullable so legacy rows remain unchanged`);
  }
  assert.deepEqual((await pool.query(`
    SELECT line_kind_id,line_kind_profile_ref,line_name,line_discriminator,
      line_direction_id,line_toponym,source_canonical_connection_ref
    FROM party_runtime.g5_site_connections
    WHERE id='legacy-action-connection'
  `)).rows[0], {
    line_kind_id: null,
    line_kind_profile_ref: null,
    line_name: null,
    line_discriminator: null,
    line_direction_id: null,
    line_toponym: null,
    source_canonical_connection_ref: null
  }, 'legacy connection must not receive line values during migration');

  const connectionConstraints = await constraintDefinitions(pool, 'g5_site_connections');
  assert.match(connectionConstraints, /FOREIGN KEY \(from_site_id\).*party_g5_sites/u);
  assert.match(connectionConstraints, /FOREIGN KEY \(to_site_id\).*party_g5_sites/u);
  assert.match(connectionConstraints, /CHECK.*line_name.*cost_kind.*time/is,
    'new line rows must be time-cost while legacy rows retain old semantics');
  await pool.query(`
    INSERT INTO party_runtime.g5_site_connections(
      id,party_id,from_site_id,to_site_id,passage_type_id,
      line_kind_id,line_kind_profile_ref,line_name,
      transition_environment_profile_ref,movement_orientation_profile_ref,
      cost_kind,baseline_movement_method_id,movement_method_cost_profile_ref,
      base_minutes,dynamic_recheck_policy_ref,status,state_version,
      created_change_set_id,updated_change_set_id
    ) VALUES (
      'new-timed-line','legacy-party','legacy-from','legacy-to','passage.path',
      'line_kind.path','{"entity_id":"line-kind-profile"}','Forest path',
      '{"entity_id":"environment"}','{"entity_id":"orientation"}',
      'time','movement.foot','{"entity_id":"movement-cost"}',20,
      '{"entity_id":"recheck-policy"}','active',0,'seed','seed'
    )
  `);
  await assert.rejects(pool.query(`
    INSERT INTO party_runtime.g5_site_connections(
      id,party_id,from_site_id,to_site_id,passage_type_id,
      line_kind_id,line_kind_profile_ref,line_name,
      transition_environment_profile_ref,movement_orientation_profile_ref,
      cost_kind,action_units,status,state_version,created_change_set_id,
      updated_change_set_id
    ) VALUES (
      'invalid-action-line','legacy-party','legacy-from','legacy-to','passage.path',
      'line_kind.path','{"entity_id":"line-kind-profile"}','Action-cost line',
      '{"entity_id":"environment"}','{"entity_id":"orientation"}',
      'action',1,'active',0,'seed','seed'
    )
  `), (error) => error?.code === '23514');
  await assert.rejects(pool.query(`
    INSERT INTO party_runtime.g5_site_connections(
      id,party_id,from_site_id,to_site_id,passage_type_id,
      line_kind_id,line_name,
      transition_environment_profile_ref,movement_orientation_profile_ref,
      cost_kind,baseline_movement_method_id,movement_method_cost_profile_ref,
      base_minutes,dynamic_recheck_policy_ref,status,state_version,
      created_change_set_id,updated_change_set_id
    ) VALUES (
      'incomplete-timed-line','legacy-party','legacy-from','legacy-to',
      'passage.path','line_kind.path','Incomplete line',
      '{"entity_id":"environment"}','{"entity_id":"orientation"}',
      'time','movement.foot','{"entity_id":"movement-cost"}',20,
      '{"entity_id":"recheck-policy"}','active',0,'seed','seed'
    )
  `), (error) => error?.code === '23514');

  const travelColumns = await tableColumns(pool, 'traveller_travel_states');
  assert.ok(travelColumns.has('mirrored'), 'travel state must persist mirrored direction');
  assert.ok(travelColumns.has('closed_result'), 'travel state must persist terminal outcome');
  assert.match(await constraintDefinitions(pool, 'traveller_travel_states'),
    /returned_to_departure/u, 'closed_result must allow returned_to_departure');

  const intervalColumns = await tableColumns(pool, 'party_traversal_interval_results');
  assert.ok(intervalColumns.has('turn_back'), 'interval must persist atomic turn_back');
  assert.match(await constraintDefinitions(pool, 'party_traversal_interval_results'),
    /returned_to_departure/u, 'interval result_kind must allow returned_to_departure');

  const appendOnly = await pool.query(`
    SELECT tgname, (tgtype & 16) <> 0 AS fires_update,
      (tgtype & 8) <> 0 AS fires_delete
    FROM pg_trigger
    WHERE tgrelid='party_runtime.party_traversal_interval_results'::regclass
      AND NOT tgisinternal
  `);
  assert.ok(appendOnly.rows.some((row) => row.fires_update && row.fires_delete),
    'interval history must reject UPDATE and DELETE');
});

async function waitForPostgres(name) {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker([
      'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'lines', '-d', 'lines'
    ]).status === 0) {
      ready = true;
      break;
    }
  }
  assert.equal(ready, true, 'isolated PostgreSQL did not become ready');
}

async function tableColumns(pool, table) {
  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='party_runtime' AND table_name=$1
  `, [table]);
  return new Set(result.rows.map((row) => row.column_name));
}

async function constraintDefinitions(pool, table) {
  const result = await pool.query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid=format('party_runtime.%I', $1::text)::regclass
  `, [table]);
  return result.rows.map((row) => row.definition).join('\n');
}
