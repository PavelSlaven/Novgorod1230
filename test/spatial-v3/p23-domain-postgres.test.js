import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3DomainMutationService } from '@rus/party-store/spatial-v3-domain-integration';
import { createSpatialV3P23DomainRepository } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-p23-domain-repository.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const name = `p23-domain-${process.pid}`; const port = 55400 + (process.pid % 200);
const profile = (id) => ({ entity_ref: { entity_kind: 'access_profile', entity_id: id }, authoring_version: 'r1' });
function request(overrides = {}) {
  const body = { party_id: 'p', idempotency_key: 'key', expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 0 }], domain_mutation: { entity_kind: 'transport', entity_id: 'boat', placement_kind: 'scene_position', position_node_id: 'pos', capacity_units: 1, required_access_profile_ref: profile('pilot') }, ...overrides };
  return { ...body, canonical_digest: computeSpatialV3CanonicalDigest(body) };
}
function carrierLocalRequest(overrides = {}) {
  return request({
    idempotency_key: 'carrier-local-key',
    expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 0 }],
    carrier_local: {
      slice_id: 'slice', root_execution_id: 'root-exec', root_travel_state_id: 'root-travel',
      root_execution_state_version: 2, root_travel_state_version: 1,
      change_set_id: 'slice-cs', slice_digest: 'slice-plan-digest'
    },
    ...overrides
  });
}

async function migrate(pool) {
  for (const file of ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql']) await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
}
async function seed(pool) {
  await pool.query(`
    INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest) VALUES('p',3,'w','d','m','r','c','b');
    INSERT INTO party_runtime.party_g5_sites(id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id) VALUES('site','p','canonical','g4','{}','active',0,'c','c');
    INSERT INTO party_runtime.party_scene_baselines(id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id) VALUES('base','p','transport','boat','transport_template','{}','t','m','d','active',0,'c','c');
    INSERT INTO party_runtime.party_g6_instances(id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id) VALUES('g6','p','base','{"entity_id":"boat-cabin","authoring_version":"r1"}','slot','transport','boat','open','role','surface','none','default_clear','near','uniform','active',0,'c','c');
    INSERT INTO party_runtime.scene_position_nodes(id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id) VALUES('pos','p','g6','standing','p',0,6,'public','active',0,'c','c'),('pos2','p','g6','standing','p2',0,6,'public','active',0,'c','c');
    INSERT INTO party_runtime.entity_placements(party_id,entity_kind,entity_id,placement_kind,position_node_id,occupies_capacity_units,state_version,updated_change_set_id) VALUES
      ('p','npc','guard','scene_position','pos',1,0,'c'),('p','transport','boat','scene_position','pos',1,0,'c'),('p','actor','a','scene_position','pos',1,0,'c'),('p','item','x','scene_position','pos',1,0,'c');
    INSERT INTO party_runtime.party_entity_controls(party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,access_profile_ref,capacity_units,state_version,updated_change_set_id) VALUES
      ('p','npc','guard','{"entity_kind":"actor","entity_id":"a"}','{"entity_kind":"actor","entity_id":"a"}','{"entity_kind":"actor","entity_id":"a"}','{"entity_ref":{"entity_kind":"access_profile","entity_id":"open"},"authoring_version":"r1"}',2,0,'c'),
      ('p','transport','boat','{"entity_kind":"actor","entity_id":"a"}','{"entity_kind":"actor","entity_id":"a"}','{"entity_kind":"actor","entity_id":"a"}','{"entity_ref":{"entity_kind":"access_profile","entity_id":"pilot"},"authoring_version":"r1"}',2,0,'c');
    INSERT INTO party_runtime.party_npc_spatial_schedules(id,party_id,npc_id,current_position_node_id,schedule_profile_ref,dependency_pins,causal_state_ref,status,state_version,updated_change_set_id) VALUES('sched','p','guard','pos','{"entity_ref":{"entity_kind":"schedule_profile","entity_id":"watch"},"authoring_version":"r1"}','{"canonical_digest":"pin"}','{"entity_ref":{"entity_kind":"npc_causal_state","entity_id":"watch"}}','active',0,'c');
    INSERT INTO party_runtime.party_carrier_attachments(id,party_id,subject_kind,subject_id,carrier_kind,carrier_id,status,state_version,attached_change_set_id) VALUES('attach','p','actor','a','transport','boat','active',0,'c');
    INSERT INTO party_runtime.party_transport_attached_g6(id,party_id,transport_id,g6_instance_id,approved_template_ref,status,state_version,updated_change_set_id) VALUES('attached','p','boat','g6','{"entity_ref":{"entity_kind":"transport_template","entity_id":"boat-cabin"},"authoring_version":"r1"}','active',0,'c');
    INSERT INTO party_runtime.party_actor_carrier_positions(id,party_id,actor_id,root_carrier_kind,root_carrier_id,scene_baseline_id,g6_instance_id,position_node_id,status,state_version,created_change_set_id) VALUES('carrier-pos','p','a','transport','boat','base','g6','pos','active',0,'c');
    INSERT INTO party_runtime.party_v3_change_sets(id,party_id,operation_kind,expected_state_version_set_digest,expected_state_version_set,committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn) VALUES('slice-cs','p','root_traversal','slice-expected','[]','slice-committed','slice-plan-digest',0,0);
    INSERT INTO party_runtime.party_command_idempotency(id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,status,lease_token,lease_expires_at,created_at_turn) VALUES('slice-idem','p','root_traversal','slice-key','slice-input','slice-expected','leased','slice-lease',now()+interval '1 minute',0);
    INSERT INTO party_runtime.party_clocks(party_id,whole_minutes,subminute_numerator,subminute_denominator,clock_owner_kind,clock_owner_id,state_version,updated_change_set_id) VALUES('p',1,0,1,'transport','boat',1,'slice-cs');
    INSERT INTO party_runtime.party_route_plans(id,party_id,journey_owner_ref,journey_scope,request_kind,planning_request_id,path_query_digest,option_id,knowledge_scope,source_endpoint_snapshot,target_request,resolved_factual_target_ref,target_resolution_dependency_pins,world_revision_id,catalog_digest,planning_algorithm_version,planning_state_version,planning_context_dependency_pins,canonical_serialization_digest,created_change_set_id,lifecycle_change_set_id,created_at_turn) VALUES('root-plan','p','{"entity_kind":"transport","entity_id":"boat"}','world_travel','ordinary','root-request','root-query','root-option','factual','{"endpoint_kind":"scene_position","endpoint_id":"pos"}','{"endpoint_kind":"scene_position","endpoint_id":"pos"}','{"endpoint_kind":"scene_position","endpoint_id":"pos"}','{}','w','d','root-algo',1,'{}','root-digest','slice-cs','slice-cs',0);
    INSERT INTO party_runtime.party_route_plan_steps(route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,arrival_endpoint_snapshot,static_contract_snapshot) VALUES('root-plan',0,'timed_traversal','{"endpoint_kind":"scene_position","endpoint_id":"pos"}','{"endpoint_kind":"scene_position","endpoint_id":"pos"}','{"snapshot_kind":"timed_traversal"}');
    INSERT INTO party_runtime.party_route_plan_executions(id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,current_step_ordinal,current_endpoint_ref,updated_change_set_id) VALUES('root-exec','p','root-plan','{"entity_kind":"transport","entity_id":"boat"}','world_travel','planned',0,'{"endpoint_kind":"scene_position","endpoint_id":"pos"}','slice-cs');
    INSERT INTO party_runtime.party_route_plan_execution_events(execution_id,event_ordinal,event_kind,to_status,step_ordinal,location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn) VALUES('root-exec',0,'planned','planned',0,'{}','slice-cs','slice-idem',0);
    INSERT INTO party_runtime.traveller_travel_states(id,party_id,route_plan_execution_id,plan_step_ordinal,movement_carrier_ref,segment_progress_ppm,cumulative_actual_time_numerator,cumulative_actual_time_denominator,navigation_state,last_confirmed_endpoint_ref,status,updated_change_set_id) VALUES('root-travel','p','root-exec',0,'{"entity_kind":"transport","entity_id":"boat"}',0,0,1,'on_course','{}','active','slice-cs');
    INSERT INTO party_runtime.party_route_plan_execution_events(execution_id,event_ordinal,event_kind,from_status,to_status,step_ordinal,location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn) VALUES('root-exec',1,'activated','planned','active',0,'{}','slice-cs','slice-idem',0);
    UPDATE party_runtime.party_route_plan_executions SET status='active',current_endpoint_ref=NULL,active_travel_state_id='root-travel',started_at_turn=0,state_version=2 WHERE id='root-exec';
    INSERT INTO party_runtime.party_synchronized_time_slices(id,party_id,root_execution_id,root_travel_state_id,clock_owner_kind,clock_owner_id,elapsed_numerator,elapsed_denominator,clock_before_whole_minutes,clock_before_subminute_numerator,clock_before_subminute_denominator,clock_after_whole_minutes,clock_after_subminute_numerator,clock_after_subminute_denominator,crossed_whole_minute_boundaries,change_set_id,idempotency_record_id) VALUES('slice','p','root-exec','root-travel','transport','boat',1,2,0,1,2,1,0,1,1,'slice-cs','slice-idem');
    INSERT INTO party_runtime.party_synchronized_time_slice_results(id,slice_id,participant_execution_id,result_kind,elapsed_numerator,elapsed_denominator,result_ref) VALUES('slice-root','slice','root-exec','root_traversal',1,2,'{}');
  `);
}

test('P23 Node→PostgreSQL service port validates persisted P13/P15/005 domain rows and commits exactly once', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required');
  t.after(() => docker(['rm', '-f', name]));
  assert.equal(docker(['run', '-d', '--name', name, '-p', `${port}:5432`, '-e', 'POSTGRES_PASSWORD=p23', '-e', 'POSTGRES_USER=p23', '-e', 'POSTGRES_DB=p23', 'postgres:16-alpine']).status, 0);
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'p23', password: 'p23', database: 'p23' }); t.after(() => pool.end());
  for (let i = 0; i < 45; i += 1) { try { await pool.query('SELECT 1'); break; } catch { await new Promise((done) => setTimeout(done, 250)); if (i === 44) throw new Error('PostgreSQL unavailable'); } }
  await migrate(pool); await seed(pool);
  const service = createSpatialV3DomainMutationService({ repository: createSpatialV3P23DomainRepository({ pool }), committer: createSpatialV3PostgresCombinedAtomicCommitter({ pool }), verifyApproval: async () => ({ ok: true }) });
  const first = request(); assert.equal((await service.commit(first)).ok, true);
  assert.equal((await service.commit(structuredClone(first))).replay, true);
  assert.equal((await service.commit(request({ domain_mutation: { ...first.domain_mutation, capacity_units: 2 } }))).error.code, 'idempotency_conflict');
  assert.equal((await service.commit(request({ idempotency_key: 'stale', expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 0 }] }))).error.code, 'state_version_conflict');
  const row = await pool.query("SELECT occupies_capacity_units,state_version FROM party_runtime.entity_placements WHERE party_id='p' AND entity_kind='transport' AND entity_id='boat'"); assert.deepEqual(row.rows[0], { occupies_capacity_units: 1, state_version: '1' });

  // Every rejection goes through the service and rolls back its transient idempotency lease.
  await pool.query("UPDATE party_runtime.party_npc_spatial_schedules SET current_position_node_id='pos' WHERE id='sched'");
  for (const [key, sql, reset, code] of [
    ['bad-endpoint', "UPDATE party_runtime.party_npc_spatial_schedules SET current_position_node_id='pos2' WHERE id='sched'", "UPDATE party_runtime.party_npc_spatial_schedules SET current_position_node_id='pos' WHERE id='sched'", 'route_plan_version_pin_missing'],
    ['bad-profile', "UPDATE party_runtime.party_npc_spatial_schedules SET schedule_profile_ref='{}' WHERE id='sched'", "UPDATE party_runtime.party_npc_spatial_schedules SET schedule_profile_ref='{\"entity_ref\":{\"entity_kind\":\"schedule_profile\",\"entity_id\":\"watch\"},\"authoring_version\":\"r1\"}' WHERE id='sched'", 'route_plan_version_pin_missing'],
    ['bad-pin', "UPDATE party_runtime.party_npc_spatial_schedules SET dependency_pins='{}' WHERE id='sched'", "UPDATE party_runtime.party_npc_spatial_schedules SET dependency_pins='{\"canonical_digest\":\"pin\"}' WHERE id='sched'", 'route_plan_version_pin_missing'],
    ['bad-access', "UPDATE party_runtime.party_entity_controls SET access_profile_ref='{\"entity_ref\":{\"entity_kind\":\"access_profile\",\"entity_id\":\"closed\"},\"authoring_version\":\"r1\"}' WHERE entity_kind='transport'", "UPDATE party_runtime.party_entity_controls SET access_profile_ref='{\"entity_ref\":{\"entity_kind\":\"access_profile\",\"entity_id\":\"pilot\"},\"authoring_version\":\"r1\"}' WHERE entity_kind='transport'", 'route_plan_version_pin_missing'],
    ['bad-template', "UPDATE party_runtime.party_transport_attached_g6 SET approved_template_ref='{\"entity_ref\":{\"entity_kind\":\"transport_template\",\"entity_id\":\"other\"},\"authoring_version\":\"r1\"}' WHERE id='attached'", "UPDATE party_runtime.party_transport_attached_g6 SET approved_template_ref='{\"entity_ref\":{\"entity_kind\":\"transport_template\",\"entity_id\":\"boat-cabin\"},\"authoring_version\":\"r1\"}' WHERE id='attached'", 'journey_location_ownership_mismatch'],
    ['bad-capacity', "UPDATE party_runtime.scene_position_nodes SET capacity=1 WHERE id='pos'", "UPDATE party_runtime.scene_position_nodes SET capacity=6 WHERE id='pos'", 'relation_capacity_undefined']
  ]) {
    await pool.query(sql); const result = await service.commit(request({ idempotency_key: key, expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 1 }] })); await pool.query(reset);
    assert.equal(result.error.code, code, key);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_command_idempotency WHERE idempotency_key=$1", [key])).rows[0].n, 0, `${key} rollback`);
  }
  const concurrent = [service.commit(request({ idempotency_key: 'same', expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 1 }] })), service.commit(request({ idempotency_key: 'same', expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 1 }] }))];
  const pair = await Promise.all(concurrent); assert.equal(pair.filter((entry) => entry.ok).length, 2); assert.equal(pair.some((entry) => entry.replay), true);

  // Carrier-local time participates only through a physical root transport slice.
  const local = carrierLocalRequest({ expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 2 }] });
  const localResult = await service.commit(local);
  assert.equal(localResult.ok, true, `valid P14 root execution/travel/slice witness admits carrier-local mutation: ${JSON.stringify(localResult)}`);
  for (const [key, carrier_local] of [
    ['missing-slice', { ...local.carrier_local, slice_id: 'missing' }],
    ['forged-root', { ...local.carrier_local, root_execution_id: 'forged-root' }],
    ['forged-travel', { ...local.carrier_local, root_travel_state_id: 'forged-travel' }],
    ['forged-exec-version', { ...local.carrier_local, root_execution_state_version: 3 }],
    ['forged-travel-version', { ...local.carrier_local, root_travel_state_version: 2 }],
    ['forged-change-set', { ...local.carrier_local, change_set_id: 'forged-change-set' }],
    ['forged-digest', { ...local.carrier_local, slice_digest: 'forged-digest' }]
  ]) {
    const result = await service.commit(carrierLocalRequest({ idempotency_key: key, expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 3 }], carrier_local }));
    assert.equal(result.error.code, 'journey_location_ownership_mismatch', key);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_command_idempotency WHERE idempotency_key=$1", [key])).rows[0].n, 0, `${key} rolls back its lease`);
  }
  const sameCarrierLocal = carrierLocalRequest({ idempotency_key: 'carrier-local-same', expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 3 }] });
  const carrierPair = await Promise.all([service.commit(sameCarrierLocal), service.commit(structuredClone(sameCarrierLocal))]);
  assert.equal(carrierPair.filter((entry) => entry.ok).length, 2, 'same carrier-local command serializes at the physical root lock');
  assert.equal(carrierPair.some((entry) => entry.replay), true, 'the losing concurrent carrier-local request replays its exact committed result');
  await pool.query("UPDATE party_runtime.traveller_travel_states SET movement_carrier_ref='{\"entity_kind\":\"transport\",\"entity_id\":\"other\"}' WHERE id='root-travel'");
  const badRoot = await service.commit(carrierLocalRequest({ idempotency_key: 'wrong-root-carrier', expected_state_versions: [{ resource: 'entity_placements', id: 'transport:boat', state_version: 4 }] }));
  assert.equal(badRoot.error.code, 'journey_location_ownership_mismatch');
  await pool.query("UPDATE party_runtime.traveller_travel_states SET movement_carrier_ref='{\"entity_kind\":\"transport\",\"entity_id\":\"boat\"}' WHERE id='root-travel'");

  // Two distinct clients present the same carrier-local root context but list
  // actor/transport resources in opposite input order. §13.1 requires the
  // repository to normalize that order before it reaches physical row locks:
  // one CAS may win, the other must fail cleanly (never deadlock), and the
  // winner remains replayable after its state version advanced.
  const inverseBase = [
    { resource: 'entity_placements', id: 'transport:boat', state_version: 4 },
    { resource: 'entity_placements', id: 'actor:a', state_version: 0 }
  ];
  const inverseBoat = carrierLocalRequest({
    idempotency_key: 'inverse-boat', expected_state_versions: inverseBase,
    domain_mutation: { entity_kind: 'transport', entity_id: 'boat', placement_kind: 'scene_position', position_node_id: 'pos', capacity_units: 1, required_access_profile_ref: profile('pilot') }
  });
  const inverseActor = carrierLocalRequest({
    idempotency_key: 'inverse-actor', expected_state_versions: [...inverseBase].reverse(),
    domain_mutation: { entity_kind: 'actor', entity_id: 'a', placement_kind: 'scene_position', position_node_id: 'pos', capacity_units: 1 }
  });
  let inverseTimeout;
  const inversePair = await Promise.race([
    Promise.all([service.commit(inverseBoat), service.commit(inverseActor)]),
    new Promise((_, reject) => { inverseTimeout = setTimeout(() => reject(new Error('inverse carrier-local lock order deadlocked')), 12_000); })
  ]).finally(() => clearTimeout(inverseTimeout));
  assert.equal(inversePair.filter((result) => result.ok).length, 1, 'exactly one inverse CAS wins');
  assert.equal(inversePair.filter((result) => result.error?.code === 'state_version_conflict').length, 1, 'the losing inverse request observes CAS, not a deadlock');
  const winner = inversePair[0].ok ? inverseBoat : inverseActor;
  assert.equal((await service.commit(structuredClone(winner))).replay, true, 'committed inverse request replays after its own version advanced');
  const versions = await pool.query("SELECT entity_kind,entity_id,state_version FROM party_runtime.entity_placements WHERE party_id='p' AND (entity_kind,entity_id) IN (('transport','boat'),('actor','a')) ORDER BY entity_kind,entity_id");
  const fresh = new Map(versions.rows.map((row) => [`${row.entity_kind}:${row.entity_id}`, Number(row.state_version)]));
  const loserIsBoat = !inversePair[0].ok;
  const retryMutation = loserIsBoat ? inverseBoat.domain_mutation : inverseActor.domain_mutation;
  const retry = carrierLocalRequest({
    idempotency_key: 'inverse-retry',
    expected_state_versions: (loserIsBoat ? inverseBase : [...inverseBase].reverse()).map((entry) => ({ ...entry, state_version: fresh.get(entry.id) })),
    domain_mutation: retryMutation
  });
  assert.equal((await service.commit(retry)).ok, true, 'fresh inverse retry succeeds with exact post-CAS versions');
});
