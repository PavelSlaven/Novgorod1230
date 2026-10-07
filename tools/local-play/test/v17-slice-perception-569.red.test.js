import test from 'node:test';
import assert from 'node:assert/strict';
import { runLegs } from '../v17-slice-legs.js';
import { visibleCurrentTargets } from '../../../apps/game-server/src/runtime/spatial-v3-current-visibility.js';

// Issue #569: SQL presence is not perceptual admission. Only the transport and
// snapshot ports are fixtures; the visibility owner and slice verdict run unchanged.
function fixture({ weather = 'none', npcPresent = true } = {}) {
  const target = { target_id: 'npc:npc1', entity_kind: 'npc', position_id: 'npc-position',
    lighting: 'clear', stable_cover: 'clear', dynamic_occlusion: 'clear',
    concealment: 'clear', weather };
  const admitted = visibleCurrentTargets({ observer_position_id: 'player-position',
    observer_visual_capability: 'clear', positions: [
      { id: 'player-position', g6_instance_id: 'g6:B' },
      { id: 'npc-position', g6_instance_id: 'g6:B' }
    ], g6: [{ id: 'g6:B', intra_g6_visibility_mode: 'default_clear' }],
    visibility_links: [], portals: {}, targets: npcPresent ? [target] : [],
    modifier_set: { complete: true, rows: [] } });
  let site = 'A';
  let version = 1;
  const statements = [];
  const inputs = [];
  const screen = () => {
    const visibleNpcs = site === 'B' ? admitted.map(() => ({
      entity_ref: { entity_kind: 'npc', entity_id: 'npc1' }, display_label: 'человек'
    })) : [];
    return { main_prose: 'Осматриваю место.', screen_status: 'ready',
      visible_context: { schema: 'visible_context_package', version: 1,
        visible_scene: 'Место у воды.', visible_npc: visibleNpcs, visible_objects: [] },
      labels: site === 'A' ? ['Тропа'] : [],
      panels: visibleNpcs.length ? { people: { visible: true,
        data: { visible_npcs: visibleNpcs.map(({ display_label }) => ({ display_label })) } } } : {} };
  };
  const snapshot = () => ({ state_version: version,
    player_character_ref: { entity_kind: 'player_character', entity_id: 'player' },
    position: { site_id: site, slot: 'arrival', position_id: site === 'B' ? 'player-position' : 'start-position',
      g6_instance_id: `g6:${site}`, canonical_g5: `cg5v3__fixture_r2_${site}` },
    placements_here: site === 'B' && npcPresent ? [{ entity_kind: 'npc', entity_id: 'npc1', slot: 'near_water' }] : [],
    npc_placements_all: npcPresent ? [{ entity_id: 'npc1', position_id: 'npc-position', g6_instance_id: 'g6:B' }] : [],
    npc_statements: structuredClone(statements), items: [], party_items: [], resource_nodes: [] });
  const envelope = (data) => ({ status: 200, ok: true, data, error: null });
  const api = {
    async newGame() { return envelope({ party_id: 'party', screen: screen() }); },
    async ack() { return envelope({}); },
    async screen() { return envelope({ screen: screen() }); },
    async turn(_party, { raw_text }) {
      inputs.push(raw_text);
      version += 1;
      if (raw_text === 'Тропа') site = 'B';
      else if (/^Здороваюсь|^Здравствуй/u.test(raw_text)) statements.push({
        statement_id: `reply-${version}`, speaker_ref: { entity_kind: 'npc', entity_id: 'npc1' },
        dominant_act: 'answer', utterance_text: 'Здравствуй.',
        intended_addressee_refs: [{ entity_kind: 'player_character', entity_id: 'player' }]
      });
      // Material attempts are committed no-ops: this fixture supplies no items
      // or resources and does not claim to exercise their domain mechanics.
      else assert.ok(raw_text === 'Осматриваюсь вокруг.' || /^Оторву|^Отрежу/u.test(raw_text),
        'fixture expects only walking, looking, greeting or a material attempt');
      return envelope({ screen: screen() });
    }
  };
  return { admitted, inputs, snapshot, screen, api,
    sql: { async snapshot() { return snapshot(); } }, routeLabels: (view) => view.labels };
}

const leg = (result, id) => result.legs.find((entry) => entry.id === id);
async function runFixture(options, t) {
  const world = fixture(options);
  // No resources; the focused run needs enough exploration budget to offer talk
  // when a person is admitted. Material legs are outside this fixture's scope.
  const result = await runLegs({ ...world, scenarioId: 'fixture', runId: 'issue-569',
    maxTurns: 6, llm: { count: () => 0 } });
  assert.equal(leg(result, 'start').status, 'pass', 'start must succeed before checking meet');
  assert.equal(leg(result, 'walk').status, 'pass', 'walk must reach a second site before checking meet');
  assert.equal(result.final_snapshot.position.site_id, 'B');
  assert.ok(result.turns.every((turn) => turn.committed && !turn.error && !turn.delivery_failed));
  t.diagnostic(JSON.stringify({ weather: options.weather, npc_present: options.npcPresent ?? true,
    admitted: world.admitted, sql_npcs: world.snapshot().placements_here.length,
    start: leg(result, 'start').status, walk: leg(result, 'walk').status,
    meet: leg(result, 'meet'), turns: result.turns.map(({ leg: id }) => id) }));
  return { world, result };
}

test('ожидаемо красный, issue #569: non-admitted SQL NPC blocks meet instead of failing it', async (t) => {
  const { world, result } = await runFixture({ weather: 'none' }, t);
  assert.deepEqual(world.admitted, [], 'the production visibility owner admits no NPC');
  assert.equal(world.snapshot().placements_here.length, 1, 'SQL still contains the NPC in the player G6');
  assert.deepEqual(world.screen().visible_context.visible_npc, []);
  assert.equal(world.screen().panels.people, undefined, 'no admitted person means no people panel');
  assert.equal(leg(result, 'meet').status, 'blocked',
    'issue #569: an NPC not admitted by perception is not evidence of a broken people panel');
});

test('контроль #569: no perceived NPC keeps talk, take and make blocked without sending their turns', async (t) => {
  const { result } = await runFixture({ weather: 'none' }, t);
  for (const id of ['talk', 'take', 'make']) assert.equal(leg(result, id).status, 'blocked');
  assert.ok(result.turns.every(({ leg: id }) => id === 'walk'));
});

for (const weather of ['clear', 'partial']) {
  test(`контроль #569: ${weather} admission with a consistent people panel passes meet`, async (t) => {
    const { world, result } = await runFixture({ weather }, t);
    assert.deepEqual(world.admitted, [{ target_id: 'npc:npc1', visibility: weather }]);
    assert.equal(world.snapshot().placements_here.length, 1);
    assert.equal(world.screen().visible_context.visible_npc.length, 1);
    assert.equal(world.screen().panels.people.data.visible_npcs.length, 1);
    assert.equal(leg(result, 'meet').status, 'pass');
    assert.equal(leg(result, 'talk').status, 'pass', 'the budget permits an admitted interlocutor to answer');
  });
}

test('контроль #569: no NPC in SQL or perception blocks meet', async (t) => {
  const { world, result } = await runFixture({ weather: 'none', npcPresent: false }, t);
  assert.deepEqual(world.admitted, []);
  assert.deepEqual(world.snapshot().placements_here, []);
  assert.equal(leg(result, 'meet').status, 'blocked');
});
