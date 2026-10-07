import assert from 'node:assert/strict';
import test from 'node:test';

import { captureVisibilityConditions, runLegs } from '../v17-slice-legs.js';
import { renderPlaytestMarkdown } from '../v17-slice-report.js';

const admittedNpc = { entity_ref: { entity_kind: 'npc', entity_id: 'npc-1' }, display_label: 'человек' };
const panelPerson = { display_label: 'человек' };
const response = (data = {}) => ({ status: 200, ok: true, data, error: null });

function scene({ admission = [], contextPresent = true, panel = [], panelVisible = true,
  factual = false, lightPhase = 'civil_dusk' } = {}) {
  const visibleContext = {};
  if (lightPhase != null) visibleContext.current_light_phase = lightPhase;
  if (contextPresent) visibleContext.visible_npc = admission;
  return {
    ...(factual ? { schema: 'factual_turn_delivery_screen', screen_status: 'ready' }
      : { main_prose: 'На лесной тропе.' }),
    labels: [],
    visible_context: visibleContext,
    panels: { people: { visible: panelVisible, data: { people: panel } } }
  };
}

function world({ admission = [], contextPresent = true, panel = [], panelVisible = true,
  factual = false, sqlNpc = true } = {}) {
  const state = { site: 'A', version: 1 };
  const startScreen = scene({ lightPhase: null });
  startScreen.labels = ['Тропа'];
  const meetScreen = scene({ admission, contextPresent, panel, panelVisible, factual });
  const screenNow = () => state.site === 'A' ? startScreen : meetScreen;
  const snapshot = () => ({
    state_version: state.version,
    player_character_ref: { entity_kind: 'player_character', entity_id: 'pc-1' },
    position: { site_id: state.site, slot: 'arrival', canonical_g5: `cg5v3__x_r2_${state.site}` },
    placements_here: state.site === 'B' && sqlNpc ? [{ entity_kind: 'npc', entity_id: 'npc-1' }] : [],
    npc_placements_all: sqlNpc ? [{ entity_id: 'npc-1', position_id: 'position:B', g6_instance_id: 'g6:B' }] : [],
    items: [], party_items: [], npc_statements: [], resource_nodes: []
  });
  const api = {
    async newGame() { return response({ party_id: 'p-1', screen: { main_prose: 'Начало.' } }); },
    async ack() { return response(); },
    async screen() { return response({ screen: screenNow() }); },
    async turn(_partyId, { raw_text }) {
      if (raw_text === 'Тропа') { state.site = 'B'; state.version += 1; }
      return response({ screen: screenNow() });
    }
  };
  return {
    api,
    sql: { snapshot: async () => snapshot() },
    routeLabels: (screen) => screen?.labels ?? [],
    llm: { count: () => 0 },
    scenarioId: 'test-scene', runId: '569', maxTurns: 4,
    scene: meetScreen
  };
}

async function run(options) {
  return runLegs(world(options));
}

const meetStatus = (result) => result.legs.find(({ id }) => id === 'meet');

test('meet 569: SQL-only NPC is blocked when the screen does not admit it', async () => {
  const result = await run({ admission: [], panel: [], sqlNpc: true });
  assert.equal(result.legs.find(({ id }) => id === 'start').status, 'pass');
  assert.equal(result.legs.find(({ id }) => id === 'walk').status, 'pass');
  assert.equal(meetStatus(result).status, 'blocked');
  assert.match(meetStatus(result).reason, /восприятие не допускает NPC при текущих условиях/u);
});

test('meet 569: admitted NPC missing from a visible people panel remains a harness failure', async () => {
  const result = await run({ admission: [admittedNpc], panel: [], sqlNpc: false });
  assert.equal(meetStatus(result).status, 'fail');
  assert.match(meetStatus(result).reason, /панель людей пуста/u);
});

test('meet 569: admitted NPC hidden by the people panel remains a harness failure', async () => {
  const result = await run({ admission: [admittedNpc], panel: [panelPerson], panelVisible: false, sqlNpc: false });
  assert.equal(meetStatus(result).status, 'fail');
  assert.match(meetStatus(result).reason, /панель людей пуста/u);
});

test('meet 569: admitted panel person passes without an SQL placement', async () => {
  const result = await run({ admission: [admittedNpc], panel: [panelPerson], sqlNpc: false });
  assert.equal(meetStatus(result).status, 'pass');
});

test('meet 569: unknown admission plus SQL placement is not a visibility failure', async () => {
  const result = await run({ contextPresent: false, panel: [], panelVisible: false, sqlNpc: true });
  assert.equal(meetStatus(result).status, 'blocked');
  assert.equal(result.turns[0].visibility_conditions.after.admission_source, 'unknown');
  assert.match(meetStatus(result).reason, /допуск восприятия неизвестен/u);
  assert.doesNotMatch(meetStatus(result).reason, /SQL видит NPC/u);
  assert.doesNotMatch(meetStatus(result).reason, /восприятие не допускает NPC при текущих условиях/u);
});

test('meet 569: a factual visible panel is the fallback when visible_npc is absent', async () => {
  const result = await run({ contextPresent: false, panel: [panelPerson], factual: true, sqlNpc: false });
  assert.equal(meetStatus(result).status, 'pass');
  assert.equal(result.turns[0].visibility_conditions.after.admission_source, 'people_panel');
});

test('meet 569: explicit empty admission cannot be replaced by a populated panel', async () => {
  const result = await run({ admission: [], contextPresent: true, panel: [panelPerson], sqlNpc: true });
  assert.equal(meetStatus(result).status, 'blocked');
  assert.equal(result.turns.some(({ leg }) => leg === 'talk'), false);
});

test('meet 569: captures before/response/after and renders known phase with unavailable factors', async () => {
  const result = await run({ admission: [admittedNpc], panel: [panelPerson], sqlNpc: true });
  const turn = result.turns[0];
  assert.deepEqual(Object.keys(turn.visibility_conditions), ['before', 'response', 'after']);
  assert.equal(turn.visibility_conditions.before.admission_source, 'visible_context');
  assert.equal(turn.visibility_conditions.before.admitted_npcs_count, 0);
  assert.deepEqual(turn.visibility_conditions.before.admitted_npc_ids, []);
  assert.equal(turn.visibility_conditions.before.current_light_phase, 'unknown');
  assert.equal(turn.visibility_conditions.response.admission_source, 'visible_context');
  assert.equal(turn.visibility_conditions.response.admitted_npcs_count, 1);
  assert.deepEqual(turn.visibility_conditions.response.admitted_npc_ids, ['npc-1']);
  assert.equal(turn.visibility_conditions.response.current_light_phase, 'civil_dusk');
  assert.equal(turn.visibility_conditions.after.admitted_npcs_count, 1);
  assert.deepEqual(turn.visibility_conditions.after.admitted_npc_ids, ['npc-1']);
  assert.equal(turn.visibility_conditions.after.current_light_phase, 'civil_dusk');
  assert.equal(result.opening.visibility_conditions_initial.current_light_phase, 'unknown');
  assert.equal(result.opening.visibility_conditions_after_ack.current_light_phase, 'unknown');

  const unknown = captureVisibilityConditions({ panels: { people: { visible: false, data: { people: [] } } } });
  assert.equal(unknown.admission_source, 'unknown');
  assert.equal(unknown.weather, 'unknown');
  assert.equal(unknown.local_light, 'unknown');
  assert.equal(unknown.visibility_factors, 'unknown');

  const markdown = renderPlaytestMarkdown({
    identity: { scenario_id: 'test', branch: 'fleet/army-569', head: 'abc', dirty: true,
      run_id: 'r', started_at: 'start', ended_at: 'end', duration_ms: 1, model: 'none', llm_settings_path: '—' },
    preconditions: { postgres_image: 'fixture', wk_encoder: 'stub', max_turns: 4,
      reserve_make: 3, deadline_min: 1, qualification: 'not applicable' },
    ...result,
    llm: { total: 0, failed: 0, by_role: {} },
    readback: null
  });
  assert.match(markdown, /Условия видимости \(открытие\)/u);
  assert.match(markdown, /Условия видимости \(после подтверждения открытия\)/u);
  assert.match(markdown, /Условия видимости \(ход 1, response\)/u);
  assert.match(markdown, /Условия видимости \(ход 1, after\)/u);
  assert.match(markdown, /civil_dusk/u);
  assert.match(markdown, /current_light_phase/u);
  assert.match(markdown, /"weather":"unknown"/u);
  assert.match(markdown, /"local_light":"unknown"/u);
  assert.match(markdown, /"visibility_factors":"unknown"/u);
});
