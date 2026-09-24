import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { createSpatialV3ProposedVisibleSources } from
  '../src/infrastructure/postgres/spatial-v3-proposed-visible-sources.js';
import { overlaySpatialV3VisibleRows, projectSpatialV3ProposedVisiblePackage } from
  '../src/runtime/spatial-v3-proposed-visible-context.js';

test('proposed destination matches committed package using one transaction for mutable facts', async () => {
  const fixture = await approvedNaturalPerceptionFixture({ canonical: true });
  const { currentFacts } = fixture.input;
  const rows = { sites: [], scene_baselines: [], g6_instances: [], scene_positions: [],
    acoustic_profiles: [], visibility_links: [], portals: [], movement_edges: [],
    endpoint_bindings: [], placements: [] };
  const write = (target_table, id, record) => ({ target_table, id,
    record: { party_id: 'party:1', status: 'active', state_version: 1, ...record } });
  const site = write('party_g5_sites', 'site', { id: 'site', origin: 'generated',
    parent_g4_id: currentFacts.scene.g4_ref.id });
  const baseline = write('party_scene_baselines', 'baseline', { id: 'baseline',
    host_kind: 'g5_site', host_id: 'site', scene_template_ref: {
      entity_id: fixture.sceneClosure.header.id,
      authoring_version: String(fixture.sceneClosure.header.version) } });
  const proposal = { target_site_id: 'site', target_position_id: 'position:shore',
    inserts: [site, baseline,
      ...currentFacts.scene.g6.map((row) => write('party_g6_instances', row.id,
        { ...row, host_id: 'site' })),
      ...currentFacts.scene.positions.map((row) => write('scene_position_nodes', row.id, row)),
      ...currentFacts.scene.acoustic_profiles.map((row) => write('g6_acoustic_profiles', row.g6_instance_id, row)),
      write('party_site_connection_endpoint_bindings', 'binding', { id: 'binding',
        endpoint_role: 'to', g5_site_id: 'site', position_id: 'position:shore',
        source_slot_key: currentFacts.source_endpoint.slot_key })], updates: [] };
  const firstEntry = { approved_write_sets: [{ inserts: [write('entity_placements', 'item:item:1', {
    entity_kind: 'item', entity_id: 'item:1', position_node_id: 'position:shore',
    placement_kind: 'scene_position' })], updates: [], appends: [] }] };
  const seen = [];
  const transaction = { async query(sql) {
    seen.push(sql);
    assert.doesNotMatch(sql, /party_g5_sites|party_scene_baselines|scene_position_nodes/);
    if (sql.includes('party_actor_body_states')) return { rowCount: 1,
      rows: [{ state_version: 3 }] };
    if (sql.includes('party_item_placements')) return { rows: [{ state: { contents: [] },
      condition_state: 'intact', anchor_id: null, scene_position_id: 'position:shore',
      container_id: null, holder_npc_id: null, holder_character_id: null }] };
    return { rows: [] };
  } };
  const expansionClosure = { directional_exits: [] };
  const readSources = createSpatialV3ProposedVisibleSources({
    verifiedCatalog: fixture.input.verifiedCatalog, pin: fixture.input.pin,
    worldBaseReader: { async readPinnedSceneTemplateClosure() {
      return { ok: true, value: fixture.sceneClosure }; } },
    actorId: 'player:1', sourceLocation: { party_id: 'party:1', owner_id: 'player:1',
      scene_position_id: 'position:source' }, expansionClosure,
    readCurrentEnvironment: async ({ transaction: used }) => {
      assert.equal(used, transaction); return currentFacts.current_environment;
    },
    readTargetConditions: async ({ transaction: used }) => {
      assert.equal(used, transaction);
      return { stable_cover: 'clear', dynamic_occlusion: 'clear', concealment: 'clear' };
    } });
  const pins = [];
  const envelopeInput = { package_id: 'visible:1', party_id: 'party:1', turn_id: 'turn:1',
    committed_state_version: '1', change_set_id: 'change:1',
    projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'policy:1' },
      authoring_version: 'v1' }, dependency_pins: { pins,
      canonical_digest: computeSpatialV3CanonicalDigest(pins).slice(7) },
    idempotency_record_id: 'idem:1' };
  const proposed = await projectSpatialV3ProposedVisiblePackage({ transaction, snapshot: rows,
    proposal, firstEntry, readSources, envelopeInput });
  const committed = overlaySpatialV3VisibleRows({ snapshot: rows, proposal, firstEntry });
  const afterCommit = await projectSpatialV3ProposedVisiblePackage({ transaction,
    snapshot: committed, proposal: { ...proposal, inserts: [], updates: [] },
    firstEntry: { approved_write_sets: [] }, readSources, envelopeInput });
  assert.equal(proposed.envelope.package_digest, afterCommit.envelope.package_digest);
  assert.equal(proposed.envelope.visible_payload.visible_objects[0].entity_ref.entity_id, 'item:1');
  assert.ok(seen.some((sql) => sql.includes('party_actor_body_states')));
  assert.ok(seen.some((sql) => sql.includes('visibility_modifiers')));
  assert.ok(seen.some((sql) => sql.includes('party_item_placements')));
  fixture.sceneClosure.visibility_links = [{ link_slot_key: 'unmaterialized' }];
  await assert.rejects(projectSpatialV3ProposedVisiblePackage({ transaction, snapshot: rows,
    proposal, firstEntry, readSources, envelopeInput }), (error) =>
    error.details?.reason === 'place_visible_context_source_required');
  delete fixture.sceneClosure.visibility_links;
  delete expansionClosure.directional_exits;
  await assert.rejects(projectSpatialV3ProposedVisiblePackage({ transaction, snapshot: rows,
    proposal, firstEntry, readSources, envelopeInput }), (error) =>
    error.details?.reason === 'place_visible_context_source_required');
});
