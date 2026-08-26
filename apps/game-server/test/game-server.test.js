import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeStage26ScreenDigest } from '@rus/contracts';
import {
  createGameCompositionRoot,
  createGameHttpServer,
  createInMemorySessionStore,
  createPortraitSpecNormalizer,
  createStaticAssetResolver,
  listen,
  matchApiRoute
} from '../src/index.js';

function stage26Fixture() {
  const screen = {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: 'party-1',
    main_prose: 'Перед тобой открывается дорога к Новгороду.',
    action_panel: { suggested_actions: [{ option_id: 'look', label: 'Осмотреться' }] },
    position_panel: { position_ref: { g1_id: 'g1-1', g2_id: 'g2-1' } },
    delivery_state: { message_id: 'message-1' }
  };
  return {
    version: 1,
    schema: 'stage26_first_game_screen_result',
    pass: true,
    request_id: 'request-1',
    party_id: 'party-1',
    transaction_id: 'tx-1',
    first_game_screen: screen,
    screen_digest: computeStage26ScreenDigest(screen),
    visible_context_package_digest: 'sha256:visible',
    narrator_output_digest: 'sha256:narrator',
    delivery_permission: {
      can_create_delivery_attempt: true,
      can_show_screen: true,
      can_accept_first_turn_intent: true
    }
  };
}

function turnResult() {
  return {
    version: 1,
    schema: 'turn_result',
    party_id: 'party-1',
    turn_id: 'turn-1',
    turn_number: 1,
    status: 'resolved',
    mode: 'attention',
    summary: { outcome: 'observed' },
    commit: { status: 'committed' },
    screen: {
      version: 1,
      schema: 'turn_screen',
      screen_status: 'ready',
      party_id: 'party-1',
      turn_id: 'turn-1',
      turn_number: 1,
      main_prose: 'Ты замечаешь свежие следы на дороге.',
      visible_context: { current_position: { g1_id: 'g1-1' } },
      input_panel: { input_contract: 'intent_not_fact' },
      action_panel: { suggested_actions: [] },
      panels: {}
    }
  };
}

function portraitSpec() {
  return {
    schema: 'portrait_spec_v1',
    person: {
      sex: 'male', age: 'middle_aged', build: 'stocky',
      skin_tone: 'light', face_shape: 'broad'
    },
    hair: {
      color: 'dark_brown', length: 'medium', style: 'loose',
      facial_hair: 'full_beard'
    },
    eyes: { color: 'gray', gaze: 'viewer' },
    expression: { emotion: 'angry', intensity: 'medium' },
    clothing: {
      neckline: 'high_closed', sleeve: 'narrow', outer: 'wrap',
      fabric: 'wool', trim: 'braid', main_color: 'dark_blue',
      secondary_color: 'madder_red', headwear: 'none'
    },
    pose: { body: 'three_quarter', head: 'slightly_turned' },
    background: 'neutral'
  };
}

function createRoot() {
  return createGameCompositionRoot({
    newGameWorkflow: { run: async () => ({ status: 'approved', artifact: stage26Fixture() }) },
    turnWorkflow: { run: async () => turnResult() },
    sessionStore: createInMemorySessionStore(),
    scenarioRegistry: {
      listPublic: () => [{
        scenario_id: 'lower_dvina_late_summer_open_water_v1',
        title: 'Нижняя Двина: позднее лето',
        description: 'Первый тестовый сценарий.',
        available: true
      }],
      resolveForNewGame: (scenarioId) => {
        if (scenarioId !== 'lower_dvina_late_summer_open_water_v1') return null;
        return {
          scenario_id: scenarioId,
          start_text: 'Начать утверждённый сценарий Нижней Двины',
          scenario_context: {
            archetype_requirement: 'boatman',
            season_mode: 'late_summer_open_water'
          }
        };
      }
    },
    now: () => '2026-07-12T10:00:00.000Z'
  });
}

test('composition root starts game, requires acknowledgement, and returns versioned screens', async () => {
  const root = createRoot();
  const started = await root.startNewGame({ start_text: 'Начать в Новгороде', request_id: 'request-1' });
  assert.equal(started.screen.schema, 'first_game_screen');
  await assert.rejects(() => root.submitTurn('party-1', { raw_text: 'Осматриваюсь' }), { code: 'OPENING_ACK_REQUIRED' });
  const ack = await root.acknowledgeOpening('party-1', { client_ack_id: 'ack-1' });
  assert.equal(ack.delivery_status, 'acknowledged');
  const turn = await root.submitTurn('party-1', { raw_text: 'Осматриваюсь' });
  assert.equal(turn.screen.schema, 'turn_screen');
  assert.equal(turn.turn.turn_number, 1);
});

test('scenario launch resolves scenario_id before new-game workflow without breaking baseline start', async () => {
  const workflowInputs = [];
  const root = createGameCompositionRoot({
    newGameWorkflow: {
      run: async (input) => {
        workflowInputs.push(input);
        return { status: 'approved', artifact: stage26Fixture() };
      }
    },
    turnWorkflow: { run: async () => turnResult() },
    sessionStore: createInMemorySessionStore(),
    scenarioRegistry: {
      listPublic: () => [{
        scenario_id: 'lower_dvina_late_summer_open_water_v1',
        title: 'Нижняя Двина: позднее лето',
        description: 'Первый тестовый сценарий.',
        available: true
      }],
      resolveForNewGame: (scenarioId) => scenarioId === 'lower_dvina_late_summer_open_water_v1'
        ? {
            scenario_id: scenarioId,
            start_text: 'Начать утверждённый сценарий Нижней Двины',
            scenario_context: { archetype_requirement: 'boatman' }
          }
        : null
    },
    now: () => '2026-07-12T10:00:00.000Z'
  });

  assert.equal((await root.listScenarios()).scenarios.length, 1);
  await root.startNewGame({ scenario_id: 'lower_dvina_late_summer_open_water_v1' });
  assert.equal(workflowInputs[0].scenario_id, 'lower_dvina_late_summer_open_water_v1');
  assert.equal(workflowInputs[0].scenario_context.archetype_requirement, 'boatman');

  await root.startNewGame({ start_text: 'Обычное начало', player_name: 'Садко' });
  assert.equal(workflowInputs[1].start_text, 'Обычное начало');
  assert.equal(workflowInputs[1].scenario_id, null);

  await assert.rejects(
    () => root.startNewGame({ scenario_id: 'unknown' }),
    { code: 'SCENARIO_NOT_SUPPORTED' }
  );
});

test('HTTP server publishes only versioned /api/v1 envelopes', async (t) => {
  const server = createGameHttpServer({ root: createRoot(), maxBodyBytes: 64_000 });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.schema, 'rus_api_success');
  assert.equal(body.data.service, '@rus/game-server');
});

test('API route matcher is declarative and bounded', () => {
  assert.deepEqual(matchApiRoute('GET', '/api/v1/scenarios'), { id: 'scenarios', status: 200 });
  assert.deepEqual(matchApiRoute('POST', '/api/v1/portrait-spec'), { id: 'portrait_spec', status: 200 });
  assert.deepEqual(matchApiRoute('POST', '/api/v1/new-games'), { id: 'new_game', status: 201 });
  assert.equal(matchApiRoute('DELETE', '/api/v1/new-games'), null);
  assert.equal(matchApiRoute('GET', '/api/v2/health'), null);
});

test('static asset resolver serves only allowlisted web paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rus-web-'));
  const contractsRoot = await mkdtemp(join(tmpdir(), 'rus-contracts-'));
  await mkdir(join(root, 'public'), { recursive: true });
  await mkdir(join(root, 'public', 'assets'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'public', 'index.html'), '<h1>RUS</h1>');
  await writeFile(join(root, 'public', 'portrait-lab.html'), '<h1>Portrait Lab</h1>');
  await writeFile(join(root, 'src', 'main.js'), 'export {};');
  await writeFile(join(root, 'public', 'assets', 'portrait.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await writeFile(join(root, 'public', 'assets', 'map.webp'), Buffer.from('RIFF'));
  await writeFile(join(contractsRoot, 'portrait-spec-v1.js'), 'export const schema = 1;');
  const resolver = createStaticAssetResolver({ webRoot: root, contractsRoot });
  assert.match((await resolver.read('/')).body.toString(), /RUS/u);
  assert.match((await resolver.read('/portrait-lab')).body.toString(), /Portrait Lab/u);
  assert.match(
    (await resolver.read('/packages/contracts/src/portrait-spec-v1.js')).body.toString(),
    /schema/u
  );
  assert.deepEqual((await resolver.read('/assets/portrait.png')), {
    body: Buffer.from([0x89, 0x50, 0x4e, 0x47]), contentType: 'image/png'
  });
  assert.deepEqual((await resolver.read('/assets/map.webp')), {
    body: Buffer.from('RIFF'), contentType: 'image/webp'
  });
  assert.equal(await resolver.read('/assets/'), null);
  assert.equal(await resolver.read('/assets/./portrait.png'), null);
  assert.equal(await resolver.read('/assets/../secret.txt'), null);
  assert.equal(await resolver.read('/assets/..\\secret.txt'), null);
  assert.equal(await resolver.read('/assets/missing.gif'), null);
  assert.equal(await resolver.read('/../package.json'), null);
  assert.equal(await resolver.read('/secret.txt'), null);
});

test('hidden fields are blocked at the HTTP success boundary', async () => {
  const root = {
    health: () => ({ hidden_state: { secret: true } }),
    startNewGame() {}, acknowledgeOpening() {}, submitTurn() {}, getPartyScreen() {}
  };
  const server = createGameHttpServer({ root });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
  server.close();
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.error.code, 'PUBLIC_PAYLOAD_HIDDEN_LEAK');
});

test('infrastructure adapters require explicit provider and database ports', async () => {
  const { createLlmRoleRunnerAdapter, createWorldBaseAdapter, createPartyStoreAdapter } = await import('../src/index.js');
  assert.throws(() => createWorldBaseAdapter(), /query function/u);
  assert.throws(() => createPartyStoreAdapter(), /transact function/u);
  const world = createWorldBaseAdapter({ query: async (sql, params) => ({ sql, params }) });
  await assert.rejects(() => world.read('DELETE FROM world_base', []), /read-only/u);
  const llm = createLlmRoleRunnerAdapter({ execute: async () => ({ status: 'ok', parsed_json: { approved: true }, provider: 'fixture', model: 'fixture', scope: 'turn_runtime', role_id: 'test', tier_id: 'test', durationMs: 1, config_hash: 'hash' }) });
  assert.deepEqual((await llm.run({ scope: 'turn_runtime', role_id: 'test' })).output, { approved: true });
});

test('portrait endpoint normalizes text and never exposes provider metadata or API keys', async (t) => {
  const secret = 'sk-test-secret-never-public';
  const normalizer = createPortraitSpecNormalizer({
    roleRunner: {
      run: async () => ({
        output: portraitSpec(),
        provider_record: { provider: 'deepseek', api_key: secret }
      })
    }
  });
  const server = createGameHttpServer({
    root: createRoot(), portraitNormalizer: normalizer, maxBodyBytes: 64_000
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());

  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/v1/portrait-spec`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Сердитый бородатый мужчина' })
    }
  );
  const raw = await response.text();
  const body = JSON.parse(raw);
  assert.equal(response.status, 200);
  assert.deepEqual(body.data.spec, portraitSpec());
  assert.equal(raw.includes(secret), false);
  assert.equal('provider_record' in body.data, false);
});

test('portrait endpoint preserves Russian UTF-8 text end to end', async (t) => {
  const prompt = 'Старая женщина в льняном платке, усталый взгляд';
  let receivedText = null;
  const server = createGameHttpServer({
    root: createRoot(),
    portraitNormalizer: {
      normalize: async (text) => {
        receivedText = text;
        return portraitSpec();
      }
    }
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());

  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/v1/portrait-spec`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ text: prompt })
    }
  );

  assert.equal(response.status, 200);
  assert.equal(receivedText, prompt);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
});

test('portrait normalizer validates DeepSeek output and fails closed', async () => {
  const calls = [];
  const valid = createPortraitSpecNormalizer({
    roleRunner: {
      run: async (request) => {
        calls.push(request);
        return { output: portraitSpec() };
      }
    }
  });
  assert.deepEqual(await valid.normalize('  Пожилая женщина  '), portraitSpec());
  assert.equal(calls[0].scope, 'portrait_lab');
  assert.equal(calls[0].role_id, 'portrait_spec_normalizer');
  const systemPrompt = calls[0].messages[0].content;
  assert.match(systemPrompt, /JSON Schema/u);
  assert.match(systemPrompt, /slit_round, narrow, none, light_linen, none/u);
  assert.match(systemPrompt, /high_closed, narrow, wrap, wool, braid/u);
  assert.match(systemPrompt, /round, wide, shoulder_drape, wool, none/u);
  assert.match(
    systemPrompt,
    /high_closed, narrow, sleeveless_overlayer, furred, fur_edge/u
  );
  assert.doesNotMatch(systemPrompt, /"(?:caftan|cloak|sheepskin)"/u);
  assert.equal(calls[0].messages[1].content, 'Пожилая женщина');

  const invalid = createPortraitSpecNormalizer({
    roleRunner: { run: async () => ({ output: { schema: 'portrait_spec_v1' } }) }
  });
  await assert.rejects(
    () => invalid.normalize('Портрет'),
    { code: 'PORTRAIT_SPEC_PROVIDER_INVALID', status: 502 }
  );

  const legacyOutput = portraitSpec();
  legacyOutput.clothing.base = 'linen_tunic';
  const legacy = createPortraitSpecNormalizer({
    roleRunner: { run: async () => ({ output: legacyOutput }) }
  });
  await assert.rejects(
    () => legacy.normalize('Старая форма одежды'),
    { code: 'PORTRAIT_SPEC_PROVIDER_INVALID', status: 502 }
  );
});

test('portrait endpoint rejects unknown request fields before calling DeepSeek', async (t) => {
  let calls = 0;
  const server = createGameHttpServer({
    root: createRoot(),
    portraitNormalizer: { normalize: async () => { calls += 1; return portraitSpec(); } }
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/v1/portrait-spec`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Портрет', api_key: 'must-not-pass' })
    }
  );
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'PORTRAIT_REQUEST_FIELD_UNKNOWN');
  assert.equal(calls, 0);

  const wrongType = await fetch(
    `http://127.0.0.1:${address.port}/api/v1/portrait-spec`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 42 })
    }
  );
  const wrongTypeBody = await wrongType.json();
  assert.equal(wrongType.status, 400);
  assert.equal(wrongTypeBody.error.code, 'PORTRAIT_TEXT_TYPE_INVALID');
  assert.equal(calls, 0);
});
