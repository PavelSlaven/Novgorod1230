import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('035 preserves topology and permits nonportal conditions while requiring portal conditions', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `nonportal-availability-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  const started = docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name,
    '-e', 'POSTGRES_PASSWORD=availability', '-e', 'POSTGRES_USER=availability',
    '-e', 'POSTGRES_DB=availability', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    ready = docker(['exec', name, 'psql', '-U', 'availability', '-d', 'availability',
      '-c', 'SELECT 1']).status === 0;
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(ready, true);
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'availability',
    password: 'availability', database: 'availability' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS.slice(0, 34)) await pool.query(sql);
  await pool.query(`
    INSERT INTO party_runtime.parties
      (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
      VALUES ('p',3,'world','catalog','materializer','rng','commands','profiles');
    INSERT INTO party_runtime.party_g5_sites
      (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ('site','p','canonical','g4','{"entity_id":"canonical"}','active',0,'seed','seed');
    INSERT INTO party_runtime.party_scene_baselines
      (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ('base','p','g5_site','site','canonical_template','{}','trace','m','d','active',0,'seed','seed');
    INSERT INTO party_runtime.party_g6_instances
      (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ('g6','p','base','{}','main','g5_site','site','open','outside','ground','sky','default_clear','near','uniform','active',0,'seed','seed');
    INSERT INTO party_runtime.scene_position_nodes
      (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ('position','p','g6','standing','entry',0,8,'open','active',0,'seed','seed');
    INSERT INTO party_runtime.portal_entities
      (id,party_id,scene_baseline_id,portal_template_ref,state,state_version,created_change_set_id,updated_change_set_id)
      VALUES ('portal','p','base','{}','open',0,'seed','seed');
  `);
  const condition = { entity_id: 'seasonal-access', authoring_version: '1' };
  const insert = (table, id, portal, availability) => {
    const scene = table === 'scene_movement_edges';
    return pool.query(`INSERT INTO party_runtime.${table}
      (id,party_id,${scene
        ? 'scene_baseline_id,source_scene_template_ref,source_edge_slot_key,from_position_id,to_position_id'
        : 'from_site_id,to_site_id'},passage_type_id,transition_environment_profile_ref,
        movement_orientation_profile_ref,cost_kind,action_units,portal_entity_id,
        availability_condition_set_ref,status,state_version,created_change_set_id,updated_change_set_id)
      VALUES ($1,'p',${scene ? "'base','{}',$1,'position','position'" : "'site','site'"},
        'path','{}','{}','action',1,$2,$3,'active',0,'seed','seed')`, [id, portal, availability]);
  };
  const tables = ['scene_movement_edges', 'g5_site_connections'];
  for (const table of tables) {
    await insert(table, `${table}:existing`, null, null);
    await assert.rejects(insert(table, `${table}:conditional`, null, condition),
      { code: '23514' }, 'original 002 constraint reproduces the rejection');
  }
  await pool.query(SPATIAL_V3_TARGET_MIGRATIONS[34]);
  for (const table of tables) {
    const before = await pool.query(`SELECT * FROM party_runtime.${table} WHERE id=$1`,
      [`${table}:existing`]);
    await insert(table, `${table}:conditional`, null, condition);
    await insert(table, `${table}:portal`, 'portal', condition);
    await assert.rejects(insert(table, `${table}:missing-condition`, 'portal', null),
      { code: '23514', constraint: `${table}_portal_requires_availability_check` });
    await pool.query(SPATIAL_V3_TARGET_MIGRATIONS[34]);
    const after = await pool.query(`SELECT * FROM party_runtime.${table} WHERE id=$1`,
      [`${table}:existing`]);
    assert.deepEqual(after.rows, before.rows, 'repeat migration preserves historical row');
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM party_runtime.${table}`))
      .rows[0].count, 3, 'conditional and portal rows survive reapply');
    await assert.rejects(insert(table, `${table}:still-missing`, 'portal', null),
      { code: '23514', constraint: `${table}_portal_requires_availability_check` });
  }
});
