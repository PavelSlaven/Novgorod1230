import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENE_NPC_SOURCE, withSceneNpcs, withoutSceneNpcs } from
  '../src/infrastructure/postgres/scene-npcs-readback.js';
import { projectPreparedDomainState } from
  '../src/runtime/lower-dvina-trace-turn-step-prepared-state-projection.js';
import { routineNpcSnapshot, withoutSceneRead } from '../src/runtime/lower-dvina-trace-scene-presence.js';
import { bindLowerDvinaTraceTurnStepIdempotency } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-idempotency.js';
import { projectTraceCombatWorkingState } from
  '../src/runtime/lower-dvina-trace-combat-working-state.js';
import { loadApprovedMaterializedNpcBodyInitializationProfile } from
  '../src/runtime/combat-min-data.js';

const row = (id, extra = {}) => ({ npc_id: id, run_id: 'run', profile_set_id: 'profile',
  profile_level: 'background', anchor_id: null,
  identity_state: { public_role_label: 'рыбак' }, machine_state: { status: 'active' },
  semantic_state: { participant_slot_ref: `slot:${id}`, location_profile_ref: 'loc' },
  role_ref: 'role_fisher', occupation_ref: 'occ_fisher',
  skill_profile_snapshot: { approved_defaults: [] }, knowledge_profile_snapshot: { local: 'x' },
  attribute_profile_snapshot: { strength: 3 }, profile_candidate_set_digest: 'digest',
  body_profile_ref: { id: 'body:npc', schema: 'body-profile-v1', revision: 2 },
  health: '73', energy: '61', satiety: '49', body_state_version: '4',
  position_id: `pos:${id}`, g6_instance_id: 'g6:main', ...extra });
const pool = (rows, positions = [{ id: 'pos:me', g6_instance_id: 'g6:main' }],
  bodyRows = [], participantRows = []) => {
  const calls = []; return { calls, async query(text, values) {
    calls.push({ text, values });
    if (/FROM party_runtime.party_actor_body_states/u.test(text)) {
      return { rows: bodyRows.filter(({ actor_id: id }) =>
        values[1].includes(id)) };
    }
    if (/FROM party_runtime.party_npcs n/u.test(text)
        && Array.isArray(values[1])) {
      return { rows: participantRows.filter(({ npc_id: id }) =>
        values[1].includes(id)) };
    }
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
  assert.deepEqual(loaded.body_state, { health: 73, energy: 61, satiety: 49 });
  assert.deepEqual(loaded.body_profile_ref, row('x').body_profile_ref);
  assert.equal(loaded.body_state_version, 4);
  assert.equal(loaded.body_state_persisted, true);
  assert.equal(loaded.scene_readback_present, true);
  assert.equal(loaded.location_profile_ref, 'loc');
  assert.equal(loaded.runtime_source, SCENE_NPC_SOURCE);
  assert.equal(state.npcs.length, 2);
});

test('scene body readback refreshes existing NPC instead of duplicating it', async () => {
  const npc = { instance_id: 'npc_start', body_profile_ref: { id: 'body:old' },
    body_state: { health: 10 } };
  const state = await withSceneNpcs(pool([row('npc_start')]), 'party',
    base({ npcs: [npc] }));
  assert.equal(state.npcs.length, 1);
  assert.deepEqual(state.npcs[0].body_state,
    { health: 73, energy: 61, satiety: 49 });
  assert.equal(state.npcs[0].body_profile_ref.id, 'body:npc');
  assert.equal(state.npcs[0].body_state_version, 4);
  assert.equal(state.npcs[0].scene_readback_present, true);
  assert.equal(state.npcs[0].position_id, 'pos:npc_start');
  assert.equal(state.npcs[0].g6_instance_id, 'g6:main');
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
  assert.equal(kept.npcs.length, 1);
  assert.equal(kept.npcs[0].anchor_id, 'a');
  assert.deepEqual(kept.npcs[0].body_state,
    { health: 73, energy: 61, satiety: 49 });
  assert.equal(kept.npcs[0].body_state_version, 4);
  assert.deepEqual(kept.scene_position_g6, { 'pos:me': 'g6:main' });
  const p = pool([row('npc_gen')]);
  const noSite = base({ position: { position_id: 'pos:me' } });
  assert.equal(await withSceneNpcs(p, 'party', noSite), noSite);
  assert.equal(p.calls.length, 0);
  const empty = base();
  assert.deepEqual((await withSceneNpcs(pool([]), 'party', empty)).npcs, empty.npcs);
});

test('combat participant body reloads by actor ref without site or placement', async () => {
  const body = { actor_id: 'npc_start', body_profile_ref: { id: 'body:npc' },
    health: '73', energy: '61', satiety: '49', body_state_version: '4' };
  const profile = { schema: 'rus.body_state.initialization_profile.v1' };
  const snapshot = base({ position: { position_id: 'pos:me' },
    combat_sessions: [{ status: 'paused_for_player', participant_refs: [
      { entity_kind: 'npc', entity_id: 'npc_start' }
    ] }], npcs: [{ instance_id: 'npc_start', body_state_profile: profile,
      body_state: { health: 72, energy: 61, satiety: 49 },
      body_state_persisted: false }] });
  const p = pool([], [], [body]);
  const loaded = await withSceneNpcs(p, 'party', snapshot);
  assert.deepEqual(p.calls.map(({ values }) => values), [
    ['party', ['npc_start']]
  ]);
  assert.match(p.calls[0].text, /FROM party_runtime\.party_actor_body_states/u);
  assert.doesNotMatch(p.calls[0].text,
    /entity_placements|scene_position_nodes|party_g6_instances/u);
  assert.deepEqual(loaded.npcs[0].body_state,
    { health: 73, energy: 61, satiety: 49 });
  assert.equal(loaded.npcs[0].body_state_version, 4);
  assert.equal(loaded.npcs[0].body_state_persisted, true);
  assert.equal(loaded.npcs[0].body_profile_ref.id, 'body:npc');
  assert.equal(loaded.npcs[0].body_state_profile, profile);
});

test('active combat participant reloads from party records after leaving player scene', async () => {
  const profile = { schema: 'rus.body_state.initialization_profile.v1' };
  const npc = row('npc_departed_scene', { semantic_state: {
    participant_slot_ref: 'slot:npc_departed_scene',
    body_state_profile: profile
  } });
  const session = { status: 'paused_for_player', participant_refs: [
    { entity_kind: 'npc', entity_id: npc.npc_id },
    { entity_kind: 'player_character', entity_id: 'player' }
  ], participant_states: [
    { actor_ref: { entity_kind: 'npc', entity_id: npc.npc_id },
      combat_status: 'active' },
    { actor_ref: { entity_kind: 'player_character', entity_id: 'player' },
      combat_status: 'active' }
  ] };
  const snapshot = base({ position: { site_id: 'site:elsewhere',
    position_id: 'pos:player', g6_instance_id: 'g6:elsewhere' },
  combat_sessions: [session], npcs: [] });
  const p = pool([], [{ id: 'pos:player', g6_instance_id: 'g6:elsewhere' }],
    [], [npc]);

  const loaded = await withSceneNpcs(p, 'party', snapshot);
  const participant = loaded.npcs.find(({ instance_id: id }) => id === npc.npc_id);
  assert.ok(participant);
  assert.equal(participant.runtime_source, SCENE_NPC_SOURCE);
  assert.equal(Object.hasOwn(participant, 'scene_readback_present'), false);
  assert.equal(participant.position_id, npc.position_id);
  const participantRead = p.calls.find(({ text }) =>
    /FROM party_runtime\.party_npcs n/u.test(text)
      && /ANY\(\$2::text\[\]\)/u.test(text));
  assert.ok(participantRead);
  assert.deepEqual(participantRead.values, ['party', [npc.npc_id]]);
  assert.doesNotMatch(participantRead.text, /g6\.host_id=\$2/u);

  const working = projectTraceCombatWorkingState({ ...loaded,
    actor_id: 'player', body_state: { health: 90 } }, session);
  assert.equal(working.actor_states[`npc:${npc.npc_id}`].body_state.health, 73);
});

test('scene readback leaves body initialization profile loading to combat owner',
  async () => {
    const npc = row('npc_without_body', { body_state_version: null,
      health: null, energy: null, satiety: null, body_profile_ref: null });
    const loaded = await withSceneNpcs(pool([npc]), 'party', base());
    const sceneNpc = loaded.npcs.find(({ instance_id: id }) =>
      id === 'npc_without_body');
    assert.equal(sceneNpc.body_state_persisted, false);
    assert.equal(Object.hasOwn(sceneNpc,
      'body_state_initialization_profile'), false);
    assert.equal(sceneNpc.scene_readback_present, true);
  });

test('profile source gap does not break ordinary readback but remains typed for combat',
  async () => {
    let loads = 0;
    const loadBrokenProfile = () => {
      loads += 1;
      return loadApprovedMaterializedNpcBodyInitializationProfile({
        readFileImpl: async () => Buffer.from('{}\n')
      });
    };
    const ordinary = await withSceneNpcs(pool([]), 'party', base(), {
      loadBodyInitializationProfile: loadBrokenProfile
    });
    assert.equal(loads, 0);
    assert.ok(ordinary);

    const combat = base({ position: { position_id: 'pos:me' },
      combat_sessions: [{ status: 'paused_for_player', participant_refs: [
        { entity_kind: 'npc', entity_id: 'npc_missing_body' }
      ] }], npcs: [{ instance_id: 'npc_missing_body' }] });
    await assert.rejects(withSceneNpcs(pool([]), 'party', combat, {
      loadBodyInitializationProfile: loadBrokenProfile
    }), { code: 'combat_actor_body_state_profile_gap' });
    assert.equal(loads, 1);
  });

test('combat body readback errors propagate and are never treated as an absent row', async () => {
  const error = new Error('readback failed');
  const pool = { async query(text) {
    if (/party_actor_body_states/u.test(text)) throw error;
    return { rows: [] };
  } };
  const state = base({ position: { position_id: 'pos:me' },
    combat_sessions: [{ status: 'paused_for_player', participant_refs: [
      { entity_kind: 'npc', entity_id: 'npc_missing_body' }
    ] }], npcs: [{ instance_id: 'npc_missing_body' }] });
  await assert.rejects(withSceneNpcs(pool, 'party', state), error);
});

test('combat-only participant readback initializes missing body without scene marker',
  async () => {
    const combatSession = { status: 'paused_for_player', participant_refs: [
      { entity_kind: 'npc', entity_id: 'npc_missing_body' }
    ] };
    const snapshot = base({ position: { position_id: 'pos:me' },
      npcs: [{ instance_id: 'npc_missing_body', body_state_persisted: false }],
      combat_sessions: [combatSession] });
    const loaded = await withSceneNpcs(pool([], [], [], []), 'party', snapshot);
    const participant = loaded.npcs[0];
    assert.equal(participant.body_state_persisted, false);
    assert.equal(Object.hasOwn(participant, 'scene_readback_present'), false);
    const working = projectTraceCombatWorkingState({ ...loaded,
      actor_id: 'player', body_state: { health: 90 } }, combatSession);
    assert.deepEqual(working.actor_states['npc:npc_missing_body'].body_state,
      { health: 100, satiety: 70, energy: 80, active_conditions: [],
        body_parts: {}, prose: null });
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
  const refreshed = withoutSceneNpcs({ npcs: [{ instance_id: 'npc_start',
    position_id: 'pos:current', g6_instance_id: 'g6:current',
    scene_readback_present: true }] });
  assert.deepEqual(refreshed.npcs, [{ instance_id: 'npc_start',
    position_id: 'pos:current', g6_instance_id: 'g6:current' }]);
  const nested = withoutSceneNpcs({ last_turn: { exchange: { world_state: { npcs: [
    keep, { instance_id: 'npc_gen', runtime_source: SCENE_NPC_SOURCE }] } } } });
  assert.deepEqual(nested.last_turn.exchange.world_state.npcs, [keep]);
  const untouched = { other: 1 };
  assert.equal(withoutSceneNpcs(untouched), untouched);
});

test('refreshing an existing scene NPC does not replace its saved locus in snapshots',
  async () => {
    const npc = { instance_id: 'npc_start', anchor_id: 'a',
      position_id: 'pos:saved', g6_instance_id: 'g6:saved' };
    const state = base({ npcs: [npc] });
    const refreshed = await withSceneNpcs(pool([row('npc_start', {
      position_id: 'pos:readback', g6_instance_id: 'g6:readback'
    })]), 'party', state);
    assert.equal(refreshed.npcs[0].position_id, 'pos:readback');
    assert.equal(refreshed.npcs[0].g6_instance_id, 'g6:readback');
    const snapshotNpc = withoutSceneNpcs(refreshed).npcs[0];
    assert.equal(snapshotNpc.position_id, 'pos:saved');
    assert.equal(snapshotNpc.g6_instance_id, 'g6:saved');
    assert.equal(Object.hasOwn(snapshotNpc, 'scene_readback_present'), false);
    assert.equal(Object.hasOwn(snapshotNpc, 'scene_readback_prior_locus'), false);
    assert.equal(snapshotNpc.body_state_version, 4);
  });

test('the routine schedule keeps a slim snapshot of a scene-read NPC', () => {
  const full = { instance_id: 'npc_gen', anchor_id: null, machine_state: { status: 'active' },
    identity_state: { canonical_name: 'X' }, semantic_state: { hidden: 1 },
    runtime_source: SCENE_NPC_SOURCE };
  assert.deepEqual(routineNpcSnapshot(full), { instance_id: 'npc_gen', anchor_id: null,
    machine_state: { status: 'active' } });
  const sealed = { instance_id: 'npc_start', semantic_state: {} };
  assert.equal(routineNpcSnapshot(sealed), sealed);
  assert.deepEqual(routineNpcSnapshot({ instance_id: 'npc_start',
    position_id: 'pos:current', g6_instance_id: 'g6:current',
    scene_readback_present: true }), { instance_id: 'npc_start',
    position_id: 'pos:current', g6_instance_id: 'g6:current' });
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

test('snapshot stripping removes transient body initialization DTOs', () => {
  const profile = { profile_ref: { entity_id: 'init-profile' },
    initial_state: { health: 100, energy: 80, satiety: 70 } };
  const stripped = withoutSceneNpcs({ npcs: [{ instance_id: 'combat-only',
    body_state_initialization_profile: profile }] });
  assert.equal(Object.hasOwn(stripped.npcs[0],
    'body_state_initialization_profile'), false);
});
