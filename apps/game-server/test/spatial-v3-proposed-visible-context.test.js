import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { overlaySpatialV3VisibleRows, projectSpatialV3ProposedVisiblePackage } from
  '../src/runtime/spatial-v3-proposed-visible-context.js';

test('proposal and committed rows produce the same player-safe digest', async () => {
  const { perception } = await approvedNaturalPerceptionFixture({ canonical: true });
  const snapshot = { sites: [], scene_baselines: [], g6_instances: [], scene_positions: [],
    acoustic_profiles: [], visibility_links: [], portals: [], movement_edges: [],
    endpoint_bindings: [], placements: [] };
  const write = (target_table, id, record) => ({ target_table, id, record: {
    party_id: 'party:1', status: 'active', ...record } });
  const proposal = { target_site_id: 'site', target_position_id: 'position:shore',
    inserts: [write('party_g5_sites', 'site', { id: 'site', origin: 'generated' }),
      write('party_scene_baselines', 'baseline', { id: 'baseline', host_kind: 'g5_site', host_id: 'site' }),
      write('party_g6_instances', 'g6:inside', { id: 'g6:inside', scene_baseline_id: 'baseline', host_id: 'site' }),
      write('g6_acoustic_profiles', 'g6:inside', { g6_instance_id: 'g6:inside' }),
      write('scene_position_nodes', 'position:shore', { id: 'position:shore', g6_instance_id: 'g6:inside' }),
      write('party_site_connection_endpoint_bindings', 'binding:to', { id: 'binding:to',
        endpoint_role: 'to', g5_site_id: 'site', position_id: 'position:shore' })],
    updates: [] };
  const firstEntry = { approved_write_sets: [{ inserts: [write('entity_placements', 'item:item:1', {
    entity_kind: 'item', entity_id: 'item:1', position_node_id: 'position:shore' })],
  updates: [], appends: [] }] };
  const transaction = { query: () => { throw new Error('destination SELECT forbidden'); } };
  const pins = [];
  const envelopeInput = { package_id: 'visible:1', party_id: 'party:1', turn_id: 'turn:1',
    committed_state_version: '1', change_set_id: 'change:1',
    projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'policy:1' },
      authoring_version: 'v1' },
    dependency_pins: { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).slice(7) },
    idempotency_record_id: 'idem:1' };
  const readSources = async ({ transaction: received, overlay }) => {
    assert.equal(received, transaction);
    assert.equal(overlay.site.id, 'site');
    assert.equal(overlay.placements.length, 1);
    return { naturalInput: perception, partyId: 'party:1', actorId: 'player:1',
      positionId: overlay.position.id,
      entityObservations: overlay.placements.map((row) => ({ entity_kind: row.entity_kind,
        entity_id: row.entity_id, visibility: 'clear', display_label: 'корзина',
        exterior: { condition_state: 'intact' } })),
      localEdges: [], directionalExits: [] };
  };
  const proposed = await projectSpatialV3ProposedVisiblePackage({ transaction,
    snapshot, proposal, firstEntry, readSources, envelopeInput });
  const committed = overlaySpatialV3VisibleRows({ snapshot, proposal, firstEntry });
  const afterCommit = await projectSpatialV3ProposedVisiblePackage({ transaction,
    snapshot: committed, proposal: { ...proposal, inserts: [], updates: [] },
    firstEntry: { approved_write_sets: [] }, readSources, envelopeInput });
  assert.equal(proposed.envelope.package_digest, afterCommit.envelope.package_digest);
  assert.equal(proposed.envelope.visible_payload.visible_objects[0].entity_ref.entity_id, 'item:1');
});

test('missing relation source fails closed', () => {
  assert.throws(() => overlaySpatialV3VisibleRows({ snapshot: { sites: [] },
    proposal: { inserts: [], updates: [] }, firstEntry: { approved_write_sets: [] } }),
  (error) => error.details?.reason === 'place_visible_context_source_required');
});
