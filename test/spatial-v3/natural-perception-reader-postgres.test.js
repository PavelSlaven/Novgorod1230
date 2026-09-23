import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { sha256 } from '@rus/kernel';
import { createPostgresTestBackend } from '../fixtures/postgres-test-backend.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { readCurrentNaturalPerceptionFacts } from '../../apps/game-server/src/infrastructure/postgres/g4-natural-perception-reader.js';
import { approvedNaturalPerceptionFixture } from '../../apps/game-server/test/g4-natural-perception-fixture.js';
import { prepareG4NaturalScenePerceptionInput, projectG4NaturalPerception } from '../../apps/game-server/src/runtime/g4-natural-perception.js';
import { readInitialCanonicalNaturalSourceState } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-initial-state.js';

test('natural reader uses committed actor/scene/portal state with real approved descriptors', async (t) => {
  const backend = await createPostgresTestBackend('natural_perception');
  if (!backend) return t.skip('PostgreSQL required');
  const pool = new pg.Pool({ connectionString: backend.partyUrl });
  t.after(async () => { await pool.end(); await backend.close(); });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS.slice(0, 11)) await pool.query(sql);
  const { input, sceneClosure, currentSourceState } = await approvedNaturalPerceptionFixture();
  const facts = input.currentFacts; const scene = facts.scene;
  const template = { entity_id: scene.scene_template_ref.id, authoring_version: String(scene.scene_template_ref.version) };
  await pool.query(`INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party:1',2,$1,$2,'1','1','commands','profiles')`, [scene.g4_ref.world_revision_id, input.pin.compatible_world_catalog_digest]);
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
  await pool.query(`UPDATE party_runtime.parties SET world_catalog_digest='wrong' WHERE party_id='party:1'`);
  await assert.rejects(read(), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  await pool.query(`UPDATE party_runtime.parties SET world_catalog_digest=$1 WHERE party_id='party:1'`, [input.pin.compatible_world_catalog_digest]);
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
  const canonical = await approvedNaturalPerceptionFixture({ canonical: true });
  await pool.query(`DELETE FROM party_runtime.party_site_connection_endpoint_bindings WHERE party_id='party:1'`);
  await pool.query(`DELETE FROM party_runtime.portal_entities WHERE party_id='party:1'`);
  await pool.query(`UPDATE party_runtime.parties SET world_catalog_digest=$1 WHERE party_id='party:1'`, [canonical.initialRule.world_pin.world_catalog_digest]);
  await pool.query(`UPDATE party_runtime.party_g5_sites SET parent_g4_id=$1,canonical_g5_ref=$2 WHERE id='site'`,
    [canonical.initialRule.rule.g4_ref.id, { entity_id: canonical.initialRule.rule.canonical_g5_ref.id,
      authoring_version: String(canonical.initialRule.rule.canonical_g5_ref.version) }]);
  await pool.query(`UPDATE party_runtime.party_journey_locations SET scene_position_id='position:shore' WHERE id='location'`);
  const canonicalArgs = { ...args, verifiedCatalog: canonical.input.verifiedCatalog, pin: canonical.input.pin,
    worldBaseReader: { async readPinnedSceneTemplateClosure() { return { ok: true, value: canonical.sceneClosure }; },
      async readPinnedCanonicalG5SceneBinding(ref) {
        assert.equal(ref.id, canonical.initialRule.rule.canonical_g5_ref.id);
        return { ok: true, value: { ...ref, parent_id: canonical.initialRule.rule.g4_ref.id,
          parent_version: canonical.initialRule.rule.g4_ref.version,
          scene_template_id: canonical.initialRule.rule.scene_template_ref.id,
          scene_template_version: canonical.initialRule.rule.scene_template_ref.version } };
      } }, readCurrentSourceState: async () => canonical.currentSourceState };
  const initial = await readCurrentNaturalPerceptionFacts(canonicalArgs);
  assert.deepEqual(initial.source_bindings, []);
  assert.equal(initial.canonical_source_binding.position_id, 'position:shore');
  assert.equal(prepareG4NaturalScenePerceptionInput({ ...canonical.input, currentFacts: initial }).observer.position_id, 'position:shore');
  canonical.currentSourceState.canonical_initial_state.initial_snapshot_identity.state_version = 1;
  await assert.rejects(readCurrentNaturalPerceptionFacts(canonicalArgs), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  await insertInitialGuardState(pool, canonical);
  canonicalArgs.readCurrentSourceState = (request) => readInitialCanonicalNaturalSourceState({ ...request,
    rule_ref: { id: canonical.initialRule.rule.id, version: canonical.initialRule.rule.version } });
  const guarded = await readCurrentNaturalPerceptionFacts(canonicalArgs);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM party_runtime.party_server_sessions WHERE party_id='party:1'`)).rows[0].n, 0);
  assert.equal(guarded.canonical_source_binding.initial_snapshot_identity.state_version, 0);
  const projected = projectG4NaturalPerception({
    input: prepareG4NaturalScenePerceptionInput({ ...canonical.input, currentFacts: guarded }),
    partyId: 'party:1', actorId: 'player:1', positionId: 'position:shore' });
  assert.ok(projected.perceived_facts.length > 0);
  assert.ok(projected.perceived_facts.every((row) => row.channel === 'visual'));
  await pool.query(`UPDATE party_runtime.party_actor_body_states SET energy=79 WHERE party_id='party:1'`);
  await assert.rejects(readCurrentNaturalPerceptionFacts(canonicalArgs), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  await pool.query(`UPDATE party_runtime.party_actor_body_states SET energy=80 WHERE party_id='party:1'`);
  const clockProbe = await pool.connect();
  try {
    await clockProbe.query('BEGIN');
    await clockProbe.query(`UPDATE party_runtime.party_clocks SET whole_minutes=whole_minutes+1,state_version=2 WHERE party_id='party:1'`);
    await assert.rejects(readCurrentNaturalPerceptionFacts({ ...canonicalArgs, transaction: clockProbe }),
      { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  } finally {
    await clockProbe.query('ROLLBACK');
    clockProbe.release();
  }
  await pool.query(`INSERT INTO party_runtime.party_server_sessions(party_id,request_id,stage26_result,screen,turn_number,state_version)
    VALUES ('party:1','request',$1,'{}',0,1)`, [{ scenario_id: canonical.initialRule.scenario_id }]);
  assert.equal((await readCurrentNaturalPerceptionFacts(canonicalArgs)).canonical_source_binding.verified, true);
  await pool.query(`UPDATE party_runtime.party_server_sessions SET turn_number=1 WHERE party_id='party:1'`);
  await assert.rejects(readCurrentNaturalPerceptionFacts(canonicalArgs), { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
});

async function insertInitialGuardState(pool, canonical) {
  const { initialRule, input } = canonical;
  const time = initialRule.initial_environment_inputs;
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets(id,party_id,operation_kind,expected_state_version_set_digest,expected_state_version_set,committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('change','party:1','new_game','expected','[]','committed','plan',0,0)`);
  await pool.query(`INSERT INTO party_runtime.party_actor_body_states(party_id,actor_kind,actor_id,body_profile_ref,health,energy,satiety,state_version,updated_change_set_id)
    VALUES ('party:1','player_character','player:1','{"id":"body-ready"}',100,80,70,1,'change')`);
  await pool.query(`INSERT INTO party_runtime.party_clocks(party_id,whole_minutes,subminute_numerator,subminute_denominator,clock_owner_kind,state_version,updated_change_set_id)
    VALUES ('party:1',$1,$2,$3,'party',1,'change')`, [time.game_timestamp.whole_minutes,
    time.game_timestamp.subminute_numerator, time.game_timestamp.subminute_denominator]);
  const body = await pool.query(`SELECT * FROM party_runtime.party_actor_body_states WHERE party_id='party:1'`);
  const clock = await pool.query(`SELECT * FROM party_runtime.party_clocks WHERE party_id='party:1'`);
  const expected = { player: { character_id: 'player:1' }, body: body.rows[0], clock: clock.rows[0], conditions: [] };
  const payload = { schema: 'rus.authored_start_initial_party_snapshot.v3',
    request_identity: { party_id: 'party:1', scenario_id: initialRule.scenario_id,
      idempotency_key: 'initial-idempotency', scenario_manifest_digest: sha256({ fixture_manifest: initialRule.scenario_id }),
      world_revision_id: initialRule.world_pin.world_revision_id, world_catalog_digest: initialRule.world_pin.world_catalog_digest },
    policy_profile_pins: [{ key: initialRule.rule.id, revision: initialRule.rule.version,
      digest: initialRule.source_candidate_sha256 }],
    immediate: { player: { instance_id: 'player:1' }, environment_snapshot: { ...input.currentFacts.current_environment,
      calendar_date: time.calendar_date, local_minute_of_day: time.local_minute_of_day }, timestamp: time.game_timestamp },
    initial_spatial_v3_runtime: { g5: 'site', baseline: 'baseline', position: 'position:shore' },
    persisted_projection: expected, persisted_projection_digest: sha256(expected) };
  await pool.query(`INSERT INTO party_runtime.party_state_snapshots(party_id,state_version,state_payload,state_digest)
    VALUES ('party:1',0,$1,$2)`, [payload, sha256(payload)]);
}
