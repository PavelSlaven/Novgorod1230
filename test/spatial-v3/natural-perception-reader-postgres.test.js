import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { createPostgresTestBackend } from '../fixtures/postgres-test-backend.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { readCurrentNaturalPerceptionFacts } from '../../apps/game-server/src/infrastructure/postgres/g4-natural-perception-reader.js';
import { approvedNaturalPerceptionFixture } from '../../apps/game-server/test/g4-natural-perception-fixture.js';
import { prepareG4NaturalScenePerceptionInput, projectG4NaturalPerception } from '../../apps/game-server/src/runtime/g4-natural-perception.js';

test('natural reader uses committed actor/scene/portal state with real approved descriptors', async (t) => {
  const backend = await createPostgresTestBackend('natural_perception');
  if (!backend) return t.skip('PostgreSQL required');
  const pool = new pg.Pool({ connectionString: backend.partyUrl });
  t.after(async () => { await pool.end(); await backend.close(); });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS.slice(0, 4)) await pool.query(sql);
  const { input, sceneClosure, currentSourceState } = await approvedNaturalPerceptionFixture();
  const facts = input.currentFacts; const scene = facts.scene;
  const template = { entity_id: scene.scene_template_ref.id, authoring_version: String(scene.scene_template_ref.version) };
  await pool.query(`INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party:1',2,$1,'world-digest','1','1','commands','profiles')`, [scene.g4_ref.world_revision_id]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites(id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('site','party:1','canonical',$1,'{"entity_id":"site","authoring_version":"1"}','active',1,'change','change')`, [scene.g4_ref.id]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines(id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('baseline','party:1','g5_site','site','canonical_template',$1,'trace','1','digest','active',1,'change','change')`, [template]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances(id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('g6:inside','party:1','baseline',$1,'main','g5_site','site','spatial.g6.open','outside','level','none','default_clear','local','uniform','active',1,'change','change')`, [template]);
  for (const position of scene.positions) await pool.query(`INSERT INTO party_runtime.scene_position_nodes(id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party:1','g6:inside','ground',$2,0,3,'open','active',1,'change','change')`, [position.id, position.template_slot_key]);
  await pool.query(`INSERT INTO party_runtime.g6_acoustic_profiles(party_id,g6_instance_id,acoustic_uniformity,ambient_noise,state_version,updated_change_set_id)
    VALUES ('party:1','g6:inside','uniform',0,1,'change')`);
  await pool.query(`INSERT INTO party_runtime.party_journey_locations(id,party_id,owner_kind,owner_id,location_kind,scene_position_id,state_version,updated_change_set_id)
    VALUES ('location','party:1','actor','player:1','scene','position:inside',1,'change')`);
  const conditions = currentSourceState;
  const args = { transaction: pool, partyId: 'party:1', actorId: 'player:1',
    verifiedCatalog: input.verifiedCatalog, pin: input.pin,
    worldBaseReader: { async readPinnedSceneTemplateClosure(ref) {
      assert.deepEqual(ref, { ...scene.scene_template_ref, world_revision_id: scene.g4_ref.world_revision_id });
      return { ok: true, value: sceneClosure };
    } }, readCurrentSourceState: async ({ snapshot }) => {
      assert.equal(snapshot.location.scene_position_id, 'position:inside'); return conditions;
    } };
  const read = async () => prepareG4NaturalScenePerceptionInput({ ...input,
    currentFacts: await readCurrentNaturalPerceptionFacts(args) });
  await assert.rejects(read(), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  await pool.query(`INSERT INTO party_runtime.g5_site_connections(id,party_id,from_site_id,to_site_id,passage_type_id,transition_environment_profile_ref,movement_orientation_profile_ref,cost_kind,action_units,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('connection','party:1','site','site','path','{}','{}','action',1,'active',1,'change','change')`);
  await pool.query(`INSERT INTO party_runtime.party_site_connection_endpoint_bindings(id,party_id,site_connection_id,endpoint_role,g5_site_id,position_id,source_slot_key,status,state_version,activated_change_set_id)
    VALUES ('binding','party:1','connection','to','site','position:inside','arrival','active',1,'change')`);
  await assert.rejects(read(), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  await pool.query(`UPDATE party_runtime.party_site_connection_endpoint_bindings SET position_id='position:shore' WHERE id='binding'`);
  assert.ok(projectG4NaturalPerception({ input: await read(), partyId: 'party:1', actorId: 'player:1', positionId: 'position:inside' }).perceived_facts.length > 0);
  await pool.query(`INSERT INTO party_runtime.portal_entities(id,party_id,scene_baseline_id,portal_template_ref,state,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('door','party:1','baseline','{"entity_id":"door","authoring_version":"1"}','closed',1,'change','change')`);
  await assert.rejects(read(), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  conditions.portal_profiles = { door: { portal_template_ref: 'door@1', condition_profile_ref: 'door-condition@1',
    visibility_by_state: { open: 'clear', closed: 'none', locked: 'none', destroyed: 'clear' },
    acoustic_loss_by_state: { open: 0, closed: 'blocked', locked: 'blocked', destroyed: 0 } } };
  const loaded = await read();
  assert.equal(loaded.scene.portals.door.state, 'closed');
  await pool.query(`UPDATE party_runtime.portal_entities SET state='open',state_version=2 WHERE id='door'`);
  assert.equal((await read()).scene.portals.door.state, 'open');
  await assert.rejects(readCurrentNaturalPerceptionFacts({ ...args, actorId: 'another-player' }), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
});
