import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { newDb, DataType } from 'pg-mem';
import {
  createPostgresPools,
  runPartyRuntimeMigrations,
  createPostgresSessionStore,
  createPostgresWorldBaseReader,
  createPostgresStage25Ports,
  createPostgresPartyStore,
  createProductionLlmRoleRunner
} from '@rus/game-server/production-v2-migration-source';
import {
  createProductionV2RollbackSourceRoot
} from '../../apps/game-server/src/composition/production-v2-rollback-source.js';
import { buildPartyRuntimeV2WritePlan } from '@rus/new-game/stages/stage-24/compat';
import { materializeStage25PhysicalPlan } from '@rus/new-game/stages/stage-25/compat';
import { canonicalDigest, issueBoundedDecisionRequest, materializeWorldInstances, repairWorldInstances, validateBoundedDecisionResult } from '@rus/materialization';
import { createAutonomousUpdateRegistry, createTurnCommandRegistry, runAutonomousUpdates, runTurnWorkflow } from '@rus/turn';
import { buildPersistencePlanStage } from '../../packages/turn/src/stages/persistence-plan.js';
import { makeStage24Fixture } from '../fixtures/stage24-fixtures.mjs';

function createMemoryPostgres() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'rus_test' });
  db.public.registerFunction({ name: 'current_user', returns: DataType.text, implementation: () => 'rus_test_user' });
  const { Pool } = db.adapters.createPg();
  return { db, Pool };
}

async function installRuntimeCatalogPinTables(pool) {
  // Exact DDL, constraints and immutability triggers are exercised in the
  // PostgreSQL 16 migration suite. pg-mem needs only the SQL-plan target shape.
  await pool.query(`CREATE TABLE party_runtime.party_catalog_pins (
    party_id TEXT NOT NULL, catalog_scope TEXT NOT NULL, catalog_revision_id TEXT NOT NULL,
    catalog_digest TEXT NOT NULL, import_id TEXT NOT NULL, import_audit_digest TEXT NOT NULL,
    record_registry_digest TEXT NOT NULL, runtime_contract_digest TEXT NOT NULL,
    compatible_world_revision_id TEXT NOT NULL, compatible_world_catalog_digest TEXT NOT NULL,
    compatible_world_pin_manifest_digest TEXT NOT NULL, activation_event_id TEXT NOT NULL,
    PRIMARY KEY (party_id,catalog_scope)
  )`);
  await pool.query(`CREATE TABLE party_runtime.party_materialization_run_catalog_pins (
    party_id TEXT NOT NULL, run_id TEXT NOT NULL, catalog_scope TEXT NOT NULL,
    catalog_revision_id TEXT NOT NULL, catalog_digest TEXT NOT NULL, import_id TEXT NOT NULL,
    import_audit_digest TEXT NOT NULL, record_registry_digest TEXT NOT NULL,
    runtime_contract_digest TEXT NOT NULL, activation_event_id TEXT NOT NULL,
    PRIMARY KEY (party_id,run_id,catalog_scope)
  )`);
}

async function createProviderServer(t) {
  const calls = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    calls.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { total_tokens: 3 } }));
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, calls };
}

test('production PostgreSQL adapters persist sessions, enforce world read-only, and execute Stage 25 transactions', async () => {
  const { Pool } = createMemoryPostgres();
  const pools = createPostgresPools({
    env: { RUS_WORLD_DATABASE_URL: 'postgres://memory', RUS_PARTY_DATABASE_URL: 'postgres://memory' },
    PoolClass: Pool
  });
  await runPartyRuntimeMigrations(pools.partyPool);
  await pools.worldPool.query('CREATE SCHEMA world_base');
  await pools.worldPool.query('CREATE TABLE world_base.integration_probe (id text primary key, title text not null)');
  await pools.worldPool.query("INSERT INTO world_base.integration_probe (id, title) VALUES ('probe-1', 'Новгород')");
  await pools.partyPool.query('CREATE TABLE party_state (id text primary key, status text not null, audit_state jsonb)');

  const sessions = createPostgresSessionStore({ pool: pools.partyPool });
  await pools.partyPool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status)
    VALUES ('party-1',2,'revision-1','catalog-1','code_materializer_v2','mulberry32_v1','commands-1','profiles-1','active')`);
  await sessions.save('party-1', { version: 2, schema: 'game_server_session_v2', party_id: 'party-1', request_id: 'request-1', turn_number: 0, screen: { schema: 'first_game_screen' } });
  assert.equal((await sessions.load('party-1')).party_id, 'party-1');

  const world = createPostgresWorldBaseReader({ pool: pools.worldPool });
  const read = await world.read('SELECT id, title FROM world_base.integration_probe WHERE id = $1', ['probe-1']);
  assert.equal(read.rows[0].title, 'Новгород');
  await assert.rejects(() => world.read("UPDATE world_base.integration_probe SET title = 'X'", []), /read-only/u);

  const ports = createPostgresStage25Ports({
    pool: pools.partyPool,
    postcommitProjector: async ({ input }) => ({ version: 1, schema: 'test_postcommit', request_id: input.request_id })
  });
  const physicalPlan = {
    transaction: { transaction_id: 'tx-1', write_order: ['state'] },
    write_batches: [{
      batch_id: 'state', target_table: 'party_state', operation_mode: 'upsert_with_idempotency',
      records: [{ id: 'party-1', status: 'active', audit_state: { current_phase: 'awaiting_player_input' } }]
    }]
  };
  const common = {
    request_id: 'req-1', physical_write_plan: physicalPlan, physical_write_plan_digest: 'sha256:plan',
    party_creation_context: { party_id: 'party-1', idempotency_key: 'idem-1', payload_hash: 'sha256:payload' }
  };
  const dryRun = await ports.dryRunExecutor(common);
  assert.equal(dryRun.pass, true);
  assert.equal(dryRun.rollback_completed, true);
  await pools.partyPool.query('DELETE FROM party_state'); // pg-mem does not model transaction rollback; live PostgreSQL does.
  const committed = await ports.transactionExecutor({ ...common, postconditions: [{ check: 'party_ready' }] });
  assert.equal(committed.commit_status, 'committed');
  assert.equal((await pools.partyPool.query("SELECT status FROM party_state WHERE id = 'party-1'")).rows[0].status, 'active');
  await pools.close();
});

test('production provider adapter uses role runtime transport and exact HTTP payload', async (t) => {
  const provider = await createProviderServer(t);
  const runner = createProductionLlmRoleRunner({
    env: { DEEPSEEK_API_KEY: 'test-key', DEEPSEEK_BASE_URL: provider.baseUrl, TURN_INTENT_ROUTER_MODEL: 'fixture-model' }
  });
  const result = await runner.run({
    scope: 'turn_runtime', role_id: 'intent_router', messages: [{ role: 'user', content: 'route' }], overrides: { maxTokens: 64 }
  });
  assert.deepEqual(result.output, { ok: true });
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].url, '/chat/completions');
  assert.equal(provider.calls[0].authorization, 'Bearer test-key');
  assert.equal(provider.calls[0].body.model, 'fixture-model');
  assert.equal(provider.calls[0].body.max_tokens, 64);
});

test('production Stage 25 ports execute the actual Stage 24 party_runtime_v2 plan', async () => {
  const { Pool } = createMemoryPostgres();
  const pool = new Pool();
  await runPartyRuntimeMigrations(pool);
  await installRuntimeCatalogPinTables(pool);
  const fixture = makeStage24Fixture();
  const input = structuredClone(fixture.input);
  input.party_creation_context.party_id = 'party-stage25-production-path';
  input.party_creation_context.idempotency_key = 'idem-stage25-production-path';
  input.approved_pipeline_outputs.g5_scene_graph.materialization_run.seed_context.party_id = input.party_creation_context.party_id;
  const logicalPlan = buildPartyRuntimeV2WritePlan(input);
  const partyDatabaseSchema = {
    version: 1, schema: 'party_database_schema_snapshot', schema_version: 'party_runtime_v2',
    allowed_operations: ['insert_only'],
    tables: logicalPlan.write_batches.map((batch) => ({
      name: batch.target_table, allowed_operations: ['insert_only'],
      columns: [...new Set(batch.records.flatMap((record) => Object.keys(record)))].map((name) => ({ name, nullable: true }))
    })), foreign_keys: [], unique_constraints: [], check_constraints: [], enum_definitions: []
  };
  const physical = materializeStage25PhysicalPlan({ logical_plan: logicalPlan, party_database_schema: partyDatabaseSchema, world_base_reference_snapshot: {} });
  const ports = createPostgresStage25Ports({ pool, postcommitProjector: async () => ({}) });
  const result = await ports.transactionExecutor({
    request_id: input.request_id, physical_write_plan: physical.physical_write_plan,
    physical_write_plan_digest: physical.physical_write_plan_digest,
    party_creation_context: { ...input.party_creation_context, payload_hash: 'payload-stage25-production-path' },
    postconditions: logicalPlan.postconditions
  });
  assert.equal(result.pass, true, result.rollback?.reason);
  assert.equal((await pool.query("SELECT status FROM party_runtime.parties WHERE party_id='party-stage25-production-path'")).rows[0].status, 'active');
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM party_runtime.party_g5_anchors WHERE party_id='party-stage25-production-path'")).rows[0].count, 1);
  await pool.end();
});

test('production first-entry repository locks the party/G4 key before baseline lookup', async () => {
  const calls = [];
  const transaction = { async query(sql, params) { calls.push({ sql, params }); return { rows: [] }; } };
  const store = createPostgresPartyStore({ pool: { connect: async () => transaction }, catalogBundleLoader: async () => ({}) });
  await store.loadCommittedBaseline({ partyId: 'party-lock-1', g4Id: 'g4-lock-1', transaction });
  assert.match(calls[0].sql, /pg_advisory_xact_lock/u);
  assert.deepEqual(calls[0].params, ['party:party-lock-1:g4:g4-lock-1']);
  assert.match(calls[1].sql, /party_materialization_runs/u);
});

test('production first-entry repository fails closed on unsupported materializer pins', async () => {
  let catalogCalls = 0;
  const transaction = { async query() { return { rows: [{ party_id:'party-pin',schema_version:2,world_revision_id:'rev',world_catalog_digest:'catalog',materializer_version:'future_materializer',rng_version:'mulberry32_v1',state_version:0 }] }; } };
  const store = createPostgresPartyStore({ pool: { connect: async () => transaction }, catalogBundleLoader: async () => { catalogCalls += 1; return {}; } });
  await assert.rejects(() => store.buildMaterializationRequest({ partyId:'party-pin',g4Id:'g4',trigger:'first_entry',transaction }), (error) => error.code === 'MATERIALIZER_VERSION_PIN_MISMATCH');
  assert.equal(catalogCalls, 0);
});

test('production first-entry repository commits the generic materializer proposed write set', async () => {
  const { Pool } = createMemoryPostgres();
  const pool = new Pool();
  await runPartyRuntimeMigrations(pool);
  await installRuntimeCatalogPinTables(pool);
  const partyId = 'party-generic-materializer-path';
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status)
    VALUES ($1,2,'revision-generic','catalog-generic','code_materializer_v2','mulberry32_v1','commands-generic','profiles-generic','active')`, [partyId]);
  const catalog_bundle = {
    player_start_anchor_slot_key: 'entry',
    rules: [
      { rule_id: 'node-rule', slot_key: 'main', domain: 'g5_node', min_count: 1, max_count: 1, candidate_ids: ['node-candidate'] },
      { rule_id: 'anchor-rule', slot_key: 'entry', domain: 'g5_anchor', min_count: 1, max_count: 1, candidate_ids: ['anchor-candidate'] },
      { rule_id: 'npc-rule', slot_key: 'yard', domain: 'npc', min_count: 1, max_count: 1, candidate_ids: ['npc-candidate'] }
    ],
    candidates: [
      { candidate_id: 'node-candidate', domain: 'g5_node', status: 'approved', weight: 1, template_id: 'node-template', attributes: { access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: {} } },
      { candidate_id: 'anchor-candidate', domain: 'g5_anchor', status: 'approved', weight: 1, template_id: 'anchor-template', attributes: { g5_node_slot_key: 'main', npc_capacity: 2, item_capacity: 2, container_capacity: 1, access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: {} } },
      { candidate_id: 'npc-candidate', domain: 'npc', status: 'approved', weight: 1, profile_id: 'npc-profile', attributes: { profile_level: 'background', anchor_slot_key: 'entry', identity_state: { visibility: 'anonymous' }, machine_state: { mode: 'idle' }, presence_reason: 'approved_place_function', access_state: { access: 'present' }, visibility_state: { visibility: 'visible' }, causal_basis: { type: 'regional_profile' } } }
    ]
  };
  const scope = { status:'approved',world_revision_id:'revision-generic',region_id:'region-generic',valid_from_year:1200,valid_to_year:1300,allowed_seasons:['spring'] };
  catalog_bundle.rules = catalog_bundle.rules.map((record) => ({ ...scope, ...record }));
  catalog_bundle.candidates = catalog_bundle.candidates.map((record) => ({ ...scope, ...record, attributes: { ...record.attributes, ...(record.domain === 'g5_node' || record.domain === 'g5_anchor' ? { state: { state_version: 1 } } : {}), ...(record.domain === 'g5_anchor' ? { entry_role: 'start_and_exit' } : {}), ...(record.domain === 'npc' ? { causal_basis: { causal_basis_type:'regional_profile',causal_basis_id:'npc-rule' } } : {}) } }));
  const domainCatalogDigest = canonicalDigest(catalog_bundle);
  await pool.query(`INSERT INTO party_runtime.party_catalog_pins
    (party_id,catalog_scope,catalog_revision_id,catalog_digest,import_id,import_audit_digest,
     record_registry_digest,runtime_contract_digest,compatible_world_revision_id,
     compatible_world_catalog_digest,compatible_world_pin_manifest_digest,activation_event_id)
    VALUES ($1,'item_container_materialization_v2','domain-generic',$2,'import-generic',$3,$4,$5,
            'revision-generic','catalog-generic',$6,'activation-generic')`,
  [partyId, domainCatalogDigest, 'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)]);
  const materialization = materializeWorldInstances({
    version: 2, schema: 'world_materialization_request_v2', party_id: partyId, run_id: 'run-generic', world_revision_id: 'revision-generic', region_id:'region-generic',
    historical_frame: { calendar: { year: 1230, season:'spring' } }, g1_id: 'g1-generic', g4_id: 'g4-generic', trigger: 'first_entry', occurrence: 0,
    materializer_version: 'code_materializer_v2', rng_algorithm_id: 'mulberry32_v1',
    seed_context: { party_id: partyId, world_revision_id: 'revision-generic', g1_id: 'g1-generic', g4_id: 'g4-generic', trigger: 'first_entry', occurrence: 0, materializer_version: 'code_materializer_v2', rng_algorithm_id: 'mulberry32_v1' },
    existing_party_state: { state_version: 0, baseline_exists: false }, catalog_bundle, catalog_digest: domainCatalogDigest
  });
  const store = createPostgresPartyStore({ pool, catalogBundleLoader: async () => ({}) });
  await store.transact((transaction) => store.commitMaterializationAndMovement({ partyId, g4Id: 'g4-generic', materialization, writePlan: {}, idempotencyKey:'turn:generic:first-entry' }, { transaction }));
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM party_runtime.party_materialization_runs WHERE party_id=$1 AND status='committed'", [partyId])).rows[0].count, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_g5_anchors WHERE party_id=$1', [partyId])).rows[0].count, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_npcs WHERE party_id=$1', [partyId])).rows[0].count, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_materialization_run_catalog_pins WHERE party_id=$1 AND run_id=$2', [partyId, materialization.run_id])).rows[0].count, 1);
  const replacementRequest = { version: 2, schema: 'world_materialization_request_v2', party_id: partyId, run_id: 'run-generic-repair', world_revision_id: 'revision-generic', region_id:'region-generic', historical_frame: { calendar: { year: 1230, season:'spring' } }, g1_id: 'g1-generic', g4_id: 'g4-generic', trigger: 'expansion', occurrence: 1, materializer_version: 'code_materializer_v2', rng_algorithm_id: 'mulberry32_v1', seed_context: { party_id: partyId, world_revision_id: 'revision-generic', g1_id: 'g1-generic', g4_id: 'g4-generic', trigger: 'expansion', occurrence: 1, materializer_version: 'code_materializer_v2', rng_algorithm_id: 'mulberry32_v1' }, existing_party_state: { state_version: 0, baseline_exists: true }, catalog_bundle, catalog_digest: canonicalDigest(catalog_bundle) };
  const repaired = repairWorldInstances({ version: 2, schema: 'world_materialization_repair_request_v2', repair_reason: 'approved repair', previous_result: materialization, previous_result_digest: materialization.trace.result_digest, replacement_request_digest: canonicalDigest(replacementRequest), repair_history: [{ previous_run_id: materialization.run_id }], replacement_request: replacementRequest });
  const repairedCommit = await store.commitMaterializationRepair({ partyId, g4Id:'g4-generic', previousRunId:materialization.run_id, previousResultDigest:materialization.trace.result_digest, materialization:repaired, idempotencyKey:'repair:generic:1' });
  assert.equal(repairedCommit.repaired, true);
  assert.equal((await store.commitMaterializationRepair({ partyId, g4Id:'g4-generic', previousRunId:materialization.run_id, previousResultDigest:materialization.trace.result_digest, materialization:repaired, idempotencyKey:'repair:generic:1' })).replayed, true);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM party_runtime.party_materialization_runs WHERE party_id=$1 AND run_kind='repair' AND supersedes_run_id=$2", [partyId, materialization.run_id])).rows[0].count, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_materialization_run_catalog_pins WHERE party_id=$1', [partyId])).rows[0].count, 2);
  await assert.rejects(() => store.commitMaterializationRepair({ partyId, g4Id:'g4-generic', previousRunId:materialization.run_id, previousResultDigest:'0'.repeat(64), materialization:repaired, idempotencyKey:'repair:generic:tampered' }), (error) => error.code === 'MATERIALIZATION_REPAIR_IDENTITY_MISMATCH');
  await pool.end();
});

test('production turn commit persists bounded trace, advances state atomically and enforces replay/conflict/rollback/FKs', async () => {
  const { Pool } = createMemoryPostgres();
  const pool = new Pool();
  await runPartyRuntimeMigrations(pool);
  const insertParty = (partyId) => pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status)
    VALUES ($1,2,'revision','catalog','code_materializer_v2','mulberry32_v1','commands','profiles','active')`, [partyId]);
  await insertParty('party-turn');
  await pool.query("INSERT INTO party_runtime.party_state_snapshots (party_id,state_version,state_payload,state_digest) VALUES ('party-turn',0,'{\"unchanged_profile\":{\"name\":\"preserved\"}}','initial')");
  const request = issueBoundedDecisionRequest({ requestId: 'turn-decision-1', partyId: 'party-turn', actorId: 'party-turn', policyId: 'base_turn_command_selection', policyVersion: '2', stateVersion: 0, issuedAt: '2029-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:00:00.000Z', secret: 'secret', options: [
    { option_id: 'wait', command_id: 'wait', actor_id: 'party-turn', target_id: 'party-turn', preconditions: [], expected_cost: { kind: 'time', value: 1 }, known_risks: [], reason_visible_to_actor: 'Wait.', state_version: 0, metadata: {} },
    { option_id: 'observe', command_id: 'observe', actor_id: 'party-turn', target_id: 'party-turn', preconditions: [], expected_cost: { kind: 'time', value: 1 }, known_risks: [], reason_visible_to_actor: 'Observe.', state_version: 0, metadata: {} }
  ] });
  const raw = { version: 2, schema: 'bounded_decision_result_v2', request_id: request.request_id, state_version: 0, option_id: 'wait', command_token: request.options[0].command_token };
  const decision = validateBoundedDecisionResult({ request, result: raw, secret: 'secret', now: '2029-01-02T00:00:00.000Z', currentPolicyVersion: '2' });
  const makePlan = async (value, turnId = 'turn-1', baseStateVersion = 0, trace = { decision_protocol: 'code_singleton_v1' }) => {
    const registry = createTurnCommandRegistry([{ command_id: 'wait', matches: () => true, mode: {}, availability: () => ({}), consequence: () => ({}), writeTargets: () => [{ target: 'party_events', value }] }]);
    return buildPersistencePlanStage({ playerInput: { party_id: 'party-turn' }, retrievedState: { party_state: { state_version: baseStateVersion } }, commandRegistry: registry, modeResolution: { turn_id: turnId, command_id: 'wait', decision_trace: trace, resolution_plan: { expected_writes: ['party_events'] } }, availability: {}, consequence: {}, timeUpdate: {}, hiddenUpdate: {}, visibleContext: {}, narration: {} });
  };
  const plan = await makePlan({ event: 'waited' }, 'turn-1', 0, { decision_protocol: 'bounded_decision_v2', bounded_decision_trace: { request, result: decision, validation_report: { pass: true } } });
  const store = createPostgresPartyStore({ pool, catalogBundleLoader: async () => ({}) });
  const committed = await store.commit(plan, { idempotencyKey: 'turn-commit-1' });
  assert.equal(committed.committed, true);
  assert.equal((await pool.query("SELECT state_version FROM party_runtime.parties WHERE party_id='party-turn'")).rows[0].state_version, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM party_runtime.party_decision_results WHERE party_id='party-turn'")).rows[0].count, 1);
  const committedState = (await pool.query("SELECT state_payload FROM party_runtime.party_state_snapshots WHERE party_id='party-turn' AND state_version=1")).rows[0].state_payload;
  assert.deepEqual(committedState.unchanged_profile, { name: 'preserved' });
  assert.deepEqual(committedState.party_events, { event: 'waited' });
  const replay = await store.commit(plan, { idempotencyKey: 'turn-commit-1' });
  assert.equal(replay.replayed, true);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM party_runtime.party_state_snapshots WHERE party_id='party-turn'")).rows[0].count, 2);
  await assert.rejects(async () => store.commit(await makePlan({ event: 'different' }, 'turn-2', 1), { idempotencyKey: 'turn-commit-1' }), (error) => error.code === 'TURN_IDEMPOTENCY_CONFLICT');
  await assert.rejects(async () => store.commit(await makePlan({ event: 'stale' }, 'turn-stale', 0), { idempotencyKey: 'turn-stale' }));
  // pg-mem does not fully emulate rollback of a row written before a later
  // statement fails. The real-PostgreSQL suite verifies this invariant.
  await assert.rejects(() => store.commit({ party_id: 'party-turn', schema: 'party_turn_write_plan', write_targets: [{ target_table: 'party_items' }] }, { idempotencyKey: 'turn-forged' }), (error) => error.code === 'TURN_WRITE_PLAN_NOT_CODE_OWNED');

  await insertParty('party-other');
  await pool.query("INSERT INTO party_runtime.party_materialization_runs (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,materializer_version,rng_version,result_digest,idempotency_key,status) VALUES ('party-other','run-other','g4-other','baseline','seed','input','catalog','code_materializer_v2','mulberry32_v1','result','materialization:other','committed')");
  await pool.query("INSERT INTO party_runtime.party_g5_nodes (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key) VALUES ('party-other','node-other','run-other','g4-other','node-template','main')");
  await pool.query("INSERT INTO party_runtime.party_g5_anchors (party_id,anchor_id,g5_node_id,template_id,slot_key) VALUES ('party-other','anchor-other','node-other','anchor-template','start')");
  await assert.rejects(() => pool.query("INSERT INTO party_runtime.party_positions (party_id,g4_id,g5_node_id,g5_anchor_id) VALUES ('party-turn','g4-other','node-other','anchor-other')"));
  await pool.end();
});

test('runTurnWorkflow preserves the code-owned plan seal through the production repository', async () => {
  const { Pool } = createMemoryPostgres();
  const pool = new Pool();
  await runPartyRuntimeMigrations(pool);
  await pool.query("INSERT INTO party_runtime.parties (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status) VALUES ('party-e2e',2,'revision','catalog','code_materializer_v2','mulberry32_v1','commands','profiles','active')");
  await pool.query("INSERT INTO party_runtime.party_state_snapshots (party_id,state_version,state_payload,state_digest) VALUES ('party-e2e',0,'{\"existing\":true}','initial')");
  const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'Двор виден.', visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] };
  const store = createPostgresPartyStore({ pool, catalogBundleLoader: async () => ({}) });
  const commandRegistry = createTurnCommandRegistry([{ command_id: 'wait', matches: () => true, mode: { selected_primary_mode: 'attention', secondary_modes: [], resolution_plan: { subsystems: [], checks_to_run: [], state_blocks_to_load: ['party_state'], expected_writes: ['party_events'] } }, availability: () => ({ version: 1, schema: 'turn_availability_decision', status: 'available', can_attempt: true, reasons: [], check_requests: [] }), consequence: () => ({ version: 1, schema: 'turn_consequence_package', status: 'resolved', duration_minutes: 1, visible_seed: {}, hidden_update: {}, state_changes: [], suggested_actions: [] }), writeTargets: () => [{ target: 'party_events', value: { event: 'waited' } }] }]);
  const services = {
    commandRegistry,
    stateReader: { read: async () => ({ party_state: { party_id: 'party-e2e', state_version: 0 }, current_position: {}, clock_weather_light: { clock: { day: 1, hour: 1, minute: 0 }, weather: {}, light: {} }, visible_context: visible, character_knowledge_map: [], relevant_hidden_state: {}, relevant_events: [] }) },
    visibleProjector: { project: async () => visible },
    persistedVisibleReader: { read: async () => visible },
    semanticResolver: async () => ({ status: 'unknown' }),
    decisionSecret: 'production-infrastructure-test',
    decisionExpiresAt: '2030-01-01T00:05:00.000Z',
    narrator: { run: async ({ request_id: requestId }) => ({ version: 1, schema: 'narration_flow_result', request_id: requestId, surface: 'turn', status: 'approved', pass: true, approved_output: { version: 1, schema: 'narration_output', output_id: `narration:${requestId}`, prose: 'Проходит минута.', action_options: [], used_references: [], self_check: { no_new_world_facts: true } }, final_audit: { version: 1, schema: 'narration_audit', pass: true, concerns: [], evidence: ['visible'] }, repair_request: null, generation_history: [], audit_history: [], repair_history: [], diagnostics: {} }) },
    partyStore: store
  };
  const result = await runTurnWorkflow({ party_id: 'party-e2e', turn_number: 1, request_id: 'turn-e2e', idempotency_key: 'turn-e2e', raw_text: 'Жду.', received_at: '2030-01-01T00:00:00.000Z' }, services, { now: '2030-01-01T00:00:00.000Z', requestId: 'turn-e2e' });
  assert.equal(result.commit.committed, true);
  const state = (await pool.query("SELECT state_payload FROM party_runtime.party_state_snapshots WHERE party_id='party-e2e' AND state_version=1")).rows[0].state_payload;
  assert.deepEqual(state, { existing: true, party_events: { event: 'waited' } });
  await pool.end();
});

test('production autonomous commit verifies version pins, digests and deterministic retry', async () => {
  const { Pool } = createMemoryPostgres();
  const pool = new Pool();
  await runPartyRuntimeMigrations(pool);
  const pins = { world_revision_id: 'revision-auto', catalog_digest: 'a'.repeat(64), command_catalog_digest: 'b'.repeat(64), profile_bundle_digest: 'c'.repeat(64) };
  await pool.query(`INSERT INTO party_runtime.parties (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status) VALUES ('party-auto',2,$1,$2,'code_materializer_v2','mulberry32_v1',$3,$4,'active')`, [pins.world_revision_id, pins.catalog_digest, pins.command_catalog_digest, pins.profile_bundle_digest]);
  await pool.query("INSERT INTO party_runtime.party_state_snapshots (party_id,state_version,state_payload,state_digest) VALUES ('party-auto',0,'{\"existing\":true}','initial')");
  const registry = createAutonomousUpdateRegistry([{ rule_id: 'clock-rule', rule_version: '1', policy_id: 'clock-policy', policy_version: '1', applies: () => true, buildChangeSet: ({ party_id: partyId, state_version: stateVersion }) => ({ version: 2, schema: 'party_change_set_v2', change_set_id: `change-${stateVersion}`, party_id: partyId, rule_id: 'clock-rule', base_state_version: stateVersion, result_state_version: stateVersion + 1, operations: [{ target: 'party_events', value: { tick: 1 } }], created_or_changed_refs: [{ target: 'party_events' }], validation_report: { pass: true }, trace: { handler: 'clock-rule' } }) }]);
  const store = createPostgresPartyStore({ pool, catalogBundleLoader: async () => ({}) });
  const captured = [];
  await runAutonomousUpdates({ registry, partyId: 'party-auto', baseState: { state_version: 0, existing: true }, stateVersion: 0, trigger: { kind: 'clock_tick', at: '2030-01-01T00:00:00Z' }, catalogPins: pins, commit: async (update) => { captured.push(update); return store.commitAutonomousUpdate(update); } });
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM party_runtime.party_autonomous_updates WHERE party_id='party-auto' AND input_digest=$1", [captured[0].input_digest])).rows[0].count, 1);
  assert.equal((await store.commitAutonomousUpdate(captured[0])).replayed, true);
  await assert.rejects(() => store.commitAutonomousUpdate(structuredClone(captured[0])), (error) => error.code === 'AUTONOMOUS_UPDATE_NOT_CODE_OWNED');
  const persistedState = { state_version: 1, existing: true, party_events: { tick: 1 } };
  await assert.rejects(() => runAutonomousUpdates({ registry, partyId: 'party-auto', baseState: persistedState, stateVersion: 1, trigger: { kind: 'clock_tick', at: '2030-01-01T01:00:00Z' }, catalogPins: { ...pins, world_revision_id: 'other-revision' }, commit: (update) => store.commitAutonomousUpdate(update) }), (error) => error.code === 'AUTONOMOUS_VERSION_PINS_MISMATCH');
  await assert.rejects(() => runAutonomousUpdates({ registry, partyId: 'party-auto', baseState: { ...persistedState, existing: false }, stateVersion: 1, trigger: { kind: 'clock_tick', at: '2030-01-01T02:00:00Z' }, catalogPins: pins, commit: (update) => store.commitAutonomousUpdate(update) }), (error) => error.code === 'AUTONOMOUS_BASE_SNAPSHOT_MISMATCH');
  await pool.end();
});

test('builtin production composition runs with PostgreSQL-backed session and delivery state', async (t) => {
  const { Pool } = createMemoryPostgres();
  const provider = await createProviderServer(t);
  const here = dirname(fileURLToPath(import.meta.url));
  const bindings = resolve(here, '../fixtures/runtime-bindings/production-bindings.js');
  const env = {
    RUS_WORLD_DATABASE_URL: 'postgres://memory',
    RUS_PARTY_DATABASE_URL: 'postgres://memory',
    RUS_RUNTIME_BINDINGS_MODULE: bindings,
    DEEPSEEK_API_KEY: 'test-key',
    DEEPSEEK_BASE_URL: provider.baseUrl
  };
  const root = await createProductionV2RollbackSourceRoot({
    env,
    PoolClass: Pool,
    config: { runtimeBindingsModule: bindings, runMigrations: true, probeProvider: true, requireRuntimeCatalog: false },
    now: () => '2026-07-12T12:00:00.000Z'
  });
  t.after(() => root.close());
  const health = root.health();
  assert.equal(health.composition, 'production');
  assert.equal(health.dependencies.world_database.ok, true);
  assert.equal(health.dependencies.provider.ok, true);
  const started = await root.startNewGame({ start_text: 'Начать в Новгороде', request_id: 'req-prod-1' });
  assert.equal(started.screen.schema, 'first_game_screen');
  await root.acknowledgeOpening(started.party_id, { client_ack_id: 'ack-prod-1' });
  const turn = await root.submitTurn(started.party_id, { raw_text: 'Осматриваюсь' });
  assert.equal(turn.screen.schema, 'turn_screen');
  assert.equal((await root.getPartyScreen(started.party_id)).turn_number, 1);
});
