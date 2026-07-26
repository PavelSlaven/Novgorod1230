import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  SPATIAL_V3_TARGET_MIGRATIONS
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const docker = (args, input = null) => spawnSync(
  'docker',
  args,
  { input, encoding: 'utf8', timeout: 60_000 }
);
const containerName = `lower-dvina-party-011-${process.pid}`;

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
