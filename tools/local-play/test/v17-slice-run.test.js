import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { EXIT, PreflightError, UsageError, createFinalizers, describeServerError, installLlmMeter, parseArgs, summarizeLlm,
  createHttpApi, readLlmSettingsRecord, runHarness } from '../v17-slice-run.mjs';
import { capturePeoplePanel, positionProgressed, RESERVE_MAKE_TURNS, runLegs } from '../v17-slice-legs.js';
import { createRedactor, d49MinimumOf, exitCodeOf, renderPlaytestMarkdown, verdictOf } from '../v17-slice-report.js';

const SECRET_KEY = 'sk-test-secret-key-0123456789';
const SECRET_URL = 'https://llm.internal.example:8443/v1';

// ---------- argument parsing and exit ----------

test('parseArgs: defaults, aliases and overrides', () => {
  const defaults = parseArgs([], {});
  assert.equal(defaults.scenario, 'novgorod_vikhtuy_work_storage_v1');
  assert.equal(defaults.maxTurns, 24);
  assert.equal(defaults.deadlineMin, 26);
  assert.equal(defaults.wkEncoder, 'stub');
  assert.match(defaults.runId, /^\d{14}$/u);
  assert.ok(defaults.outDir.includes(defaults.runId));
  const set = parseArgs(['--scenario', 'household_cluster', '--max-turns', '5', '--deadline-min', '60',
    '--out-dir', '/tmp/x', '--playtest-dir', 'docs/playtests', '--run-id', 'r-1'], {});
  assert.deepEqual([set.scenario, set.maxTurns, set.deadlineMin, set.outDir, set.playtestDir, set.runId],
    ['novgorod_vikhtuy_household_cluster_v1', 5, 60, '/tmp/x', 'docs/playtests', 'r-1']);
  assert.equal(parseArgs(['--scenario', 'novgorod_pine_ridge_approach_v1'], {}).scenario, 'novgorod_pine_ridge_approach_v1');
  assert.equal(parseArgs(['--help'], {}).help, true);
});

test('parseArgs: bad input is a usage error, giga without python is a preflight error', () => {
  for (const argv of [['--nope', '1'], ['--max-turns'], ['--max-turns', 'x'], ['--max-turns', '-1'], ['--deadline-min', '0'],
    ['--wk-encoder', 'real'], ['stray'], ['--run-id', 'a b']]) {
    assert.throws(() => parseArgs(argv, {}), UsageError, JSON.stringify(argv));
  }
  assert.throws(() => parseArgs(['--wk-encoder', 'giga'], {}), PreflightError);
  assert.equal(parseArgs(['--wk-encoder', 'giga'], { RUS_WORLD_KNOWLEDGE_PYTHON: '/py' }).wkEncoder, 'giga');
});

test('readLlmSettingsRecord: needs the path and the v2 custom openai_compatible shape; values are never in the message', async () => {
  const good = { version: 2, settings: { mode: 'custom', compatibility: 'openai_compatible', base_url: SECRET_URL, model: 'm', api_key: SECRET_KEY } };
  assert.equal((await readLlmSettingsRecord('/p', { load: async () => good })).settings.model, 'm');
  await assert.rejects(readLlmSettingsRecord('', { load: async () => good }), PreflightError);
  for (const bad of [null, { version: 1, settings: good.settings }, { version: 2, settings: { ...good.settings, api_key: '' } },
    { version: 2, settings: { ...good.settings, mode: 'default' } }]) {
    await assert.rejects(readLlmSettingsRecord('/p', { load: async () => bad }), (error) =>
      error instanceof PreflightError && !error.message.includes(SECRET_KEY) && !error.message.includes(SECRET_URL));
  }
  await assert.rejects(readLlmSettingsRecord('/p', { load: async () => { throw Object.assign(new Error(SECRET_URL), { code: 'ENOENT' }); } }),
    (error) => error instanceof PreflightError && !error.message.includes(SECRET_URL));
});

test('exit code and verdict follow the legs', () => {
  const legs = (...statuses) => statuses.map((status, i) => ({ id: `l${i}`, status }));
  assert.equal(exitCodeOf(legs('pass', 'pass')), EXIT.PASS);
  assert.equal(exitCodeOf(legs('pass', 'blocked')), EXIT.LEGS);
  assert.equal(exitCodeOf(legs('fail')), EXIT.LEGS);
  assert.deepEqual([verdictOf(legs('pass', 'pass')), verdictOf(legs('pass', 'fail')), verdictOf(legs('blocked', 'fail'))],
    ['PASS', 'PARTIAL', 'FAIL']);
});

test('D49 minimum accepts either item path while strict acceptance remains all six legs', () => {
  const legs = (take, make) => ['pass', 'pass', 'pass', 'pass', take, make].map((status, i) =>
    ({ id: ['start', 'walk', 'meet', 'talk', 'take', 'make'][i], status }));
  for (const [statuses, itemLeg] of [[['pass', 'fail'], 'take'], [['fail', 'pass'], 'make']]) {
    const result = legs(...statuses);
    const turns = [{ n: 4, leg: 'talk', pass: true }, { n: 5, leg: itemLeg, pass: true }];
    assert.deepEqual(d49MinimumOf(result, turns), { status: 'PASS', item_leg: itemLeg });
    assert.equal(exitCodeOf(result), EXIT.LEGS);
  }
  assert.deepEqual(d49MinimumOf(legs('fail', 'fail')), { status: 'PARTIAL', item_leg: null });
  assert.deepEqual(d49MinimumOf(legs('pass', 'fail'), [{ n: 5, leg: 'talk', pass: true }, { n: 4, leg: 'take', pass: true }]),
    { status: 'PARTIAL', item_leg: null }, 'a passing item turn before talk does not satisfy the minimum');
});

// ---------- report ----------

test('redactor strips secret values, hosts and bearer shapes', () => {
  const redact = createRedactor([SECRET_KEY, SECRET_URL, 'llm.internal.example', 'ab']);
  const out = redact(`key ${SECRET_KEY} at ${SECRET_URL} host llm.internal.example Bearer abcdefgh12345678 ab`);
  assert.equal(out.includes(SECRET_KEY), false);
  assert.equal(out.includes('llm.internal'), false);
  assert.equal(out.includes('abcdefgh12345678'), false);
  assert.ok(out.endsWith(' ab'), 'values shorter than 4 chars are not redacted');
});

const PROSE = 'Вы стоите у сруба. Пахнет дымом.';
function sampleReport(extra = {}) {
  const snap = (sv, slot) => ({ state_version: sv, position: { slot, site_id: 's1', canonical_g5: 'cg5v3__x_r2_work_storage' },
    placements_here: [], items: [], resource_nodes: [], npc_statements: [] });
  return {
    identity: { run_id: 'r1', scenario_id: 'novgorod_vikhtuy_work_storage_v1', branch: 'b', head: 'abcdef123456', dirty: false,
      started_at: 't0', ended_at: 't1', duration_ms: 61000, model: 'qwen', llm_settings_path: '/srv/x/llm-settings.json' },
    preconditions: { postgres_image: 'postgres:16.14-alpine', wk_encoder: 'stub', max_turns: 24, reserve_make: 3, deadline_min: 26, qualification: 'ok' },
    opening: { attempts: 2, rejections: 1, party_id: 'p1', prose: PROSE, route_labels: ['Тропа', 'Брод'] },
    legs: [{ id: 'start', status: 'pass', reason: 'партия p1' }, { id: 'walk', status: 'fail', reason: 'не ушёл | никуда', detail: null },
      { id: 'meet', status: 'blocked', reason: 'нет людей', detail: null }, { id: 'talk', status: 'blocked', reason: 'нет NPC', detail: null },
      { id: 'take', status: 'blocked', reason: 'нет источника', detail: null }, { id: 'make', status: 'blocked', reason: 'бюджет', detail: null }],
    turns: [{ n: 1, leg: 'walk', input: 'Иду по тропе.', http_status: 200, error: null, committed: true, recovered: true,
      prose: PROSE, server_errors: [{ code: 'TURN_STEP_PLAN_INVALID', message: 'Turn-step plan is invalid.', validation: ['identity_shape'] }], before: snap(1, 'arrival'), after: snap(2, 'departure'), ms: 40000, llm_calls: 5,
      route_labels: ['Тропа'], people_labels: ['человек (1)'] },
    { n: 2, leg: 'make', input: 'Делаю.', http_status: 409, committed: false, recovered: false,
      error: { code: 'TURN_NOT_SAVED', message: 'Ход не сохранён. Попробуйте сформулировать действие иначе.', turn_commit_status: 'not_started' },
      prose: PROSE, server_errors: [], before: snap(2, 'departure'), after: snap(2, 'departure'), ms: 1000, llm_calls: 1, route_labels: [], people_labels: [] }],
    llm: { total: 9, failed: 0, by_role: { planner: 9 } }, readback: snap(2, 'departure'), infra_error: null, ...extra
  };
}

test('markdown has the README sections, the screen verbatim, the WK stub note and no secrets', () => {
  const redact = createRedactor([SECRET_KEY, SECRET_URL]);
  const md = renderPlaytestMarkdown(sampleReport({ infra_error: `boom ${SECRET_KEY}`,
    transport_errors: [{ method: 'GET', path: '/api/v1/parties/:party_id/screen',
      phase: 'screen_after_turn', leg: 'walk', turn: 7,
      cause: { name: 'TypeError', message: 'fetch failed', cause_code: 'ECONNREFUSED' } }] }), redact);
  for (const heading of ['## Identity', '## Preconditions', '## Gameplay transcript', '## Persistence/readback', '## Findings', '## Result']) {
    assert.ok(md.includes(heading), heading);
  }
  assert.ok(md.includes(`> ${PROSE}`), 'screen text verbatim');
  assert.ok(md.includes('Ввод игрока: «Иду по тропе.»'));
  assert.ok(md.includes('ЗАГЛУШКА'), 'the encoder stub is stated');
  assert.ok(md.includes('presentation-recovery'));
  assert.ok(md.includes('TURN_STEP_PLAN_INVALID: Turn-step plan is invalid. [identity_shape]'), 'the masked server reason is shown');
  assert.ok(md.includes('Проходы на первом экране: «Тропа», «Брод»'), 'first-screen passages are reported');
  const refused = md.slice(md.indexOf('### Ход 2'));
  assert.ok(refused.includes('> Ход не сохранён. Попробуйте сформулировать действие иначе.'), 'a refused turn shows the error text');
  assert.equal(refused.includes(PROSE), false, 'a refused turn does not repeat the previous screen');
  assert.equal(md.includes('скрыта за TEMPORARY_ACTION_UNAVAILABLE'), false);
  assert.ok(md.includes('**PARTIAL**'));
  assert.ok(md.includes('D49 minimum (start, walk, meet, talk и take или make): **PARTIAL**'));
  assert.ok(md.includes('Строгий результат: **PARTIAL**'));
  assert.match(md, /GET \| \/api\/v1\/parties\/:party_id\/screen \| screen_after_turn \| walk \| 7 \| TypeError: fetch failed: ECONNREFUSED/u);
  assert.ok(md.includes('позиция s1') === false && md.includes('@arrival → cg5v3__x_r2_work_storage@departure'));
  assert.equal(md.includes(SECRET_KEY), false);
  assert.ok(md.includes('/srv/x/llm-settings.json'), 'the settings path is allowed in the report');
});

// ---------- legs against a fake world ----------

/** A small world: A (start, shirt) —«Тропа»→ B (a person, deadwood). Talk/take/make behave as configured. */
function fakeWorld({ blindLooks = 0, talkWorks = true, talkRecipient = 'player', talkAct = 'answer', makeWorks = true, takeWorks = true,
  hidePeople = false, hidePanelPeople = hidePeople, hideSqlPeople = hidePeople, npcAtStart = false, npcAtDestination = true,
  peoplePanelVisible = true, hideReturnPassage = false, samePlaceWalks = 0, talkCommitted = true,
  priorNpcReply = false, snapshotErrorAt = null, openingRejections = 0, emptyProse = false,
  npcSite = null, resourceSites = ['B'], routeThroughC = false,
  walkLocalLabels = [], walkExits = null, walkLocalNoProgress = false,
  walkSlotSteps = null,
  presentationPendingOnce = false, presentationStaysPending = false } = {}) {
  const w = { looks: 0, sv: 1, site: 'A', slot: 'arrival', slotChain: 0,
    pendingTurnOnce: presentationPendingOnce,
    presentationStaysPending, statements: priorNpcReply ? [{
    statement_id: 'statement-old', speaker_ref: { entity_kind: 'npc', entity_id: 'npc1' }, dominant_act: 'answer',
    intended_addressee_refs: [{ entity_kind: 'player_character', entity_id: 'c' }], utterance_text: 'Я Милонег.'
  }] : [], nodeQuantities: Object.fromEntries(resourceSites.map((site) => [site, 60])), held: [], made: [], turns: [], newGames: 0, recovered: 0, prose: 'Начало.' };
  const items = () => [{ item_id: 'shirt', holder: 'c', position: 'worn' }, ...w.held];
  const effectiveNpcSite = npcSite ?? (npcAtStart ? 'A' : npcAtDestination ? 'B' : null);
  const npcHere = () => w.site === effectiveNpcSite;
  const snap = () => ({ state_version: w.sv, player_character_ref: { entity_kind: 'player_character', entity_id: 'c' },
    position: { slot: w.slot, site_id: w.site, position_id: `position:${w.site}`,
      g6_instance_id: `g6:${w.site}`,
      canonical_g5: `cg5v3__x_r2_${w.site === 'A' ? 'work_storage' : w.site === 'B' ? 'forest_path' : 'river_bank'}` },
    placements_here: npcHere() && !hideSqlPeople ? [{ entity_kind: 'npc', entity_id: 'npc1' }] : [],
    npc_placements_all: effectiveNpcSite == null ? [] : [{ entity_id: 'npc1',
      position_id: `position:${effectiveNpcSite}`, g6_instance_id: `g6:${effectiveNpcSite}` }],
    items: items(), party_items: w.made, npc_statements: w.statements,
    resource_nodes: resourceSites.map((site) => ({
      resource_node_id: `m2c_finite_deadwood_v1:${site}`, site_id: site, quantity_numerator: String(w.nodeQuantities[site])
    })) });
  const labelsAt = () => {
    if (w.looks < blindLooks) return [];
    if (w.site === 'A' && (walkLocalLabels.length > 0 || walkExits != null || walkSlotSteps)) {
      return [...walkLocalLabels, ...Object.keys(walkExits ?? walkSlotSteps ?? { 'Тропа': 'B' })];
    }
    if (w.site === 'A') return ['Тропа'];
    if (w.site === 'B' && routeThroughC) return ['Дальше'];
    return hideReturnPassage ? [] : ['Назад'];
  };
  const screen = () => ({ main_prose: w.prose, labels: labelsAt(),
    visible_context: { schema: 'visible_context_package', visible_npc: npcHere()
      ? [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc1' }, display_label: 'человек' }] : [] },
    panels: { people: { visible: peoplePanelVisible, data: { people: npcHere() && !hidePanelPeople ? [{ display_label: 'человек (1)' }] : [] } } } });
  const env = (data) => ({ status: 200, ok: true, data, error: null });
  const api = {
    async newGame() { w.newGames += 1; return w.newGames <= openingRejections
      ? { status: 409, ok: false, data: null, error: { code: 'AUTHORED_OPENING_AUDIT_REJECTED' } }
      : env({ party_id: 'p1', screen: { main_prose: 'Открытие.' } }); },
    async llmTurnReport() {
      return env({ failure: {
        code: 'AUTHORED_OPENING_AUDIT_REJECTED',
        opening_rejection: {
          writer_prose: 'Черновик вступления.',
          stage23: { pass: false, concerns: [{ code: 'NARRATOR_PROSE_MUST_INCLUDE_MISSING',
            severity: 'repairable', message: 'gap' }], evidence: ['gap'], codes: ['NARRATOR_PROSE_MUST_INCLUDE_MISSING'] },
          repair: { observed: true, attempted: false }
        }
      } });
    },
    async ack() { return env({}); },
    async screen() { return env({ screen: screen() }); },
    async recover() {
      w.recovered += 1;
      if (w.presentationStaysPending) {
        return env({ screen: { screen_status: 'committed_presentation_pending', main_prose: '' } });
      }
      w.prose = 'Восстановлено.';
      return env({ screen: screen() });
    },
    async turn(_id, { raw_text: text }) {
      w.turns.push(text);
      if (w.pendingTurnOnce) {
        w.pendingTurnOnce = false;
        w.sv += 1;
        return env({ screen: { ...screen(), screen_status: 'committed_presentation_pending',
          main_prose: '' } });
      }
      if (text === 'Осматриваюсь вокруг.') w.looks += 1;
      if (walkLocalLabels.includes(text)) {
        if (!walkLocalNoProgress) {
          w.slot = w.slot === 'arrival' ? 'local_bend' : 'arrival';
        }
        w.sv += 1;
      }
      else if (walkSlotSteps && Object.hasOwn(walkSlotSteps, text)) {
        const steps = walkSlotSteps[text];
        w.slotChain += 1;
        if (w.slotChain <= steps.length) w.slot = steps[w.slotChain - 1];
        else { w.site = 'B'; w.slot = 'arrival'; w.prose = 'Лесная тропа.'; }
        w.sv += 1;
      }
      else if (walkExits != null && Object.hasOwn(walkExits, text)) {
        w.site = walkExits[text]; w.sv += 1;
        w.prose = w.site === 'B' ? 'Лесная тропа.' : w.site === 'C' ? 'У реки.' : 'Дальше.';
      }
      else if (text === 'Тропа') {
        if (w.turns.filter((turn) => turn === 'Тропа').length > samePlaceWalks) w.site = routeThroughC && w.site === 'B' ? 'C' : 'B';
        w.sv += 1; w.prose = w.site === 'B' ? 'Лесная тропа.' : 'Тропа всё ещё впереди.';
      }
      else if (text === 'Дальше') { w.site = 'C'; w.sv += 1; }
      else if (text === 'Назад') { w.site = routeThroughC && w.site === 'C' ? 'B' : 'A'; w.sv += 1; }
      else if (/^Здоров|^Здравств/u.test(text)) { if (talkCommitted) w.sv += 1; if (talkWorks && talkCommitted) w.statements = [...w.statements, {
        statement_id: `statement-${w.statements.length + 1}`, speaker_ref: { entity_kind: 'npc', entity_id: 'npc1' }, dominant_act: talkAct,
        intended_addressee_refs: talkRecipient === 'missing' ? [] : [{ entity_kind: 'player_character', entity_id: talkRecipient === 'player' ? 'c' : 'other' }],
        utterance_text: 'Я Милонег.'
      }]; }
      else if (/^Беру/u.test(text)) { w.sv += 1; if (takeWorks) { w.nodeQuantities[w.site] -= 1; w.held = [...w.held, { item_id: 'ordinary_item_1', holder: 'c', position: 'hands' }]; } }
      else if (/^Ото|^Отр/u.test(text)) {
        if (!makeWorks) return { status: 422, ok: false, data: null, error: { code: 'TURN_STEP_PLAN_INVALID' } };
        w.sv += 1; w.made = [{ item_id: 'a1-result:1', action_production: true }];
      } else w.sv += 1;
      if (emptyProse) w.prose = '';
      if (/^Здоров|^Здравств/u.test(text) && !talkCommitted)
        return { status: 422, ok: false, data: null, error: { code: 'TURN_NOT_SAVED' } };
      return env({ screen: screen() });
    }
  };
  let snapshotCount = 0;
  return { w, api, sql: { snapshot: async () => {
    snapshotCount += 1;
    return snapshotCount === snapshotErrorAt ? { error: 'snapshot failed: injected' } : snap();
  } }, routeLabels: (s) => s?.labels ?? [] };
}
const meter = () => { let n = 0; return { count: () => (n += 1) }; };
const runFake = (world, extra = {}) => runLegs({ ...world, llm: meter(), scenarioId: 's', runId: 'r', maxTurns: 24, ...extra });
const statusOf = (result) => Object.fromEntries(result.legs.map(({ id, status }) => [id, status]));

test('legs: a working world passes every leg with the exact phrases of the plan', async () => {
  const world = fakeWorld();
  const result = await runFake(world);
  assert.deepEqual(statusOf(result), { start: 'pass', walk: 'pass', meet: 'pass', talk: 'pass', take: 'pass', make: 'pass' });
  assert.deepEqual(world.w.turns, ['Тропа', 'Здороваюсь с человеком и спрашиваю, как его зовут.', 'Беру валежник.', 'Оторву полосу от подола рубахи.']);
  assert.ok(world.w.turns.indexOf('Тропа') < world.w.turns.findIndex((text) => /^Здоров/u.test(text)));
  assert.equal(result.turns.every(({ ms }) => Number.isFinite(ms)), true);
  const movement = result.turns.find(({ input }) => input === 'Тропа');
  assert.deepEqual(movement.current_visible_context.before.visible_npc, []);
  assert.equal(movement.current_visible_context.after.visible_npc[0]
    .entity_ref.entity_id, 'npc1');
  assert.equal(exitCodeOf(result.legs), EXIT.PASS);
});

test('legs: fetch failures record request and phase without changing the blocked turn', async () => {
  const failure = () => new TypeError('fetch failed', {
    cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
  });
  const rejectedApi = createHttpApi('http://127.0.0.1:1', async () => {
    throw failure();
  });

  const turnWorld = fakeWorld();
  turnWorld.api.turn = (...args) => rejectedApi.turn(...args);
  const turnResult = await runFake(turnWorld);
  assert.equal(turnResult.transport_errors[0].method, 'POST');
  assert.equal(turnResult.transport_errors[0].path,
    '/api/v1/parties/:party_id/turns');
  assert.equal(turnResult.transport_errors[0].phase, 'turn');
  assert.equal(turnResult.transport_errors[0].leg, 'walk');
  assert.equal(turnResult.transport_errors[0].turn, 1);
  assert.equal(turnResult.transport_errors[0].cause.cause_code, 'ECONNREFUSED');
  assert.equal(turnResult.legs.find(({ id }) => id === 'walk').status, 'blocked');
  assert.equal(turnResult.turns.length, 0, 'failed transport does not fabricate an HTTP turn');

  const screenWorld = fakeWorld();
  const screen = screenWorld.api.screen;
  let screenCalls = 0;
  screenWorld.api.screen = (...args) => {
    screenCalls += 1;
    return screenCalls === 3 ? rejectedApi.screen(...args) : screen(...args);
  };
  const screenResult = await runFake(screenWorld);
  assert.equal(screenResult.transport_errors[0].method, 'GET');
  assert.equal(screenResult.transport_errors[0].path,
    '/api/v1/parties/:party_id/screen');
  assert.equal(screenResult.transport_errors[0].phase, 'screen_after_turn');
  assert.equal(screenResult.transport_errors[0].leg, 'walk');
  assert.equal(screenResult.transport_errors[0].turn, 1);
  assert.equal(screenResult.turns.length, 0, 'failed screen read does not fabricate a completed turn');
});

test('legs: a spot that shows no passages is looked at twice, then walk fails with the reason', async () => {
  const late = await runFake(fakeWorld({ blindLooks: 2 }));
  assert.equal(statusOf(late).walk, 'pass', 'the second look showed the passage');
  const world = fakeWorld({ blindLooks: 99, hidePeople: true });
  const blind = await runFake(world);
  assert.equal(world.w.looks, 2);
  assert.equal(statusOf(blind).walk, 'fail', 'turns were spent, the player never left');
  assert.match(blind.legs.find(({ id }) => id === 'walk').reason, /не показывает проходов после 2 осмотров/u);
});

test('legs: a failing talk fails only talk; others still run', async () => {
  const result = await runFake(fakeWorld({ talkWorks: false }));
  assert.deepEqual(statusOf(result), { start: 'pass', walk: 'pass', meet: 'pass', talk: 'fail', take: 'blocked', make: 'blocked' });
  assert.match(result.legs.find(({ id }) => id === 'talk').reason, /ответа NPC игроку/u);
  assert.equal(result.turns.filter(({ leg }) => leg === 'talk').length, 2, 'the second greeting was tried');
  assert.equal(result.turns.some(({ leg }) => ['take', 'make'].includes(leg)), false, 'item turns wait for talk PASS');
});

test('legs: SQL placement with an empty player panel fails meet; a screen-only person passes meet', async () => {
  const hidden = await runFake(fakeWorld({ hidePanelPeople: true, hideSqlPeople: false }));
  assert.equal(statusOf(hidden).meet, 'fail');
  assert.match(hidden.legs.find(({ id }) => id === 'meet').reason, /панель людей пуста/u);
  const screenOnly = await runFake(fakeWorld({ hideSqlPeople: true, hidePanelPeople: false }));
  assert.equal(statusOf(screenOnly).meet, 'pass');
  const hiddenData = await runFake(fakeWorld({ peoplePanelVisible: false, hidePanelPeople: false, hideSqlPeople: false }));
  assert.equal(statusOf(hiddenData).meet, 'fail');
  assert.equal(hiddenData.turns.some(({ leg }) => leg === 'talk'), false);
  assert.equal(hiddenData.turns.every(({ people_labels }) => people_labels.length === 0), true);
});

test('legs: a person visible only at start does not count as a meeting or permit talk before walk', async () => {
  const world = fakeWorld({ npcAtStart: true, npcAtDestination: false, hideReturnPassage: true });
  const result = await runFake(world);
  assert.equal(statusOf(result).meet, 'blocked');
  assert.equal(statusOf(result).talk, 'blocked');
  assert.equal(world.w.turns.some((text) => /^Здоров|^Здравств/u.test(text)), false);
  assert.ok(world.w.turns.indexOf('Тропа') === 0, 'the player leaves start before later legs can run');
});

test('legs: a visible person on a previously visited place can be met after returning there', async () => {
  const world = fakeWorld({ npcAtStart: true, npcAtDestination: false });
  const result = await runFake(world);
  assert.equal(statusOf(result).walk, 'pass');
  assert.equal(statusOf(result).meet, 'pass');
  assert.equal(statusOf(result).talk, 'pass');
  assert.ok(world.w.turns.indexOf('Назад') > world.w.turns.indexOf('Тропа'));
  assert.ok(world.w.turns.findIndex((text) => /^Здоров/u.test(text)) > world.w.turns.indexOf('Назад'));
});

test('legs: a resource found before NPC is only taken after a later talk PASS', async () => {
  const world = fakeWorld({ npcAtStart: true, npcAtDestination: false, makeWorks: false });
  const result = await runFake(world);
  const talkPass = result.turns.find(({ leg, pass }) => leg === 'talk' && pass)?.n;
  const takePass = result.turns.find(({ leg, pass }) => leg === 'take' && pass)?.n;
  assert.ok(talkPass != null && takePass > talkPass);
  assert.ok(world.w.turns.indexOf('Назад') > world.w.turns.indexOf('Тропа'));
  assert.deepEqual(d49MinimumOf(result.legs, result.turns), { status: 'PASS', item_leg: 'take' });
});

test('legs: a source seen before meeting does not pin take to its site', async () => {
  const world = fakeWorld({ npcSite: 'C', resourceSites: ['B', 'C'], routeThroughC: true, makeWorks: false });
  const result = await runFake(world);
  const talkAt = world.w.turns.findIndex((text) => /^Здоров|^Здравств/u.test(text));
  const takeAt = world.w.turns.findIndex((text) => /^Беру/u.test(text));
  assert.ok(talkAt > world.w.turns.indexOf('Дальше'), 'talk happens at C after the resource was seen at B');
  assert.ok(takeAt > talkAt, 'take happens after talk');
  assert.equal(world.w.nodeQuantities.B, 60, 'the earlier source remains untouched');
  assert.equal(world.w.nodeQuantities.C, 59, 'the source at the current post-talk place is taken');
  assert.equal(statusOf(result).take, 'pass');
  assert.deepEqual(d49MinimumOf(result.legs, result.turns), { status: 'PASS', item_leg: 'take' });
});

test('legs: talk requires a persisted NPC answer addressed to the player', async () => {
  for (const options of [{ talkRecipient: 'other' }, { talkRecipient: 'missing' }, { talkAct: 'inform' }]) {
    const result = await runFake(fakeWorld(options));
    assert.equal(statusOf(result).talk, 'fail', JSON.stringify(options));
  }
  assert.equal(statusOf(await runFake(fakeWorld({ talkCommitted: false }))).talk, 'fail', 'an uncommitted answer is absent from the snapshot');
  const valid = await runFake(fakeWorld({ talkRecipient: 'player', talkAct: 'answer' }));
  assert.equal(statusOf(valid).talk, 'pass');
  assert.match(valid.legs.find(({ id }) => id === 'talk').detail, /Я Милонег/u, 'the report keeps the NPC reply as an observation');
});

test('legs: an errored snapshot cannot make an old NPC answer pass after an uncommitted turn', async () => {
  const result = await runFake(fakeWorld({ priorNpcReply: true, snapshotErrorAt: 4, talkCommitted: false, talkWorks: false }));
  assert.equal(statusOf(result).talk, 'fail');
  assert.match(result.legs.find(({ id }) => id === 'talk').reason, /снимок недоступен/u);
  assert.equal(result.turns.filter(({ leg }) => leg === 'talk').some(({ pass }) => pass), false);
});

test('legs: committed walks without a site change stay visible in the walk detail', async () => {
  const result = await runFake(fakeWorld({ samePlaceWalks: 1 }));
  const walk = result.legs.find(({ id }) => id === 'walk');
  assert.equal(walk.status, 'pass');
  assert.match(walk.detail, /ходов движения: 2, из них без смены места: 1/u);
});

test('legs: three local slot changes at one site still allow finding the exit label', async () => {
  const result = await runFake(fakeWorld({
    walkLocalLabels: ['Петля на месте', 'Ещё петля', 'Третья петля'],
    walkExits: { 'Тропа': 'B' }
  }));
  assert.equal(statusOf(result).walk, 'pass');
  const walkTurns = result.turns.filter(({ leg }) => leg === 'walk');
  assert.ok(walkTurns.length <= 8);
  assert.ok(walkTurns.some(({ input }) => input === 'Тропа'));
});

test('legs: local committed walks do not reset stuck counter; exits still found', async () => {
  const result = await runFake(fakeWorld({
    walkLocalLabels: ['Петля на месте', 'Ещё петля'],
    walkExits: { 'Тропа': 'B', 'К реке': 'C' },
    resourceSites: ['B', 'C']
  }));
  assert.equal(statusOf(result).walk, 'pass');
  const walkTurns = result.turns.filter(({ leg }) => leg === 'walk');
  assert.ok(walkTurns.length <= 7, `too many walk turns: ${walkTurns.length}`);
  assert.ok(walkTurns.some(({ before, after }) => before?.position?.site_id !== after?.position?.site_id));
});

test('legs: when every passage label fails to change site, walk ends with label diagnostics', async () => {
  const result = await runFake(fakeWorld({
    walkLocalLabels: ['Петля на месте', 'Ещё петля'],
    walkLocalNoProgress: true,
    walkExits: {},
    npcAtStart: true,
    npcAtDestination: false
  }));
  assert.equal(statusOf(result).walk, 'fail');
  assert.match(result.legs.find(({ id }) => id === 'walk').reason,
    /ни одна подпись.*Петля на месте.*Ещё петля/u);
});

test('legs: multi-step exit through three positions on one label keeps walking', async () => {
  const world = fakeWorld({
    walkSlotSteps: { 'Глинистая тропа': ['focus', 'departure'] }
  });
  const result = await runFake(world, { maxTurns: 12 });
  assert.equal(statusOf(result).walk, 'pass');
  const walkTurns = result.turns.filter(({ leg }) => leg === 'walk');
  assert.ok(walkTurns.length >= 3);
  assert.ok(walkTurns.filter(({ input }) => input === 'Глинистая тропа').length >= 3);
  assert.ok(walkTurns.every(({ before, after }) => positionProgressed(before, after)
    || before?.position?.site_id !== after?.position?.site_id));
});

test('D49 harness minimum passes with take alone, make alone, and fails the item requirement without either', async () => {
  const takeOnly = await runFake(fakeWorld({ makeWorks: false }));
  assert.deepEqual(d49MinimumOf(takeOnly.legs, takeOnly.turns), { status: 'PASS', item_leg: 'take' });
  assert.equal(exitCodeOf(takeOnly.legs), EXIT.LEGS);
  const makeOnly = await runFake(fakeWorld({ takeWorks: false }));
  assert.deepEqual(d49MinimumOf(makeOnly.legs, makeOnly.turns), { status: 'PASS', item_leg: 'make' });
  assert.equal(exitCodeOf(makeOnly.legs), EXIT.LEGS);
  const neither = await runFake(fakeWorld({ takeWorks: false, makeWorks: false }));
  assert.notEqual(d49MinimumOf(neither.legs, neither.turns).status, 'PASS');
  assert.deepEqual(d49MinimumOf(neither.legs, neither.turns), { status: 'PARTIAL', item_leg: null });
});

test('legs: rejected make plans are a fail with the API code, take without effect is a fail', async () => {
  const result = await runFake(fakeWorld({ makeWorks: false, takeWorks: false }));
  assert.equal(statusOf(result).make, 'fail');
  assert.match(result.legs.find(({ id }) => id === 'make').reason, /TURN_STEP_PLAN_INVALID/u);
  assert.equal(statusOf(result).take, 'fail');
  assert.equal(result.turns.filter(({ leg }) => leg === 'make').length, 3);
});

test('legs: nobody around is blocked (meet, talk), not fail', async () => {
  const result = await runFake(fakeWorld({ hidePeople: true }));
  assert.deepEqual([statusOf(result).meet, statusOf(result).talk], ['blocked', 'blocked']);
  assert.match(result.legs.find(({ id }) => id === 'meet').reason, /work_storage/u);
});

test('legs: the turn budget keeps the make reserve; a tiny budget blocks make with the reason', async () => {
  const world = fakeWorld({ hidePeople: true });
  const result = await runFake(world, { maxTurns: 5 });
  assert.ok(result.turns.filter(({ leg }) => leg !== 'make').length <= 5 - RESERVE_MAKE_TURNS);
  assert.ok(result.turns.length <= 5);
  const tiny = await runFake(fakeWorld(), { maxTurns: 0 });
  assert.equal(statusOf(tiny).make, 'blocked');
  assert.match(tiny.legs.find(({ id }) => id === 'make').reason, /бюджет/u);
});

test('legs: the deadline blocks further turns', async () => {
  const result = await runFake(fakeWorld(), { deadlineAt: 0, now: () => 1 });
  assert.equal(statusOf(result).walk, 'blocked');
  assert.match(result.legs.find(({ id }) => id === 'walk').reason, /дедлайн/u);
  assert.equal(result.turns.length, 0);
});

test('legs: an opening rejected three times fails start and blocks the rest; two rejections still start', async () => {
  const dead = await runFake(fakeWorld({ openingRejections: 9 }));
  assert.equal(statusOf(dead).start, 'fail');
  assert.ok(Object.entries(statusOf(dead)).filter(([id]) => id !== 'start').every(([, status]) => status === 'blocked'));
  assert.match(dead.legs.find(({ id }) => id === 'walk').reason, /start не пройден/u);
  const flaky = await runFake(fakeWorld({ openingRejections: 2 }));
  assert.equal(statusOf(flaky).start, 'pass');
  assert.equal(flaky.opening.rejections, 2);
  assert.equal(flaky.opening.opening_attempts.filter(({ outcome }) => outcome === 'rejected').length, 2);
  assert.equal(flaky.opening.opening_attempts[0].writer_prose, 'Черновик вступления.');
});

test('legs: a failed opening diagnostics fetch does not block later new-game retries', async () => {
  const world = fakeWorld({ openingRejections: 2 });
  world.api.llmTurnReport = async () => {
    throw Object.assign(new TypeError('fetch failed'), { transport: { phase: 'opening_llm_report' } });
  };
  const result = await runFake(world);
  assert.equal(statusOf(result).start, 'pass');
  assert.equal(result.opening.opening_attempts[0].repair.observed, false);
  assert.equal(result.opening.opening_attempts[0].repair.attempted, null);
});

test('legs: a committed turn without text triggers one presentation-recovery', async () => {
  const world = fakeWorld({ emptyProse: true });
  const result = await runFake(world, { maxTurns: 4 });
  assert.ok(world.w.recovered >= 1);
  assert.equal(result.turns[0].recovered, true);
  assert.equal(result.turns[0].prose, 'Восстановлено.');
});

test('legs: committed_presentation_pending triggers presentation-recovery like the web client', async () => {
  const world = fakeWorld({ presentationPendingOnce: true });
  const result = await runFake(world, { maxTurns: 6 });
  assert.ok(world.w.recovered >= 1);
  assert.equal(result.presentation_recovery.attempts, 1);
  assert.equal(result.presentation_recovery.recovered, 1);
  assert.equal(result.turns[0].presentation_recovery_outcome, 'recovered');
  assert.equal(statusOf(result).walk, 'pass');
});

test('legs: still pending after presentation-recovery stops the leg with delivery diagnostics', async () => {
  const world = fakeWorld({ presentationPendingOnce: true, presentationStaysPending: true });
  const result = await runFake(world, { maxTurns: 6 });
  assert.equal(result.presentation_recovery.still_pending, 1);
  assert.match(result.legs.find(({ id }) => id === 'walk').reason, /доставка прозы не завершена/u);
  assert.equal(result.turns.length, 1);
  assert.equal(result.turns[0].delivery_failed, true);
  assert.equal(result.turns[0].request_id, 'slice-r-1');
  assert.equal(world.w.turns.length, 1, 'no further POST turns after delivery failure');
});

test('meter: counts LLM calls by role without content and turns the masked server error log into a summary', async () => {
  const real = globalThis.fetch;
  const printed = [];
  const log = { error: (...args) => printed.push(args) };
  const stub = async () => new Response('{}', { status: 200 });
  globalThis.fetch = stub;
  const originalError = log.error;
  const meter = installLlmMeter({ log });
  try {
    await globalThis.fetch('http://x.invalid', { body: JSON.stringify({ messages: [{ role: 'system', content: 'Return a valid json object. Return only {"pass":true}' }] }) });
    meter.telemetry.onCall({ roleId: 'turn_step_planner', durationMs: 123, status: 'ok' });
    assert.deepEqual([meter.count(), meter.calls[0].status, meter.roleCalls[0]], [1, 200,
      { role_id: 'turn_step_planner', ms: 123, status: 'ok' }]);
    assert.equal(JSON.stringify(meter.calls).includes('messages'), false);
    const error = Object.assign(new Error('Turn-step plan is invalid.'), { code: 'TURN_STEP_PLAN_INVALID', details: { errors: [{ code: 'identity_shape' }, {}] } });
    log.error('[game-server] request abc failed', error);
    log.error('something else', 1);
    assert.deepEqual(meter.serverErrorsSince(0), [describeServerError(error)]);
    assert.deepEqual(meter.serverErrorsSince(0)[0].validation, ['identity_shape', '{}']);
    assert.equal(printed.length, 1, 'unrelated console.error passes through, the stack is swallowed');
  } finally { meter.restore(); }
  assert.equal(globalThis.fetch, stub, 'restore puts fetch back');
  assert.equal(log.error, originalError, 'restore puts console.error back');
  globalThis.fetch = real;
});

test('people panel capture keeps raw visibility, counts and NPC ids only', () => {
  const capture = capturePeoplePanel({ panels: { people: { visible: false, data: {
    visible_npcs: [{ label: 'person' }, { label: 'second' }], people: [{ label: 'person' }, { label: 'second' }],
    active_interlocutor: { entity_id: 'npc-2' }
  } } }, visible_context: { visible_npc: [{ entity_ref: { entity_id: 'npc-2' } }] } },
  { placements_here: [{ entity_kind: 'npc', entity_id: 'npc-2' }, { entity_kind: 'player_character', entity_id: 'pc' }] });
  assert.deepEqual(capture, { panel_exists: true, visible: false, visible_npcs_count: 2, people_count: 2,
    active_interlocutor_exists: true, placement_npc_ids: ['npc-2'], visible_context_npc_ids: ['npc-2'] });
  assert.deepEqual(capturePeoplePanel(null), { panel_exists: false, visible: null, visible_npcs_count: 0,
    people_count: 0, active_interlocutor_exists: false, placement_npc_ids: [], visible_context_npc_ids: [] });
});

test('LLM timing summary groups by canonical role_id and measures share of turn time', () => {
  const summary = summarizeLlm([{ status: 200 }], [
    { role_id: 'planner', ms: 20 }, { role_id: 'planner', ms: 40 }, { role_id: 'narrator', ms: 10 }
  ], [{ ms: 100, llm_role_calls: [
    { role_id: 'planner', ms: 20 }, { role_id: 'planner', ms: 40 }, { role_id: 'narrator', ms: 10 }
  ] }]);
  assert.deepEqual(summary.by_role, { planner: 2, narrator: 1 });
  assert.deepEqual(summary.by_role_timing, {
    planner: { count: 2, sum_ms: 60, p50_ms: 20, p95_ms: 40, turn_time_share: 0.6 },
    narrator: { count: 1, sum_ms: 10, p50_ms: 10, p95_ms: 10, turn_time_share: 0.1 }
  });
});

// ---------- cleanup ----------

test('finalizers all run in reverse order even when one throws, and only once', async () => {
  const order = [];
  const finalizers = createFinalizers();
  finalizers.add('a', () => order.push('a'));
  finalizers.add('b', () => { throw new Error('b broke'); });
  finalizers.add('c', () => order.push('c'));
  assert.deepEqual(await finalizers.run(), ['b: b broke']);
  assert.deepEqual(order, ['c', 'a']);
  assert.deepEqual(await finalizers.run(), []);
  assert.deepEqual(order, ['c', 'a']);
});

function fakeDeps(order, { rootFails = false, legsFail = false, transportFail = false,
  ...worldOpts } = {}) {
  const world = fakeWorld(worldOpts);
  let roleTelemetry = null;
  let sceneProjectionCapture = null;
  return {
    postgresImage: 'postgres:16.14-alpine',
    routeLabels: world.routeLabels,
    loadSettings: async () => ({ version: 2, settings: { mode: 'custom', compatibility: 'openai_compatible', base_url: SECRET_URL, model: 'qwen', api_key: SECRET_KEY } }),
    bootstrap: async () => ({ container: `v17-slice-test-none-${process.pid}`, partyPool: {}, dispose: async () => { order.push('dispose'); } }),
    createLlmOwner: async () => ({}),
    createRoot: async ({ telemetry, onNpcSceneProjection }) => {
      roleTelemetry = telemetry;
      sceneProjectionCapture = onNpcSceneProjection;
      if (rootFails) throw new Error(`root broke ${SECRET_KEY}`);
      return { runtime: { close: async () => { order.push('root'); } } };
    },
    startServer: async () => ({ url: 'http://127.0.0.1:1', close: async () => { order.push('server'); } }),
    createApi: () => {
      const turn = world.api.turn;
      return { ...world.api, health: async () => ({ ok: true, status: 200 }),
        async turn(...args) {
          roleTelemetry?.onCall({ roleId: 'turn_step_planner', durationMs: 125, status: 'ok' });
          sceneProjectionCapture?.({ request_id: args[1]?.request_id,
            before: { projection_npc_ids: ['npc-old'] },
            after: { projection_npc_ids: ['npc-new'] } });
          if (transportFail) {
            const error = new Error('fetch failed');
            error.transport = { method: 'POST', path: '/api/v1/parties/:party_id/turns',
              request_id: 'slice-test-1', elapsed_ms: 3,
              cause: { name: 'TypeError', message: 'fetch failed', cause_code: 'ECONNREFUSED' } };
            throw error;
          }
          return turn(...args);
        }, ...(legsFail ? { newGame: async () => { throw new Error('leg exploded'); } } : {}) };
    },
    createSql: () => world.sql
  };
}

test('runHarness: persists presentation_recovery into report.json and playtest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v17-slice-test-'));
  try {
    const order = [];
    const options = parseArgs(['--out-dir', dir, '--playtest-dir', join(dir, 'pt'), '--run-id', 'recovery'], {});
    const { code, report } = await runHarness(options,
      fakeDeps(order, { presentationPendingOnce: true }), { env: { RUS_LLM_SETTINGS_PATH: '/p' } });
    assert.equal(code, EXIT.PASS);
    assert.equal(report.presentation_recovery.attempts, 1);
    assert.equal(report.presentation_recovery.recovered, 1);
    const saved = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8'));
    assert.deepEqual(saved.presentation_recovery, report.presentation_recovery);
    const md = await readFile(join(dir, 'pt', (await readdir(join(dir, 'pt')))[0]), 'utf8');
    assert.ok(md.includes('Presentation recovery'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runHarness: happy path writes report.json and playtest, then cleans in reverse order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v17-slice-test-'));
  try {
    const order = [];
    const options = parseArgs(['--out-dir', dir, '--playtest-dir', join(dir, 'pt'), '--run-id', 'happy'], {});
    const { code, report } = await runHarness(options, fakeDeps(order), { env: { RUS_LLM_SETTINGS_PATH: '/srv/x/llm-settings.json' } });
    assert.equal(code, EXIT.PASS);
    assert.deepEqual(report.d49_minimum, { status: 'PASS', item_leg: 'take' });
    assert.deepEqual(order, ['server', 'root', 'dispose']);
    assert.equal(report.legs.every(({ status }) => status === 'pass'), true);
    const capturedTurn = report.turns.find(({ n }) => n === 1);
    assert.equal(capturedTurn.current_visible_context.after.schema,
      'visible_context_package');
    assert.deepEqual(capturedTurn.npc_scene_projection_diagnostics[0]
      .after.projection_npc_ids, ['npc-new']);
    assert.equal(capturedTurn.after.position.position_id, 'position:B');
    assert.equal(capturedTurn.after.position.g6_instance_id, 'g6:B');
    assert.equal(capturedTurn.after.npc_placements_all[0].position_id,
      'position:B');
    const json = await readFile(join(dir, 'report.json'), 'utf8');
    const saved = JSON.parse(json);
    assert.deepEqual(saved.d49_minimum, { status: 'PASS', item_leg: 'take' });
    assert.ok(saved.llm.by_role_timing['turn_step_planner'].count > 0);
    assert.deepEqual(saved.turns.find(({ n }) => n === 1)
      .npc_scene_projection_diagnostics[0].before.projection_npc_ids,
    ['npc-old']);
    assert.equal(saved.llm.by_role_timing['turn_step_planner'].sum_ms,
      saved.llm.by_role_timing['turn_step_planner'].count * 125);
    assert.equal(json.includes(SECRET_KEY) || json.includes(SECRET_URL), false);
    const [file] = await readdir(join(dir, 'pt'));
    assert.match(file, /^\d{4}-\d{2}-\d{2}_rt-harness_[0-9a-f]{8}_v17-slice-happy\.md$/u);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runHarness: a crash while building the root still cleans up, exits 4 and never leaks the key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v17-slice-test-'));
  try {
    const order = [];
    const options = parseArgs(['--out-dir', dir, '--run-id', 'crash'], {});
    const { code, report } = await runHarness(options, fakeDeps(order, { rootFails: true }), { env: { RUS_LLM_SETTINGS_PATH: '/p' } });
    assert.equal(code, EXIT.STAND);
    assert.deepEqual(order, ['dispose']);
    assert.ok(report.legs.every(({ status }) => status === 'blocked'));
    const text = await readFile(join(dir, 'report.json'), 'utf8') + await readFile(join(dir, 'playtest.md'), 'utf8');
    assert.equal(text.includes(SECRET_KEY), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runHarness: an exception inside a leg is contained, the run still cleans up', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v17-slice-test-'));
  try {
    const order = [];
    const options = parseArgs(['--out-dir', dir, '--run-id', 'leg'], {});
    const { code, report } = await runHarness(options, fakeDeps(order, { legsFail: true }), { env: { RUS_LLM_SETTINGS_PATH: '/p' } });
    assert.equal(code, EXIT.LEGS);
    assert.equal(report.legs.find(({ id }) => id === 'start').reason, 'leg exploded');
    assert.deepEqual(order, ['server', 'root', 'dispose']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runHarness: transport diagnostics reach JSON and playtest report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v17-slice-test-'));
  try {
    const order = [];
    const options = parseArgs(['--out-dir', dir, '--playtest-dir', join(dir, 'pt'), '--run-id', 'transport'], {});
    const { code, report } = await runHarness(options,
      fakeDeps(order, { transportFail: true }),
      { env: { RUS_LLM_SETTINGS_PATH: '/p' } });
    assert.equal(code, EXIT.LEGS);
    assert.equal(report.transport_errors[0].phase, 'turn');
    assert.equal(report.transport_errors[0].turn, 1);
    const json = await readFile(join(dir, 'report.json'), 'utf8');
    assert.equal(JSON.parse(json).transport_errors[0].cause.cause_code, 'ECONNREFUSED');
    const [file] = await readdir(join(dir, 'pt'));
    const markdown = await readFile(join(dir, 'pt', file), 'utf8');
    assert.match(markdown, /POST \| \/api\/v1\/parties\/:party_id\/turns \| turn \| walk \| 1 \| TypeError: fetch failed: ECONNREFUSED/u);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('runHarness: missing settings path is a preflight failure before any container exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v17-slice-test-'));
  try {
    const order = [];
    const deps = fakeDeps(order);
    deps.loadSettings = (path) => readLlmSettingsRecord(path, { load: async () => null });
    deps.bootstrap = async () => { order.push('bootstrap'); throw new Error('must not run'); };
    const { code } = await runHarness(parseArgs(['--out-dir', dir], {}), deps, { env: {} });
    assert.equal(code, EXIT.PREFLIGHT);
    assert.deepEqual(order, []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// Real Docker: the container and its anonymous volume are removed by the harness even when the run crashes and the
// bootstrap's own dispose does nothing (the safety-net finalizer).
test('cleanup self-check: a crashing run leaves no container and no anonymous volume', async (t) => {
  const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 90_000 });
  const { POSTGRES_IMAGE, startPostgres } = await import('../../../test/spatial-v3/presence-rules-production-e2e-fixture.js');
  if (docker(['version']).status !== 0 || docker(['image', 'inspect', POSTGRES_IMAGE]).status !== 0) {
    return t.skip(`Docker and image ${POSTGRES_IMAGE} required`);
  }
  const dir = await mkdtemp(join(tmpdir(), 'v17-slice-test-'));
  const container = `v17-slice-cleanup-${process.pid}`;
  t.after(async () => { docker(['rm', '-fv', container]); await rm(dir, { recursive: true, force: true }); });
  let volume = null;
  const deps = fakeDeps([], { rootFails: true });
  deps.bootstrap = async () => {
    startPostgres(container);
    volume = docker(['inspect', '-f', '{{range .Mounts}}{{.Name}}{{end}}', container]).stdout.trim();
    assert.equal(docker(['ps', '-a', '--filter', `name=${container}`, '--format', '{{.Names}}']).stdout.trim(), container);
    return { container, partyPool: {}, dispose: async () => {} };
  };
  const { code } = await runHarness(parseArgs(['--out-dir', dir, '--run-id', 'docker'], {}), deps, { env: { RUS_LLM_SETTINGS_PATH: '/p' } });
  assert.equal(code, EXIT.STAND);
  assert.equal(docker(['ps', '-a', '--filter', `name=${container}`, '--format', '{{.Names}}']).stdout.trim(), '', 'container removed');
  assert.ok(volume, 'the postgres image declares an anonymous volume');
  assert.notEqual(docker(['volume', 'inspect', volume]).status, 0, 'anonymous volume removed');
});
