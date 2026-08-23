import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { createSpatialSemanticFirstEntryProvisioner } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-first-entry-provisioning.js';
import { applySpatialSemanticAtomicWritePlanInTransaction } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-persistence.js';
import { createSpatialSemanticAtomicWritePlan, spatialSemanticPhysicalKeys, spatialSemanticRows } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-atomic-write-plan.js';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { admitSpatialSemanticRemainder, prepareSpatialSemanticRemainder } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

const docker = (args) => spawnSync('docker', args,
  { encoding: 'utf8', timeout: 60_000 });
const container = `spatial-semantic-schema-${process.pid}`;

test('S1 P16 schema stores envelope capacity and resolution without reservations or digests', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', container]);
  });
  const started = docker(['run', '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=s1', '-e', 'POSTGRES_USER=s1', '-e', 'POSTGRES_DB=s1',
    'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  await waitForP16Postgres(container);
  const port = Number(docker(['port', container, '5432/tcp']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new Pool({ host: '127.0.0.1', port, user: 's1', password: 's1', database: 's1' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  const columns = await pool.query(`SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='party_runtime' AND table_name IN
      ('party_spatial_semantic_envelopes','party_spatial_semantic_resolutions')
    ORDER BY table_name,column_name`);
  const names = new Set(columns.rows.map(({ table_name, column_name }) => `${table_name}.${column_name}`));
  for (const name of ['party_spatial_semantic_envelopes.capacity_total',
    'party_spatial_semantic_envelopes.consumed_count',
    'party_spatial_semantic_envelopes.state_version',
    'party_spatial_semantic_resolutions.local_ref',
    'party_spatial_semantic_resolutions.semantics',
    'party_spatial_semantic_resolutions.p16_change_set_id']) assert.equal(names.has(name), true);
  assert.equal((await pool.query(`SELECT to_regclass('party_runtime.party_spatial_semantic_reservations') AS relation`)).rows[0].relation, null);
  for (const obsolete of ['authority_digest', 'resolution_digest', 'write_plan_digest', 'reservation_ref']) assert.equal([...names].some((name) => name.endsWith(`.${obsolete}`)), false);
});

test('S1 first-entry provisioning persists approved descriptive envelopes', async () => {
  const inserts = [];
  const provisioner = createSpatialSemanticFirstEntryProvisioner({ loadedProfile: profile() });
  const transaction = { query: async (sql, values) => {
    if (sql.includes('FROM party_runtime.party_scene_baselines')) return { rowCount: 1, rows: [scope()] };
    if (sql.includes('FROM party_runtime.party_spatial_semantic_envelopes')) return { rowCount: 0, rows: [] };
    if (sql.includes('INSERT INTO party_runtime.party_spatial_semantic_envelopes')) {
      inserts.push(JSON.parse(values[2])); return { rowCount: 1, rows: [] };
    }
    assert.fail(`unexpected query: ${sql}`);
  } };
  await provisioner.provision({ transaction, partyId: 'party-s1', changeSetId: 'change-s1',
    firstEntryBinding: { g6_instance_id: 'g6-s1', position_id: 'position-s1' } });
  assert.equal(inserts.length, 2);
  for (const envelope of inserts) {
    assert.deepEqual(Object.keys(envelope).sort(), ['baseline_ref','baseline_state_version',
      'capacity_total','consumed_count','envelope_ref','environment_ref','function_ref','g5_ref',
      'g5_state_version','g6_ref','g6_state_version','kind','structural_variant','available_mechanics','policy_ref',
      'policy_version','position_ref','position_state_version','profile_ref','profile_version',
      'semantic_context',
      'property_ref','scope_kind','state_version'].sort());
    assert.equal(envelope.scope_kind, 'current_position_local_reference');
    assert.equal(typeof envelope.structural_variant, 'string');
    assert.deepEqual([envelope.capacity_total, envelope.consumed_count, envelope.state_version], [1, 0, 1]);
  }
});

test('S1 first-entry provisions only template-and-position matches from a mixed profile', async () => {
  const inserts = [];
  const provisioner = createSpatialSemanticFirstEntryProvisioner({ loadedProfile: profile([
    { envelope_ref: 'feature-s1', kind: 'local_natural_feature', template_id: 'template-s1',
      position_kind: 'scene_position', scope_kind: 'current_position_local_reference',
      structural_variant: 'descriptive_local_reference', available_mechanics: [], capacity_total: 1,
      semantic_context: semanticContext('local_natural_feature') },
    { envelope_ref: 'other-template-s1', kind: 'ordinary_structure', template_id: 'template-other',
      position_kind: 'scene_position', scope_kind: 'current_position_local_reference',
      structural_variant: 'open_one_space', available_mechanics: [], capacity_total: 1,
      semantic_context: semanticContext('ordinary_structure') },
    { envelope_ref: 'other-position-s1', kind: 'ordinary_structure', template_id: 'template-s1',
      position_kind: 'other_position', scope_kind: 'current_position_local_reference',
      structural_variant: 'open_one_space', available_mechanics: [], capacity_total: 1,
      semantic_context: semanticContext('ordinary_structure') }
  ]) });
  const transaction = { query: async (sql, values) => {
    if (sql.includes('FROM party_runtime.party_scene_baselines')) return { rowCount: 1, rows: [scope()] };
    if (sql.includes('FROM party_runtime.party_spatial_semantic_envelopes')) return { rowCount: 0, rows: [] };
    if (sql.includes('INSERT INTO party_runtime.party_spatial_semantic_envelopes')) {
      inserts.push(JSON.parse(values[2])); return { rowCount: 1, rows: [] };
    }
    assert.fail(`unexpected query: ${sql}`);
  } };
  const result = await provisioner.provision({ transaction, partyId: 'party-s1', changeSetId: 'change-s1',
    firstEntryBinding: { g6_instance_id: 'g6-s1', position_id: 'position-s1' } });
  assert.deepEqual(result.envelope_refs, ['feature-s1']);
  assert.deepEqual(inserts.map(({ envelope_ref }) => envelope_ref), ['feature-s1']);
});

test('S1 P16 commit reloads one resolution and stale last-slot plan cannot commit', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `${container}-commit`; let pool;
  t.after(async () => { if (pool) await pool.end(); docker(['rm', '-f', name]); });
  const started = docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=s1', '-e', 'POSTGRES_USER=s1', '-e', 'POSTGRES_DB=s1',
    'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    if (docker(['exec', name, 'pg_isready', '-U', 's1', '-d', 's1']).status === 0) break;
    if (attempt === 49) assert.fail('PostgreSQL not ready');
  }
  await new Promise((done) => setTimeout(done, 750));
  await new Promise((done) => setTimeout(done, 750));
  const port = Number(docker(['port', name, '5432/tcp']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new Pool({ host: '127.0.0.1', port, user: 's1', password: 's1', database: 's1' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await seedCommitScope(pool);
  const spatialBefore = await spatialSnapshot(pool);
  const first = s1Plan('request:one', 'change:one');
  const stale = s1Plan('request:two', 'change:two');
  const rejected = await pool.connect();
  try {
    await rejected.query('BEGIN');
    await assert.rejects(() => applySpatialSemanticAtomicWritePlanInTransaction({ client: rejected,
      input: first, sealedWrites: [], p16ChangeSetId: 'change:one', partyStateVersionAfter: 5 }),
    { code: 'SPATIAL_SEMANTIC_P16_BINDING_INVALID' });
    await rejected.query('ROLLBACK');
  } finally { rejected.release(); }
  assert.deepEqual((await pool.query(`SELECT consumed_count FROM party_runtime.party_spatial_semantic_envelopes
    WHERE party_id='party:s1' AND envelope_ref='envelope:s1'`)).rows, [{ consumed_count: '0' }]);
  const client = await pool.connect();
  const second = await pool.connect();
  try {
    await client.query('BEGIN');
    assert.deepEqual(await applySpatialSemanticAtomicWritePlanInTransaction({ client,
      input: first, p16ChangeSetId: 'change:one', partyStateVersionAfter: 5 }), { replay: false });
    await second.query('BEGIN');
    const staleAttempt = applySpatialSemanticAtomicWritePlanInTransaction({ client: second,
      input: stale, p16ChangeSetId: 'change:two', partyStateVersionAfter: 5 })
      .then(() => null, (error) => error);
    await client.query(`UPDATE party_runtime.parties SET state_version=5 WHERE party_id='party:s1'`);
    await client.query('COMMIT');
    assert.equal(['SPATIAL_SEMANTIC_PARTY_STALE', 'SPATIAL_SEMANTIC_CAPACITY_EXHAUSTED',
      'SPATIAL_SEMANTIC_AUTHORITY_STALE'].includes((await staleAttempt)?.code), true);
    await second.query('ROLLBACK');
  } finally { client.release(); second.release(); }
  const row = await pool.query(`SELECT request_id,local_ref,position_ref FROM
    party_runtime.party_spatial_semantic_resolutions WHERE party_id='party:s1'`);
  assert.deepEqual(row.rows, [{ request_id: 'request:one', local_ref: 's1-local:request:one',
    position_ref: 'position:s1' }]);
  assert.deepEqual(await spatialSnapshot(pool), spatialBefore);
  assert.equal((await pool.query(`SELECT to_regclass('party_runtime.party_spatial_semantic_reservations') AS relation`)).rows[0].relation, null);
});

test('S1 combined P16 maps concurrent last-slot loss to typed conflict', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `${container}-combined`; let pool;
  t.after(async () => { if (pool) await pool.end(); docker(['rm', '-f', name]); });
  const started = docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=s1', '-e', 'POSTGRES_USER=s1', '-e', 'POSTGRES_DB=s1',
    'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    if (docker(['exec', name, 'pg_isready', '-U', 's1', '-d', 's1']).status === 0) break;
    if (attempt === 49) assert.fail('PostgreSQL not ready');
  }
  const port = Number(docker(['port', name, '5432/tcp']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new Pool({ host: '127.0.0.1', port, user: 's1', password: 's1', database: 's1', max: 2 });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await seedCommitScope(pool);
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    now: () => new Date('2030-01-01T00:00:00.000Z'), recheck: async () => ({ ok: true }) });
  const results = await Promise.all([
    committer.commit({ plan: await s1CombinedPlan('request:combined-one', 'change:combined-one') }),
    committer.commit({ plan: await s1CombinedPlan('request:combined-two', 'change:combined-two') })
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1, JSON.stringify(results));
  assert.equal(results.filter((result) => result.error?.code === 'state_version_conflict').length,
    1, JSON.stringify(results));
  assert.equal((await pool.query(`SELECT request_id FROM party_runtime.party_spatial_semantic_resolutions
    WHERE party_id='party:s1' ORDER BY request_id`)).rows.length, 1);
  assert.deepEqual((await pool.query(`SELECT consumed_count,state_version FROM
    party_runtime.party_spatial_semantic_envelopes WHERE party_id='party:s1' AND envelope_ref='envelope:s1'`)).rows[0],
  { consumed_count: '1', state_version: '2' });
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM party_runtime.party_v3_change_sets
    WHERE party_id='party:s1' AND id IN ('change:combined-one','change:combined-two')`)).rows[0].count, 1);
  assert.deepEqual((await pool.query(`SELECT count(*)::int AS g6,
    (SELECT count(*)::int FROM party_runtime.scene_position_nodes WHERE id LIKE 's1:%') AS positions,
    (SELECT count(*)::int FROM party_runtime.scene_movement_edges WHERE id LIKE 's1:%') AS edges,
    (SELECT count(*)::int FROM party_runtime.visibility_links WHERE id LIKE 's1:%') AS visibility
    FROM party_runtime.party_g6_instances WHERE id LIKE 's1:%'`)).rows[0],
  { g6: 1, positions: 1, edges: 2, visibility: 2 });
  assert.deepEqual((await pool.query(`SELECT passage_type_id,transition_environment_profile_ref,
    movement_orientation_profile_ref FROM party_runtime.scene_movement_edges
    WHERE party_id='party:s1' ORDER BY id`)).rows, [
    { passage_type_id: 'passage.local', transition_environment_profile_ref: {
      entity_ref: { entity_kind: 'transition_environment_profile', entity_id: 'env.local_variable' },
      authoring_version: '1' }, movement_orientation_profile_ref: {
      entity_ref: { entity_kind: 'movement_orientation_profile', entity_id: 'orientation.topological_local' },
      authoring_version: '1' } },
    { passage_type_id: 'passage.local', transition_environment_profile_ref: {
      entity_ref: { entity_kind: 'transition_environment_profile', entity_id: 'env.local_variable' },
      authoring_version: '1' }, movement_orientation_profile_ref: {
        entity_ref: { entity_kind: 'movement_orientation_profile', entity_id: 'orientation.topological_local' },
      authoring_version: '1' } }
  ]);
  const placementAndVisibility = (await pool.query(`SELECT p.position_node_id, v.from_position_id,v.to_position_id
    FROM party_runtime.entity_placements p CROSS JOIN party_runtime.visibility_links v
    WHERE p.party_id='party:s1' AND p.entity_kind='ordinary_structure'
    ORDER BY v.id`)).rows;
  assert.equal(placementAndVisibility.length, 2);
  for (const row of placementAndVisibility) assert.equal(row.position_node_id, 'position:s1');
  const interiorPosition = placementAndVisibility[0].from_position_id === 'position:s1'
    ? placementAndVisibility[0].to_position_id : placementAndVisibility[0].from_position_id;
  assert.notEqual(interiorPosition, 'position:s1');
  assert.deepEqual(placementAndVisibility.map(({ from_position_id, to_position_id }) =>
    [from_position_id, to_position_id].sort()).sort(), [
    ['position:s1', interiorPosition], ['position:s1', interiorPosition]
  ].sort());
});

test('S1 controlled passage fails before P16 without portal condition owner', async (t) => {
  const database = await startP16Postgres(t, 'passage'); if (!database) return;
  const { pool } = database;
  const envelope = { ...s1Envelope(), structural_variant: 'one_space_controlled_passage',
    available_mechanics: ['controlled_passage'] };
  await seedCommitScope(pool, envelope);
  const requestId = 'request:passage';
  await assert.rejects(() => s1CombinedPlan(requestId, 'change:passage', envelope),
    { code: 'S1_SPATIAL_DATA_GAP' });
  assert.deepEqual((await pool.query(`SELECT
    (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_resolutions WHERE party_id='party:s1') AS resolutions,
    (SELECT count(*)::int FROM party_runtime.portal_entities WHERE party_id='party:s1') AS portals,
    (SELECT count(*)::int FROM party_runtime.scene_movement_edges WHERE party_id='party:s1') AS edges,
    (SELECT count(*)::int FROM party_runtime.visibility_links WHERE party_id='party:s1') AS visibility`)).rows[0],
  { resolutions: 0, portals: 0, edges: 0, visibility: 0 });
});

test('S1 combined P16 persists descriptive local reference without topology', async (t) => {
  const database = await startP16Postgres(t, 'feature'); if (!database) return;
  const { pool } = database;
  const envelope = { ...s1Envelope(), kind: 'local_natural_feature',
    structural_variant: 'descriptive_local_reference', available_mechanics: [],
    semantic_context: semanticContext('local_natural_feature') };
  await seedCommitScope(pool, envelope);
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    now: () => new Date('2030-01-01T00:00:00.000Z'), recheck: async () => ({ ok: true }) });
  const requestId = 'request:feature';
  const result = await committer.commit({ plan: await s1CombinedPlan(requestId, 'change:feature', envelope) });
  assert.equal(result.ok, true, JSON.stringify(result));
  const resolution = (await pool.query(`SELECT local_ref,position_ref,formal_spatial_refs FROM
    party_runtime.party_spatial_semantic_resolutions WHERE party_id='party:s1' AND request_id=$1`,
  [requestId])).rows[0];
  const refs = resolution.formal_spatial_refs;
  assert.deepEqual(refs, { schema: 'rus.s1_formal_spatial_refs.v1', status: 'materialized',
    structural_variant: 'descriptive_local_reference', local_ref: resolution.local_ref,
    placement_ref: `local_natural_feature:${resolution.local_ref}`, g6_instance_ref: null,
    position_ref: null, portal_ref: null, movement_edge_refs: [], visibility_link_refs: [] });
  assert.deepEqual((await pool.query(`SELECT entity_kind,entity_id,position_node_id FROM party_runtime.entity_placements
    WHERE party_id='party:s1'`)).rows,
  [{ entity_kind: 'local_natural_feature', entity_id: resolution.local_ref, position_node_id: resolution.position_ref }]);
  assert.deepEqual((await pool.query(`SELECT count(*)::int AS g6,
    (SELECT count(*)::int FROM party_runtime.scene_position_nodes WHERE party_id='party:s1') AS positions,
    (SELECT count(*)::int FROM party_runtime.scene_movement_edges WHERE party_id='party:s1') AS edges,
    (SELECT count(*)::int FROM party_runtime.visibility_links WHERE party_id='party:s1') AS visibility,
    (SELECT count(*)::int FROM party_runtime.portal_entities WHERE party_id='party:s1') AS portals
    FROM party_runtime.party_g6_instances WHERE party_id='party:s1'`)).rows[0],
  { g6: 1, positions: 1, edges: 0, visibility: 0, portals: 0 });
  assert.deepEqual((await pool.query(`SELECT consumed_count,state_version FROM party_runtime.party_spatial_semantic_envelopes
    WHERE party_id='party:s1' AND envelope_ref='envelope:s1'`)).rows[0], { consumed_count: '1', state_version: '2' });
});

test('S1 P16 rejects persisted context variant or mechanics drift before capacity decrement', async (t) => {
  const database = await startP16Postgres(t, 'context-drift'); if (!database) return;
  const { pool } = database;
  await seedCommitScope(pool);
  const input = s1Plan('request:context-drift', 'change:context-drift');
  const drifted = { ...s1Envelope(), structural_variant: 'one_space_controlled_passage',
    available_mechanics: ['controlled_passage'] };
  await pool.query(`UPDATE party_runtime.party_spatial_semantic_envelopes SET envelope=$1::jsonb
    WHERE party_id='party:s1' AND envelope_ref='envelope:s1'`, [JSON.stringify(drifted)]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assert.rejects(() => applySpatialSemanticAtomicWritePlanInTransaction({ client, input,
      p16ChangeSetId: 'change:context-drift', partyStateVersionAfter: 5 }),
    { code: 'SPATIAL_SEMANTIC_SCOPE_STALE' });
    await client.query('ROLLBACK');
  } finally { client.release(); }
  assert.deepEqual((await pool.query(`SELECT consumed_count,state_version FROM
    party_runtime.party_spatial_semantic_envelopes WHERE party_id='party:s1' AND envelope_ref='envelope:s1'`)).rows[0],
  { consumed_count: '0', state_version: '1' });
  assert.deepEqual((await pool.query(`SELECT
    (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_resolutions WHERE party_id='party:s1') AS resolutions,
    (SELECT count(*)::int FROM party_runtime.scene_movement_edges WHERE party_id='party:s1') AS edges,
    (SELECT count(*)::int FROM party_runtime.visibility_links WHERE party_id='party:s1') AS visibility,
    (SELECT count(*)::int FROM party_runtime.entity_placements WHERE party_id='party:s1') AS placements`)).rows[0],
  { resolutions: 0, edges: 0, visibility: 0, placements: 0 });
});

function s1Plan(request_id, change_set_id, envelope = s1Envelope()) {
  const prepared = prepareSpatialSemanticRemainder({ schema: 'rus.s1_spatial_semantic_request.v1',
    request_id, causal_request_ref: 'action:s1', party_id: 'party:s1', need: 'perception', envelope });
  return createSpatialSemanticAtomicWritePlan({ schema: 'spatial_semantic_atomic_write_plan_v1',
    party_id: 'party:s1', base_party_state_version: 4, change_set_id,
    causal_identity: { request_id, root_turn_id: 'turn:s1', action_ref: 'action:s1',
      step_index: 1, actor_ref: 'actor:s1' }, envelope_ref: 'envelope:s1',
    expected_envelope_state_version: 1, formal_spatial_context: { baseline_ref: envelope.baseline_ref,
      g5_ref: envelope.g5_ref, kind: envelope.kind,
      structural_variant: envelope.structural_variant, available_mechanics: envelope.available_mechanics }, resolution: admitSpatialSemanticRemainder({ prepared,
      proposal: { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id,
        name: 'Выступ', description: 'Камень у воды.', semantic_requirements: [] } }) });
}

async function s1CombinedPlan(request_id, change_set_id, envelope = s1Envelope()) {
  const spatial = s1Plan(request_id, change_set_id, envelope);
  const payload = { schema: 'temporal_visible_package.v1', perceived_scene: 'Осмотр.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: {
    entity_kind: 'world_revision', entity_id: 's1-test' }, version_pin: {
    pin_kind: 'authoring_version', authoring_version: 'test-v1', state_version: null } }];
  const semanticCommandSnapshot = { schema:
    'rus.lower_dvina_trace_turn_step_command_snapshot.v1', semantic_trace: {
    step_traces: [{ step_index: 1, approved_plan: { request_id,
      operations: [{ op: 'request_discovery', actor_ref: 'actor:s1',
        discovery_kind: 'look', target_refs: ['position:s1'] }] } }] } };
  const built = await buildCombinedWritePlan({ plan_id: `plan:${request_id}`,
    party_id: 'party:s1', write_plan_kind: 'semantic_commit', operation_kind: 'trace_turn_step',
    canonical_input_digest: `sha256:${'a'.repeat(64)}`,
    expected_state_versions: [{ target_table: 'parties', id: 'party:s1', state_version: 4 }],
    validation_report: { status: 'pass', digest: `sha256:${'b'.repeat(64)}` },
    idempotency: { id: `idem:${request_id}`, key: `key:${request_id}`,
      request_id, semantic_command_snapshot: semanticCommandSnapshot,
      semantic_command_digest: computeSpatialV3CanonicalDigest(semanticCommandSnapshot),
      semantic_dependency_pins: { pins: [] } },
    change_set: { id: change_set_id },
    visible_package_envelope: { package_id: `visible:${request_id}`, party_id: 'party:s1',
      turn_id: 'turn:s1', committed_state_version: '5', change_set_id,
      package_digest: computeSpatialV3CanonicalDigest(payload), visible_payload: payload,
      presentation_status: 'pending', projection_policy_ref: { entity_ref: {
        entity_kind: 'visibility_modifier', entity_id: 'projection-v1' }, authoring_version: 'test-v1' },
      dependency_pins: { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') },
      idempotency_record_id: `idem:${request_id}` },
    approved_write_sets: [{ inserts: spatialSemanticRows(spatial), updates: [{ target_table: 'parties', id: 'party:s1',
      record: { party_id: 'party:s1', profile_bundle_digest: 'profiles' } }], appends: [{
      target_table: 'party_v3_change_sets', id: change_set_id,
      record: { id: change_set_id, party_id: 'party:s1', operation_kind: 'trace_turn_step',
        idempotency_record_id: `idem:${request_id}` } }] }],
    lock_context: { owner_keys: ['actor:actor:s1'], execution_keys: [], g4_keys: [],
      physical_keys: [`party_runtime.party_v3_change_sets:${change_set_id}`,
        'party_runtime.parties:party:s1', ...spatialSemanticPhysicalKeys(spatial)] },
    spatial_semantic_atomic_write_plan: spatial,
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: `sha256:${'c'.repeat(64)}` })) },
  { verifyApproval: async () => ({ ok: true }) });
  assert.equal(built.ok, true, JSON.stringify(built.error));
  return built.plan;
}
function s1Envelope() {
  return { envelope_ref: 'envelope:s1', kind: 'ordinary_structure',
    scope_kind: 'current_position_local_reference', structural_variant: 'open_one_space', available_mechanics: [],
    baseline_ref: 'baseline:s1', g5_ref: 'g5:s1', g6_ref: 'g6:s1', position_ref: 'position:s1',
    property_ref: 'property:s1', function_ref: 'function:s1',
    environment_ref: 'environment:s1', semantic_context: semanticContext('ordinary_structure'),
    profile_ref: 'profile:s1', profile_version: 1,
    policy_ref: 'policy:s1', policy_version: 1, baseline_state_version: 0,
    g5_state_version: 0, g6_state_version: 0, position_state_version: 0,
    capacity_total: 1, consumed_count: 0, state_version: 1 };
}

async function seedCommitScope(pool, envelope = s1Envelope()) {
  await pool.query(`INSERT INTO party_runtime.parties (party_id,schema_version,world_revision_id,
    world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,state_version)
    VALUES ('party:s1',3,'world','catalog','materializer','rng','commands','profiles',4)`);
  for (const [index, id] of ['fixture:s1', 'change:one', 'change:two'].entries()) await pool.query(`INSERT INTO
    party_runtime.party_v3_change_sets (id,party_id,operation_kind,expected_state_version_set_digest,
    expected_state_version_set,committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ($1,'party:s1','fixture',$2,'[]'::jsonb,$2,$2,0,0)`, [id,
      String(index + 1).repeat(64)]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites (id,party_id,origin,parent_g4_id,
    canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('g5:s1','party:s1','canonical','g4','{}','active',0,'fixture:s1','fixture:s1')`);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines (id,party_id,host_kind,host_id,
    source_kind,scene_template_ref,materialization_trace_id,materializer_version,catalog_digest,status,
    state_version,created_change_set_id,updated_change_set_id) VALUES ('baseline:s1','party:s1','g5_site',
    'g5:s1','canonical_template','{}','trace','m','c','active',0,'fixture:s1','fixture:s1')`);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances (id,party_id,scene_baseline_id,
    source_scene_template_ref,scene_slot_key,host_kind,host_id,physical_class_id,primary_scene_role_id,
    vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,
    acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('g6:s1','party:s1','baseline:s1','{}','slot','g5_site','g5:s1','open','role','ground','none',
    'default_clear','near','uniform','active',0,'fixture:s1','fixture:s1')`);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes (id,party_id,g6_instance_id,position_type_id,
    template_slot_key,template_instance_ordinal,capacity,access_class_id,status,state_version,
    created_change_set_id,updated_change_set_id) VALUES ('position:s1','party:s1','g6:s1','ground','slot',0,2,
    'public','active',0,'fixture:s1','fixture:s1')`);
  await pool.query(`INSERT INTO party_runtime.party_spatial_semantic_envelopes (party_id,envelope_ref,envelope,
    capacity_total,consumed_count,state_version,status,created_change_set_id) VALUES ('party:s1','envelope:s1',
    $1::jsonb,1,0,1,'committed','fixture:s1')`, [JSON.stringify(envelope)]);
}

async function startP16Postgres(t, suffix) {
  if (docker(['version']).status !== 0) {
    t.skip('Docker required'); return null;
  }
  const name = `${container}-${suffix}`;
  let pool;
  t.after(async () => { if (pool) await pool.end(); docker(['rm', '-f', name]); });
  const started = docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=s1', '-e', 'POSTGRES_USER=s1', '-e', 'POSTGRES_DB=s1',
    'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  await waitForP16Postgres(name);
  const port = Number(docker(['port', name, '5432/tcp']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new Pool({ host: '127.0.0.1', port, user: 's1', password: 's1', database: 's1' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  return { pool };
}

async function waitForP16Postgres(name) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    const logs = docker(['logs', name]);
    const initialized = `${logs.stdout}\n${logs.stderr}`.includes(
      'PostgreSQL init process complete; ready for start up.');
    if (initialized && docker(['exec', name, 'pg_isready', '-U', 's1', '-d', 's1']).status === 0) return;
  }
  assert.fail('PostgreSQL not ready');
}

async function spatialSnapshot(pool) {
  const result = await pool.query(`SELECT jsonb_build_object(
    'baseline', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'state_version',state_version) ORDER BY id),'[]'::jsonb)
      FROM party_runtime.party_scene_baselines WHERE party_id='party:s1'),
    'g5', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'state_version',state_version) ORDER BY id),'[]'::jsonb)
      FROM party_runtime.party_g5_sites WHERE party_id='party:s1'),
    'g6', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'state_version',state_version) ORDER BY id),'[]'::jsonb)
      FROM party_runtime.party_g6_instances WHERE party_id='party:s1'),
    'position', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'state_version',state_version) ORDER BY id),'[]'::jsonb)
      FROM party_runtime.scene_position_nodes WHERE party_id='party:s1'),
    'edges', (SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb)
      FROM party_runtime.scene_movement_edges WHERE party_id='party:s1'),
    'g5_edges', (SELECT coalesce(jsonb_agg(g5_edge_id ORDER BY g5_edge_id),'[]'::jsonb)
      FROM party_runtime.party_g5_edges WHERE party_id='party:s1'),
    'routes', (SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb)
      FROM party_runtime.party_route_plans WHERE party_id='party:s1')) AS snapshot`);
  return result.rows[0].snapshot;
}

function profile(envelopes = [
  { envelope_ref: 'structure-s1', kind: 'ordinary_structure', template_id: 'template-s1',
    position_kind: 'scene_position', scope_kind: 'current_position_local_reference',
    structural_variant: 'open_one_space', available_mechanics: [], capacity_total: 1,
    semantic_context: semanticContext('ordinary_structure') },
  { envelope_ref: 'feature-s1', kind: 'local_natural_feature', template_id: 'template-s1',
    position_kind: 'scene_position', scope_kind: 'current_position_local_reference',
    structural_variant: 'descriptive_local_reference', available_mechanics: [], capacity_total: 1,
    semantic_context: semanticContext('local_natural_feature') }
]) {
  return { schema: 'rus.lower_dvina_trace_s1_loaded_profile.v1', profile: {
      schema: 'rus.lower_dvina_trace_spatial_semantic_profile.v1', status: 'approved',
      scenario_definition_revision: 24,
      profile_id: 'lower_dvina_trace_s1_spatial_semantic_profile_v2',
      policy_ref: 'lower_dvina_trace:s1:ordinary_spatial_semantic_policy_v1',
      revision: 2, policy_version: 1,
      property_ref: 'lower_dvina_trace:s1:shore_property_context_v1',
      function_ref: 'lower_dvina_trace:s1:formal_spatial_owner_v1',
      environment_ref: 'lower_dvina_trace:s1:late_summer_open_water_v1', envelopes } };
}

function scope() {
  return { baseline_ref: 'baseline-s1', baseline_state_version: 0, g5_ref: 'g5-s1',
    g5_state_version: 0, g6_ref: 'g6-s1', g6_state_version: 0,
    template_ref: { entity_ref: { entity_id: 'template-s1' } }, position_ref: 'position-s1',
    position_state_version: 0, template_id: 'template-s1', position_kind: 'scene_position' };
}
function semanticContext(allowed_kind) { return { allowed_kind, period: '1230, Rus',
  region: 'Lower Dvina', place_type: 'open river shore at a boat-wreck site',
  environment: 'late summer open water; wet sand, driftwood, reeds, riverbank stones and timber',
  material_culture: 'early thirteenth-century Rus: wood, bark, rope, woven wattle, clay and stone; no modern technology or later institutions',
  ordinary_boundary: `create one unimportant local ${allowed_kind.replaceAll('_', ' ')} only. Never create or identify canonical places, historical people or events, significant landmarks, hidden clues, evidence, ownership, law, routes, hazards, movement, resources, or mechanics.` }; }
