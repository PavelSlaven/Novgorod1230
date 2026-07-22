import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3CombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';

const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 45_000 });
const name = `p16-node-${process.pid}`;
const hex = 'a'.repeat(64);
const later = new Date('2030-01-01T00:00:00.000Z');

async function makePlan({ planId, idempotencyId, idempotencyKey, changeSetId, canonicalInputDigest = `sha256:${hex}`, expectedStateVersions = [], updates = [], extraAppends = [], physicalKeys = [] }) {
  const appends = [{
    target_table: 'party_v3_change_sets', id: changeSetId,
    record: { id: changeSetId, party_id: 'p', operation_kind: 'move', idempotency_record_id: idempotencyId, expected_state_version_set_digest: 'expected', expected_state_version_set: [], committed_state_version_set_digest: 'committed', write_plan_digest: `${changeSetId}-write`, created_at_turn: 0, committed_at_turn: 0 }
  }, ...extraAppends];
  const built = await buildCombinedWritePlan({
    plan_id: planId, party_id: 'p', write_plan_kind: 'semantic_commit', operation_kind: 'move', canonical_input_digest: canonicalInputDigest,
    expected_state_versions: expectedStateVersions, validation_report: { status: 'pass', digest: `sha256:${hex}` },
    idempotency: { id: idempotencyId, key: idempotencyKey }, change_set: { id: changeSetId },
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [], physical_keys: [`party_runtime.party_v3_change_sets:${changeSetId}`, ...physicalKeys] },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: `sha256:${hex}` })),
    approved_write_sets: [{ inserts: [], updates, appends }]
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.plan;
}

function transactionOwner(client, lockKeys) {
  return async (work) => {
    await client.query('BEGIN');
    try {
      const result = await work({ query: async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) lockKeys.push(params[0]);
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
  if (docker(['version']).status !== 0) t.skip('Docker required');
  t.after(() => docker(['rm', '-f', name]));
  assert.equal(docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name, '-e', 'POSTGRES_PASSWORD=p16', '-e', 'POSTGRES_USER=p16', '-e', 'POSTGRES_DB=p16', 'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((done) => setTimeout(done, 300));
    if (docker(['exec', name, 'pg_isready', '-U', 'p16', '-d', 'p16']).status === 0) { ready = true; break; }
  }
  assert.equal(ready, true, 'isolated PostgreSQL must become ready');
  await new Promise((done) => setTimeout(done, 500));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)?.[1]);
  const client = new pg.Client({ host: '127.0.0.1', port, user: 'p16', password: 'p16', database: 'p16' });
  await client.connect();
  t.after(() => client.end());
  for (const file of ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql']) await client.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  await client.query("INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest) VALUES ('p',3,'w','d','m','r','c','b'); INSERT INTO party_runtime.party_clocks(party_id,whole_minutes,subminute_numerator,subminute_denominator,clock_owner_kind,state_version,updated_change_set_id) VALUES ('p',0,0,1,'party',1,'old');");

  const locks = [];
  let rechecks = 0;
  const committer = createSpatialV3CombinedAtomicCommitter({
    now: () => later,
    recheck: async () => { rechecks += 1; return { ok: true }; },
    withTransaction: transactionOwner(client, locks)
  });

  const first = await makePlan({
    planId: 'p1', idempotencyId: 'idem', idempotencyKey: 'key', changeSetId: 'cs',
    expectedStateVersions: [{ target_table: 'party_clocks', id: 'p', state_version: 1 }],
    updates: [{ target_table: 'party_clocks', id: 'p', record: { party_id: 'p', whole_minutes: 0, subminute_numerator: 0, subminute_denominator: 1, clock_owner_kind: 'party', clock_owner_id: null, updated_change_set_id: 'cs' } }],
    physicalKeys: ['party_runtime.party_clocks:p']
  });
  assert.equal((await committer.commit({ plan: first })).ok, true);
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
    planId: 'rollback-plan', idempotencyId: 'rollback-idem', idempotencyKey: 'rollback-key', changeSetId: 'rollback-cs',
    extraAppends: [{ target_table: 'party_route_plan_execution_events', id: 'missing-exec:0', record: { execution_id: 'missing-exec', event_ordinal: 0, event_kind: 'planned', to_status: 'planned', step_ordinal: 0, location_snapshot: {}, change_set_id: 'rollback-cs', idempotency_record_id: 'rollback-idem', occurred_at_turn: 0 } }],
    physicalKeys: ['party_runtime.party_route_plan_execution_events:missing-exec:0']
  });
  assert.equal((await committer.commit({ plan: rollback })).ok, false, 'foreign-key failure is returned by the real committer');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_v3_change_sets WHERE id='rollback-cs'")).rows[0].count, '0');
  assert.equal((await client.query("SELECT count(*) FROM party_runtime.party_command_idempotency WHERE id='rollback-idem'")).rows[0].count, '0', 'failed write rolls back both change set and leased idempotency row');
});
