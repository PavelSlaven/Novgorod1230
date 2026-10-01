import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { EXIT, PreflightError, UsageError, createFinalizers, describeServerError, installLlmMeter, parseArgs,
  readLlmSettingsRecord, runHarness } from '../v17-slice-run.mjs';
import { RESERVE_MAKE_TURNS, runLegs } from '../v17-slice-legs.js';
import { createRedactor, exitCodeOf, renderPlaytestMarkdown, verdictOf } from '../v17-slice-report.js';

const SECRET_KEY = 'sk-test-secret-key-0123456789';
const SECRET_URL = 'https://llm.internal.example:8443/v1';
const LOCAL_LINE = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json',
  import.meta.url))).find(({ id }) => id === 'cg5bindv3__g4dirv3f__g4route_gn_nov_g3_xp017_yp026_r2_vikhtuy_locality_4');
assert.ok(LOCAL_LINE, 'the Vikhtuy work-storage line exists in the approved candidate data');

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
  const md = renderPlaytestMarkdown(sampleReport({ infra_error: `boom ${SECRET_KEY}` }), redact);
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
  assert.ok(md.includes('позиция s1') === false && md.includes('@arrival → cg5v3__x_r2_work_storage@departure'));
  assert.equal(md.includes(SECRET_KEY), false);
  assert.ok(md.includes('/srv/x/llm-settings.json'), 'the settings path is allowed in the report');
});

// ---------- legs against a fake world ----------

/** A small world: A (start, shirt) —«Тропа»→ B (a person, deadwood). Talk/take/make behave as configured. */
function fakeWorld({ blindLooks = 0, talkWorks = true, makeWorks = true, takeWorks = true, hidePeople = false, openingRejections = 0, emptyProse = false } = {}) {
  const w = { looks: 0, sv: 1, site: 'A', slot: 'arrival', statements: [], node: 60, held: [], made: [], turns: [], newGames: 0, recovered: 0, prose: 'Начало.' };
  const items = () => [{ item_id: 'shirt', holder: 'c', position: 'worn' }, ...w.held];
  const snap = () => ({ state_version: w.sv, position: { slot: w.slot, site_id: w.site, canonical_g5: `cg5v3__x_r2_${w.site === 'A' ? 'work_storage' : 'forest_path'}` },
    placements_here: w.site === 'B' && !hidePeople ? [{ entity_kind: 'npc', entity_id: 'npc1' }] : [],
    items: items(), party_items: w.made, npc_statements: w.statements,
    resource_nodes: w.site === 'B' ? [{ resource_node_id: 'm2c_finite_deadwood_v1:x', quantity_numerator: String(w.node) }] : [] });
  const screen = () => ({ main_prose: w.prose, labels: w.looks < blindLooks ? [] : w.site === 'A' ? [LOCAL_LINE.line_name] : ['Назад'],
    panels: { people: { data: { people: w.site === 'B' && !hidePeople ? [{ display_label: 'человек (1)' }] : [] } } } });
  const env = (data) => ({ status: 200, ok: true, data, error: null });
  const api = {
    async newGame() { w.newGames += 1; return w.newGames <= openingRejections
      ? { status: 409, ok: false, data: null, error: { code: 'AUTHORED_OPENING_AUDIT_REJECTED' } }
      : env({ party_id: 'p1', screen: { main_prose: 'Открытие.' } }); },
    async ack() { return env({}); },
    async screen() { return env({ screen: screen() }); },
    async recover() { w.recovered += 1; w.prose = 'Восстановлено.'; return env({}); },
    async turn(_id, { raw_text: text }) {
      w.turns.push(text);
      if (text === 'Осматриваюсь вокруг.') w.looks += 1;
      if (text === LOCAL_LINE.line_name) { w.site = 'B'; w.sv += 1; w.prose = 'Лесная тропа.'; }
      else if (text === 'Назад') { w.site = 'A'; w.sv += 1; }
      else if (/^Здоров|^Здравств/u.test(text)) { w.sv += 1; if (talkWorks) w.statements = [...w.statements, { speaker_ref: { entity_kind: 'npc' }, text: 'Я Милонег.' }]; }
      else if (/^Беру/u.test(text)) { w.sv += 1; if (takeWorks) { w.node -= 1; w.held = [...w.held, { item_id: 'ordinary_item_1', holder: 'c', position: 'hands' }]; } }
      else if (/^Ото|^Отр/u.test(text)) {
        if (!makeWorks) return { status: 422, ok: false, data: null, error: { code: 'TURN_STEP_PLAN_INVALID' } };
        w.sv += 1; w.made = [{ item_id: 'a1-result:1', action_production: true }];
      } else w.sv += 1;
      if (emptyProse) w.prose = '';
      return env({ screen: screen() });
    }
  };
  return { w, api, sql: { snapshot: async () => snap() }, routeLabels: (s) => s?.labels ?? [] };
}
const meter = () => { let n = 0; return { count: () => (n += 1) }; };
const runFake = (world, extra = {}) => runLegs({ ...world, llm: meter(), scenarioId: 's', runId: 'r', maxTurns: 24, ...extra });
const statusOf = (result) => Object.fromEntries(result.legs.map(({ id, status }) => [id, status]));

test('legs: a working world passes every leg with the exact phrases of the plan', async () => {
  const world = fakeWorld();
  const result = await runFake(world);
  assert.deepEqual(statusOf(result), { start: 'pass', walk: 'pass', meet: 'pass', talk: 'pass', take: 'pass', make: 'pass' });
  assert.deepEqual(world.w.turns, [LOCAL_LINE.line_name, 'Здороваюсь с человеком и спрашиваю, как его зовут.', 'Беру валежник.', 'Оторву полосу от подола рубахи.']);
  assert.equal(result.turns[0].input, LOCAL_LINE.line_name, 'the harness chooses the actual approved line name');
  assert.doesNotMatch(result.turns[0].input, /Проход\s+\d|выход\s+\d|\b(?:первый|второй|третий)\b/iu);
  assert.equal(result.turns.every(({ ms }) => Number.isFinite(ms)), true);
  assert.equal(exitCodeOf(result.legs), EXIT.PASS);
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
  assert.deepEqual(statusOf(result), { start: 'pass', walk: 'pass', meet: 'pass', talk: 'fail', take: 'pass', make: 'pass' });
  assert.match(result.legs.find(({ id }) => id === 'talk').reason, /реплики NPC/u);
  assert.equal(result.turns.filter(({ leg }) => leg === 'talk').length, 2, 'the second greeting was tried');
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
});

test('legs: a committed turn without text triggers one presentation-recovery', async () => {
  const world = fakeWorld({ emptyProse: true });
  const result = await runFake(world, { maxTurns: 4 });
  assert.ok(world.w.recovered >= 1);
  assert.equal(result.turns[0].recovered, true);
  assert.equal(result.turns[0].prose, 'Восстановлено.');
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
    assert.deepEqual([meter.count(), meter.calls[0].role, meter.calls[0].status], [1, 'Return only {"pass":true}', 200]);
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

function fakeDeps(order, { rootFails = false, legsFail = false } = {}) {
  const world = fakeWorld();
  return {
    postgresImage: 'postgres:16.14-alpine',
    routeLabels: world.routeLabels,
    loadSettings: async () => ({ version: 2, settings: { mode: 'custom', compatibility: 'openai_compatible', base_url: SECRET_URL, model: 'qwen', api_key: SECRET_KEY } }),
    bootstrap: async () => ({ container: `v17-slice-test-none-${process.pid}`, partyPool: {}, dispose: async () => { order.push('dispose'); } }),
    createLlmOwner: async () => ({}),
    createRoot: async () => {
      if (rootFails) throw new Error(`root broke ${SECRET_KEY}`);
      return { runtime: { close: async () => { order.push('root'); } } };
    },
    startServer: async () => ({ url: 'http://127.0.0.1:1', close: async () => { order.push('server'); } }),
    createApi: () => ({ ...world.api, health: async () => ({ ok: true, status: 200 }),
      ...(legsFail ? { newGame: async () => { throw new Error('leg exploded'); } } : {}) }),
    createSql: () => world.sql
  };
}

test('runHarness: happy path writes report.json and playtest, then cleans in reverse order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'v17-slice-test-'));
  try {
    const order = [];
    const options = parseArgs(['--out-dir', dir, '--playtest-dir', join(dir, 'pt'), '--run-id', 'happy'], {});
    const { code, report } = await runHarness(options, fakeDeps(order), { env: { RUS_LLM_SETTINGS_PATH: '/srv/x/llm-settings.json' } });
    assert.equal(code, EXIT.PASS);
    assert.deepEqual(order, ['server', 'root', 'dispose']);
    assert.equal(report.legs.every(({ status }) => status === 'pass'), true);
    const json = await readFile(join(dir, 'report.json'), 'utf8');
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
