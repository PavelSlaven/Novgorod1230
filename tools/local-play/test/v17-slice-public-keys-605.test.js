import assert from 'node:assert/strict';
import test from 'node:test';

import { runLegs } from '../v17-slice-legs.js';

// Issue #605: cover public-key API leaves without converting private SQL refs.
// All captures stay in memory; no model, database, temporary files or tracked writes.
function publicKeyWorld() {
  let site = 'A';
  let version = 1;
  let quantity = 2;
  const statements = [];
  const held = [{ item_id: 'shirt', holder: 'player' }];
  const made = [];
  const expectedTurns = [];
  const captures = [];
  let lastScreen = null;
  const envelope = (data) => ({ status: 200, ok: true, data, error: null });
  const screen = (phase = 'refresh') => {
    // Public keys are screen-local. Distinct response/refresh keys expose phase mixups.
    const offset = version * 10 + (phase === 'response' ? 2 : 0);
    return { main_prose: 'У тропы стоит человек.', labels: ['Тропа'],
      visible_context: { schema: 'visible_context_package',
        visible_npc: [{ entity_ref: { entity_kind: 'npc', public_key: `e${offset + 1}` },
          display_label: 'Милонег' }],
        visible_objects: [{ entity_ref: { entity_kind: 'item', public_key: `e${offset + 2}` },
          display_label: 'валежник' }] },
      panels: { people: { visible: true, data: { people: [{ display_label: 'Милонег' }] } } } };
  };
  const api = {
    async newGame() { return envelope({ party_id: 'party', screen: screen() }); },
    async ack() { return envelope({}); },
    async screen() {
      lastScreen = screen();
      if (expectedTurns.length) expectedTurns.at(-1).after = lastScreen.visible_context;
      return envelope({ screen: lastScreen });
    },
    async turn(_party, { raw_text, request_id }) {
      const before = lastScreen.visible_context;
      version += 1;
      if (raw_text === 'Тропа') site = 'B';
      else if (/^Здороваюсь/u.test(raw_text)) statements.push({
        statement_id: 'reply', speaker_ref: { entity_kind: 'npc', entity_id: 'private-npc' },
        dominant_act: 'answer', utterance_text: 'Здравствуй.',
        intended_addressee_refs: [{ entity_kind: 'player_character', entity_id: 'player' }]
      });
      else if (raw_text === 'Беру валежник.') {
        quantity -= 1;
        held.push({ item_id: 'deadwood', holder: 'player' });
      } else if (raw_text === 'Оторву полосу от подола рубахи.') {
        made.push({ item_id: 'cloth', action_production: true });
      } else assert.fail(`Unexpected fixture input: ${raw_text}`);
      const response = screen('response');
      expectedTurns.push({ request_id, before, response: response.visible_context });
      return envelope({ screen: response });
    }
  };
  const sql = { async snapshot() {
    return structuredClone({ state_version: version,
      player_character_ref: { entity_kind: 'player_character', entity_id: 'player' },
      position: { site_id: site, canonical_g5: `cg5v3__fixture_r2_${site}`, slot: 'arrival' },
      placements_here: [{ entity_kind: 'npc', entity_id: 'private-npc' }],
      items: held, party_items: made, npc_statements: statements,
      resource_nodes: [{ resource_node_id: 'deadwood', site_id: 'B', quantity_numerator: quantity }] });
  } };
  return { api, sql, expectedTurns, captures,
    persist: (state) => captures.push(structuredClone(state)),
    routeLabels: (view) => view?.labels ?? [] };
}

test('issue #605: public-key fake API preserves phased captures and diagnostics with private SQL identity', async (t) => {
  const world = publicKeyWorld();
  const result = await runLegs({ ...world, scenarioId: 'fixture', runId: 'issue-605',
    maxTurns: 8, llm: { count: () => 0 } });

  assert.deepEqual(Object.fromEntries(result.legs.map(({ id, status }) => [id, status])),
    { start: 'pass', walk: 'pass', meet: 'pass', talk: 'pass', take: 'pass', make: 'pass' });
  assert.deepEqual(result.turns.map(({ leg }) => leg), ['walk', 'talk', 'take', 'make']);
  assert.deepEqual(world.captures.at(-1).turns, result.turns, 'persist receives complete capture evidence');
  for (const [index, turn] of result.turns.entries()) {
    const expected = world.expectedTurns[index];
    assert.equal(turn.request_id, expected.request_id);
    assert.ok(turn.committed && !turn.error && !turn.delivery_failed);
    for (const phase of ['before', 'response', 'after']) {
      const context = turn.current_visible_context[phase];
      assert.deepEqual(context, expected[phase], `${turn.leg}: ${phase} comes from its API screen`);
      assert.notEqual(context, expected[phase], `${phase}: capture is a clone`);
      for (const leaf of [...context.visible_npc, ...context.visible_objects]) {
        assert.deepEqual(Object.keys(leaf.entity_ref).sort(), ['entity_kind', 'public_key']);
        assert.match(leaf.entity_ref.public_key, /^e[1-9]\d*$/u);
      }
      assert.deepEqual(turn.visibility_conditions[phase].admitted_npc_keys,
        context.visible_npc.map(({ entity_ref }) => entity_ref.public_key));
      assert.equal(turn.visibility_conditions[phase].admission_source, 'visible_context');
      assert.equal(turn.visibility_conditions[phase].admitted_npcs_count, 1);
    }
    assert.notDeepEqual(turn.current_visible_context.response, turn.current_visible_context.after,
      'response and refresh fixtures differ so the test detects copying the wrong phase');
    assert.deepEqual(turn.people_panel.visible_context_npc_keys,
      expected.after.visible_npc.map(({ entity_ref }) => entity_ref.public_key));
    assert.deepEqual(turn.people_panel.placement_npc_ids, ['private-npc']);
    assert.deepEqual(turn.before.placements_here, [{ entity_kind: 'npc', entity_id: 'private-npc' }]);
    assert.deepEqual(turn.after.placements_here, turn.before.placements_here);
  }
  assert.deepEqual(result.turns.find(({ leg }) => leg === 'talk').after.npc_statements[0].speaker_ref,
    { entity_kind: 'npc', entity_id: 'private-npc' }, 'private statement readback keeps authoritative identity');
  assert.deepEqual(result.opening.people_panel_after_ack.visible_context_npc_keys, ['e11']);
  assert.deepEqual(result.opening.visibility_conditions_initial.admitted_npc_keys, ['e11']);
  t.diagnostic(JSON.stringify({ issue: 605, legs: result.legs.map(({ id, status }) => ({ id, status })),
    turns: result.turns.length, persisted_captures: world.captures.length,
    model_calls: result.turns.reduce((sum, turn) => sum + turn.llm_calls, 0) }));
});
