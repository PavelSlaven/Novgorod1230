import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import {
  createPostgresPartyStore,
  runPartyRuntimeMigrations
} from '@rus/game-server/production-v2-migration-source';
import { createAutonomousUpdateRegistry, createTurnCommandRegistry, enterG4WithMaterialization, runAutonomousUpdates } from '@rus/turn';
import { canonicalDigest, issueBoundedDecisionRequest, materializeWorldInstances, repairWorldInstances, validateBoundedDecisionResult } from '@rus/materialization';
import { buildPersistencePlanStage } from '../../packages/turn/src/stages/persistence-plan.js';

function makePostgresMaterializationRequest({ partyId, runId, g4Id, trigger = 'first_entry', occurrence = 0, baselineExists = false }) {
  const scope = { status: 'approved', world_revision_id: 'revision-repair', region_id: 'region-repair', valid_from_year: 1200, valid_to_year: 1300, allowed_seasons: ['spring'] };
  const catalog_bundle = {
    player_start_anchor_slot_key: 'entry',
    rules: [
      { ...scope, rule_id: 'node-rule', slot_key: 'main', domain: 'g5_node', min_count: 1, max_count: 1, candidate_ids: ['node'] },
      { ...scope, rule_id: 'anchor-rule', slot_key: 'entry', domain: 'g5_anchor', min_count: 1, max_count: 1, candidate_ids: ['anchor'] }
    ],
    candidates: [
      { ...scope, candidate_id: 'node', domain: 'g5_node', template_id: 'node-template', weight: 1, attributes: { access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } },
      { ...scope, candidate_id: 'anchor', domain: 'g5_anchor', template_id: 'anchor-template', weight: 1, attributes: { g5_node_slot_key: 'main', entry_role: 'start_and_exit', npc_capacity: 1, item_capacity: 1, container_capacity: 1, access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } }
    ]
  };
  return {
    version: 2, schema: 'world_materialization_request_v2', party_id: partyId, run_id: runId,
    world_revision_id: scope.world_revision_id, region_id: scope.region_id, historical_frame: { calendar: { year: 1230, season: 'spring' } },
    g1_id: 'g1-repair', g4_id: g4Id, trigger, occurrence, materializer_version: 'code_materializer_v2', rng_algorithm_id: 'mulberry32_v1',
    seed_context: { party_id: partyId, world_revision_id: scope.world_revision_id, g1_id: 'g1-repair', g4_id: g4Id, trigger, occurrence, materializer_version: 'code_materializer_v2', rng_algorithm_id: 'mulberry32_v1' },
    existing_party_state: { state_version: 0, baseline_exists: baselineExists }, catalog_bundle, catalog_digest: canonicalDigest(catalog_bundle)
  };
}

test('party_runtime_v2 persists baseline trace and normalized G5 in real PostgreSQL', { skip: !process.env.PARTY_DATABASE_URL }, async () => {
  const client = new pg.Client({ connectionString: process.env.PARTY_DATABASE_URL });
  await client.connect();
  const id = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query(await readFile(new URL('../../schemas/party-db/001_party_runtime.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO party_runtime.parties (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status) VALUES ($1,2,$2,$3,$4,$5,$6,$7,$8)', [id, 'revision', 'catalog', 'code_materializer_v2', 'mulberry32_v1', 'commands', 'profiles', 'creating']);
    await client.query("INSERT INTO party_runtime.party_materialization_runs (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,materializer_version,rng_version,result_digest,idempotency_key,status,validation_report,trace) VALUES ($1,$2,$3,'baseline',$4,$5,$6,$7,$8,$9,$10,'committed',$11,$12)", [id, `run-${id}`, 'g4', 'seed', 'input', 'catalog', 'code_materializer_v2', 'mulberry32_v1', 'result', `materialization:${id}`, { pass: true }, { choices: 1 }]);
    await client.query('INSERT INTO party_runtime.party_g5_nodes (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key) VALUES ($1,$2,$3,$4,$5,$6)', [id, `node-${id}`, `run-${id}`, 'g4', 'node-template', 'main']);
    await client.query('INSERT INTO party_runtime.party_g5_anchors (party_id,anchor_id,g5_node_id,template_id,slot_key,npc_capacity,item_capacity,container_capacity) VALUES ($1,$2,$3,$4,$5,1,1,1),($1,$6,$3,$4,$7,1,1,1)', [id, `anchor-a-${id}`, `node-${id}`, 'anchor-template', 'a', `anchor-b-${id}`, 'b']);
    await client.query('INSERT INTO party_runtime.party_g5_edges (party_id,g5_edge_id,from_anchor_id,to_anchor_id,template_id) VALUES ($1,$2,$3,$4,$5)', [id, `edge-${id}`, `anchor-a-${id}`, `anchor-b-${id}`, 'edge-template']);
    const row = await client.query('SELECT r.materializer_version, count(e.g5_edge_id)::int AS edges FROM party_runtime.party_materialization_runs r JOIN party_runtime.party_g5_edges e ON e.party_id=r.party_id WHERE r.party_id=$1 GROUP BY r.materializer_version', [id]);
    assert.deepEqual(row.rows[0], { materializer_version: 'code_materializer_v2', edges: 1 });
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
});

test('concurrent first G4 entry creates one baseline under PostgreSQL advisory lock', { skip: !process.env.PARTY_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.PARTY_DATABASE_URL, max: 4 });
  await runPartyRuntimeMigrations(pool);
  const partyId = randomUUID();
  const g4Id = `g4-${randomUUID()}`;
  const catalogBundle = {
    player_start_anchor_slot_key: 'entry',
    rules: [
      { status: 'approved', world_revision_id: 'revision-concurrent', region_id: 'region-concurrent', valid_from_year: 1200, valid_to_year: 1300, allowed_seasons: ['spring'], rule_id: 'node-rule', slot_key: 'main', domain: 'g5_node', min_count: 1, max_count: 1, candidate_ids: ['node-candidate'] },
      { status: 'approved', world_revision_id: 'revision-concurrent', region_id: 'region-concurrent', valid_from_year: 1200, valid_to_year: 1300, allowed_seasons: ['spring'], rule_id: 'anchor-rule', slot_key: 'entry', domain: 'g5_anchor', min_count: 1, max_count: 1, candidate_ids: ['anchor-candidate'] },
      { status: 'approved', world_revision_id: 'revision-concurrent', region_id: 'region-concurrent', valid_from_year: 1200, valid_to_year: 1300, allowed_seasons: ['spring'], rule_id: 'npc-rule', slot_key: 'yard', domain: 'npc', min_count: 1, max_count: 1, candidate_ids: ['npc-candidate'] }
    ],
    candidates: [
      { candidate_id: 'node-candidate', domain: 'g5_node', status: 'approved', world_revision_id: 'revision-concurrent', region_id: 'region-concurrent', valid_from_year: 1200, valid_to_year: 1300, allowed_seasons: ['spring'], weight: 1, template_id: 'node-template', attributes: { access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } },
      { candidate_id: 'anchor-candidate', domain: 'g5_anchor', status: 'approved', world_revision_id: 'revision-concurrent', region_id: 'region-concurrent', valid_from_year: 1200, valid_to_year: 1300, allowed_seasons: ['spring'], weight: 1, template_id: 'anchor-template', attributes: { g5_node_slot_key: 'main', entry_role: 'start_and_exit', npc_capacity: 2, item_capacity: 2, container_capacity: 1, access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } },
      { candidate_id: 'npc-candidate', domain: 'npc', status: 'approved', world_revision_id: 'revision-concurrent', region_id: 'region-concurrent', valid_from_year: 1200, valid_to_year: 1300, allowed_seasons: ['spring'], weight: 1, profile_id: 'npc-profile', attributes: { profile_level: 'background', anchor_slot_key: 'entry', identity_state: { visibility: 'anonymous' }, machine_state: { mode: 'idle' }, presence_reason: 'approved_place_function', access_state: { access: 'present' }, visibility_state: { visibility: 'visible' }, causal_basis: { causal_basis_type: 'regional_profile', causal_basis_id: 'npc-rule' }, source_trace: [{ source_id: 'npc-rule' }] } }
    ]
  };
  const catalogDigest = canonicalDigest(catalogBundle);
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status)
    VALUES ($1,2,'revision-concurrent',$2,'code_materializer_v2','mulberry32_v1','commands-concurrent','profiles-concurrent','active')`, [partyId, catalogDigest]);
  const store = createPostgresPartyStore({ pool, catalogBundleLoader: async () => ({ world_revision_id: 'revision-concurrent', catalog_digest: catalogDigest, region_id: 'region-concurrent', historical_frame: { calendar: { year: 1230, season: 'spring' } }, g1_id: 'g1-concurrent', catalog_bundle: catalogBundle }) });
  let materializeCalls = 0;
  const materialize = async (request) => {
    materializeCalls += 1;
    return materializeWorldInstances(request);
  };
  const enter = () => enterG4WithMaterialization({
    partyId, g4Id, materialize,
    transact: store.transact.bind(store), loadCommittedBaseline: store.loadCommittedBaseline.bind(store),
    buildMaterializationRequest: store.buildMaterializationRequest.bind(store),
    commitMovement: (args) => store.commitMovement({ ...args, writePlan: {}, idempotencyKey: `first-entry:${partyId}:${g4Id}` }, { transaction: args.transaction }),
    commitMaterializationAndMovement: (args) => store.commitMaterializationAndMovement({ ...args, writePlan: {}, idempotencyKey: `first-entry:${partyId}:${g4Id}` }, { transaction: args.transaction })
  });
  try {
    const results = await Promise.all([enter(), enter()]);
    assert.equal(materializeCalls, 1);
    assert.equal(results.filter((result) => result.replayed).length, 1);
    assert.equal(new Set(results.map((result) => result.baseline_run_id)).size, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM party_runtime.party_materialization_runs WHERE party_id=$1 AND g4_id=$2 AND run_kind='baseline' AND status='committed'", [partyId, g4Id])).rows[0].count, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_g5_anchors WHERE party_id=$1', [partyId])).rows[0].count, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_npcs WHERE party_id=$1', [partyId])).rows[0].count, 1);
  } finally {
    await pool.query('DELETE FROM party_runtime.parties WHERE party_id=$1', [partyId]).catch(() => {});
    await pool.end();
  }
});

test('real PostgreSQL repair is bound to the persisted result and rolls back a failed atomic plan', { skip: !process.env.PARTY_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.PARTY_DATABASE_URL, max: 2 });
  await runPartyRuntimeMigrations(pool);
  const partyId = randomUUID();
  const g4Id = `g4-${randomUUID()}`;
  const baselineRequest = makePostgresMaterializationRequest({ partyId, runId: `baseline-${randomUUID()}`, g4Id });
  const baseline = materializeWorldInstances(baselineRequest);
  const store = createPostgresPartyStore({ pool, catalogBundleLoader: async () => ({}) });
  try {
    await pool.query(`INSERT INTO party_runtime.parties
      (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status)
      VALUES ($1,2,$2,$3,'code_materializer_v2','mulberry32_v1','commands-repair','profiles-repair','active')`, [partyId, baselineRequest.world_revision_id, baselineRequest.catalog_digest]);
    await store.transact((transaction) => store.commitMaterializationAndMovement({ partyId, g4Id, materialization: baseline, writePlan: {}, idempotencyKey: `baseline:${partyId}` }, { transaction }));

    const makeRepair = (runId, occurrence) => {
      const replacement = makePostgresMaterializationRequest({ partyId, runId, g4Id, trigger: 'expansion', occurrence, baselineExists: true });
      return repairWorldInstances({
        version: 2, schema: 'world_materialization_repair_request_v2', repair_reason: 'approved PostgreSQL repair',
        previous_result: baseline, previous_result_digest: baseline.trace.result_digest,
        replacement_request_digest: canonicalDigest(replacement), repair_history: [{ previous_run_id: baseline.run_id }], replacement_request: replacement
      });
    };
    const repaired = makeRepair(`repair-${randomUUID()}`, 1);
    const repairKey = `repair:${partyId}:1`;
    assert.equal((await store.commitMaterializationRepair({ partyId, g4Id, previousRunId: baseline.run_id, previousResultDigest: baseline.trace.result_digest, materialization: repaired, idempotencyKey: repairKey })).repaired, true);
    assert.equal((await store.commitMaterializationRepair({ partyId, g4Id, previousRunId: baseline.run_id, previousResultDigest: baseline.trace.result_digest, materialization: repaired, idempotencyKey: repairKey })).replayed, true);

    const tamperedResult = structuredClone(repaired);
    tamperedResult.instances[0].candidate_id = 'tampered';
    await assert.rejects(() => store.commitMaterializationRepair({ partyId, g4Id, previousRunId: baseline.run_id, previousResultDigest: baseline.trace.result_digest, materialization: tamperedResult, idempotencyKey: `repair:${partyId}:tampered` }), (error) => error.code === 'MATERIALIZATION_REPAIR_RESULT_TAMPERED');

    const retryable = makeRepair(`repair-${randomUUID()}`, 2);
    const invalidPlan = structuredClone(retryable);
    const choiceBatch = invalidPlan.proposed_write_set.write_batches.find((batch) => batch.target_table === 'party_materialization_choices');
    choiceBatch.records.push(structuredClone(choiceBatch.records[0]));
    const retryKey = `repair:${partyId}:retry`;
    await assert.rejects(() => store.commitMaterializationRepair({ partyId, g4Id, previousRunId: baseline.run_id, previousResultDigest: baseline.trace.result_digest, materialization: invalidPlan, idempotencyKey: retryKey }), (error) => error.code === '23505');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_materialization_runs WHERE party_id=$1 AND run_id=$2', [partyId, retryable.run_id])).rows[0].count, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.commit_idempotency WHERE idempotency_key=$1', [retryKey])).rows[0].count, 0);
    assert.equal((await store.commitMaterializationRepair({ partyId, g4Id, previousRunId: baseline.run_id, previousResultDigest: baseline.trace.result_digest, materialization: retryable, idempotencyKey: retryKey })).repaired, true);
  } finally {
    await pool.query('DELETE FROM party_runtime.parties WHERE party_id=$1', [partyId]).catch(() => {});
    await pool.end();
  }
});

test('real PostgreSQL autonomous updates persist D-013 pins and roll back rejected commits', { skip: !process.env.PARTY_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.PARTY_DATABASE_URL, max: 2 });
  await runPartyRuntimeMigrations(pool);
  const partyId = randomUUID();
  const pins = { world_revision_id: 'revision-auto-pg', catalog_digest: 'a'.repeat(64), command_catalog_digest: 'b'.repeat(64), profile_bundle_digest: 'c'.repeat(64) };
  const store = createPostgresPartyStore({ pool, catalogBundleLoader: async () => ({}) });
  const registry = createAutonomousUpdateRegistry([{ rule_id: 'clock-rule', rule_version: '7', policy_id: 'clock-policy', policy_version: '3', applies: () => true, buildChangeSet: ({ party_id: id, state_version: version }) => ({ version: 2, schema: 'party_change_set_v2', change_set_id: `change-${id}-${version}`, party_id: id, rule_id: 'clock-rule', base_state_version: version, result_state_version: version + 1, operations: [{ target: 'party_events', value: { tick: version + 1 } }], created_or_changed_refs: [{ target: 'party_events' }], validation_report: { pass: true }, trace: { handler: 'clock-rule' } }) }]);
  try {
    await pool.query(`INSERT INTO party_runtime.parties
      (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status)
      VALUES ($1,2,$2,$3,'code_materializer_v2','mulberry32_v1',$4,$5,'active')`, [partyId, pins.world_revision_id, pins.catalog_digest, pins.command_catalog_digest, pins.profile_bundle_digest]);
    await pool.query('INSERT INTO party_runtime.party_state_snapshots (party_id,state_version,state_payload,state_digest) VALUES ($1,0,$2,$3)', [partyId, { preserved: true }, 'initial']);
    const captured = [];
    await runAutonomousUpdates({ registry, partyId, baseState: { state_version: 0, preserved: true }, stateVersion: 0, trigger: { kind: 'clock_tick', at: '2030-01-01T00:00:00Z' }, catalogPins: pins, commit: async (update) => { captured.push(update); return store.commitAutonomousUpdate(update); } });
    const persisted = (await pool.query('SELECT rule_version,policy_id,policy_version,world_revision_id,catalog_digest,command_catalog_digest,profile_bundle_digest,input_digest FROM party_runtime.party_autonomous_updates WHERE party_id=$1', [partyId])).rows[0];
    assert.deepEqual(persisted, { rule_version: '7', policy_id: 'clock-policy', policy_version: '3', world_revision_id: pins.world_revision_id, catalog_digest: pins.catalog_digest, command_catalog_digest: pins.command_catalog_digest, profile_bundle_digest: pins.profile_bundle_digest, input_digest: captured[0].input_digest });
    assert.equal((await store.commitAutonomousUpdate(captured[0])).replayed, true);
    const state = (await pool.query('SELECT state_payload FROM party_runtime.party_state_snapshots WHERE party_id=$1 AND state_version=1', [partyId])).rows[0].state_payload;
    assert.deepEqual(state, { preserved: true, party_events: { tick: 1 } });

    await assert.rejects(() => store.commitAutonomousUpdate(structuredClone(captured[0])), (error) => error.code === 'AUTONOMOUS_UPDATE_NOT_CODE_OWNED');
    const persistedState = { state_version: 1, preserved: true, party_events: { tick: 1 } };
    await assert.rejects(() => runAutonomousUpdates({ registry, partyId, baseState: persistedState, stateVersion: 1, trigger: { kind: 'clock_tick', at: '2030-01-01T01:00:00Z' }, catalogPins: { ...pins, world_revision_id: 'foreign-revision' }, commit: (update) => store.commitAutonomousUpdate(update) }), (error) => error.code === 'AUTONOMOUS_VERSION_PINS_MISMATCH');
    let rejectedUpdate;
    await assert.rejects(() => runAutonomousUpdates({ registry, partyId, baseState: { ...persistedState, preserved: false }, stateVersion: 1, trigger: { kind: 'clock_tick', at: '2030-01-01T02:00:00Z' }, catalogPins: pins, commit: (update) => { rejectedUpdate = update; return store.commitAutonomousUpdate(update); } }), (error) => error.code === 'AUTONOMOUS_BASE_SNAPSHOT_MISMATCH');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.commit_idempotency WHERE idempotency_key=$1', [rejectedUpdate.idempotency_key])).rows[0].count, 0);
  } finally {
    await pool.query('DELETE FROM party_runtime.parties WHERE party_id=$1', [partyId]).catch(() => {});
    await pool.end();
  }
});

test('real PostgreSQL turn commit preserves atomic replay, decision trace and party-local FKs', { skip: !process.env.PARTY_DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.PARTY_DATABASE_URL, max: 2 });
  await runPartyRuntimeMigrations(pool);
  const partyId = randomUUID();
  const otherPartyId = randomUUID();
  const insertParty = (id) => pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status)
    VALUES ($1,2,'revision','catalog','code_materializer_v2','mulberry32_v1','commands','profiles','active')`, [id]);
  try {
    await insertParty(partyId);
    await pool.query('INSERT INTO party_runtime.party_state_snapshots (party_id,state_version,state_payload,state_digest) VALUES ($1,0,$2,$3)', [partyId, {}, 'initial']);
    const request = issueBoundedDecisionRequest({
      secret: 'postgres-test-secret',
      issuedAt: '2029-01-01T00:00:00.000Z',
      expiresAt: '2029-01-03T00:00:00.000Z',
      requestId: `turn-decision-${partyId}`,
      partyId,
      actorId: partyId,
      policyId: 'turn-command',
      policyVersion: '2',
      stateVersion: 0,
      options: [
        { option_id: 'wait', command_id: 'wait', actor_id: partyId, target_id: partyId, preconditions: [], expected_cost: { kind: 'time', value: 1 }, known_risks: [], reason_visible_to_actor: 'Wait.', state_version: 0, metadata: {} },
        { option_id: 'observe', command_id: 'observe', actor_id: partyId, target_id: partyId, preconditions: [], expected_cost: { kind: 'time', value: 1 }, known_risks: [], reason_visible_to_actor: 'Observe.', state_version: 0, metadata: {} }
      ]
    });
    const decision = validateBoundedDecisionResult({
      request,
      result: { version: 2, schema: 'bounded_decision_result_v2', request_id: request.request_id, state_version: 0, option_id: 'wait', command_token: request.options[0].command_token },
      secret: 'postgres-test-secret',
      now: '2029-01-02T00:00:00.000Z',
      currentPolicyVersion: '2'
    });
    const makePlan = async (value, turnId, baseStateVersion, trace = { decision_protocol: 'code_singleton_v1' }) => {
      const registry = createTurnCommandRegistry([{ command_id: 'wait', matches: () => true, mode: {}, availability: () => ({}), consequence: () => ({}), writeTargets: () => [{ target: 'party_events', value }] }]);
      return buildPersistencePlanStage({
        playerInput: { party_id: partyId },
        retrievedState: { party_state: { state_version: baseStateVersion } },
        commandRegistry: registry,
        modeResolution: { turn_id: turnId, command_id: 'wait', decision_trace: trace, resolution_plan: { expected_writes: ['party_events'] } },
        availability: {}, consequence: {}, timeUpdate: {}, hiddenUpdate: {}, visibleContext: {}, narration: {}
      });
    };
    const trace = { decision_protocol: 'bounded_decision_v2', bounded_decision_trace: { request, result: decision, validation_report: { pass: true } } };
    const plan = await makePlan({ event: 'waited' }, `turn-${partyId}`, 0, trace);
    const store = createPostgresPartyStore({ pool, catalogBundleLoader: async () => ({}) });
    const key = `turn-commit-${partyId}`;
    assert.equal((await store.commit(plan, { idempotencyKey: key })).committed, true);
    assert.equal((await store.commit(plan, { idempotencyKey: key })).replayed, true);
    assert.equal(Number((await pool.query('SELECT state_version FROM party_runtime.parties WHERE party_id=$1', [partyId])).rows[0].state_version), 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_decision_results WHERE party_id=$1', [partyId])).rows[0].count, 1);
    const conflictingPlan = await makePlan({ event: 'different' }, `turn-conflict-${partyId}`, 1);
    await assert.rejects(() => store.commit(conflictingPlan, { idempotencyKey: key }), (error) => error.code === 'TURN_IDEMPOTENCY_CONFLICT');

    const staleKey = `turn-stale-${partyId}`;
    const stalePlan = await makePlan({ event: 'stale' }, `turn-stale-${partyId}`, 0);
    await assert.rejects(() => store.commit(stalePlan, { idempotencyKey: staleKey }));
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.commit_idempotency WHERE idempotency_key=$1', [staleKey])).rows[0].count, 0);

    await insertParty(otherPartyId);
    const runId = `run-${otherPartyId}`;
    const nodeId = `node-${otherPartyId}`;
    const anchorId = `anchor-${otherPartyId}`;
    await pool.query("INSERT INTO party_runtime.party_materialization_runs (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,materializer_version,rng_version,result_digest,idempotency_key,status) VALUES ($1,$2,'g4-other','baseline','seed','input','catalog','code_materializer_v2','mulberry32_v1','result',$3,'committed')", [otherPartyId, runId, `materialization:${otherPartyId}`]);
    await pool.query("INSERT INTO party_runtime.party_g5_nodes (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key) VALUES ($1,$2,$3,'g4-other','node-template','main')", [otherPartyId, nodeId, runId]);
    await pool.query("INSERT INTO party_runtime.party_g5_anchors (party_id,anchor_id,g5_node_id,template_id,slot_key) VALUES ($1,$2,$3,'anchor-template','start')", [otherPartyId, anchorId, nodeId]);
    await assert.rejects(() => pool.query("INSERT INTO party_runtime.party_positions (party_id,g4_id,g5_node_id,g5_anchor_id) VALUES ($1,'g4-other',$2,$3)", [partyId, nodeId, anchorId]), (error) => error.code === '23503');
  } finally {
    await pool.query('DELETE FROM party_runtime.parties WHERE party_id = ANY($1::text[])', [[partyId, otherPartyId]]).catch(() => {});
    await pool.end();
  }
});
