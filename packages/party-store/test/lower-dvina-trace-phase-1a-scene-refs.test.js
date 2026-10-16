import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTracePhase1ASceneRefs } from
  '../src/lower-dvina-trace-phase-1a-repository.js';
import { createLowerDvinaTracePhase1ARepository } from
  '../src/lower-dvina-trace-phase-1a-repository.js';

const scene = () => ({
  node_id: 'node:start',
  selected_position_id: 'position:arrival',
  canonical_scene_proposal: {
    party_id: 'party:start',
    site_id: 'g5:node:start',
    baseline_id: 'baseline:node:start',
    endpoints: [{ endpoint_role: 'arrival', position_id: 'position:arrival' }],
    rows: [
      { target_table: 'party_scene_baselines', id: 'baseline:node:start',
        record: { id: 'baseline:node:start', host_kind: 'g5_site', host_id: 'g5:node:start' } },
      { target_table: 'party_g6_instances', id: 'g6:start',
        record: { id: 'g6:start', scene_baseline_id: 'baseline:node:start',
          host_kind: 'g5_site', host_id: 'g5:node:start' } },
      { target_table: 'scene_position_nodes', id: 'position:arrival',
        record: { id: 'position:arrival', g6_instance_id: 'g6:start' } },
      { target_table: 'scene_position_nodes', id: 'position:other',
        record: { id: 'position:other', g6_instance_id: 'g6:start' } },
      { target_table: 'scene_movement_edges', id: 'edge:start' },
      { target_table: 'g6_acoustic_profiles', id: 'acoustic:start' },
    ]
  },
  s1_physical_writes: [
    { target_table: 'visibility_links', id: 'link:start' },
  ]
});

const refs = [
  { domain: 'g5_node', instance_id: 'node:start' },
  { domain: 'npc', instance_id: 'npc:start' },
];

test('Phase1A maps legacy domain refs to exact authored scene row refs', () => {
  assert.deepEqual(projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: refs, initialSpatialV3: scene(),
  }), [
    { table: 'entity_placements', id: 'npc:npc:start' },
    { table: 'party_g5_sites', id: 'g5:node:start' },
    { table: 'party_g6_instances', id: 'g6:start' },
    { table: 'party_scene_baselines', id: 'baseline:node:start' },
    { table: 'scene_movement_edges', id: 'edge:start' },
    { table: 'scene_position_nodes', id: 'position:arrival' },
    { table: 'scene_position_nodes', id: 'position:other' },
    { table: 'visibility_links', id: 'link:start' },
  ]);
});

test('Phase1A rejects scene rows not tied to its g5 created_ref or arrival', () => {
  assert.throws(() => projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: refs.slice(1), initialSpatialV3: scene(),
  }), { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
  const wrongSite = scene();
  wrongSite.canonical_scene_proposal.site_id = 'g5:foreign';
  assert.throws(() => projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: refs, initialSpatialV3: wrongSite,
  }), { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
  const noArrival = scene();
  noArrival.selected_position_id = 'position:foreign';
  assert.throws(() => projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: refs, initialSpatialV3: noArrival,
  }), { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
});

test('Phase1A scene read returns refs and the physical baseline creation change set', async () => {
  const queries = [];
  const repository = createLowerDvinaTracePhase1ARepository({ async query(sql, values) {
    queries.push({ sql, values });
    if (queries.length === 1) return { rows: [{
      state_payload: { initial_spatial_v3: scene() }, created_refs: refs,
    }] };
    return { rows: [{ created_change_set_id: 'change:baseline' }] };
  } });
  const result = await repository.loadSceneRefs('party:start');
  assert.equal(result.change_set_id, 'change:baseline');
  assert.deepEqual(result.refs, projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: refs, initialSpatialV3: scene(),
  }));
  assert.deepEqual(queries[1].values, ['party:start', 'g5:node:start']);
});

const authored = () => ({
  node_id: 'node:start', anchor_id: 'anchor:start',
  s1_topology: { g6_instance_ref: 's1:g6', position_ref: 's1:position',
    movement_edge_refs: ['s1:out', 's1:back'],
    visibility_link_refs: ['s1:visible-out', 's1:visible-back'] },
  s1_physical_writes: [
    { target_table: 'party_g6_instances', id: 's1:g6',
      record: { scene_baseline_id: 'baseline:node:start',
        host_kind: 'g5_site', host_id: 'g5:node:start' } },
    { target_table: 'scene_position_nodes', id: 's1:position',
      record: { g6_instance_id: 's1:g6' } },
    ...['s1:out', 's1:back'].map((id) =>
      ({ target_table: 'scene_movement_edges', id })),
    ...['s1:visible-out', 's1:visible-back'].map((id) =>
      ({ target_table: 'visibility_links', id }))
  ]
});
const authoredRefs = [
  { domain: 'player_character', instance_id: 'player:start' },
  { domain: 'g5_node', instance_id: 'node:start' },
  { domain: 'g5_anchor', instance_id: 'anchor:start' },
  { domain: 'npc', instance_id: 'npc:start' }
];
const authoredRuntime = {
  g5: 'g5:node:start', baseline: 'baseline:node:start',
  g6: 'g6:anchor:start', position: 'position:anchor:start',
  journey: 'journey-location:party:start:player:start'
};

test('Phase1A maps authored start runtime and S1 rows without canonical proposal', () => {
  assert.deepEqual(projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: authoredRefs,
    initialSpatialV3: authored(), initialSpatialV3Runtime: authoredRuntime,
  }), [
    { table: 'party_g5_sites', id: 'g5:node:start' },
    { table: 'party_g6_instances', id: 'g6:anchor:start' },
    { table: 'party_g6_instances', id: 's1:g6' },
    { table: 'party_scene_baselines', id: 'baseline:node:start' },
    { table: 'scene_movement_edges', id: 's1:back' },
    { table: 'scene_movement_edges', id: 's1:out' },
    { table: 'scene_position_nodes', id: 'position:anchor:start' },
    { table: 'scene_position_nodes', id: 's1:position' },
    { table: 'visibility_links', id: 's1:visible-back' },
    { table: 'visibility_links', id: 's1:visible-out' },
  ]);
});

test('Phase1A rejects invalid authored runtime and S1 topology', () => {
  assert.throws(() => projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: authoredRefs,
    initialSpatialV3: authored(),
    initialSpatialV3Runtime: { ...authoredRuntime, g6: 'g6:foreign' },
  }), { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
  const broken = authored();
  broken.s1_physical_writes[0].record.host_id = 'g5:foreign';
  assert.throws(() => projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: authoredRefs,
    initialSpatialV3: broken, initialSpatialV3Runtime: authoredRuntime,
  }), { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
  const brokenCanonical = scene();
  brokenCanonical.canonical_scene_proposal.site_id = 'g5:foreign';
  assert.throws(() => projectLowerDvinaTracePhase1ASceneRefs({
    partyId: 'party:start', createdRefs: authoredRefs,
    initialSpatialV3: brokenCanonical, initialSpatialV3Runtime: authoredRuntime,
  }), { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
});
