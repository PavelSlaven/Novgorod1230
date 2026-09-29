import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENE_NPC_SOURCE, withSceneNpcs, withoutSceneNpcs } from
  '../src/infrastructure/postgres/scene-npcs-readback.js';

const row = (id, extra = {}) => ({ npc_id: id, run_id: 'run', profile_set_id: 'profile',
  profile_level: 'background', anchor_id: null,
  identity_state: { public_role_label: 'рыбак' }, machine_state: { status: 'active' },
  semantic_state: { participant_slot_ref: `slot:${id}`, location_profile_ref: 'loc' },
  role_ref: 'role_fisher', occupation_ref: 'occ_fisher',
  skill_profile_snapshot: { approved_defaults: [] }, knowledge_profile_snapshot: { local: 'x' },
  attribute_profile_snapshot: { strength: 3 }, profile_candidate_set_digest: 'digest',
  position_id: `pos:${id}`, g6_instance_id: 'g6:main', ...extra });
const pool = (rows) => { const calls = []; return { calls, async query(text, values) {
  calls.push({ text, values }); return { rows }; } }; };
const base = (extra = {}) => ({ position: { site_id: 'site:1', position_id: 'pos:me',
  g6_instance_id: 'g6:main' }, npcs: [{ instance_id: 'npc_start', anchor_id: 'a' }], ...extra });

test('scene NPCs are read from the database for the current site with the G6', async () => {
  const p = pool([row('npc_gen')]);
  const state = await withSceneNpcs(p, 'party', base());
  assert.deepEqual(p.calls[0].values, ['party', 'site:1']);
  const loaded = state.npcs.find(({ instance_id: id }) => id === 'npc_gen');
  assert.equal(loaded.g6_instance_id, 'g6:main');
  assert.equal(loaded.position_id, 'pos:npc_gen');
  assert.equal(loaded.anchor_id, null);
  assert.equal(loaded.participant_slot_ref, 'slot:npc_gen');
  assert.deepEqual(loaded.role_ref, { id: 'role_fisher', source: 'approved_social_roles' });
  assert.deepEqual(loaded.occupation_ref, { id: 'occ_fisher', source: 'approved_occupations' });
  assert.deepEqual(loaded.base_attributes, { strength: 3 });
  assert.equal(loaded.location_profile_ref, 'loc');
  assert.equal(loaded.runtime_source, SCENE_NPC_SOURCE);
  assert.equal(state.npcs.length, 2);
});

test('existing records win by instance_id; no site or no rows leaves the state alone', async () => {
  const kept = await withSceneNpcs(pool([row('npc_start')]), 'party', base());
  assert.deepEqual(kept.npcs, [{ instance_id: 'npc_start', anchor_id: 'a' }]);
  const p = pool([row('npc_gen')]);
  const noSite = base({ position: { position_id: 'pos:me' } });
  assert.equal(await withSceneNpcs(p, 'party', noSite), noSite);
  assert.equal(p.calls.length, 0);
  const empty = base();
  assert.deepEqual((await withSceneNpcs(pool([]), 'party', empty)).npcs, empty.npcs);
});

test('scene-loaded NPCs are stripped before a snapshot and nothing else is touched', () => {
  const keep = { instance_id: 'npc_start', anchor_id: 'a' };
  const state = { npcs: [keep, { instance_id: 'npc_gen', runtime_source: SCENE_NPC_SOURCE }],
    other: 1 };
  const stripped = withoutSceneNpcs(state);
  assert.deepEqual(stripped.npcs, [keep]);
  assert.equal(stripped.other, 1);
  assert.equal(state.npcs.length, 2);
  const untouched = { other: 1 };
  assert.equal(withoutSceneNpcs(untouched), untouched);
});
