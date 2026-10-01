import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { runSpatialV3TargetMigrations } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args, input = null) => spawnSync(
  'docker', args, { input, encoding: 'utf8', timeout: 60_000 }
);

test('038 local-line party schema preflights legacy history and reapplies through the production chain', async (t) => {
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

  await assertLegacyPreflight(pool, migration);
  await pool.query(`
    CREATE TABLE party_runtime.schema_migrations(
      migration_id text PRIMARY KEY, migration_digest text NOT NULL,
      target_schema_fingerprint text NOT NULL
    );
    INSERT INTO party_runtime.schema_migrations(
      migration_id,migration_digest,target_schema_fingerprint
    ) VALUES ('fixture-012','${'a'.repeat(64)}','${'b'.repeat(64)}');
  `);
  const appliedMigration = {
    migration_id: 'fixture-012',
    migration_digest: 'a'.repeat(64),
    target_schema_fingerprint: 'b'.repeat(64)
  };
  const firstApply = await runSpatialV3TargetMigrations(pool, {
    exactAppliedMigration: appliedMigration
  });
  assert.equal(firstApply.newly_applied, 27,
    'production runner must apply chain 012–038 for an existing catalog schema');
  const secondApply = await runSpatialV3TargetMigrations(pool, {
    exactAppliedMigration: appliedMigration
  });
  assert.equal(secondApply.newly_applied, 27,
    'production runner must safely reapply chain 012–038');
  assert.deepEqual((await pool.query(`
    SELECT (SELECT count(*)::integer FROM party_runtime.traveller_travel_states) AS states,
      (SELECT count(*)::integer FROM party_runtime.party_traversal_interval_results) AS intervals
  `)).rows[0], { states: 0, intervals: 0 },
  '038 must apply twice to an empty 001–037 database');

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
    INSERT INTO party_runtime.party_route_plans(
      id,party_id,journey_owner_ref,journey_scope,request_kind,
      planning_request_id,path_query_digest,option_id,knowledge_scope,
      source_endpoint_snapshot,target_request,resolved_factual_target_ref,
      target_resolution_dependency_pins,world_revision_id,catalog_digest,
      planning_algorithm_version,planning_state_version,
      planning_context_dependency_pins,canonical_serialization_digest,
      created_change_set_id,lifecycle_change_set_id,created_at_turn
    ) VALUES (
      'legacy-plan','legacy-party','{"entity_kind":"actor","entity_id":"legacy-actor"}',
      'world_travel','ordinary','legacy-request','legacy-query','legacy-option',
      'factual','{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',
      '{"target":"legacy-to"}','{"endpoint_kind":"scene_position","endpoint_id":"legacy-to"}',
      '{"pins":[]}','world','catalog','legacy-algorithm',1,'{"pins":[]}',
      'legacy-plan-digest','seed','seed',0
    );
    INSERT INTO party_runtime.party_route_plan_steps(
      route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,
      arrival_endpoint_snapshot,static_contract_snapshot
    ) VALUES (
      'legacy-plan',0,'timed_traversal',
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-to"}',
      '{"snapshot_kind":"timed_traversal"}'
    );
    INSERT INTO party_runtime.party_route_plan_executions(
      id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,
      current_step_ordinal,current_endpoint_ref,updated_change_set_id
    ) VALUES (
      'legacy-execution','legacy-party','legacy-plan',
      '{"entity_kind":"actor","entity_id":"legacy-actor"}',
      'world_travel','planned',0,
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}','seed'
    );
    INSERT INTO party_runtime.party_route_plan_execution_events(
      execution_id,event_ordinal,event_kind,to_status,step_ordinal,
      location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn
    ) VALUES (
      'legacy-execution',0,'planned','planned',0,'{}','seed','legacy-planned',0
    );
    INSERT INTO party_runtime.traveller_travel_states(
      id,party_id,route_plan_execution_id,plan_step_ordinal,movement_carrier_ref,
      segment_progress_ppm,cumulative_actual_time_numerator,
      cumulative_actual_time_denominator,navigation_state,last_confirmed_endpoint_ref,
      status,closed_result,updated_change_set_id,closed_change_set_id
    ) VALUES (
      'legacy-travel','legacy-party','legacy-execution',0,
      '{"entity_kind":"actor","entity_id":"legacy-actor"}',1000000,1,1,
      'on_course','{"endpoint_kind":"scene_position","endpoint_id":"legacy-to"}',
      'closed','completed','legacy-travel-change','legacy-travel-close'
    );
    INSERT INTO party_runtime.party_traversal_interval_results(
      id,travel_state_id,route_plan_execution_id,plan_step_ordinal,interval_ordinal,
      progress_before_ppm,planned_progress_after_ppm,actual_progress_after_ppm,
      planned_time_numerator,planned_time_denominator,actual_time_numerator,
      actual_time_denominator,cumulative_time_before_numerator,
      cumulative_time_before_denominator,cumulative_time_after_numerator,
      cumulative_time_after_denominator,crossed_whole_minute_boundaries,
      clock_commit_mode,dynamic_snapshot,result_kind,result_code,
      outcome_composition_policy_version,outcome_composition_trace_digest,
      result_change_set_id,idempotency_record_id,occurred_at_turn
    ) VALUES (
      'legacy-interval','legacy-travel','legacy-execution',0,0,999999,1000000,1000000,
      1,1,1,1,0,1,1,1,1,'direct_party_clock','{}',
      'segment_completed','legacy-completed','legacy-policy','legacy-trace',
      'legacy-interval-change','legacy-interval-idem',0
    );
  `);

  const baseline = await pool.query(`
    SELECT count(*)::integer AS count,
      coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) AS rows
    FROM party_runtime.g5_site_connections c
  `);
  assert.equal(baseline.rows[0].count, 1);
  const travelBefore = await pool.query(`
    SELECT count(*)::integer AS count,
      coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) AS rows
    FROM party_runtime.traveller_travel_states s
  `);
  assert.equal(travelBefore.rows[0].count, 1,
    'the 001–037 fixture contains one existing travel state');
  const intervalsBefore = await pool.query(`
    SELECT count(*)::integer AS count,
      coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb) AS rows
    FROM party_runtime.party_traversal_interval_results r
  `);
  assert.equal(intervalsBefore.rows[0].count, 1,
    'the 001–037 fixture contains one existing interval result');
  const preflight = await pool.query(`
    SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE cost_kind='action')::integer AS legacy_action,
      count(*) FILTER (WHERE cost_kind='time')::integer AS legacy_timed
    FROM party_runtime.g5_site_connections
  `);
  assert.deepEqual(preflight.rows[0], { total: 1, legacy_action: 1, legacy_timed: 0 },
    'fixture preflight counts must be exact before changing constraints');

  assert.equal(travelBefore.rows[0].count, 1,
    'the fixture contains one existing travel state');
  assert.equal(intervalsBefore.rows[0].count, 1,
    'the fixture contains one existing interval result');

  // A terminal row and its interval share a plan step with the legacy
  // completed state. This also proves that closed states no longer reserve
  // the step's single live-state slot and that interval ordinal 0 is local to
  // each travel_state_id.
  await insertTravelState(pool, {
    id: 'returned-travel', executionId: 'legacy-execution', status: 'closed',
    progress: 1_000_000, closedResult: 'returned_to_departure', mirrored: true,
    changeSet: 'returned-state'
  });
  await insertInterval(pool, {
    id: 'returned-interval', travelStateId: 'returned-travel',
    executionId: 'legacy-execution', resultKind: 'returned_to_departure',
    progressBefore: 500_000, plannedProgress: 1_000_000,
    actualProgress: 1_000_000, turnBack: true, changeSet: 'returned-interval'
  });
  await insertTravelState(pool, {
    id: 'mirrored-ordinary-travel', executionId: 'legacy-execution',
    status: 'closed', progress: 600_000, closedResult: 'interrupted_to_anchor',
    mirrored: true, changeSet: 'mirrored-ordinary-state'
  });
  await insertInterval(pool, {
    id: 'mirrored-ordinary-interval', travelStateId: 'mirrored-ordinary-travel',
    executionId: 'legacy-execution', resultKind: 'progressed',
    progressBefore: 500_000, plannedProgress: 700_000,
    actualProgress: 600_000, changeSet: 'mirrored-ordinary-interval'
  });
  await pool.query(`
    INSERT INTO party_runtime.party_route_plans(
      id,party_id,journey_owner_ref,journey_scope,request_kind,
      planning_request_id,path_query_digest,option_id,knowledge_scope,
      source_endpoint_snapshot,target_request,resolved_factual_target_ref,
      target_resolution_dependency_pins,world_revision_id,catalog_digest,
      planning_algorithm_version,planning_state_version,
      planning_context_dependency_pins,canonical_serialization_digest,
      created_change_set_id,lifecycle_change_set_id,created_at_turn
    ) VALUES (
      'other-plan','legacy-party','{"entity_kind":"actor","entity_id":"legacy-actor"}',
      'world_travel','ordinary','other-request','other-query','other-option','factual',
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',
      '{"target":"legacy-to"}',
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-to"}',
      '{}','world','catalog','test-algorithm',1,'{}','other-digest','seed','seed',0
    );
    INSERT INTO party_runtime.party_route_plan_steps(
      route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,
      arrival_endpoint_snapshot,static_contract_snapshot
    ) VALUES (
      'other-plan',0,'timed_traversal',
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-to"}',
      '{"snapshot_kind":"timed_traversal"}'
    );
    INSERT INTO party_runtime.party_route_plan_executions(
      id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,
      current_step_ordinal,current_endpoint_ref,updated_change_set_id
    ) VALUES (
      'other-execution','legacy-party','other-plan',
      '{"entity_kind":"actor","entity_id":"legacy-actor"}',
      'world_travel','planned',0,
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}','seed'
    );
    INSERT INTO party_runtime.party_route_plan_execution_events(
      execution_id,event_ordinal,event_kind,to_status,step_ordinal,
      location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn
    ) VALUES ('other-execution',0,'planned','planned',0,'{}','seed','seed',0)
  `);
  await assert.rejects(insertInterval(pool, {
    id: 'wrong-travel-state-scope', travelStateId: 'mirrored-ordinary-travel',
    executionId: 'other-execution', resultKind: 'progressed',
    progressBefore: 500_000, plannedProgress: 700_000,
    actualProgress: 600_000, intervalOrdinal: 1,
    changeSet: 'wrong-travel-state-scope'
  }), (error) => error?.code === '23503',
  'interval state FK must pin matching execution and step');
  await insertTravelState(pool, {
    id: 'zero-progress-interruption', executionId: 'legacy-execution',
    status: 'closed', progress: 0, closedResult: 'interrupted_to_anchor',
    changeSet: 'zero-progress-state'
  });
  await insertInterval(pool, {
    id: 'zero-progress-interruption-interval',
    travelStateId: 'zero-progress-interruption',
    executionId: 'legacy-execution', resultKind: 'interrupted_at_anchor',
    progressBefore: 0, plannedProgress: 333_333, actualProgress: 0,
    changeSet: 'zero-progress-interval'
  });
  await insertTravelState(pool, {
    id: 'resumed-travel', executionId: 'legacy-execution', status: 'active',
    progress: 0, changeSet: 'resumed-state'
  });
  await insertInterval(pool, {
    id: 'resumed-interval-zero', travelStateId: 'resumed-travel',
    executionId: 'legacy-execution', resultKind: 'progressed',
    progressBefore: 0, plannedProgress: 333_333,
    actualProgress: 333_333, changeSet: 'resumed-interval'
  });
  await insertTravelState(pool, {
    id: 'interval-check-travel', executionId: 'legacy-execution', status: 'closed',
    progress: 400_000, closedResult: 'superseded', changeSet: 'interval-check-state'
  });
  for (const invalid of [
    {
      id: 'bad-turnback-blocked', resultKind: 'blocked_before_progress',
      resultCode: 'blocked_before_progress', progressBefore: 100_000,
      plannedProgress: 200_000, actualProgress: 100_000, turnBack: true
    },
    {
      id: 'bad-turnback-zero', resultKind: 'progressed', resultCode: 'progressed',
      progressBefore: 0, plannedProgress: 100_000,
      actualProgress: 100_000, turnBack: true
    },
    {
      id: 'bad-turnback-refusal', resultKind: 'progressed',
      resultCode: 'turn_back_refused', progressBefore: 100_000,
      plannedProgress: 200_000, actualProgress: 200_000, turnBack: false
    },
    {
      id: 'bad-paused-zero', resultKind: 'paused_in_transit',
      resultCode: 'paused_in_transit', progressBefore: 0,
      plannedProgress: 200_000, actualProgress: 0, turnBack: false
    }
  ]) {
    await assert.rejects(insertInterval(pool, {
      ...invalid, travelStateId: 'interval-check-travel',
      executionId: 'legacy-execution', changeSet: invalid.id
    }), (error) => error?.code === '23514',
    `${invalid.id} must violate the F.1.1 interval invariant`);
  }
  for (const [suffix, status, strandedReason] of [
    ['active', 'active', null],
    ['paused', 'paused_in_transit', null],
    ['stranded', 'stranded_in_transit', 'lost']
  ]) {
    await assert.rejects(insertTravelState(pool, {
      id: `duplicate-live-${suffix}`, executionId: 'legacy-execution', status,
      progress: status === 'paused_in_transit' ? 100_000 : 0,
      strandedReason, changeSet: `duplicate-${suffix}`
    }), (error) => error?.code === '23505',
    `${status} must conflict with the existing open travel state`);
  }
  await assert.rejects(insertTravelState(pool, {
    id: 'bad-paused-zero-state', executionId: 'legacy-execution',
    status: 'paused_in_transit', progress: 0,
    changeSet: 'bad-paused-zero-state'
  }), (error) => error?.code === '23514',
  'paused travel state must have progress strictly between endpoints');

  for (const invalid of [
    {
      id: 'bad-completed-mirrored', resultKind: 'completed',
      progress: 1_000_000, mirrored: true
    },
    {
      id: 'bad-return-unmirrored', resultKind: 'returned_to_departure',
      progress: 1_000_000, mirrored: false
    },
    {
      id: 'bad-return-short', resultKind: 'returned_to_departure',
      progress: 999_999, mirrored: true
    }
  ]) {
    await assert.rejects(insertTravelState(pool, {
      id: invalid.id, executionId: 'legacy-execution', status: 'closed',
      progress: invalid.progress, closedResult: invalid.resultKind,
      mirrored: invalid.mirrored, changeSet: invalid.id
    }), (error) => error?.code === '23514',
    `${invalid.id} must violate the terminal mirrored/progress check`);
  }

  await assertWaitStartedScenario(pool, {
    suffix: 'returned', resultKind: 'returned_to_departure',
    progressBefore: 500_000, actualProgress: 1_000_000,
    closedResult: 'returned_to_departure', expectAccepted: true
  });
  await assertWaitStartedScenario(pool, {
    suffix: 'interrupted-zero', resultKind: 'interrupted_at_anchor',
    progressBefore: 0, actualProgress: 0,
    closedResult: 'interrupted_to_anchor', expectAccepted: true
  });
  await assertWaitStartedScenario(pool, {
    suffix: 'interrupted-positive', resultKind: 'interrupted_at_anchor',
    progressBefore: 333_333, actualProgress: 333_333,
    closedResult: 'interrupted_to_anchor', expectAccepted: false
  });

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
  await assert.rejects(pool.query(`
    UPDATE party_runtime.party_traversal_interval_results
    SET result_code='rewritten' WHERE id='legacy-interval'
  `), (error) => error?.code === 'P0001',
  'the temporary travel_state_id backfill exception must not remain after 038');

  const gameDataBeforeRerun = await pool.query(`
    SELECT
      (SELECT count(*)::integer FROM party_runtime.g5_site_connections) AS connections,
      (SELECT count(*)::integer FROM party_runtime.traveller_travel_states) AS states,
      (SELECT count(*)::integer FROM party_runtime.party_traversal_interval_results) AS intervals,
      (SELECT count(*)::integer FROM party_runtime.party_route_plan_executions) AS executions
  `);
  const postDataRerun = await runSpatialV3TargetMigrations(pool, {
    exactAppliedMigration: appliedMigration
  });
  assert.equal(postDataRerun.newly_applied, 27,
    'production chain must reapply 012–038 after game data exists');
  assert.deepEqual((await pool.query(`
    SELECT
      (SELECT count(*)::integer FROM party_runtime.g5_site_connections) AS connections,
      (SELECT count(*)::integer FROM party_runtime.traveller_travel_states) AS states,
      (SELECT count(*)::integer FROM party_runtime.party_traversal_interval_results) AS intervals,
      (SELECT count(*)::integer FROM party_runtime.party_route_plan_executions) AS executions
  `)).rows[0], gameDataBeforeRerun.rows[0],
  'production chain rerun must preserve existing party game data');
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

async function assertLegacyPreflight(pool, migration) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO party_runtime.parties(
        party_id,schema_version,world_revision_id,world_catalog_digest,
        materializer_version,rng_version,command_catalog_digest,profile_bundle_digest
      ) VALUES ('preflight-party',3,'world','catalog','materializer','rng','commands','profiles');
      INSERT INTO party_runtime.party_route_plans(
        id,party_id,journey_owner_ref,journey_scope,request_kind,
        planning_request_id,path_query_digest,option_id,knowledge_scope,
        source_endpoint_snapshot,target_request,resolved_factual_target_ref,
        target_resolution_dependency_pins,world_revision_id,catalog_digest,
        planning_algorithm_version,planning_state_version,
        planning_context_dependency_pins,canonical_serialization_digest,
        created_change_set_id,lifecycle_change_set_id,created_at_turn
      ) VALUES (
        'preflight-plan','preflight-party','{"entity_kind":"actor","entity_id":"a"}',
        'world_travel','ordinary','request','query','option','factual',
        '{"endpoint_kind":"scene_position","endpoint_id":"from"}',
        '{"target":"to"}','{"endpoint_kind":"scene_position","endpoint_id":"to"}',
        '{}','world','catalog','test-algorithm',1,'{}','digest','seed','seed',0
      );
      INSERT INTO party_runtime.party_route_plan_steps(
        route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,
        arrival_endpoint_snapshot,static_contract_snapshot
      ) VALUES (
        'preflight-plan',0,'timed_traversal',
        '{"endpoint_kind":"scene_position","endpoint_id":"from"}',
        '{"endpoint_kind":"scene_position","endpoint_id":"to"}',
        '{"snapshot_kind":"timed_traversal"}'
      );
      INSERT INTO party_runtime.party_route_plan_executions(
        id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,
        current_step_ordinal,current_endpoint_ref,updated_change_set_id
      ) VALUES (
        'preflight-execution','preflight-party','preflight-plan',
        '{"entity_kind":"actor","entity_id":"a"}',
        'world_travel','planned',0,
        '{"endpoint_kind":"scene_position","endpoint_id":"from"}','seed'
      );
      INSERT INTO party_runtime.traveller_travel_states(
        id,party_id,route_plan_execution_id,plan_step_ordinal,movement_carrier_ref,
        segment_progress_ppm,cumulative_actual_time_numerator,
        cumulative_actual_time_denominator,navigation_state,last_confirmed_endpoint_ref,
        status,closed_result,updated_change_set_id,closed_change_set_id
      ) VALUES (
        'preflight-travel','preflight-party','preflight-execution',0,
        '{"entity_kind":"actor","entity_id":"a"}',1000000,1,1,'on_course',
        '{"endpoint_kind":"scene_position","endpoint_id":"to"}',
        'closed','completed','seed','seed'
      );
      INSERT INTO party_runtime.party_traversal_interval_results(
        id,route_plan_execution_id,plan_step_ordinal,interval_ordinal,
        progress_before_ppm,planned_progress_after_ppm,actual_progress_after_ppm,
        planned_time_numerator,planned_time_denominator,actual_time_numerator,
        actual_time_denominator,cumulative_time_before_numerator,
        cumulative_time_before_denominator,cumulative_time_after_numerator,
        cumulative_time_after_denominator,crossed_whole_minute_boundaries,
        clock_commit_mode,dynamic_snapshot,result_kind,result_code,
        outcome_composition_policy_version,outcome_composition_trace_digest,
        result_change_set_id,idempotency_record_id,occurred_at_turn
      ) VALUES (
        'preflight-interval','preflight-execution',0,0,999999,1000000,1000000,
        1,1,1,1,0,1,1,1,1,'direct_party_clock','{}','segment_completed',
        'complete','policy','trace','seed','idem',0
      );
    `);
    const before = await client.query(`
      SELECT
        (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb)
          FROM party_runtime.traveller_travel_states s) AS states,
        (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb)
          FROM party_runtime.party_traversal_interval_results r) AS intervals
    `);
    await client.query('SAVEPOINT before_038');
    await assert.rejects(client.query(migration), (error) => (
      error?.code === '55000'
      && error?.message.includes('PARTY_DATABASE_REBUILD_REQUIRED')
      && error?.detail.includes('traveller_travel_states=1')
      && error?.detail.includes('party_traversal_interval_results=1')
    ), 'legacy path rows must produce the typed D51 rebuild error');
    await client.query('ROLLBACK TO SAVEPOINT before_038');
    const after = await client.query(`
      SELECT
        (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]'::jsonb)
          FROM party_runtime.traveller_travel_states s) AS states,
        (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb)
          FROM party_runtime.party_traversal_interval_results r) AS intervals
    `);
    assert.deepEqual(after.rows[0], before.rows[0],
      'failed 038 preflight must leave both legacy histories unchanged');
    assert.deepEqual(await tableColumns(client, 'traveller_travel_states').then((columns) => [
      columns.has('mirrored'), columns.has('travel_state_id')
    ]), [false, false], 'failed preflight must leave schema unchanged');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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

async function insertTravelState(pool, {
  id, executionId, status, progress, closedResult = null, mirrored = false,
  strandedReason = null, changeSet
}) {
  return pool.query(`
    INSERT INTO party_runtime.traveller_travel_states(
      id,party_id,route_plan_execution_id,plan_step_ordinal,movement_carrier_ref,
      segment_progress_ppm,cumulative_actual_time_numerator,
      cumulative_actual_time_denominator,navigation_state,last_confirmed_endpoint_ref,
      status,stranded_reason_code,closed_result,mirrored,updated_change_set_id,
      closed_change_set_id
    ) VALUES (
      $1,'legacy-party',$2,0,'{"entity_kind":"actor","entity_id":"legacy-actor"}',
      $3,0,1,'on_course',
      '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',
      $4,$5,$6,$7,$8,CASE WHEN $4='closed' THEN $8 ELSE NULL END
    )
  `, [id, executionId, progress, status, strandedReason, closedResult, mirrored, changeSet]);
}

async function insertInterval(pool, {
  id, travelStateId, executionId, resultKind, progressBefore,
  plannedProgress, actualProgress, resultCode = resultKind,
  turnBack = false, changeSet, intervalOrdinal = 0
}) {
  return pool.query(`
    INSERT INTO party_runtime.party_traversal_interval_results(
      id,travel_state_id,route_plan_execution_id,plan_step_ordinal,
      interval_ordinal,progress_before_ppm,planned_progress_after_ppm,
      actual_progress_after_ppm,planned_time_numerator,planned_time_denominator,
      actual_time_numerator,actual_time_denominator,cumulative_time_before_numerator,
      cumulative_time_before_denominator,cumulative_time_after_numerator,
      cumulative_time_after_denominator,crossed_whole_minute_boundaries,
      clock_commit_mode,dynamic_snapshot,result_kind,result_code,
      outcome_composition_policy_version,outcome_composition_trace_digest,
      interruption_anchor_id,turn_back,result_change_set_id,idempotency_record_id,
      occurred_at_turn
    ) VALUES (
      $1,$2,$3,0,$12,$4,$5,$6,1,1,1,1,0,1,1,1,1,
      'direct_party_clock','{}',$7,$8,'test-policy','test-trace',
      CASE WHEN $7='interrupted_at_anchor' THEN 'legacy-from' ELSE NULL END,
      $9,$10,$11,1
    )
  `, [
    id, travelStateId, executionId, progressBefore, plannedProgress,
    actualProgress, resultKind, resultCode, turnBack, changeSet, `${id}-idem`,
    intervalOrdinal
  ]);
}

async function assertWaitStartedScenario(pool, {
  suffix, resultKind, progressBefore, actualProgress, closedResult,
  expectAccepted
}) {
  const executionId = `wait-${suffix}-execution`;
  const planId = `wait-${suffix}-plan`;
  const travelId = `wait-${suffix}-travel`;
  const intervalId = `wait-${suffix}-interval`;
  const stateChangeSet = `${suffix}-state`;
  const activationChangeSet = `${suffix}-activation`;
  const waitChangeSet = `${suffix}-wait`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO party_runtime.party_route_plans(
        id,party_id,journey_owner_ref,journey_scope,request_kind,
        planning_request_id,path_query_digest,option_id,knowledge_scope,
        source_endpoint_snapshot,target_request,resolved_factual_target_ref,
        target_resolution_dependency_pins,world_revision_id,catalog_digest,
        planning_algorithm_version,planning_state_version,
        planning_context_dependency_pins,canonical_serialization_digest,
        created_change_set_id,lifecycle_change_set_id,created_at_turn
      ) VALUES (
        $1,'legacy-party','{"entity_kind":"actor","entity_id":"legacy-actor"}',
        'world_travel','ordinary',$1,$1,$1,'factual',
        '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',
        '{"target":"legacy-to"}',
        '{"endpoint_kind":"scene_position","endpoint_id":"legacy-to"}',
        '{}','world','catalog','test-algorithm',1,'{}',$1,$2,$2,0
      );
    `, [planId, 'seed']);
    await client.query(`
      INSERT INTO party_runtime.party_route_plan_steps(
        route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,
        arrival_endpoint_snapshot,static_contract_snapshot
      ) VALUES (
        $1,0,'timed_traversal',
        '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',
        '{"endpoint_kind":"scene_position","endpoint_id":"legacy-to"}',
        '{"snapshot_kind":"timed_traversal"}'
      );
    `, [planId]);
    await client.query(`
      INSERT INTO party_runtime.party_route_plan_executions(
        id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,
        current_step_ordinal,current_endpoint_ref,updated_change_set_id
      ) VALUES (
        $3,'legacy-party',$1,
        '{"entity_kind":"actor","entity_id":"legacy-actor"}',
        'world_travel','planned',0,
        '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',$2
      );
    `, [planId, 'seed', executionId]);
    await client.query(`
      INSERT INTO party_runtime.party_route_plan_execution_events(
        execution_id,event_ordinal,event_kind,to_status,step_ordinal,
        location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn
      ) VALUES ($1,0,'planned','planned',0,'{}',$2,$2,0)
    `, [executionId, 'seed']);
    await insertTravelState(client, {
      id: travelId, executionId, status: 'active', progress: actualProgress,
      changeSet: stateChangeSet
    });
    await client.query(`
      UPDATE party_runtime.party_route_plan_executions
      SET status='active',current_endpoint_ref=NULL,active_travel_state_id=$1,
        started_at_turn=0,state_version=2,updated_change_set_id=$2
      WHERE id=$3
    `, [travelId, activationChangeSet, executionId]);
    await client.query(`
      INSERT INTO party_runtime.party_route_plan_execution_events(
        execution_id,event_ordinal,event_kind,from_status,to_status,step_ordinal,
        location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn
      ) VALUES (
        $1,1,'activated','planned','active',0,'{}',$2,$2,0
      )
    `, [executionId, activationChangeSet]);
    await insertInterval(client, {
      id: intervalId, travelStateId: travelId, executionId, resultKind,
      progressBefore, plannedProgress: 1_000_000, actualProgress,
      changeSet: waitChangeSet
    });
    await client.query(`
      UPDATE party_runtime.traveller_travel_states
      SET status='closed',segment_progress_ppm=$1,closed_result=$2,
        mirrored=($2='returned_to_departure'),closed_change_set_id=$3,
        updated_change_set_id=$3,state_version=state_version+1
      WHERE id=$4
    `, [actualProgress, closedResult, waitChangeSet, travelId]);
    await client.query(`
      UPDATE party_runtime.party_route_plan_executions
      SET status='waiting_at_anchor',current_endpoint_ref=
        '{"endpoint_kind":"scene_position","endpoint_id":"legacy-from"}',
        active_travel_state_id=NULL,state_version=3,updated_change_set_id=$1
      WHERE id=$2
    `, [waitChangeSet, executionId]);
    await client.query(`
      INSERT INTO party_runtime.party_route_plan_execution_events(
        execution_id,event_ordinal,event_kind,from_status,to_status,step_ordinal,
        location_snapshot,causal_result_ref,change_set_id,idempotency_record_id,
        occurred_at_turn
      ) VALUES (
        $1,2,'wait_started','active','waiting_at_anchor',0,'{}',
        jsonb_build_object('entity_kind','party_traversal_interval_result',
          'entity_id',$2::text),$3,$4,1
      )
    `, [executionId, intervalId, waitChangeSet, `${intervalId}-idem`]);
    let causalError = null;
    try {
      await client.query('SET CONSTRAINTS party_runtime.v3_execution_event_causal IMMEDIATE');
    } catch (error) {
      causalError = error;
    }
    if (expectAccepted) {
      assert.equal(causalError, null,
        `wait_started must accept ${resultKind} at progress ${actualProgress}`);
      await client.query('COMMIT');
    } else {
      assert.equal(causalError?.code, 'P0001',
        `wait_started must reject ${resultKind} at progress ${actualProgress}`);
      await client.query('ROLLBACK');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
