import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createPostgresTestBackend } from '../../../test/fixtures/postgres-test-backend.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { createSpatialV3CurrentVisibilityProvider } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-provider.js';
import { projectSpatialV3CurrentVisibleNpcs } from
  '../src/runtime/spatial-v3-current-visible-context.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
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

test('Phase 2 refresh reads committed NPCs through Spatial after arrival and restart', async (t) => {
  const backend = await createPostgresTestBackend('visible_npc_refresh');
  if (!backend) return t.skip('No supported PostgreSQL test backend');
  const pool = new pg.Pool({ connectionString: backend.partyUrl, max: 2 });
  t.after(async () => { await pool.end(); await backend.close(); });
  for (const name of ['001_party_runtime.sql', '002_party_runtime_v3.sql']) {
    await pool.query(await readFile(new URL(`../../../schemas/party-db/${name}`, import.meta.url), 'utf8'));
  }
  const fixture = await approvedNaturalPerceptionFixture({ canonical: true });
  const partyId = 'party:npc-refresh';
  const actorId = 'player:npc-refresh';
  const positionId = 'position:shore';
  const siteId = 'site:npc-refresh';
  const g6Id = 'g6:npc-refresh';
  const change = { created_change_set_id: 'change:npc-refresh',
    updated_change_set_id: 'change:npc-refresh' };
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,3,$2,'catalog','test','test','commands','profiles')`,
  [partyId, fixture.input.pin.compatible_world_revision_id]);
  const insertRecord = (table, id, row) => pool.query(
    `INSERT INTO party_runtime.${table}
       SELECT * FROM jsonb_populate_record(NULL::party_runtime.${table},$1::jsonb)`,
    [JSON.stringify({ party_id: partyId, status: 'active', state_version: 1, ...row, ...change })]);
  await insertRecord('party_g5_sites', siteId, { id: siteId, origin: 'canonical',
    parent_g4_id: fixture.perception.scene.g4_ref.id,
    canonical_g5_ref: { entity_id: 'canonical:npc-refresh' } });
  await insertRecord('party_scene_baselines', 'baseline:npc-refresh', { id: 'baseline:npc-refresh',
    host_kind: 'g5_site', host_id: siteId, source_kind: 'canonical_template',
    scene_template_ref: { entity_id: fixture.sceneClosure.header.id, authoring_version: '1' },
    materialization_trace_id: 'trace:npc-refresh', materializer_version: 'test', catalog_digest: 'catalog' });
  await insertRecord('party_g6_instances', g6Id, { id: g6Id, host_kind: 'g5_site', host_id: siteId,
    scene_baseline_id: 'baseline:npc-refresh', scene_slot_key: 'main',
    source_scene_template_ref: { entity_id: fixture.sceneClosure.header.id, authoring_version: '1' },
    primary_scene_role_id: 'main', vertical_context_id: 'ground',
    default_visibility_distance_band: 'near',
    physical_class_id: 'spatial.g6.open', overhead_cover_id: 'none',
    intra_g6_visibility_mode: 'default_clear', acoustic_uniformity: 'uniform' });
  await insertRecord('scene_position_nodes', positionId, { id: positionId,
    g6_instance_id: g6Id, template_slot_key: 'arrival', template_instance_ordinal: 0,
    position_type_id: 'ground', capacity: 5, access_class_id: 'open' });
  await pool.query(`INSERT INTO party_runtime.entity_placements
    (party_id,entity_kind,entity_id,placement_kind,position_node_id,occupies_capacity_units,
     state_version,updated_change_set_id)
    VALUES ($1,'npc','npc:seasonal','scene_position',$2,1,1,'change:npc-refresh')`,
  [partyId, positionId]);

  const emptyVisibleContext = () => ({ version: 1, schema: 'visible_context_package',
    visible_scene: 'Лесная тропа', visible_changes: [], sensory_details: [],
    visible_npc: [], visible_objects: [], known_context: [], uncertainties: [],
    allowed_tensions: [], do_not_imply: [] });
  const repositoryFor = (mode = 'default_clear', visualCapability = 'clear') => {
    const provider = createSpatialV3CurrentVisibilityProvider({ pool,
      verifiedCatalog: fixture.input.verifiedCatalog, pin: fixture.input.pin,
      readScene: async ({ transaction, partyId: currentPartyId, actorId: currentActorId,
        observedPositionId }) => ({
        world_revision_id: fixture.perception.scene.g4_ref.world_revision_id,
        location: { party_id: currentPartyId, owner_id: currentActorId,
          scene_position_id: observedPositionId },
        site: { id: siteId, parent_g4_id: fixture.perception.scene.g4_ref.id },
        baseline: { id: 'baseline:npc-refresh' },
        positions: [{ id: positionId, g6_instance_id: g6Id }],
        g6: [{ id: g6Id, intra_g6_visibility_mode: mode }],
        visibility_links: [], movement_edges: [], modifier_set: { complete: true, rows: [] },
        placements: (await transaction.query(`SELECT entity_kind,entity_id,position_node_id
          FROM party_runtime.entity_placements WHERE party_id=$1 AND placement_kind='scene_position'`,
        [currentPartyId])).rows
      }),
      readNatural: async ({ partyId: currentPartyId, actorId: currentActorId,
        observedPositionId }) => ({
        observer: { party_id: currentPartyId, actor_id: currentActorId,
          position_id: observedPositionId, visual_capability: visualCapability },
        scene: { baseline_id: 'baseline:npc-refresh',
          g4_ref: fixture.perception.scene.g4_ref, portals: {} },
        ambient_visibility: { g6_instance_id: g6Id,
          lighting: visualCapability === 'none' ? 'none' : 'clear',
          weather: 'clear', stable_cover: 'clear' }
      }),
      readTargetConditions: async () => ({ stable_cover: 'clear',
        dynamic_occlusion: 'clear', concealment: 'clear' }),
      readEntityExterior: async () => ({ appearance: { build: 'average' },
        visible_equipment: [] }),
      readPlayerKnowledge: async () => null
    });
    return createLowerDvinaTracePhase2PostgresRepository({ partyPool: pool,
      committer: { async commit() {} },
      readCurrentVisibleContext: async ({ partyId: currentPartyId, actorId: currentActorId,
        positionId: currentPositionId }) => {
        const transaction = await pool.connect();
        try {
          await transaction.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          const observations = await provider.readEntityObservations({ transaction,
            partyId: currentPartyId, actorId: currentActorId,
            observedPositionId: currentPositionId });
          const visible_npc = projectSpatialV3CurrentVisibleNpcs(observations);
          await transaction.query('COMMIT');
          return { ...emptyVisibleContext(), visible_npc };
        } catch (error) {
          await transaction.query('ROLLBACK').catch(() => {});
          throw error;
        } finally { transaction.release(); }
      }
    });
  };
  const committedState = (activity) => ({ party_id: partyId, actor_id: actorId,
    position: { position_id: positionId },
    npcs: [{ instance_id: 'npc:seasonal', machine_state: {
      current_activity: { activity_ref: activity, summary: activity } } },
    { instance_id: 'npc:offstage', presence_state: 'offstage_away' }],
    current_visible_context: emptyVisibleContext() });

  for (const activity of ['sleeping', 'working']) {
    const loaded = await repositoryFor().loadPreparedMovementScene({ partyId,
      state: committedState(activity) });
    assert.deepEqual(loaded.current_visible_context.visible_npc.map((row) =>
      row.entity_ref.entity_id), ['npc:seasonal']);
  }
  const restartedReadback = await repositoryFor().loadPreparedMovementScene({ partyId,
    state: committedState('sleeping') });
  assert.deepEqual(restartedReadback.current_visible_context.visible_npc.map((row) =>
    row.entity_ref.entity_id), ['npc:seasonal']);
  for (const [mode, visualCapability] of [['explicit', 'clear'], ['default_clear', 'none']]) {
    const hidden = await repositoryFor(mode, visualCapability).loadPreparedMovementScene({
      partyId, state: committedState('working') });
    assert.deepEqual(hidden.current_visible_context.visible_npc, []);
  }
});
