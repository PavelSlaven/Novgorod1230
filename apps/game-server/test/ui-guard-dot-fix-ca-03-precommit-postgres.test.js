import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createPostgresTestBackend } from '../../../test/fixtures/postgres-test-backend.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { projectSpatialV3ProposedVisiblePackage } from
  '../src/runtime/spatial-v3-proposed-visible-context.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';

// Same proposed-destination fixture as spatial-v3-proposed-visible-context.test.js.
// The destination exists only in memory; no topology rows are committed first.
function proposedFixture(perception) {
  const write = (target_table, id, record) => ({ target_table, id, record: {
    party_id: 'party:1', status: 'active', ...record
  } });
  return {
    snapshot: { sites: [], scene_baselines: [], g6_instances: [], scene_positions: [],
      acoustic_profiles: [], visibility_links: [], portals: [], movement_edges: [],
      endpoint_bindings: [], placements: [] },
    proposal: { target_site_id: 'site', target_position_id: 'position:shore', inserts: [
      write('party_g5_sites', 'site', { id: 'site', origin: 'generated' }),
      write('party_scene_baselines', 'baseline', { id: 'baseline', host_kind: 'g5_site', host_id: 'site' }),
      write('party_g6_instances', 'g6:inside', { id: 'g6:inside', scene_baseline_id: 'baseline', host_id: 'site' }),
      write('g6_acoustic_profiles', 'g6:inside', { g6_instance_id: 'g6:inside' }),
      write('scene_position_nodes', 'position:shore', { id: 'position:shore', g6_instance_id: 'g6:inside' }),
      write('party_site_connection_endpoint_bindings', 'binding:to', { id: 'binding:to',
        endpoint_role: 'to', g5_site_id: 'site', position_id: 'position:shore' })
    ], updates: [] },
    firstEntry: { approved_write_sets: [{ inserts: [
      write('entity_placements', 'item:item:1', {
        entity_kind: 'item', entity_id: 'item:1', position_node_id: 'position:shore'
      })
    ], updates: [], appends: [] }] },
    envelopeInput: { package_id: 'visible:1', party_id: 'party:1', turn_id: 'turn:1',
      committed_state_version: '1', change_set_id: 'change:1',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'policy:1' }, authoring_version: 'v1' },
      dependency_pins: { pins: [], canonical_digest: computeSpatialV3CanonicalDigest([]).slice(7) },
      idempotency_record_id: 'idem:1' },
    readSources: async ({ overlay }) => ({ naturalInput: structuredClone(perception),
      partyId: 'party:1', actorId: 'player:1', positionId: overlay.position.id,
      entityObservations: overlay.placements.map((row) => ({ entity_kind: row.entity_kind,
        entity_id: row.entity_id, visibility: 'clear', display_label: 'корзина',
        exterior: { condition_state: 'intact' } })), localEdges: [], directionalExits: [] })
  };
}
async function storedBaseline(pool) {
  const party = (await pool.query('SELECT * FROM party_runtime.parties ORDER BY party_id')).rows;
  const counts = {};
  for (const table of ['party_state_snapshots', 'party_server_sessions', 'party_clocks',
    'party_visible_packages', 'party_command_idempotency', 'party_v3_change_sets',
    'party_g5_sites', 'party_g6_instances', 'entity_placements']) {
    counts[table] = (await pool.query(`SELECT count(*)::text AS count FROM party_runtime.${table}`)).rows[0].count;
  }
  return { party, counts };
}

test('CA-03 PostgreSQL: unsafe proposed scene rolls back P16 preparation with a typed not_started gap', async (t) => {
  const backend = await createPostgresTestBackend('ca03_scene_precommit');
  if (!backend) return t.skip('No supported PostgreSQL test backend');
  const pool = new pg.Pool({ connectionString: backend.partyUrl, max: 1 });
  t.after(async () => { await pool.end(); await backend.close(); });
  for (const name of ['001_party_runtime.sql', '002_party_runtime_v3.sql',
    '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql',
    '005_party_runtime_v3_domain.sql', '007_party_runtime_temporal_world.sql']) {
    await pool.query(await readFile(new URL(`../../../schemas/party-db/${name}`, import.meta.url), 'utf8'));
  }
  const source = await approvedNaturalPerceptionFixture({ canonical: true });
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,3,$2,'catalog','test','test','commands','profiles')`,
  ['party:1', source.input.pin.compatible_world_revision_id]);
  const baseline = await storedBaseline(pool);
  // A valid control proves the proposed-visible fixture reaches the real owner.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const valid = await projectSpatialV3ProposedVisiblePackage({ transaction: client,
      ...proposedFixture(source.perception) });
    assert.equal(valid.ok, true);
    assert.equal(valid.envelope.visible_payload.perceived_scene, source.perception.scene.visible_scene);
  } finally { await client.query('ROLLBACK'); client.release(); }
  assert.deepEqual(await storedBaseline(pool), baseline);

  const statements = [], dirty = structuredClone(source.perception);
  dirty.scene.visible_scene = 'INFERENCE: private draft';
  const tracedPool = { async connect() {
    const connection = await pool.connect();
    return { async query(sql, values) {
      statements.push(typeof sql === 'string' ? sql : sql.text);
      return connection.query(sql, values);
    }, release: () => connection.release() };
  } };
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool: tracedPool });
  let outcome, caught, ownerEntered = false;
  try {
    outcome = await committer.prepareExpansion({ party_id: 'party:1',
      g4_id: source.input.currentFacts.scene.g4_ref.id, idempotency_key: 'ca03-scene-gap',
      canonical_input_digest: computeSpatialV3CanonicalDigest({ action: 'ca03-scene-gap' }),
      prepare: async ({ transaction }) => {
        ownerEntered = true;
        await projectSpatialV3ProposedVisiblePackage({ transaction, ...proposedFixture(dirty) });
        // Reaching this control means scene admission did not reject. It still
        // must not cause a test write; the typed-gap assertion will fail.
        return { ok: false, error: { code: 'test_control_no_commit' } };
      } });
  } catch (error) { caught = error; }
  const error = caught ?? outcome?.error;
  const status = error?.turn_commit_status ?? error?.details?.turn_commit_status
    ?? error?.diagnostics?.turn_commit_status;
  const reason = error?.details?.reason ?? error?.diagnostics?.reason;
  t.diagnostic(JSON.stringify({ owner_entered: ownerEntered,
    code: error?.code, reason, turn_commit_status: status,
    transaction_statements: statements.filter((sql) => /^(?:BEGIN|ROLLBACK|COMMIT)$/u.test(sql)) }));
  assert.equal(ownerEntered, true, 'test must reach the proposed-visible owner inside P16');
  await t.test('real transaction rolls back without committed effects', async () => {
    assert.deepEqual(statements.filter((sql) => /^(?:BEGIN|ROLLBACK|COMMIT)$/u.test(sql)), ['BEGIN', 'ROLLBACK']);
    assert.deepEqual(await storedBaseline(pool), baseline);
  });
  await t.test('P16 preserves the owner gap and confirmed not_started', () => {
    assert.equal(error?.code, 'SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP');
    assert.equal(reason, 'player_safe_visible_scene_required');
    assert.equal(status, 'not_started');
    assert.doesNotMatch(JSON.stringify(error?.details ?? error?.diagnostics), /INFERENCE:/u);
  });
});
