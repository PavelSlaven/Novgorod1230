import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { testContainerLabel } from '../../../test/helpers/test-containers.js';
import { createSpatialV3LocalSceneRuntime } from
  '../src/runtime/spatial-v3-local-scene-runtime.js';
import { recheckS1LocalMovement } from
  '../src/infrastructure/postgres/first-playable/recheck-s1-local-movement.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8' });

test('committed canonical scene edges move arrival→focus→departure with stale replay denied',
  { timeout: 180_000 }, async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    const name = `m2c-local-${randomUUID().slice(0, 12)}`;
    let db;
    t.after(async () => { await db?.end(); docker(['rm', '-fv', name]); });
    assert.equal(docker(['run', ...testContainerLabel(), '-d', '-p', '127.0.0.1::5432', '--name', name,
      '-e', 'POSTGRES_PASSWORD=local', '-e', 'POSTGRES_USER=local',
      '-e', 'POSTGRES_DB=local', 'postgres:16-alpine']).status, 0);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (docker(['exec', name, 'pg_isready', '-U', 'local', '-d', 'local']).status === 0) {
        ready = true; break;
      }
      await new Promise((done) => setTimeout(done, 300));
    }
    assert.equal(ready, true);
    await new Promise((done) => setTimeout(done, 500));
    const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/u)?.[1]);
    db = new pg.Client({ host: '127.0.0.1', port, user: 'local',
      password: 'local', database: 'local' });
    await db.connect();
    for (const file of ['001_party_runtime.sql', '002_party_runtime_v3.sql',
      '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql']) {
      await db.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    }
    await seed(db);
    await db.query(`UPDATE party_runtime.scene_movement_edges SET capacity=NULL`);
    await db.query(`UPDATE party_runtime.scene_position_nodes SET capacity=7 WHERE id='focus'`);
    await db.query(`INSERT INTO party_runtime.entity_placements
      (party_id,entity_kind,entity_id,placement_kind,position_node_id,
        occupies_capacity_units,state_version,updated_change_set_id)
      VALUES ('party','npc','resident','scene_position','focus',1,1,'seed')`);
    const runtime = createSpatialV3LocalSceneRuntime({ pool: db,
      readLocalEdgeDisclosure: async ({ state: current }) =>
        [['arrival', 'focus'], ['focus', 'arrival'], ['focus', 'departure'],
          ['departure', 'focus']].filter(([from]) =>
          from === current.position.position_id).map(([from, to]) => ({
            edge_id: `${from}:${to}`, display_label: `Проход ${from}:${to}` })) });
    let source = state('arrival', 1);
    assert.deepEqual((await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
      state: source })).map(({ edge_id: id }) => id), ['arrival:focus']);
    await assert.rejects(runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
      state: source, edgeId: 'focus:departure', playerInput: {}, inputDigest: 'direct' }),
    { code: 'SPATIAL_V3_LOCAL_EDGE_UNAVAILABLE' });
    for (const [from, to, version] of [['arrival', 'focus', 1], ['focus', 'departure', 2]]) {
      const consequence = await runtime.prepareLocalMovement({ partyId: 'party',
        actorId: 'actor', state: source, edgeId: `${from}:${to}`,
        playerInput: {}, inputDigest: `move-${version}` });
      assert.equal(consequence.duration_minutes, 0);
      const check = { actor_id: 'actor', journey_location_id: 'journey',
        expected_journey_state_version: version, from_position_ref: from,
        to_position_ref: to, movement_edge_ref: `${from}:${to}`,
        movement_admission: consequence.position_transition.movement_admission };
      await db.query('BEGIN');
      try {
        assert.equal((await recheckS1LocalMovement({ transaction: db,
          partyId: 'party', check })).ok, true);
        const write = await db.query(`UPDATE party_runtime.party_journey_locations
          SET scene_position_id=$1,state_version=state_version+1,updated_change_set_id=$2
          WHERE id='journey' AND state_version=$3`, [to, `change-${version}`, version]);
        assert.equal(write.rowCount, 1);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      const reloaded = await db.query(`SELECT scene_position_id,state_version
        FROM party_runtime.party_journey_locations WHERE id='journey'`);
      assert.equal(reloaded.rows[0].scene_position_id, to);
      assert.equal(Number(reloaded.rows[0].state_version), version + 1);
      assert.equal((await recheckS1LocalMovement({ transaction: db,
        partyId: 'party', check })).ok, false, 'stale replay cannot move again');
      source = state(to, version + 1);
    }
    assert.deepEqual((await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
      state: source })).map(({ edge_id: id }) => id), ['departure:focus']);
    await db.query(`UPDATE party_runtime.scene_movement_edges SET capacity=1`);
    await db.query(`UPDATE party_runtime.scene_position_nodes SET capacity=1
      WHERE id='focus'`);
    await db.query(`INSERT INTO party_runtime.entity_placements
      (party_id,entity_kind,entity_id,placement_kind,position_node_id,
        occupies_capacity_units,state_version,updated_change_set_id)
      VALUES ('party','npc','blocker','scene_position','focus',1,1,'block')`);
    assert.deepEqual((await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
      state: source })), [], 'occupied destination is unavailable');
  });

function state(position, journeyVersion) {
  return { party_id: 'party', actor_id: 'actor', party_state: { state_version: 1 },
    position: { position_id: position }, journey_location: { id: 'journey',
      scene_position_id: position, state_version: journeyVersion } };
}

async function seed(db) {
  await db.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
      materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party',3,'world','digest','materializer','rng','command','bundle');
    INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
      created_change_set_id,updated_change_set_id)
    VALUES ('site','party','canonical','g4','{"entity_id":"canonical"}',
      'active',1,'seed','seed');
    INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
      materialization_trace_id,materializer_version,catalog_digest,status,
      state_version,created_change_set_id,updated_change_set_id)
    VALUES ('baseline','party','g5_site','site','canonical_template','{}',
      'trace','materializer','digest','active',1,'seed','seed');
    INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
      host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,
      overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,
      acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('g6','party','baseline','{}','main','g5_site','site','open','main',
      'surface','none','default_clear','near','uniform','active',1,'seed','seed');`);
  for (const position of ['arrival', 'focus', 'departure']) {
    await db.query(`INSERT INTO party_runtime.scene_position_nodes
      (id,party_id,g6_instance_id,position_type_id,template_slot_key,
        template_instance_ordinal,capacity,access_class_id,status,state_version,
        created_change_set_id,updated_change_set_id)
      VALUES ($1,'party','g6','passage',$1,0,2,'default','active',1,'seed','seed')`,
    [position]);
  }
  for (const [from, to] of [['arrival', 'focus'], ['focus', 'arrival'],
    ['focus', 'departure'], ['departure', 'focus']]) {
    await db.query(`INSERT INTO party_runtime.scene_movement_edges
      (id,party_id,scene_baseline_id,source_scene_template_ref,source_edge_slot_key,
        from_position_id,to_position_id,passage_type_id,
        transition_environment_profile_ref,movement_orientation_profile_ref,
        cost_kind,action_units,capacity,reverse_edge_id,status,state_version,
        created_change_set_id,updated_change_set_id)
      VALUES ($1,'party','baseline','{}',$1,$2,$3,'internal_passage','{}','{}',
        'action',1,1,$4,'active',1,'seed','seed')`,
    [`${from}:${to}`, from, to, `${to}:${from}`]);
  }
  await db.query(`INSERT INTO party_runtime.party_journey_locations
    (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,
      state_version,updated_change_set_id)
    VALUES ('journey','party','actor','actor','scene','arrival',1,'seed')`);
}
