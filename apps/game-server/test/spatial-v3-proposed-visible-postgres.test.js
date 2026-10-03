import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createPostgresTestBackend } from '../../../test/fixtures/postgres-test-backend.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { projectSpatialV3ProposedVisiblePackage } from
  '../src/runtime/spatial-v3-proposed-visible-context.js';

const tables = {
  sites: 'party_g5_sites', scene_baselines: 'party_scene_baselines',
  g6_instances: 'party_g6_instances', scene_positions: 'scene_position_nodes',
  acoustic_profiles: 'g6_acoustic_profiles', visibility_links: 'visibility_links',
  portals: 'portal_entities', movement_edges: 'scene_movement_edges',
  endpoint_bindings: 'party_site_connection_endpoint_bindings',
  placements: 'entity_placements'
};

test('PostgreSQL committed destination has proposed visible package digest', async (t) => {
  const backend = await createPostgresTestBackend('proposed_visible');
  if (!backend) return t.skip('No supported PostgreSQL test backend');
  const pool = new pg.Pool({ connectionString: backend.partyUrl, max: 1 });
  t.after(async () => { await pool.end(); await backend.close(); });
  for (const name of ['001_party_runtime.sql', '002_party_runtime_v3.sql']) {
    await pool.query(await readFile(new URL(`../../../schemas/party-db/${name}`, import.meta.url), 'utf8'));
  }
  const fixture = await approvedNaturalPerceptionFixture({ canonical: true });
  const partyId = 'party:1';
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,3,$2,'catalog','test','test','commands','profiles')`,
  [partyId, fixture.input.pin.compatible_world_revision_id]);

  const write = (target_table, id, record) => ({ target_table, id, record: {
    party_id: partyId, status: 'active', state_version: 1, ...record } });
  const change = { created_change_set_id: 'change:1', updated_change_set_id: 'change:1' };
  const site = write('party_g5_sites', 'site', { id: 'site', origin: 'canonical',
    parent_g4_id: fixture.input.currentFacts.scene.g4_ref.id,
    canonical_g5_ref: { entity_id: 'canonical:site' }, ...change });
  const baseline = write('party_scene_baselines', 'baseline', { id: 'baseline',
    host_kind: 'g5_site', host_id: 'site', source_kind: 'canonical_template',
    scene_template_ref: { entity_id: fixture.sceneClosure.header.id, authoring_version: '1' },
    materialization_trace_id: 'trace', materializer_version: 'test', catalog_digest: 'catalog', ...change });
  const g6 = write('party_g6_instances', 'g6:inside', {
    ...fixture.input.currentFacts.scene.g6[0], host_kind: 'g5_site', host_id: 'site',
    source_scene_template_ref: baseline.record.scene_template_ref,
    primary_scene_role_id: 'main', vertical_context_id: 'ground',
    default_visibility_distance_band: 'near', ...change });
  const position = write('scene_position_nodes', 'position:shore', {
    ...fixture.input.currentFacts.scene.positions[1], position_type_id: 'ground',
    capacity: 3, access_class_id: 'open', ...change });
  const acoustic = write('g6_acoustic_profiles', 'g6:inside', {
    g6_instance_id: 'g6:inside', ambient_noise: 0, acoustic_uniformity: 'uniform',
    updated_change_set_id: 'change:1' });
  const binding = write('party_site_connection_endpoint_bindings', 'binding', {
    id: 'binding', site_connection_id: 'connection', endpoint_role: 'to',
    g5_site_id: 'site', position_id: 'position:shore', source_slot_key: 'arrival',
    activated_change_set_id: 'change:1' });
  const item = write('entity_placements', 'item:item:1', { entity_kind: 'item',
    entity_id: 'item:1', placement_kind: 'scene_position', position_node_id: 'position:shore',
    occupies_capacity_units: 1, updated_change_set_id: 'change:1' });
  const proposal = { target_site_id: 'site', target_position_id: 'position:shore',
    inserts: [site, baseline, g6, position, acoustic, binding], updates: [] };
  const firstEntry = { approved_write_sets: [{ inserts: [item], updates: [], appends: [] }] };
  const pins = [];
  const envelopeInput = { package_id: 'visible:1', party_id: partyId, turn_id: 'turn:1',
    committed_state_version: '1', change_set_id: 'change:1',
    projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'policy:1' },
      authoring_version: 'v1' },
    dependency_pins: { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).slice(7) },
    idempotency_record_id: 'idem:1' };
  const readSnapshot = async (transaction) => {
    const snapshot = {};
    for (const [key, table] of Object.entries(tables)) {
      snapshot[key] = (await transaction.query(
        `SELECT * FROM party_runtime.${table} WHERE party_id=$1`, [partyId])).rows;
    }
    return snapshot;
  };
  const readSources = async ({ overlay }) => ({ naturalInput: {
    ...fixture.perception, scene: { ...fixture.perception.scene,
      positions: overlay.scene_positions, g6: overlay.g6_instances,
      acoustic_profiles: overlay.acoustic_profiles } },
  partyId, actorId: 'player:1', positionId: overlay.position.id,
  entityObservations: overlay.placements.map((row) => ({ entity_kind: row.entity_kind,
    entity_id: row.entity_id, visibility: 'clear', display_label: 'корзина',
    exterior: { condition_state: 'intact' } })), localEdges: [], directionalExits: [] });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await readSnapshot(client);
    assert.equal(before.sites.length, 0);
    const proposed = await projectSpatialV3ProposedVisiblePackage({ transaction: client,
      snapshot: before, proposal, firstEntry, readSources, envelopeInput });
    for (const row of proposal.inserts) {
      if (row === binding) {
        await client.query(`INSERT INTO party_runtime.g5_site_connections
          (id,party_id,from_site_id,to_site_id,passage_type_id,
           transition_environment_profile_ref,movement_orientation_profile_ref,
           cost_kind,action_units,status,state_version,created_change_set_id,updated_change_set_id)
          VALUES ('connection',$1,'site','site','walk','{}','{}','action',1,'active',1,'change:1','change:1')`,
        [partyId]);
      }
      await client.query(`INSERT INTO party_runtime.${row.target_table}
        SELECT * FROM jsonb_populate_record(NULL::party_runtime.${row.target_table},$1::jsonb)`,
      [JSON.stringify(row.record)]);
    }
    await client.query(`INSERT INTO party_runtime.entity_placements
      SELECT * FROM jsonb_populate_record(NULL::party_runtime.entity_placements,$1::jsonb)`,
    [JSON.stringify(item.record)]);
    await client.query('COMMIT');
    const after = await readSnapshot(client);
    assert.equal(after.sites.length, 1);
    assert.equal(after.placements.length, 1);
    const committed = await projectSpatialV3ProposedVisiblePackage({ transaction: client,
      snapshot: after,
      proposal: { ...proposal, inserts: [], updates: [] },
      firstEntry: { approved_write_sets: [] }, readSources, envelopeInput });
    assert.equal(proposed.envelope.package_digest, committed.envelope.package_digest);
    assert.equal(committed.envelope.visible_payload.visible_objects[0].entity_ref.entity_id,
      'item:1');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
});
