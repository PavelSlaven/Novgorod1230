import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import {
  runSpatialV3TargetMigrations,
  SPATIAL_V3_TARGET_MIGRATIONS
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const docker = (args, input = null) => spawnSync(
  'docker',
  args,
  { input, encoding: 'utf8', timeout: 60_000 }
);
const containerName = `lower-dvina-party-011-${process.pid}`;
const rollbackContainerName =
  `lower-dvina-party-017-rollback-${process.pid}`;
const conflictContainerName =
  `lower-dvina-party-018-conflict-${process.pid}`;

test('018 preserves mode-split traces and enforces uniqueness within mode',
  async (t) => {
    if (docker(['version']).status !== 0) {
      t.skip('Docker is required for the isolated PostgreSQL migration gate.');
      return;
    }
    let pool;
    t.after(async () => {
      if (pool) await pool.end();
      docker(['rm', '-f', conflictContainerName]);
    });
    const started = docker([
      'run', '-d', '--name', conflictContainerName,
      '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD=conflict_local',
      '-e', 'POSTGRES_USER=conflict',
      '-e', 'POSTGRES_DB=conflict',
      'postgres:16-alpine'
    ]);
    assert.equal(started.status, 0, started.stderr);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (docker([
        'exec', conflictContainerName, 'pg_isready',
        '-U', 'conflict', '-d', 'conflict'
      ]).status === 0) {
        ready = true;
        break;
      }
    }
    assert.equal(ready, true);
    const port = Number(docker([
      'port', conflictContainerName, '5432'
    ]).stdout.match(/:(\d+)\s*$/u)?.[1]);
    pool = new pg.Pool({ host: '127.0.0.1', port,
      user: 'conflict', password: 'conflict_local', database: 'conflict' });
    await pool.query(`
      CREATE SCHEMA party_runtime;
      CREATE TABLE party_runtime.party_npc_decision_traces (
        party_id text NOT NULL,
        npc_id text NOT NULL,
        decision_mode text NOT NULL,
        boundary_id text,
        same_time_batch_ref jsonb
      );
      CREATE UNIQUE INDEX party_npc_decision_traces_batch_npc_mode_key
        ON party_runtime.party_npc_decision_traces (
          party_id,npc_id,decision_mode,
          (same_time_batch_ref ->> 'entity_id')
        ) WHERE boundary_id IS NOT NULL;
      INSERT INTO party_runtime.party_npc_decision_traces VALUES
        ('party','npc','conversation','conversation-boundary',
          '{"entity_kind":"temporal_batch","entity_id":"batch"}'),
        ('party','npc','combat','combat-boundary',
          '{"entity_kind":"temporal_batch","entity_id":"batch"}');
    `);

    await pool.query(SPATIAL_V3_TARGET_MIGRATIONS.at(-1));
    await assert.rejects(pool.query(`
      INSERT INTO party_runtime.party_npc_decision_traces VALUES
        ('party','npc','conversation','duplicate-conversation-boundary',
          '{"entity_kind":"temporal_batch","entity_id":"batch"}')
    `), /duplicate key value violates unique constraint/u);
    const readback = await pool.query(`
      SELECT count(*)::integer AS trace_count,
        to_regclass(
          'party_runtime.party_npc_decision_traces_batch_npc_mode_key'
        ) IS NOT NULL AS mode_index_present,
        to_regclass(
          'party_runtime.party_npc_decision_traces_batch_npc_key'
        ) IS NOT NULL AS strict_index_present
      FROM party_runtime.party_npc_decision_traces
    `);
    assert.deepEqual(readback.rows[0], {
      trace_count: 2,
      mode_index_present: true,
      strict_index_present: false
    });
  });

test('017 is rolled back when the in-transaction readiness gate fails',
  async (t) => {
    if (docker(['version']).status !== 0) {
      t.skip('Docker is required for the isolated PostgreSQL migration gate.');
      return;
    }
    let pool;
    t.after(async () => {
      if (pool) await pool.end();
      docker(['rm', '-f', rollbackContainerName]);
    });
    const started = docker([
      'run', '-d', '--name', rollbackContainerName,
      '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD=rollback_local',
      '-e', 'POSTGRES_USER=rollback',
      '-e', 'POSTGRES_DB=rollback',
      'postgres:16-alpine'
    ]);
    assert.equal(started.status, 0, started.stderr);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (docker([
        'exec', rollbackContainerName, 'pg_isready',
        '-U', 'rollback', '-d', 'rollback'
      ]).status === 0) {
        ready = true;
        break;
      }
    }
    assert.equal(ready, true);
    const port = Number(docker([
      'port', rollbackContainerName, '5432'
    ]).stdout.match(/:(\d+)\s*$/u)?.[1]);
    pool = new pg.Pool({ host: '127.0.0.1', port,
      user: 'rollback', password: 'rollback_local', database: 'rollback' });

    await assert.rejects(
      runSpatialV3TargetMigrations(pool, {
        beforeCommit: async () => {
          throw new Error('forced readiness failure');
        }
      }),
      /forced readiness failure/u
    );
    const table = await pool.query(
      `SELECT to_regclass(
        'party_runtime.party_conversation_contributions'
      ) AS relation`
    );
    assert.equal(table.rows[0].relation, null);
  });

test('011 applies to isolated PostgreSQL and permits transport departure without losing controls', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for the isolated PostgreSQL migration gate.');
    return;
  }
  t.after(() => docker(['rm', '-f', containerName]));
  const started = docker([
    'run', '-d', '--name', containerName,
    '-e', 'POSTGRES_PASSWORD=first_playable_local',
    '-e', 'POSTGRES_USER=first_playable',
    '-e', 'POSTGRES_DB=first_playable',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (docker([
      'exec', containerName, 'pg_isready',
      '-U', 'first_playable', '-d', 'first_playable'
    ]).status === 0) {
      ready = true;
      break;
    }
  }
  assert.equal(ready, true);

  const psql = (sql, options = []) => docker([
    'exec', '-i', containerName, 'psql', '-q', '-v', 'ON_ERROR_STOP=1',
    ...options,
    '-U', 'first_playable', '-d', 'first_playable'
  ], sql);
  const migrated = psql(SPATIAL_V3_TARGET_MIGRATIONS.join('\n'));
  assert.equal(migrated.status, 0, migrated.stderr);

  const seed = psql(`
    INSERT INTO party_runtime.parties(
      party_id,schema_version,world_revision_id,world_catalog_digest,
      materializer_version,rng_version,command_catalog_digest,
      profile_bundle_digest
    ) VALUES ('party',3,'world','catalog','materializer','rng','commands','profiles');
    INSERT INTO party_runtime.party_g5_sites(
      id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
      created_change_set_id,updated_change_set_id
    ) VALUES ('site','party','canonical','g4','{"entity_id":"g5"}','active',0,'seed','seed');
    INSERT INTO party_runtime.party_scene_baselines(
      id,party_id,host_kind,host_id,source_kind,scene_template_ref,
      materialization_trace_id,materializer_version,catalog_digest,status,
      state_version,created_change_set_id,updated_change_set_id
    ) VALUES (
      'baseline','party','g5_site','site','canonical_template',
      '{"entity_id":"scene"}','trace','materializer','catalog','active',0,
      'seed','seed'
    );
    INSERT INTO party_runtime.party_g6_instances(
      id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
      host_kind,host_id,physical_class_id,primary_scene_role_id,
      vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,
      default_visibility_distance_band,acoustic_uniformity,status,
      state_version,created_change_set_id,updated_change_set_id
    ) VALUES (
      'g6','party','baseline','{"entity_id":"scene"}','main','g5_site',
      'site','spatial.g6.water','navigation','surface','open',
      'default_clear','near','uniform','active',0,'seed','seed'
    );
    INSERT INTO party_runtime.scene_position_nodes(
      id,party_id,g6_instance_id,position_type_id,template_slot_key,
      template_instance_ordinal,capacity,access_class_id,status,state_version,
      created_change_set_id,updated_change_set_id
    ) VALUES (
      'mooring','party','g6','arrival','arrival',0,2,'controlled',
      'active',0,'seed','seed'
    );
    INSERT INTO party_runtime.party_transit_anchors(
      id,party_id,source_route_point_ref,anchor_role,context_snapshot,
      active_side,allowed_departure_dependency_pins,status,state_version,
      created_change_set_id,updated_change_set_id
    ) VALUES (
      'anchor','party','{}','ordinary','{}','departure','{}',
      'active',0,'seed','seed'
    );
    BEGIN;
      INSERT INTO party_runtime.party_journey_locations(
        id,party_id,owner_kind,owner_id,location_kind,scene_position_id,
        state_version,updated_change_set_id
      ) VALUES (
        'boat-location','party','transport','boat','scene','mooring',0,'seed'
      );
      INSERT INTO party_runtime.entity_placements(
        party_id,entity_kind,entity_id,placement_kind,position_node_id,
        occupies_capacity_units,state_version,updated_change_set_id
      ) VALUES (
        'party','transport','boat','moored_at_position','mooring',1,0,'seed'
      );
      INSERT INTO party_runtime.party_entity_controls(
        party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,
        access_profile_ref,capacity_units,state_version,updated_change_set_id
      ) VALUES (
        'party','transport','boat','{"entity_id":"player"}',
        '{"entity_id":"player"}','{"entity_id":"player"}',
        '{"entity_id":"boat_access"}',2,0,'seed'
      );
    COMMIT;
  `);
  assert.equal(seed.status, 0, seed.stderr);

  const invalidDeparture = psql(`
    BEGIN;
      DELETE FROM party_runtime.entity_placements
      WHERE party_id='party' AND entity_kind='transport' AND entity_id='boat';
    COMMIT;
  `);
  assert.notEqual(invalidDeparture.status, 0);

  const departure = psql(`
    BEGIN;
      UPDATE party_runtime.party_journey_locations
      SET location_kind='transit_anchor',scene_position_id=NULL,
          transit_anchor_id='anchor',state_version=1,
          updated_change_set_id='departure'
      WHERE id='boat-location';
      DELETE FROM party_runtime.entity_placements
      WHERE party_id='party' AND entity_kind='transport' AND entity_id='boat';
    COMMIT;
    SELECT count(*) AS control_count
    FROM party_runtime.party_entity_controls
    WHERE party_id='party' AND entity_kind='transport' AND entity_id='boat';
  `, ['-t', '-A']);
  assert.equal(departure.status, 0, departure.stderr);
  assert.match(departure.stdout, /1/u);
});
