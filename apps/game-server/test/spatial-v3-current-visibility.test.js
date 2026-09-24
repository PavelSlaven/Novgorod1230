import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleCurrentTargets } from '../src/runtime/spatial-v3-current-visibility.js';
import { readCurrentEntityVisibilityScene } from '../src/infrastructure/postgres/g4-natural-perception-reader.js';

const clear = { lighting: 'clear', stable_cover: 'clear', dynamic_occlusion: 'clear',
  concealment: 'clear', weather: 'clear' };
function scene(mode = 'default_clear') {
  return { observer_position_id: 'a', observer_visual_capability: 'clear', positions: [
    { id: 'a', g6_instance_id: 'one' }, { id: 'b', g6_instance_id: 'one' },
    { id: 'c', g6_instance_id: 'two' }],
  g6: [{ id: 'one', intra_g6_visibility_mode: mode },
    { id: 'two', intra_g6_visibility_mode: 'default_clear' }],
  visibility_links: [], portals: {}, targets: ['a', 'b', 'c'].map((position_id) =>
    ({ target_id: `npc:${position_id}`, position_id, ...clear })), modifier_set: { complete: true, rows: [] } };
}
const ids = (input) => visibleCurrentTargets(input).map((row) => row.target_id);

test('complete empty modifier set permits same-G6 default and directed explicit links', () => {
  const input = scene();
  assert.deepEqual(ids(input), ['npc:a', 'npc:b']);
  input.g6[0].intra_g6_visibility_mode = 'explicit';
  assert.deepEqual(ids(input), []);
  input.visibility_links.push({ from_position_id: 'a', to_position_id: 'b', quality: 'partial', portal_entity_id: null });
  assert.deepEqual(ids(input), ['npc:b']);
  input.visibility_links.push({ from_position_id: 'a', to_position_id: 'c', quality: 'clear', portal_entity_id: null });
  assert.deepEqual(ids(input), ['npc:b', 'npc:c']);
  input.targets[2].weather = 'none';
  assert.deepEqual(ids(input), ['npc:b']);
});

test('empty modifier set is required before any visibility resolution', () => {
  const input = scene();
  assert.deepEqual(ids(input), ['npc:a', 'npc:b']);
  input.modifier_set.rows = null;
  assert.throws(() => visibleCurrentTargets(input), { code: 'SPATIAL_V3_VISIBILITY_DATA_GAP' });
});

test('targets can be absent or share a position; identity and observer capability govern results', () => {
  const input = scene();
  input.targets = [];
  assert.deepEqual(visibleCurrentTargets(input), []);
  input.targets = [
    { target_id: 'npc:one', position_id: 'b', ...clear },
    { target_id: 'npc:two', position_id: 'b', ...clear }];
  input.observer_visual_capability = 'partial';
  assert.deepEqual(visibleCurrentTargets(input), [
    { target_id: 'npc:one', visibility: 'partial' },
    { target_id: 'npc:two', visibility: 'partial' }]);
});

test('nonempty current modifier set requires approved effect mapping', () => {
  const input = scene();
  input.modifier_set.rows.push({ modifier_kind: 'smoke' });
  assert.throws(() => visibleCurrentTargets(input), (error) =>
    error.code === 'SPATIAL_V3_VISIBILITY_DATA_GAP'
      && error.details?.reason === 'visibility_modifier_effect_policy_required');
});

test('missing complete read never means clear or empty modifiers', () => {
  const input = scene();
  delete input.modifier_set;
  assert.throws(() => visibleCurrentTargets(input), { code: 'SPATIAL_V3_VISIBILITY_DATA_GAP' });
  input.modifier_set = { complete: true, rows: [] };
  delete input.targets[1].lighting;
  assert.throws(() => visibleCurrentTargets(input), { code: 'SPATIAL_V3_VISIBILITY_DATA_GAP' });
});

test('current scene reader retains two placements at one position and complete empty modifiers', async () => {
  const queries = [];
  const modifiers = [];
  const transaction = { async query(sql, params) {
    queries.push({ sql, params });
    if (queries.length % 2 === 1) return { rows: [{ world_revision_id: 'world',
      world_catalog_digest: 'digest', baseline: { id: 'baseline' }, site: { id: 'site' },
      positions: [{ id: 'a' }, { id: 'b' }], g6: [], location: { scene_position_id: 'a' },
      endpoint_bindings: [] }] };
    return { rows: [{ placements: [
      { party_id: 'party', entity_kind: 'npc', entity_id: 'one', position_node_id: 'b' },
      { party_id: 'party', entity_kind: 'npc', entity_id: 'two', position_node_id: 'b' }],
    movement_edges: [], modifiers }] };
  } };
  const args = { transaction, partyId: 'party', actorId: 'actor',
    pin: { compatible_world_revision_id: 'world', compatible_world_catalog_digest: 'digest' } };
  const first = await readCurrentEntityVisibilityScene(args);
  assert.deepEqual(first.placements.map((row) => row.entity_id), ['one', 'two']);
  assert.deepEqual(first.modifier_set, { complete: true, rows: [] });
  assert.deepEqual(queries[1].params, ['party', ['a', 'b'], 'baseline']);
  const replay = await readCurrentEntityVisibilityScene(args);
  assert.deepEqual(replay.placements, first.placements);
  modifiers.push({ id: 'remote', affected_scope_ref: {
    spatial_kind: 'scene_position', spatial_id: 'remote-position' } });
  assert.deepEqual((await readCurrentEntityVisibilityScene(args)).modifier_set.rows, []);
  modifiers.push({ id: 'local', affected_scope_ref: {
    spatial_kind: 'scene_position', spatial_id: 'b' } });
  assert.deepEqual((await readCurrentEntityVisibilityScene(args)).modifier_set.rows.map((row) => row.id), ['local']);
});
