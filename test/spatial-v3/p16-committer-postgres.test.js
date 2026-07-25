import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import {
  createSpatialV3CombinedAtomicCommitter,
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import {
  recheckSpatialV3PostgresFirstEntry
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-first-entry-recheck.js';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 45_000 });
const name = `p16-node-${process.pid}`;
const hex = 'a'.repeat(64);
const later = new Date('2030-01-01T00:00:00.000Z');
function firstEntryPhysicalRecheck(overrides = {}) {
  const value = {
    kind: 'physical',
    materialization_scope_key: 'party_runtime.party_scene_baselines:baseline-new',
    baseline_disposition: 'create',
    g4_id: 'g4-existing',
    preparation_snapshot_id: 'preparation-snapshot-1',
    preparation_member_ordinal: 0,
    preparation_snapshot_digest: hex,
    preparation_member_digest: hex,
    route_plan_id: 'route-plan-first-entry',
    route_plan_digest: hex,
    route_plan_execution_id: 'route-execution-first-entry',
    preparation_claim_id: 'preparation-claim-first-entry',
    scene_baseline_id: 'baseline-new',
    g5_site_id: 'g5-new',
    g6_instance_id: 'g6-new',
    position_id: 'position-new',
    ...overrides
  };
  return { ...value, digest: computeSpatialV3CanonicalDigest(value) };
}

async function makePlan({
  planId, idempotencyId, idempotencyKey, changeSetId,
  canonicalInputDigest = `sha256:${hex}`,
  operationKind = 'move',
  expectedStateVersions = [],
  inserts = [],
  updates = [],
  extraAppends = [],
  physicalKeys = [],
  ownerKeys = [],
  executionKeys = [],
  g4Keys = [],
  commitRechecks = null
}) {
  const visiblePayload = {
    schema: 'temporal_visible_package.v1',
    perceived_scene: 'Изменение зафиксировано.',
    perceived_changes: ['Состояние сохранено.'],
    sensory_details: [],
    visible_npcs: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    hypotheses: [],
    player_safe_interruption: null,
    allowed_action_affordances: []
  };
  const dependencyPins = [{
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'temporal-v4' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '4.3.0-target.1', state_version: null }
  }];
  const appends = [{
    target_table: 'party_v3_change_sets', id: changeSetId,
    record: { id: changeSetId, party_id: 'p', operation_kind: operationKind, idempotency_record_id: idempotencyId, expected_state_version_set_digest: 'expected', expected_state_version_set: [], committed_state_version_set_digest: 'committed', write_plan_digest: `${changeSetId}-write`, created_at_turn: 0, committed_at_turn: 0 }
  }, ...extraAppends];
  const built = await buildCombinedWritePlan({
    plan_id: planId, party_id: 'p', write_plan_kind: 'semantic_commit', operation_kind: operationKind, canonical_input_digest: canonicalInputDigest,
    expected_state_versions: expectedStateVersions, validation_report: { status: 'pass', digest: `sha256:${hex}` },
    idempotency: { id: idempotencyId, key: idempotencyKey }, change_set: { id: changeSetId },
    visible_package_envelope: {
      package_id: `visible-${changeSetId}`,
      party_id: 'p',
      turn_id: `turn-${changeSetId}`,
      committed_state_version: '1',
      change_set_id: changeSetId,
      package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
      visible_payload: visiblePayload,
      presentation_status: 'pending',
      projection_policy_ref: {
        entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection-v1' },
        authoring_version: '4.3.0-target.1'
      },
      dependency_pins: {
        pins: dependencyPins,
        canonical_digest: computeSpatialV3CanonicalDigest(dependencyPins).replace('sha256:', '')
      },
      idempotency_record_id: idempotencyId
    },
    lock_context: { owner_keys: ownerKeys, execution_keys: executionKeys, g4_keys: g4Keys, physical_keys: [`party_runtime.party_v3_change_sets:${changeSetId}`, ...physicalKeys] },
    commit_rechecks: commitRechecks ?? ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: `sha256:${hex}` })),
    approved_write_sets: [{ inserts, updates, appends }]
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.plan;
}

function transactionOwner(client, lockKeys, shouldFailSettle = () => false) {
  return async (work) => {
    await client.query('BEGIN');
    try {
      const result = await work({ query: async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) lockKeys.push(params[0]);
        if (shouldFailSettle() && sql.startsWith('UPDATE party_runtime.party_command_idempotency SET status=')) {
          throw new Error('injected idempotency settlement failure');
        }
        return client.query(sql, params);
      } });
      await client.query('COMMIT');
      return result;
    } catch (cause) {
      await client.query('ROLLBACK');
      throw cause;
    }
  };
}

test('P16 Node committer executes sealed plans against isolated PostgreSQL', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  let client;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    if (client) await client.end();
    docker(['rm', '-f', name]);
  });
  assert.equal(docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name, '-e', 'POSTGRES_PASSWORD=p16', '-e', 'POSTGRES_USER=p16', '-e', 'POSTGRES_DB=p16', 'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((done) => setTimeout(done, 300));
    if (docker(['exec', name, 'pg_isready', '-U', 'p16', '-d', 'p16']).status === 0) { ready = true; break; }
  }
  assert.equal(ready, true, 'isolated PostgreSQL must become ready');
  await new Promise((done) => setTimeout(done, 500));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)?.[1]);
  client = new pg.Client({ host: '127.0.0.1', port, user: 'p16', password: 'p16', database: 'p16' });
  await client.connect();
  for (const file of ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql', '007_party_runtime_temporal_world.sql', '008_party_runtime_pr8_first_entry.sql']) await client.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  await client.query("INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest) VALUES ('p',3,'w','d','m','r','c','b'); INSERT INTO party_runtime.party_clocks(party_id,whole_minutes,subminute_numerator,subminute_denominator,clock_owner_kind,state_version,updated_change_set_id) VALUES ('p',0,0,1,'party',1,'old');");
  await client.query(
    `INSERT INTO party_runtime.preparation_snapshots
       (id,party_id,planning_request_id,planning_request_digest,immutable_members_digest,canonical_digest,created_at_turn,created_change_set_id)
     VALUES ('branch-check','p','branch-request','digest','members','snapshot',0,'seed')`
  );
  await assert.rejects(
    client.query(
      `INSERT INTO party_runtime.preparation_snapshot_members
         (preparation_snapshot_id,ordinal,member_kind,source_authoring_ref,dependency_pins,share_mode,member_digest)
       VALUES ('branch-check',0,'transfer_scene','{}','{}','execution_exclusive','none')`
    ),
    /preparation_snapshot_members_branch_check/u
  );
  await assert.rejects(
    client.query(
      `INSERT INTO party_runtime.preparation_snapshot_members
         (preparation_snapshot_id,ordinal,member_kind,source_authoring_ref,prepared_scene_materialization,dependency_pins,share_mode,member_digest)
       VALUES ('branch-check',1,'transfer_scene','{}','"not-an-object"','{}','execution_exclusive','bad-json')`
    ),
    /preparation_snapshot_members_prepared_object_check/u
  );

  const locks = [];
  let rechecks = 0;
  let failSettle = false;
  const fullRecheck = async (input) => {
    rechecks += 1;
    if (input.check.materialization_scope_key) {
      return recheckSpatialV3PostgresFirstEntry(input);
    }
    return { ok: true };
  };
  const committer = createSpatialV3CombinedAtomicCommitter({
    now: () => later,
    recheck: fullRecheck,
    withTransaction: transactionOwner(client, locks, () => failSettle)
  });

  const first = await makePlan({
    planId: 'p1', idempotencyId: 'idem', idempotencyKey: 'key', changeSetId: 'cs',
    expectedStateVersions: [{ target_table: 'party_clocks', id: 'p', state_version: 1 }],
    updates: [{ target_table: 'party_clocks', id: 'p', record: { party_id: 'p', whole_minutes: 0, subminute_numerator: 0, subminute_denominator: 1, clock_owner_kind: 'party', clock_owner_id: null, updated_change_set_id: 'cs' } }],
    physicalKeys: ['party_runtime.party_clocks:p']
  });
  assert.equal((await committer.commit({ plan: first })).ok, true);
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_visible_packages WHERE package_id='visible-cs'")).rows[0].count, '1');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_narration_jobs WHERE package_id='visible-cs' AND status='pending'")).rows[0].count, '1');
  assert.equal((await client.query("SELECT state_version FROM party_runtime.party_clocks WHERE party_id='p' ")).rows[0].state_version, '2');
  assert.deepEqual(locks, [...locks].sort(), 'lock phases are globally sorted');
  rechecks = 0;
  assert.equal((await committer.commit({ plan: first })).replay, true);
  assert.equal(rechecks, 0, 'committed replay resolves before recheck');
  const conflict = { ...first, canonical_input_digest: `sha256:${'b'.repeat(64)}` };
  assert.equal((await committer.commit({ plan: conflict })).error.code, 'generated_schema_mismatch', 'unsealed digest alteration is rejected');
  const digestConflict = await makePlan({ planId: 'conflict-plan', idempotencyId: 'idem', idempotencyKey: 'key', changeSetId: 'conflict-cs', canonicalInputDigest: `sha256:${'b'.repeat(64)}` });
  assert.equal((await committer.commit({ plan: digestConflict })).error.code, 'idempotency_conflict', 'same idempotency key cannot change the persisted digest');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='conflict-cs'")).rows[0].count, '0');
  const replayWriteSetConflict = await makePlan({ planId: 'replay-conflict-plan', idempotencyId: 'idem', idempotencyKey: 'key', changeSetId: 'different-cs' });
  assert.equal((await committer.commit({ plan: replayWriteSetConflict })).error.code, 'idempotency_conflict', 'replay must match the exact persisted change set and write-set digest');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='different-cs'")).rows[0].count, '0');

  const expired = await makePlan({ planId: 'reclaim-plan', idempotencyId: 'reclaim-idem', idempotencyKey: 'reclaim-key', changeSetId: 'reclaim-cs' });
  await client.query("INSERT INTO party_runtime.party_command_idempotency(id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,status,lease_token,lease_expires_at,created_at_turn) VALUES ('reclaim-idem','p','move','reclaim-key',$1,$2,'leased','old lease','2000-01-01T00:00:00Z',0)", [hex, expired.expected_state_versions_digest.replace('sha256:', '')]);
  const reclaimed = await committer.commit({ plan: expired });
  assert.equal(reclaimed.ok, true, JSON.stringify(reclaimed));
  assert.deepEqual((await client.query("SELECT status,state_version,lease_token,result_change_set_id FROM party_runtime.party_command_idempotency WHERE id='reclaim-idem'")).rows[0], { status: 'committed', state_version: '3', lease_token: null, result_change_set_id: 'reclaim-cs' }, 'reclaim uses versioned CAS then terminal settlement');

  const terminal = await makePlan({ planId: 'terminal-plan', idempotencyId: 'terminal-idem', idempotencyKey: 'terminal-key', changeSetId: 'terminal-cs' });
  await client.query("INSERT INTO party_runtime.party_command_idempotency(id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,status,terminal_failure_code,terminal_failure_digest,created_at_turn,finalized_at_turn) VALUES ('terminal-idem','p','move','terminal-key',$1,$2,'failed_terminal','state_version_conflict','terminal-digest',0,1)", [hex, terminal.expected_state_versions_digest.replace('sha256:', '')]);
  rechecks = 0;
  const failedReplay = await committer.commit({ plan: terminal });
  assert.equal(failedReplay.terminal, true, JSON.stringify(failedReplay));
  assert.equal(failedReplay.error.code, 'state_version_conflict');
  assert.equal(rechecks, 0, 'terminal failure replay resolves before recheck');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='terminal-cs'")).rows[0].count, '0');

  await client.query("BEGIN; INSERT INTO party_runtime.party_route_plans(id,party_id,journey_owner_ref,journey_scope,request_kind,planning_request_id,path_query_digest,option_id,knowledge_scope,source_endpoint_snapshot,target_request,resolved_factual_target_ref,target_resolution_dependency_pins,world_revision_id,catalog_digest,planning_algorithm_version,planning_state_version,planning_context_dependency_pins,canonical_serialization_digest,created_change_set_id,lifecycle_change_set_id,created_at_turn) VALUES ('history-plan','p','{\"entity_kind\":\"actor\",\"entity_id\":\"a\"}','world_travel','ordinary','request','digest','option','factual','{\"endpoint_kind\":\"scene_position\",\"endpoint_id\":\"pos\"}','{\"spatial_kind\":\"canonical_g5\",\"spatial_id\":\"g5\"}','{\"spatial_kind\":\"canonical_g5\",\"spatial_id\":\"g5\"}','{}','w','d','algorithm',1,'{}','history-plan-digest','cs','cs',0); INSERT INTO party_runtime.party_route_plan_steps(route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,arrival_endpoint_snapshot,static_contract_snapshot) VALUES ('history-plan',0,'immediate_action','{\"endpoint_kind\":\"scene_position\",\"endpoint_id\":\"pos\"}','{\"endpoint_kind\":\"scene_position\",\"endpoint_id\":\"pos\"}','{\"snapshot_kind\":\"immediate_action\"}'); INSERT INTO party_runtime.party_route_plan_executions(id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,current_step_ordinal,current_endpoint_ref,updated_change_set_id) VALUES ('history-exec','p','history-plan','{\"entity_kind\":\"actor\",\"entity_id\":\"a\"}','world_travel','planned',0,'{\"endpoint_kind\":\"scene_position\",\"endpoint_id\":\"pos\"}','cs'); INSERT INTO party_runtime.party_route_plan_execution_events(execution_id,event_ordinal,event_kind,to_status,step_ordinal,location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn) VALUES ('history-exec',0,'planned','planned',0,'{}','cs','idem',0); COMMIT;");
  const history = await makePlan({
    planId: 'history-plan-commit', idempotencyId: 'history-idem', idempotencyKey: 'history-key', changeSetId: 'history-cs',
    expectedStateVersions: [{ target_table: 'party_route_plan_executions', id: 'history-exec', state_version: 1 }],
    updates: [{ target_table: 'party_route_plan_executions', id: 'history-exec', record: { id: 'history-exec', party_id: 'p', status: 'active', started_at_turn: 0, updated_change_set_id: 'history-cs' } }],
    extraAppends: [{ target_table: 'party_route_plan_execution_events', id: 'history-exec:1', record: { execution_id: 'history-exec', event_ordinal: 1, event_kind: 'activated', from_status: 'planned', to_status: 'active', step_ordinal: 0, location_snapshot: { location: { location_kind: 'scene' } }, change_set_id: 'history-cs', idempotency_record_id: 'history-idem', occurred_at_turn: 0 } }],
    physicalKeys: ['party_runtime.party_route_plan_executions:history-exec', 'party_runtime.party_route_plan_execution_events:history-exec:1']
  });
  assert.equal((await committer.commit({ plan: history })).ok, true);
  assert.deepEqual((await client.query("SELECT execution_id,event_ordinal,event_kind,to_status,change_set_id,idempotency_record_id FROM party_runtime.party_route_plan_execution_events WHERE execution_id='history-exec' AND event_ordinal=1")).rows[0], { execution_id: 'history-exec', event_ordinal: 1, event_kind: 'activated', to_status: 'active', change_set_id: 'history-cs', idempotency_record_id: 'history-idem' }, 'committer persists composite execution history identity');

  const rollback = await makePlan({
    planId: 'rollback-plan', idempotencyId: 'rollback-idem', idempotencyKey: 'rollback-key', changeSetId: 'rollback-cs'
  });
  failSettle = true;
  assert.equal((await committer.commit({ plan: rollback })).ok, false, 'late persistence failure is returned by the real committer');
  failSettle = false;
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='rollback-cs'")).rows[0].count, '0');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_command_idempotency WHERE id='rollback-idem'")).rows[0].count, '0', 'failed write rolls back both change set and leased idempotency row');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_visible_packages WHERE package_id='visible-rollback-cs'")).rows[0].count, '0', 'failed write rolls back the factual presentation package');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_narration_jobs WHERE package_id='visible-rollback-cs'")).rows[0].count, '0', 'failed write rolls back its narration job');

  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'p16',
    password: 'p16',
    database: 'p16',
    max: 2
  });
  const concurrentCommitter = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    now: () => later,
    recheck: async () => ({ ok: true })
  });
  const concurrentA = await makePlan({
    planId: 'concurrent-plan-a',
    idempotencyId: 'concurrent-idem-a',
    idempotencyKey: 'concurrent-key',
    changeSetId: 'concurrent-cs-a'
  });
  const concurrentB = await makePlan({
    planId: 'concurrent-plan-b',
    idempotencyId: 'concurrent-idem-b',
    idempotencyKey: 'concurrent-key',
    changeSetId: 'concurrent-cs-b'
  });
  const concurrentResults = await Promise.all([
    concurrentCommitter.commit({ plan: concurrentA }),
    concurrentCommitter.commit({ plan: concurrentB })
  ]);
  assert.equal(concurrentResults.filter((result) => result.ok).length, 1);
  assert.equal(
    concurrentResults.filter((result) => result.error?.code === 'idempotency_conflict').length,
    1
  );
  assert.equal(
    (await client.query(
      "SELECT count(*) FROM party_runtime.party_command_idempotency WHERE party_id='p' AND operation_kind='move' AND idempotency_key='concurrent-key'"
    )).rows[0].count,
    '1'
  );

  await client.query(`
    INSERT INTO party_runtime.party_g5_sites
      (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES
      ('g5-old','p','canonical','g4-existing','{"entity_kind":"canonical_g5","entity_id":"canonical-old"}','active',0,'seed','seed');
    INSERT INTO party_runtime.party_scene_baselines
      (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES
      ('baseline-old','p','g5_site','g5-old','canonical_template','{"entity_ref":{"entity_kind":"scene_template","entity_id":"template-old"},"authoring_version":"v1"}','trace-old','v1','${hex}','active',0,'seed','seed');
    INSERT INTO party_runtime.party_g6_instances
      (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES
      ('g6-old','p','baseline-old','{"entity_ref":{"entity_kind":"scene_template","entity_id":"template-old"},"authoring_version":"v1"}','entry','g5_site','g5-old','spatial.g6.open','entry','surface','none','default_clear','near','uniform','active',0,'seed','seed');
    INSERT INTO party_runtime.scene_position_nodes
      (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES
      ('position-old','p','g6-old','scene_position.central','arrival',0,10,'open','active',0,'seed','seed');
    INSERT INTO party_runtime.party_journey_locations
      (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,state_version,updated_change_set_id)
    VALUES
      ('location-actor','p','actor','actor-1','scene','position-old',0,'seed');
  `);
  const preparedScene = {
    g4_id: 'g4-existing',
    g5_site_id: 'g5-new',
    g5_origin: 'generated',
    scene_baseline_id: 'baseline-new',
    g6_instance_id: 'g6-new',
    position_id: 'position-new',
    scene_template_ref: { entity_ref: { entity_kind: 'scene_template', entity_id: 'scene-new' }, authoring_version: 'v1' },
    materialization_profile_ref: { entity_ref: { entity_kind: 'scene_materialization_profile', entity_id: 'profile-new' }, authoring_version: 'v1' },
    catalog_digest: hex,
    materializer_version: 'v1',
    dependency_pins: {},
    canonical_digest: hex
  };
  await client.query(
    `INSERT INTO party_runtime.preparation_snapshots
       (id,party_id,planning_request_id,planning_request_digest,immutable_members_digest,canonical_digest,created_at_turn,created_change_set_id)
     VALUES ('preparation-snapshot-1','p','planning-request-1',$1,$1,$1,0,'seed')`,
    [hex]
  );
  await client.query(
    `INSERT INTO party_runtime.preparation_snapshot_members
       (preparation_snapshot_id,ordinal,member_kind,source_authoring_ref,prepared_scene_materialization,dependency_pins,share_mode,member_digest)
     VALUES ('preparation-snapshot-1',0,'transfer_scene','{}',$2,'{}','execution_exclusive',$1)`,
    [hex, JSON.stringify(preparedScene)]
  );
  await client.query('BEGIN');
  await client.query(
    `INSERT INTO party_runtime.party_route_plans
       (id,party_id,journey_owner_ref,journey_scope,request_kind,planning_request_id,path_query_digest,option_id,
        knowledge_scope,source_endpoint_snapshot,target_request,resolved_factual_target_ref,target_resolution_dependency_pins,
        world_revision_id,catalog_digest,planning_algorithm_version,planning_state_version,planning_context_dependency_pins,
        preparation_snapshot_id,preparation_snapshot_digest,canonical_serialization_digest,status,lifecycle_state_version,
        created_change_set_id,lifecycle_change_set_id,created_at_turn)
     VALUES
       ('route-plan-first-entry','p','{}','world_travel','ordinary','planning-request-1',$1,'option-1',
        'factual','{}','{}','{}','{}','w',$1,'v1',0,'{}',
        'preparation-snapshot-1',$1,$1,'ready',1,'seed','seed',0)`,
    [hex]
  );
  await client.query(
    `INSERT INTO party_runtime.party_route_plan_steps
       (route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,arrival_endpoint_snapshot,static_contract_snapshot)
     VALUES ('route-plan-first-entry',0,'timed_traversal','{}','{}','{"snapshot_kind":"timed_traversal"}')`
  );
  await client.query(
    `INSERT INTO party_runtime.party_route_plan_executions
       (id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,current_step_ordinal,current_endpoint_ref,state_version,updated_change_set_id)
     VALUES ('route-execution-first-entry','p','route-plan-first-entry','{}','world_travel','planned',0,'{}',1,'seed')`
  );
  await client.query(
    `INSERT INTO party_runtime.preparation_claims
       (id,preparation_snapshot_id,preparation_member_ordinal,route_plan_execution_id,claim_status,state_version,reserved_change_set_id)
     VALUES ('preparation-claim-first-entry','preparation-snapshot-1',0,'route-execution-first-entry','reserved',1,'seed')`
  );
  await client.query(
    `INSERT INTO party_runtime.party_route_plan_execution_events
       (execution_id,event_ordinal,event_kind,to_status,step_ordinal,location_snapshot,causal_result_ref,change_set_id,idempotency_record_id,occurred_at_turn)
     VALUES ('route-execution-first-entry',0,'planned','planned',0,'{}',NULL,'seed','seed-idempotency',0)`
  );
  await client.query('COMMIT');
  const generatedSceneInserts = [
    {
      target_table: 'party_g5_sites',
      id: 'g5-new',
      record: {
        id: 'g5-new', party_id: 'p', origin: 'generated',
        parent_g4_id: 'g4-existing', canonical_g5_ref: null,
        generated_template_ref: { entity_ref: { entity_kind: 'g5_template', entity_id: 'generated-site' }, authoring_version: 'v1' },
        expansion_slot_ref: { entity_ref: { entity_kind: 'expansion_slot', entity_id: 'slot-1' }, authoring_version: 'v1' },
        source_frontier_id: 'frontier-1', generation_ordinal: 0,
        direction_context_id: null, continuation_chain_id: null,
        continuation_ordinal: null, status: 'active', state_version: 0,
        created_change_set_id: 'first-entry-cs', updated_change_set_id: 'first-entry-cs',
        terminal_change_set_id: null, superseded_by_site_id: null
      }
    },
    {
      target_table: 'party_scene_baselines',
      id: 'baseline-new',
      record: {
        id: 'baseline-new', party_id: 'p', host_kind: 'g5_site',
        host_id: 'g5-new', source_kind: 'generated_template',
        scene_template_ref: { entity_ref: { entity_kind: 'scene_template', entity_id: 'scene-new' }, authoring_version: 'v1' },
        materialization_trace_id: 'trace-new', materializer_version: 'v1',
        catalog_digest: hex, status: 'active', state_version: 0,
        created_change_set_id: 'first-entry-cs', updated_change_set_id: 'first-entry-cs',
        terminal_change_set_id: null
      }
    },
    {
      target_table: 'party_g6_instances',
      id: 'g6-new',
      record: {
        id: 'g6-new', party_id: 'p', scene_baseline_id: 'baseline-new',
        source_scene_template_ref: { entity_ref: { entity_kind: 'scene_template', entity_id: 'scene-new' }, authoring_version: 'v1' },
        scene_slot_key: 'entry', enclosing_stable_structure_id: null,
        host_kind: 'g5_site', host_id: 'g5-new',
        physical_class_id: 'spatial.g6.open', primary_scene_role_id: 'entry',
        vertical_context_id: 'surface', overhead_cover_id: 'none',
        intra_g6_visibility_mode: 'default_clear',
        default_visibility_distance_band: 'near',
        acoustic_uniformity: 'uniform', status: 'active', state_version: 0,
        created_change_set_id: 'first-entry-cs', updated_change_set_id: 'first-entry-cs',
        terminal_change_set_id: null
      }
    },
    {
      target_table: 'scene_position_nodes',
      id: 'position-new',
      record: {
        id: 'position-new', party_id: 'p', g6_instance_id: 'g6-new',
        position_type_id: 'scene_position.central', template_slot_key: 'arrival',
        template_instance_ordinal: 0, stable_basis_ref: null, capacity: 10,
        access_class_id: 'open', light_profile_ref: null, hazard_profile_ref: null,
        status: 'active', state_version: 0,
        created_change_set_id: 'first-entry-cs', updated_change_set_id: 'first-entry-cs',
        terminal_change_set_id: null
      }
    }
  ];
  const generatedSceneInsertsFor = (changeSetId) => generatedSceneInserts.map((write) => ({
    ...write,
    record: {
      ...write.record,
      created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId
    }
  }));
  const materializationScopeKey = 'party_runtime.party_scene_baselines:baseline-new';
  const physicalFirstEntryRecheck = firstEntryPhysicalRecheck();
  const firstEntryRechecks = ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
    .map((kind) => ({
      kind,
      digest: `sha256:${hex}`,
      ...(kind === 'physical' ? physicalFirstEntryRecheck : {})
    }));
  const firstEntry = await makePlan({
    planId: 'first-entry-plan',
    idempotencyId: 'first-entry-idem',
    idempotencyKey: 'first-entry-key',
    changeSetId: 'first-entry-cs',
    operationKind: 'first_entry',
    inserts: generatedSceneInserts,
    updates: [
      {
        target_table: 'party_journey_locations',
        id: 'location-actor',
        record: {
          id: 'location-actor', party_id: 'p', owner_kind: 'actor',
          owner_id: 'actor-1', location_kind: 'scene',
          scene_position_id: 'position-new', transit_anchor_id: null,
          travel_state_id: null, updated_change_set_id: 'first-entry-cs'
        }
      },
      {
        target_table: 'preparation_claims',
        id: 'preparation-claim-first-entry',
        record: {
          id: 'preparation-claim-first-entry',
          claim_status: 'consumed',
          terminal_change_set_id: 'first-entry-cs'
        }
      }
    ],
    expectedStateVersions: [
      {
        target_table: 'party_journey_locations',
        id: 'location-actor',
        state_version: 0
      },
      {
        target_table: 'preparation_claims',
        id: 'preparation-claim-first-entry',
        state_version: 1
      }
    ],
    ownerKeys: ['actor:actor-1'],
    executionKeys: ['route-execution:first-entry'],
    g4Keys: ['p:g4-existing'],
    physicalKeys: [
      ...generatedSceneInserts.map((write) => `party_runtime.${write.target_table}:${write.id}`),
      'party_runtime.party_journey_locations:location-actor',
      'party_runtime.preparation_claims:preparation-claim-first-entry'
    ],
    commitRechecks: firstEntryRechecks
  });
  const firstEntryB = await makePlan({
    planId: 'first-entry-plan-b',
    idempotencyId: 'first-entry-idem-b',
    idempotencyKey: 'first-entry-key-b',
    changeSetId: 'first-entry-cs-b',
    operationKind: 'first_entry',
    inserts: generatedSceneInsertsFor('first-entry-cs-b'),
    updates: [
      {
        target_table: 'party_journey_locations',
        id: 'location-actor',
        record: {
          id: 'location-actor', party_id: 'p', owner_kind: 'actor',
          owner_id: 'actor-1', location_kind: 'scene',
          scene_position_id: 'position-new', transit_anchor_id: null,
          travel_state_id: null, updated_change_set_id: 'first-entry-cs-b'
        }
      },
      {
        target_table: 'preparation_claims',
        id: 'preparation-claim-first-entry',
        record: {
          id: 'preparation-claim-first-entry',
          claim_status: 'consumed',
          terminal_change_set_id: 'first-entry-cs-b'
        }
      }
    ],
    expectedStateVersions: [
      {
        target_table: 'party_journey_locations',
        id: 'location-actor',
        state_version: 0
      },
      {
        target_table: 'preparation_claims',
        id: 'preparation-claim-first-entry',
        state_version: 1
      }
    ],
    ownerKeys: ['actor:actor-1'],
    executionKeys: ['route-execution:first-entry'],
    g4Keys: ['p:g4-existing'],
    physicalKeys: [
      ...generatedSceneInserts.map((write) => `party_runtime.${write.target_table}:${write.id}`),
      'party_runtime.party_journey_locations:location-actor',
      'party_runtime.preparation_claims:preparation-claim-first-entry'
    ],
    commitRechecks: firstEntryRechecks
  });
  const firstEntryConcurrentCommitter = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    now: () => later,
    recheck: fullRecheck
  });
  const concurrentFirstEntryResults = await Promise.all([
    firstEntryConcurrentCommitter.commit({ plan: firstEntry }),
    firstEntryConcurrentCommitter.commit({ plan: firstEntryB })
  ]);
  const successfulFirstEntries = concurrentFirstEntryResults
    .map((result, index) => ({
      result,
      plan: index === 0 ? firstEntry : firstEntryB,
      idempotencyKey: index === 0 ? 'first-entry-key' : 'first-entry-key-b',
      changeSetId: index === 0 ? 'first-entry-cs' : 'first-entry-cs-b'
    }))
    .filter(({ result }) => result.ok);
  const rejectedFirstEntries = concurrentFirstEntryResults.filter((result) => !result.ok);
  assert.equal(successfulFirstEntries.length, 1, JSON.stringify(concurrentFirstEntryResults));
  assert.equal(rejectedFirstEntries.length, 1, JSON.stringify(concurrentFirstEntryResults));
  assert.ok(
    ['target_preparation_failed', 'state_version_conflict'].includes(rejectedFirstEntries[0].error.code),
    JSON.stringify(rejectedFirstEntries[0])
  );
  const [{
    result: firstEntryResult,
    plan: winningFirstEntryPlan,
    idempotencyKey: winningFirstEntryKey,
    changeSetId: winningFirstEntryChangeSetId
  }] = successfulFirstEntries;
  assert.ok(firstEntryResult.lock_keys.includes('04:g4:p:g4-existing'));
  assert.ok(firstEntryResult.lock_keys.includes(`05:physical:${materializationScopeKey}`));
  assert.ok(firstEntryResult.lock_keys.includes(
    `06:idempotency:p:first_entry:${winningFirstEntryKey}`
  ));
  assert.deepEqual(
    (await client.query("SELECT location_kind,scene_position_id,state_version FROM party_runtime.party_journey_locations WHERE id='location-actor'")).rows[0],
    { location_kind: 'scene', scene_position_id: 'position-new', state_version: '1' }
  );
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_scene_baselines WHERE id='baseline-new'")).rows[0].count, '1');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_g6_instances WHERE id='g6-new'")).rows[0].count, '1');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.scene_position_nodes WHERE id='position-new'")).rows[0].count, '1');
  assert.deepEqual(
    (await client.query("SELECT claim_status,state_version,terminal_change_set_id FROM party_runtime.preparation_claims WHERE id='preparation-claim-first-entry'")).rows[0],
    {
      claim_status: 'consumed',
      state_version: '2',
      terminal_change_set_id: winningFirstEntryChangeSetId
    }
  );
  assert.equal(
    (await firstEntryConcurrentCommitter.commit({ plan: winningFirstEntryPlan })).replay,
    true
  );
});
