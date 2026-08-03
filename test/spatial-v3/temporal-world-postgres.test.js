import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import {
  SPATIAL_V3_TARGET_MIGRATIONS,
  runSpatialV3TargetMigrations
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { createTemporalPresentationPostgresStore } from '../../apps/game-server/src/infrastructure/postgres/temporal-presentation-store.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const containerName = `temporal-world-${process.pid}`;

async function expectRejected(pool, sql, params = [], message = 'transaction must be rejected') {
  const client = await pool.connect();
  let failure = null;
  try {
    await client.query('BEGIN');
    await client.query(sql, params);
    await client.query('COMMIT');
  } catch (error) {
    failure = error;
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  assert.ok(failure, message);
  return failure;
}

async function createScenePosition(pool, partyId) {
  const suffix = partyId.replaceAll(/[^a-z0-9]/gu, '');
  await pool.query(
    `INSERT INTO party_runtime.party_g5_sites
      (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
     VALUES ($1,$2,'canonical','g4',$3,'active',1,'setup','setup')`,
    [`site-${suffix}`, partyId, { entity_id: `g5-${suffix}` }]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_scene_baselines
      (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
     VALUES ($1,$2,'g5_site',$3,'canonical_template',$4,'trace','m','d','active',1,'setup','setup')`,
    [`base-${suffix}`, partyId, `site-${suffix}`, { entity_id: `scene-${suffix}` }]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_g6_instances
      (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
     VALUES ($1,$2,$3,$4,'slot','g5_site',$5,'open','role','surface','none','default_clear','near','uniform','active',1,'setup','setup')`,
    [`g6-${suffix}`, partyId, `base-${suffix}`, { entity_id: `scene-${suffix}` }, `site-${suffix}`]
  );
  await pool.query(
    `INSERT INTO party_runtime.scene_position_nodes
      (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
     VALUES ($1,$2,$3,'standing','position',0,2,'public','active',1,'setup','setup')`,
    [`position-${suffix}`, partyId, `g6-${suffix}`]
  );
  return `position-${suffix}`;
}

test('Temporal World target persistence is exact, party-isolated, replay-safe and presentation-durable', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker required for isolated Temporal World PostgreSQL test');
    return;
  }
  assert.equal(docker([
    'run', '-d', '-p', '127.0.0.1::5432', '--name', containerName,
    '-e', 'POSTGRES_PASSWORD=temporal',
    '-e', 'POSTGRES_USER=temporal',
    '-e', 'POSTGRES_DB=temporal',
    'postgres:16-alpine'
  ]).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker(['exec', containerName, 'psql', '-U', 'temporal', '-d', 'temporal', '-Atqc', 'SELECT 1']).status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (docker(['exec', containerName, 'psql', '-U', 'temporal', '-d', 'temporal', '-Atqc', 'SELECT 1']).status === 0) {
        ready = true;
        break;
      }
    }
  }
  assert.equal(ready, true, 'isolated PostgreSQL must become ready');
  const port = Number(docker(['port', containerName, '5432']).stdout.match(/:(\d+)/u)?.[1]);
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'temporal', password: 'temporal', database: 'temporal', max: 6 });
  t.after(async () => {
    await pool.end();
    docker(['rm', '-f', containerName]);
  });

  const rollbackClient = await pool.connect();
  let migrationFailure = null;
  try {
    await rollbackClient.query('BEGIN');
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS.slice(0, 9)) {
      await rollbackClient.query(sql);
    }
    await rollbackClient.query('SELECT * FROM party_runtime.__forced_migration_010_failure__');
    await rollbackClient.query('COMMIT');
  } catch (error) {
    migrationFailure = error;
    await rollbackClient.query('ROLLBACK');
  } finally {
    rollbackClient.release();
  }
  assert.ok(migrationFailure, 'forced failure after migration 009 must abort the target chain');
  assert.deepEqual(
    (await pool.query(`SELECT
      to_regclass('party_runtime.parties') AS migration_001_effect,
      to_regclass('party_runtime.party_perception_replay_evidence') AS migration_009_effect`)).rows[0],
    { migration_001_effect: null, migration_009_effect: null },
    'failure after migration 009 must roll back every 001→009 DDL effect'
  );

  assert.equal((await runSpatialV3TargetMigrations(pool)).applied, 16);
  assert.equal((await runSpatialV3TargetMigrations(pool)).applied, 16, '001→016 chain is re-applicable');

  const timestampTruth = await pool.query(`SELECT
    party_runtime.game_timestamp_parts_valid(12,1,3) AS valid,
    party_runtime.game_timestamp_parts_valid(NULL,0,1) AS missing,
    party_runtime.game_timestamp_parts_valid(-1,0,1) AS negative,
    party_runtime.game_timestamp_parts_valid(1,2,4) AS unreduced,
    party_runtime.game_timestamp_parts_valid(1,1,1) AS improper,
    party_runtime.game_timestamp_parts_valid('NaN'::numeric,0,1) AS special`);
  assert.deepEqual(timestampTruth.rows[0], {
    valid: true,
    missing: false,
    negative: false,
    unreduced: false,
    improper: false,
    special: false
  });

  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party-one',3,'w','d','m','r','c','b'),('party-two',3,'w','d','m','r','c','b')`);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ('party-one','authored-run','g4','expansion','s','i','c','m','r','o',
      'authored-run','committed')`);
  const runtimeMechanicsSnapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn-one',
      step_index: 1,
      operation_ref: 'operation-one',
      origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: {
      mass_grams: 40,
      external_hand_cost: 0,
      carry_form: 'compact',
      packing_slot_cost: 1,
      quantity: { value: 1, unit: 'piece' },
      container: null
    }
  };
  const changedSnapshotJson = (change) => {
    const snapshot = structuredClone(runtimeMechanicsSnapshot);
    change(snapshot);
    return JSON.stringify(snapshot);
  };
  const quantityLiteralSnapshotJson = (literal) =>
    JSON.stringify(runtimeMechanicsSnapshot).replace(
      '"quantity":{"value":1,"unit":"piece"}',
      `"quantity":{"value":${literal},"unit":"piece"}`
    );
  await pool.query(`INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,
     condition_state,legal_status,state)
    VALUES
      ('party-one','authored-item','authored-run','template','profile','category',
       'intact','ordinary','{}'),
      ('party-one','runtime-item',NULL,NULL,NULL,NULL,'intact','ordinary',
       jsonb_build_object('runtime_instance_mechanics_snapshot',$1::jsonb)),
      ('party-two','foreign-item',NULL,NULL,NULL,NULL,'intact','ordinary',
       jsonb_build_object('runtime_instance_mechanics_snapshot',$1::jsonb))`,
  [JSON.stringify(runtimeMechanicsSnapshot)]);
  await pool.query(`INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,
     condition_state,legal_status,state)
    VALUES
      ('party-one','runtime-null-quantity',NULL,NULL,NULL,NULL,
       'intact','ordinary',jsonb_build_object(
         'runtime_instance_mechanics_snapshot',$1::jsonb)),
      ('party-one','runtime-max-quantity',NULL,NULL,NULL,NULL,
       'intact','ordinary',jsonb_build_object(
         'runtime_instance_mechanics_snapshot',$2::jsonb))`, [
    changedSnapshotJson((snapshot) => {
      snapshot.mechanics.quantity = null;
    }),
    changedSnapshotJson((snapshot) => {
      snapshot.mechanics.quantity.value = Number.MAX_VALUE;
    })
  ]);
  await pool.query(`INSERT INTO party_runtime.party_item_placements
    (party_id,item_id,attached_item_id)
    VALUES ('party-one','runtime-item','authored-item')`);
  await expectRejected(pool, `INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,
     condition_state,legal_status,state)
    VALUES ('party-one','mixed-item',NULL,'template',NULL,NULL,'intact','ordinary',
      jsonb_build_object('runtime_instance_mechanics_snapshot',$1::jsonb))`,
  [JSON.stringify(runtimeMechanicsSnapshot)], 'mixed mechanics sources must fail');
  await expectRejected(pool, `INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,
     condition_state,legal_status,state)
    VALUES ('party-one','malformed-item',NULL,NULL,NULL,NULL,'intact','ordinary',
      jsonb_build_object('runtime_instance_mechanics_snapshot',$1::jsonb))`,
  [JSON.stringify({ ...runtimeMechanicsSnapshot, version: 2 })],
  'malformed runtime mechanics snapshot must fail');
  const invalidRuntimeSnapshots = [
    ['root-tab', changedSnapshotJson((snapshot) => {
      snapshot.provenance.root_turn_id = '\tturn-one';
    })],
    ['operation-lf', changedSnapshotJson((snapshot) => {
      snapshot.provenance.operation_ref = 'operation-one\n';
    })],
    ['source-cr', changedSnapshotJson((snapshot) => {
      snapshot.provenance.source_refs = ['\rshore'];
    })],
    ['unit-nbsp', changedSnapshotJson((snapshot) => {
      snapshot.mechanics.quantity.unit = '\u00a0piece';
    })],
    ['root-bom', changedSnapshotJson((snapshot) => {
      snapshot.provenance.root_turn_id = '\ufeffturn-one';
    })],
    ['source-unicode-space', changedSnapshotJson((snapshot) => {
      snapshot.provenance.source_refs = ['shore\u2003'];
    })],
    ['unsafe-mass', changedSnapshotJson((snapshot) => {
      snapshot.mechanics.mass_grams = Number.MAX_SAFE_INTEGER + 1;
    })],
    ['unsafe-packing', changedSnapshotJson((snapshot) => {
      snapshot.mechanics.packing_slot_cost = Number.MAX_SAFE_INTEGER + 1;
    })],
    ['quantity-overflow', quantityLiteralSnapshotJson('1e309')],
    ['quantity-underflow', quantityLiteralSnapshotJson('1e-400')]
  ];
  for (const [caseId, snapshotJson] of invalidRuntimeSnapshots) {
    const validation = await pool.query(
      `SELECT party_runtime.runtime_instance_mechanics_snapshot_valid(
        $1::jsonb
      ) AS valid`,
      [snapshotJson]
    );
    assert.equal(validation.rows[0].valid, false, caseId);
    await expectRejected(pool, `INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,
       condition_state,legal_status,state)
      VALUES ('party-one',$1,NULL,NULL,NULL,NULL,'intact','ordinary',
        jsonb_build_object('runtime_instance_mechanics_snapshot',$2::jsonb))`,
    [`invalid-${caseId}`, snapshotJson], `${caseId} snapshot must fail`);
  }
  await expectRejected(pool, `INSERT INTO party_runtime.party_item_placements
    (party_id,item_id,attached_item_id)
    VALUES ('party-one','authored-item','foreign-item')`, [],
  'attached item must belong to the same party');
  await expectRejected(pool, `INSERT INTO party_runtime.party_item_placements
    (party_id,item_id,attached_item_id)
    VALUES ('party-one','authored-item','authored-item')`, [],
  'self-attached item placement must fail');
  await expectRejected(pool, `INSERT INTO party_runtime.party_temporal_events
    (event_id,party_id,event_kind,status,scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator,rule_ref,policy_ref,preconditions_digest,idempotency_key,change_set_id)
    VALUES ('bad-time','party-one','timer','pending',1,2,4,'{}','{}','d','bad-time','cs')`, [], 'non-reduced event timestamp must fail');

  await pool.query(`INSERT INTO party_runtime.party_temporal_events
    (event_id,party_id,event_kind,status,scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator,rule_ref,policy_ref,preconditions_digest,idempotency_key,change_set_id)
    VALUES
      ('event-one','party-one','timer','pending',1,0,1,'{}','{}','d','event-one','cs'),
      ('event-two','party-two','timer','pending',1,0,1,'{}','{}','d','event-two','cs')`);
  await expectRejected(pool, `INSERT INTO party_runtime.party_temporal_event_dependencies(event_id,depends_on_event_id)
    VALUES ('event-one','event-two')`, [], 'event dependency must not cross party state');
  await expectRejected(pool, `INSERT INTO party_runtime.party_npc_runtime_transitions
    (transition_id,party_id,npc_id,transition_kind,event_id,change_set_id,idempotency_record_id,occurred_at_whole_minutes,occurred_at_subminute_numerator,occurred_at_subminute_denominator)
    VALUES ('transition-cross','party-one','npc','schedule','event-two','cs','transition-cross',1,0,1)`, [], 'NPC transition must not reference another party event');
  await expectRejected(pool, `INSERT INTO party_runtime.party_perception_records
    (perception_id,party_id,event_id,perceiver_kind,perceiver_id,result_kind,perceived_at_whole_minutes,perceived_at_subminute_numerator,perceived_at_subminute_denominator,recognition_policy_ref,visibility_policy_ref,canonical_digest,signal_refs,knowledge_update_refs,change_set_id,idempotency_record_id)
    VALUES ('perception-cross','party-one','event-two','npc','npc','recognized',1,0,1,'{}','{}','d','[]','[]','cs','perception-cross')`, [], 'perception must not reference another party event');

  await pool.query(`INSERT INTO party_runtime.party_remote_aggregate_states
    (aggregate_id,party_id,scope_ref,scope_mode,last_updated_at_whole_minutes,last_updated_at_subminute_numerator,last_updated_at_subminute_denominator,state_version,canonical_digest,aggregate_process_refs,pending_incoming_effect_refs,coarse_rule_versions)
    VALUES ('aggregate-two','party-two','{}','coarse',0,0,1,1,'d','[]','[]','{}')`);
  await expectRejected(pool, `INSERT INTO party_runtime.party_propagation_processes
    (process_id,party_id,aggregate_id,process_kind,source_ref,causal_basis_ref,scope_ref,status,started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator,next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator,visibility_policy_ref,termination_policy_ref,rule_pins,idempotency_key)
    VALUES ('process-cross','party-one','aggregate-two','signal','{}','{}','{}','active',0,0,1,1,0,1,'{}','{}','{}','process-cross')`, [], 'propagation process must not reference another party aggregate');

  await pool.query(`INSERT INTO party_runtime.party_visible_packages
    (package_id,party_id,turn_id,committed_state_version,change_set_id,package_digest,visible_payload,presentation_status,projection_policy_ref,dependency_pins,idempotency_record_id)
    VALUES ('package-two','party-two','turn',1,'cs-two','digest-two','{}','pending','{}','{}','visible-two')`);
  await expectRejected(pool, `INSERT INTO party_runtime.party_narration_jobs
    (job_id,party_id,package_id,status,idempotency_key)
    VALUES ('job-cross','party-one','package-two','pending','job-cross')`, [], 'narration job must not reference another party package');

  const positionOne = await createScenePosition(pool, 'party-one');
  const positionTwo = await createScenePosition(pool, 'party-two');
  await expectRejected(pool, `INSERT INTO party_runtime.party_npc_spatial_schedules
    (id,party_id,npc_id,current_position_node_id,schedule_profile_ref,dependency_pins,causal_state_ref,status,state_version,updated_change_set_id,next_transition_at_whole_minutes,next_transition_at_subminute_numerator,next_transition_at_subminute_denominator)
    VALUES ('schedule-cross-position','party-one','npc',$1,'{}','{}','{}','active',1,'cs',1,0,1)`, [positionTwo], 'NPC schedule position must belong to its party');

  await pool.query(`BEGIN;
    INSERT INTO party_runtime.party_route_plans
      (id,party_id,journey_owner_ref,journey_scope,request_kind,planning_request_id,path_query_digest,option_id,knowledge_scope,source_endpoint_snapshot,target_request,resolved_factual_target_ref,target_resolution_dependency_pins,world_revision_id,catalog_digest,planning_algorithm_version,planning_state_version,planning_context_dependency_pins,canonical_serialization_digest,created_change_set_id,lifecycle_change_set_id,created_at_turn)
    VALUES ('plan-two','party-two','{"entity_kind":"actor","entity_id":"actor"}','world_travel','ordinary','request','digest','option','factual','{"endpoint_kind":"scene_position","endpoint_id":"position"}','{"spatial_kind":"canonical_g5","spatial_id":"g5"}','{"spatial_kind":"canonical_g5","spatial_id":"g5"}','{}','w','d','algorithm',1,'{}','plan-digest','setup','setup',0);
    INSERT INTO party_runtime.party_route_plan_steps
      (route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,arrival_endpoint_snapshot,static_contract_snapshot)
    VALUES ('plan-two',0,'timed_activity','{"endpoint_kind":"scene_position","endpoint_id":"position"}','{"endpoint_kind":"scene_position","endpoint_id":"position"}','{"snapshot_kind":"timed_activity"}');
    INSERT INTO party_runtime.party_route_plan_executions
      (id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,current_step_ordinal,current_endpoint_ref,updated_change_set_id)
    VALUES ('execution-two','party-two','plan-two','{"entity_kind":"actor","entity_id":"actor"}','world_travel','planned',0,'{"endpoint_kind":"scene_position","endpoint_id":"position"}','setup');
    INSERT INTO party_runtime.party_route_plan_execution_events
      (execution_id,event_ordinal,event_kind,to_status,step_ordinal,location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn)
    VALUES ('execution-two',0,'planned','planned',0,'{}','setup','execution-setup',0);
    INSERT INTO party_runtime.party_timed_activity_executions
      (id,route_plan_execution_id,plan_step_ordinal,series_ordinal,activity_snapshot,original_total_minutes,cumulative_elapsed_numerator,cumulative_elapsed_denominator,remaining_time_numerator,remaining_time_denominator,next_attempt_ordinal,status,state_version,updated_change_set_id,started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator,last_processed_at_whole_minutes,last_processed_at_subminute_numerator,last_processed_at_subminute_denominator,next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator,progress,preconditions_digest)
    VALUES ('activity-two','execution-two',0,0,'{}',10,0,1,10,1,0,'active',1,'setup',0,0,1,0,0,1,1,0,1,'{}','preconditions');
    COMMIT`);
  await expectRejected(pool, `INSERT INTO party_runtime.party_npc_spatial_schedules
    (id,party_id,npc_id,current_position_node_id,schedule_profile_ref,dependency_pins,causal_state_ref,status,state_version,updated_change_set_id,next_transition_at_whole_minutes,next_transition_at_subminute_numerator,next_transition_at_subminute_denominator,current_activity_execution_id)
    VALUES ('schedule-cross-activity','party-one','npc',$1,'{}','{}','{}','active',1,'cs',1,0,1,'activity-two')`, [positionOne], 'NPC schedule activity must belong to its party');

  await pool.query(`BEGIN;
    INSERT INTO party_runtime.party_timed_activity_attempts
      (activity_execution_id,attempt_ordinal,remaining_before_numerator,remaining_before_denominator,planned_time_numerator,planned_time_denominator,actual_time_numerator,actual_time_denominator,remaining_after_numerator,remaining_after_denominator,cumulative_time_before_numerator,cumulative_time_before_denominator,cumulative_time_after_numerator,cumulative_time_after_denominator,crossed_whole_minute_boundaries,clock_commit_mode,execution_context_snapshot,result_kind,result_code,dynamic_dependency_pins,result_change_set_id,idempotency_record_id,occurred_at_turn,started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator,ended_at_whole_minutes,ended_at_subminute_numerator,ended_at_subminute_denominator,reason_code,progress_before,progress_after,resource_reservations,resource_consumptions,body_effect_refs,participant_attendance,rule_and_policy_pins)
    VALUES ('activity-two',0,10,1,1,1,1,1,9,1,0,1,1,1,1,'direct_party_clock','{}','progressed','progressed','{}','activity-progress','activity-attempt-0',0,0,0,1,1,0,1,'progressed','{}','{}','[]','[]','[]','[]','{}');
    UPDATE party_runtime.party_timed_activity_executions
      SET cumulative_elapsed_numerator=1,remaining_time_numerator=9,next_attempt_ordinal=1,state_version=2,updated_change_set_id='activity-progress',
          last_processed_at_whole_minutes=1,last_processed_at_subminute_numerator=0,last_processed_at_subminute_denominator=1,
          next_boundary_at_whole_minutes=2,next_boundary_at_subminute_numerator=0,next_boundary_at_subminute_denominator=1
      WHERE id='activity-two';
    COMMIT`);
  await expectRejected(pool, `UPDATE party_runtime.party_timed_activity_attempts
    SET result_code='forged' WHERE activity_execution_id='activity-two' AND attempt_ordinal=0`, [], 'activity attempt history is append-only');
  await expectRejected(pool, `UPDATE party_runtime.party_timed_activity_executions
    SET next_attempt_ordinal=2,state_version=3 WHERE id='activity-two'`, [], 'activity cursor must reconcile with append-only attempts');

  await pool.query(`INSERT INTO party_runtime.party_activity_participant_bindings
    (activity_execution_id,participant_kind,participant_id,role_id,required,status,bound_change_set_id)
    VALUES ('activity-two','npc','npc-two','helper',true,'active','participant-bound')`);
  await pool.query(`UPDATE party_runtime.party_activity_participant_bindings
    SET status='left',terminal_change_set_id='participant-left',state_version=2
    WHERE activity_execution_id='activity-two' AND participant_kind='npc' AND participant_id='npc-two'`);
  await expectRejected(pool, `UPDATE party_runtime.party_activity_participant_bindings
    SET status='removed',state_version=3
    WHERE activity_execution_id='activity-two' AND participant_kind='npc' AND participant_id='npc-two'`, [], 'participant terminal state cannot transition again');

  const visiblePayload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Сцена изменилась.',
    perceived_changes: [],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const packageDigest = computeSpatialV3CanonicalDigest(visiblePayload);
  await pool.query(`INSERT INTO party_runtime.party_visible_packages
    (package_id,party_id,turn_id,committed_state_version,change_set_id,package_digest,visible_payload,presentation_status,projection_policy_ref,dependency_pins,idempotency_record_id)
    VALUES ('package-store','party-one','turn-store',2,'cs-store',$1,$2,'pending','{}','{}','visible-store')`, [
    packageDigest,
    visiblePayload
  ]);
  await pool.query(`INSERT INTO party_runtime.party_narration_jobs
    (job_id,party_id,package_id,status,idempotency_key)
    VALUES ('narration-job:package-store','party-one','package-store','pending',$1)`, [
    `presentation:package-store:${packageDigest}`
  ]);
  const storeInput = {
    party_id: 'party-one',
    package_id: 'package-store',
    package_digest: packageDigest,
    presentation_idempotency_key: `presentation:package-store:${packageDigest}`
  };
  const store = createTemporalPresentationPostgresStore({
    pool,
    now: () => new Date('2030-01-01T00:00:00Z'),
    leaseDurationMs: 30_000
  });
  const claims = await Promise.all([
    store.claimPresentationAttempt(storeInput),
    store.claimPresentationAttempt(storeInput)
  ]);
  assert.deepEqual(claims.map(({ disposition }) => disposition).sort(), ['claimed', 'in_progress']);
  const claim = claims.find(({ disposition }) => disposition === 'claimed');
  const narrationPayload = {
    party_id: 'party-one',
    kind: 'approved_narration',
    package_digest: packageDigest,
    text: 'Проверенная наррация.',
    dependency_pins: { pins: [], canonical_digest: 'a'.repeat(64) }
  };
  const narrationResult = {
    ...narrationPayload,
    canonical_digest: computeSpatialV3CanonicalDigest(narrationPayload)
  };
  assert.equal((await store.persistNarrationOutput({
    ...storeInput,
    attempt_id: claim.attempt_id,
    claim_token: claim.claim_token,
    narration_result: narrationResult,
    output_digest: narrationResult.canonical_digest
  })).disposition, 'output_ready');
  assert.equal((await store.claimPresentationAttempt(storeInput)).disposition, 'output_ready');
  assert.equal((await store.finalizePresentationAttempt({
    ...storeInput,
    attempt_id: claim.attempt_id,
    presentation_status: 'delivered',
    output_digest: narrationResult.canonical_digest
  })).presentation_status, 'delivered');
  assert.equal((await store.claimPresentationAttempt(storeInput)).disposition, 'delivered');
  assert.deepEqual((await pool.query(`SELECT
    (SELECT presentation_status FROM party_runtime.party_visible_packages WHERE package_id='package-store') AS package_status,
    (SELECT status FROM party_runtime.party_narration_jobs WHERE package_id='package-store') AS job_status,
    (SELECT count(*)::integer FROM party_runtime.party_narration_attempts WHERE job_id='narration-job:package-store') AS attempts`)).rows[0], {
    package_status: 'pending',
    job_status: 'delivered',
    attempts: 1
  });
});
