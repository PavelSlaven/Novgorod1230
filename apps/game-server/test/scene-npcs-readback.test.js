import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENE_NPC_SOURCE, withSceneNpcs, withoutSceneNpcs } from
  '../src/infrastructure/postgres/scene-npcs-readback.js';
import { projectPreparedDomainState } from
  '../src/runtime/lower-dvina-trace-turn-step-prepared-state-projection.js';
import { routineNpcSnapshot, withoutSceneRead } from '../src/runtime/lower-dvina-trace-scene-presence.js';
import { bindLowerDvinaTraceTurnStepIdempotency } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-idempotency.js';

const row = (id, extra = {}) => ({ npc_id: id, run_id: 'run', profile_set_id: 'profile',
  profile_level: 'background', anchor_id: null,
  identity_state: { public_role_label: 'рыбак' }, machine_state: { status: 'active' },
  semantic_state: { participant_slot_ref: `slot:${id}`, location_profile_ref: 'loc' },
  role_ref: 'role_fisher', occupation_ref: 'occ_fisher',
  skill_profile_snapshot: { approved_defaults: [] }, knowledge_profile_snapshot: { local: 'x' },
  attribute_profile_snapshot: { strength: 3 }, profile_candidate_set_digest: 'digest',
  position_id: `pos:${id}`, g6_instance_id: 'g6:main', ...extra });
const pool = (rows, positions = [{ id: 'pos:me', g6_instance_id: 'g6:main' }]) => {
  const calls = []; return { calls, async query(text, values) {
    calls.push({ text, values });
    return { rows: /FROM party_runtime.party_npcs/.test(text) ? rows : positions }; } }; };
const base = (extra = {}) => ({ position: { site_id: 'site:1', position_id: 'pos:me',
  g6_instance_id: 'g6:main' }, npcs: [{ instance_id: 'npc_start', anchor_id: 'a' }], ...extra });

test('scene NPCs are read from the database for the current site with the G6', async () => {
  const p = pool([row('npc_gen')]);
  const state = await withSceneNpcs(p, 'party', base());
  assert.deepEqual(p.calls.map(({ values }) => values), [['party', 'site:1'], ['party', 'site:1']]);
  assert.deepEqual(state.scene_position_g6, { 'pos:me': 'g6:main' });
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

test('prepared destination readback exposes scene NPCs on arrival and next-turn reload', async () => {
  const transition = { destination_site_id: 'site:destination',
    destination_g6_instance_id: 'g6:destination',
    to_position_ref: 'pos:destination' };
  const committed = {
    actor_id: 'player',
    position: { location_ref: 'source', site_id: 'site:source',
      g5_anchor_id: 'anchor:source', g5_node_id: 'node:source',
      position_id: 'pos:source', g6_id: 'g6:source' },
    prepared_scenes: [{ location_profile_ref: 'destination',
      node: { instance_id: 'node:destination' },
      anchor: { instance_id: 'anchor:destination',
        state: { zone_ref: 'zone:destination' } } }],
    npcs: [],
    clock: { whole_minutes: '0', subminute_numerator: '0',
      subminute_denominator: '1' },
    clock_weather_light: { clock: { whole_minutes: '0',
      subminute_numerator: '0', subminute_denominator: '1' } },
    body_state: {}
  };
  const effect = { consequence: { movement: { route_ref: 'route:destination',
    source: { location_ref: 'source' }, destination: {
      location_ref: 'destination', g5_anchor_id: 'anchor:destination',
      scene_position_id: 'pos:destination' } }, position_transition: transition },
  time_update: { clock_after: committed.clock, temporal_results: [] },
  body_update: { state_after: {} } };
  const destination = projectPreparedDomainState(committed, effect);
  assert.deepEqual([destination.position.site_id,
    destination.position.position_id, destination.position.g6_instance_id],
  ['site:destination', 'pos:destination', 'g6:destination']);

  const destinationPool = pool([row('npc_destination', {
    position_id: 'pos:destination', g6_instance_id: 'g6:destination' })], [
    { id: 'pos:destination', g6_instance_id: 'g6:destination' }
  ]);
  const arrival = await withSceneNpcs(destinationPool, 'party', destination);
  const npc = arrival.npcs.find(({ instance_id: id }) =>
    id === 'npc_destination');
  assert.equal(npc.runtime_source, SCENE_NPC_SOURCE);
  assert.equal(npc.g6_instance_id, 'g6:destination');
  assert.deepEqual(destinationPool.calls.map(({ values }) => values), [
    ['party', 'site:destination'], ['party', 'site:destination']
  ]);

  const nextTurn = await withSceneNpcs(destinationPool, 'party',
    withoutSceneNpcs(arrival));
  assert.equal(nextTurn.npcs.some(({ instance_id: id }) =>
    id === 'npc_destination'), true);
  assert.equal(nextTurn.scene_position_g6['pos:destination'],
    'g6:destination');
});

test('existing records win by instance_id; no site or no rows leaves the state alone', async () => {
  const kept = await withSceneNpcs(pool([row('npc_start')]), 'party', base());
  assert.deepEqual(kept.npcs, [{ instance_id: 'npc_start', anchor_id: 'a' }]);
  assert.deepEqual(kept.scene_position_g6, { 'pos:me': 'g6:main' });
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
    other: 1, scene_position_g6: { p: 'g' } };
  const stripped = withoutSceneNpcs(state);
  assert.deepEqual(stripped.npcs, [keep]);
  assert.equal(Object.hasOwn(stripped, 'scene_position_g6'), false);
  assert.equal(stripped.other, 1);
  assert.equal(state.npcs.length, 2);
  const nested = withoutSceneNpcs({ last_turn: { exchange: { world_state: { npcs: [
    keep, { instance_id: 'npc_gen', runtime_source: SCENE_NPC_SOURCE }] } } } });
  assert.deepEqual(nested.last_turn.exchange.world_state.npcs, [keep]);
  const untouched = { other: 1 };
  assert.equal(withoutSceneNpcs(untouched), untouched);
});

test('the routine schedule keeps a slim snapshot of a scene-read NPC', () => {
  const full = { instance_id: 'npc_gen', anchor_id: null, machine_state: { status: 'active' },
    identity_state: { canonical_name: 'X' }, semantic_state: { hidden: 1 },
    runtime_source: SCENE_NPC_SOURCE };
  assert.deepEqual(routineNpcSnapshot(full), { instance_id: 'npc_gen', anchor_id: null,
    machine_state: { status: 'active' } });
  const sealed = { instance_id: 'npc_start', semantic_state: {} };
  assert.equal(routineNpcSnapshot(sealed), sealed);
});

test('every snapshot writer of the trace runtime drops scene-read NPCs', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const dir = new URL('../src/infrastructure/postgres/', import.meta.url);
  // party-store*: autonomous change sets patch the stored payload (no scene NPCs in it).
  // turn-step-state builds the row; its only caller (turn-step-commit) strips first.
  const covered = new Set(['lower-dvina-trace-turn-step-state.js', 'party-store-turn.js',
    'party-store.js', 'scene-npcs-readback.js']);
  const bad = [];
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.js') || covered.has(name)) continue;
    const source = await readFile(new URL(name, dir), 'utf8');
    for (const [, value] of source.matchAll(/state_payload:\s*([A-Za-z_][\w.]*(?:\(|\b))/gu)) {
      const stripped = value.startsWith('withoutSceneNpcs(')
        || new RegExp(`(?:const|let)\\s+${value}\\s*=\\s*withoutSceneNpcs\\(`, 'u').test(source);
      if (!stripped) bad.push(`${name}: state_payload: ${value}`);
    }
  }
  assert.deepEqual(bad, []);
  const commit = await readFile(new URL('lower-dvina-trace-turn-step-commit.js', dir), 'utf8');
  assert.match(commit, /persistedSnapshot = withoutSceneNpcs\(turnStep\.snapshot\)/u);
  assert.match(commit, /snapshot: persistedSnapshot/u);
});

test('the idempotency binder fails closed on a scene NPC anywhere in the envelope', () => {
  const npc = { instance_id: 'npc_gen', runtime_source: SCENE_NPC_SOURCE };
  const bind = (envelope) => bindLowerDvinaTraceTurnStepIdempotency({ envelope,
    inputDigest: 'a'.repeat(64), semanticCommandSnapshot: {},
    semanticCommandDigest: 'b'.repeat(64), semanticDependencyPins: [],
    visibleDependencyPins: { pins: [] } });
  const leaks = { inArray: { consequence: { npcs: [{ instance_id: 'x' }, npc] } },
    inProperty: { consequence: { conversation: { speaker: npc } } },
    deep: { a: [{ b: { c: [{ d: npc }] } }] } };
  for (const [name, envelope] of Object.entries(leaks)) {
    assert.throws(() => bind(envelope),
      (error) => error.code === 'TRACE_TURN_STEP_SCENE_NPC_IN_ENVELOPE', name);
  }
  assert.equal(bind(null).semantic_command_digest, 'b'.repeat(64));
});

test('withoutSceneRead cuts the position→G6 map at any depth as well', () => {
  const exchange = { working_state: { world_state: { scene_position_g6: { p: 'g' },
    npcs: [{ instance_id: 'npc_gen', runtime_source: SCENE_NPC_SOURCE }, { instance_id: 's' }] } } };
  const cut = withoutSceneRead(exchange);
  assert.deepEqual(cut, { working_state: { world_state: { npcs: [{ instance_id: 's' }] } } });
  const clean = { a: 1 };
  assert.equal(withoutSceneRead(clean), clean);
});
