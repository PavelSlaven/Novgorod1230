import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import {
  createGameHttpServer,
  createStaticAssetResolver,
  listen
} from '@rus/game-server';
import {
  createSpatialV3PlayerProjection,
  createSpatialV3ProjectionPanels
} from '@rus/presentation/spatial-v3-projection';
import { SAMPLE_PORTRAIT_SPEC } from
  '../../apps/game-web/src/portrait-lab/sample.js';
import { PORTRAIT_EMOTIONS } from
  '../../apps/game-web/src/features/conversation-portrait/authored-portrait.js';

const executablePath = [
  process.env.RUS_CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome'
].find((item) => item && existsSync(item));

const VISUAL_CASES = Object.freeze([
  ['generic-day', { day_part: 'day' }],
  ['generic-night', { day_part: 'night' }],
  ['generic-rain', { weather: 'rain' }],
  ['generic-snow', { weather: 'snow' }],
  ['generic-fog', { weather: 'fog' }],
  ['lower-dvina-normal', { scene_asset_id: 'lower-dvina-wreck-shore' }],
  ['lower-dvina-rain', {
    scene_asset_id: 'lower-dvina-wreck-shore', weather: 'rain'
  }],
  ['lower-dvina-snow', {
    scene_asset_id: 'lower-dvina-wreck-shore', weather: 'snow'
  }],
  ['interior-natural', {
    scene_asset_id: 'lower-dvina-old-drying-shed-interior', day_part: 'day'
  }],
  ['interior-dark', {
    scene_asset_id: 'lower-dvina-old-drying-shed-interior', day_part: 'night'
  }],
  ['authored-emotions', { portrait: 'authored', emotions: PORTRAIT_EMOTIONS }],
  ['runtime-procedural', { portrait: 'procedural' }],
  ['svg-fallback', { portrait: 'svg' }],
  ['broken-landscape', {
    scene_asset_id: 'lower-dvina-zhdanko-river-descent', brokenLandscape: true
  }],
  ['broken-authored-with-spec', {
    portrait: 'authored', portrait_asset_id: 'lower-dvina-onisim', brokenPortrait: true
  }],
  ['broken-authored-without-spec', {
    portrait: 'authored', portrait_asset_id: 'lower-dvina-onisim', spec: false,
    brokenPortrait: true
  }]
]);

function createRecordedRoot(records) {
  let partyNumber = 0;
  const sessions = new Map();
  const acknowledgementAttempts = new Map();
  return Object.freeze({
    health: () => ({ status: 'ok', service: '@rus/game-server', api_version: 1 }),
    listScenarios: async () => ({
      version: 1,
      schema: 'public_scenario_catalog',
      scenarios: [{
        scenario_id: 'lower_dvina_trace_v1',
        title: 'След на Нижней Двине',
        description: 'Позднее лето, разбитая лодья и пропавший груз.',
        available: true
      }]
    }),
    async startNewGame(input) {
      records.newGames.push(structuredClone(input));
      if (input.scenario_id !== 'lower_dvina_trace_v1') {
        throw Object.assign(new Error('Scenario is not supported.'), {
          code: 'SCENARIO_NOT_SUPPORTED', status: 400
        });
      }
      partyNumber += 1;
      const partyId = `party-e2e-${partyNumber}`;
      const screen = openingFixture(partyId);
      sessions.set(partyId, { screen, turnNumber: 0 });
      return { party_id: partyId, screen };
    },
    async acknowledgeOpening(partyId, input) {
      records.acknowledgements.push({ partyId, input: structuredClone(input) });
      const attempt = (acknowledgementAttempts.get(partyId) ?? 0) + 1;
      acknowledgementAttempts.set(partyId, attempt);
      if (partyId === 'party-e2e-1' && attempt <= 2) {
        throw Object.assign(new Error('Temporary acknowledgement failure.'), {
          code: 'ACK_TEMPORARILY_UNAVAILABLE', status: 503
        });
      }
      if (partyId === 'party-e2e-2' && attempt === 1) {
        throw Object.assign(new Error('Acknowledgement response was lost.'), {
          code: 'ACK_RESPONSE_LOST', status: 503
        });
      }
      return { party_id: partyId, delivery_status: 'acknowledged' };
    },
    async submitTurn(partyId, input) {
      records.turns.push({ partyId, input: structuredClone(input) });
      if (input.raw_text === 'Медленный ход') {
        await records.slowTurn.promise;
      }
      const session = sessions.get(partyId);
      if (!session) throw Object.assign(new Error('Party session was not found.'), {
        code: 'PARTY_NOT_FOUND', status: 404
      });
      const result = turnFixture({
        ...input,
        party_id: partyId,
        turn_number: session.turnNumber + 1
      });
      sessions.set(partyId, { screen: result.screen, turnNumber: result.turn_number });
      return { party_id: partyId, screen: result.screen, turn: result };
    },
    async getPartyScreen(partyId) {
      records.screenReads.push(partyId);
      const session = sessions.get(partyId);
      if (!session) throw Object.assign(new Error('Party session was not found.'), {
        code: 'PARTY_NOT_FOUND', status: 404
      });
      return { party_id: partyId, turn_number: session.turnNumber, screen: session.screen };
    }
  });
}

function openingFixture(partyId) {
  return {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: partyId,
    scenario_id: 'lower_dvina_trace_v1',
    main_prose: 'Ты приходишь в себя на берегу Нижней Двины после крушения.',
    visible_context: {
      location_label: 'Берег Нижней Двины',
      calendar: '20 августа 1230 года',
      environment: {
        profile_id: 'env.land_path',
        node_category: 'spatial.g3.route_site',
        facts: ['cold', 'wet', 'exposed']
      },
      weather: 'clear',
      day_part: 'day'
    },
    action_panel: { suggested_actions: [] },
    panels: {
      character: {
        visible: true,
        data: { name: '<script>bad()</script>Микула', role: 'Приказчик', health: 9 }
      },
      route: { visible: true, data: { current_place: 'Берег Нижней Двины' } }
    },
    delivery_state: { message_id: `opening:${partyId}` }
  };
}

function turnFixture(input) {
  const rawText = String(input.raw_text ?? '');
  const visual = VISUAL_CASES.find(([name]) => rawText
    .startsWith(`visual:${name}:`));
  if (visual) return visualTurnFixture(input, visual[1]);
  const leaking = rawText === 'Проверка утечки';
  const conversationEnded = rawText === 'Закончить разговор';
  const targetProjection = createSpatialV3PlayerProjection({
    journey_execution: {
      status: 'suspended_at_scene',
      player_message: 'Путь остановлен у ворот после слышимого сигнала.'
    },
    scene: {
      nodes: [
        {
          id: 'gate-visible', display_token: 'gate',
          label: 'Городские ворота', knowledge_visibility: 'visible'
        },
        {
          id: 'guard-hidden', display_token: 'guard-secret',
          label: 'Скрытый страж', knowledge_visibility: 'hidden'
        }
      ],
      links: []
    },
    route_options: [{
      option_id: 'wait-at-gate',
      player_label: 'Остаться у ворот',
      knowledge_visibility: 'visible',
      mechanical_readiness: 'ready',
      observed_conditions: ['путь временно остановлен']
    }],
    world_signals: [{
      kind: 'sound', approximate_direction: 'впереди', approximate_area: 'у ворот'
    }]
  });
  const panels = createSpatialV3ProjectionPanels(targetProjection);
  return {
    version: 1,
    schema: 'turn_result',
    party_id: input.party_id,
    turn_id: `turn-${input.turn_number}`,
    turn_number: input.turn_number,
    status: 'resolved',
    mode: 'attention',
    summary: { outcome: 'observed' },
    commit: { status: 'committed' },
    screen: {
      version: 1,
      schema: 'lower_dvina_trace_turn_screen',
      screen_status: 'ready',
      scenario_id: 'lower_dvina_trace_v1',
      party_id: input.party_id,
      turn_id: `turn-${input.turn_number}`,
      turn_number: input.turn_number,
      main_prose: 'Ты замечаешь свежие следы на дороге.',
      visible_context: {
        location_label: 'У городских ворот',
        environment: { facts: ['exposed'] },
        weather: 'Облачно', day_part: 'День'
      },
      input_panel: { input_contract: 'intent_not_fact' },
      action_panel: { suggested_actions: [] },
      panels: leaking
        ? {
            route: {
              wrapper: {
                dependencyPins: [{ private_candidate: 'secret' }],
                rawTrace: 'opaque-trace', endpointBindings: ['binding-42'],
                routes: ['hidden-route-value'], route: 'nested-route-value'
              }
            }
          }
        : {
            ...panels,
            journal: {
              visible: true,
              data: { current_task: 'Осмотреть следы у ворот' }
            },
            ...(conversationEnded ? {} : { people: {
              visible: true,
              data: {
                active_interlocutor: {
                  entity_ref: { entity_kind: 'npc', entity_id: 'npc-guard' },
                  display_label: 'Страж ворот',
                  portrait_spec_v1: SAMPLE_PORTRAIT_SPEC
                }
              }
            } })
          }
    }
  };
}

function visualTurnFixture(input, visual) {
  const spec = structuredClone(SAMPLE_PORTRAIT_SPEC);
  const emotion = input.raw_text.split(':').at(-1);
  if (visual.emotions) spec.expression.emotion = emotion;
  const active = visual.portrait === 'svg'
    ? { entity_ref: { entity_kind: 'npc', entity_id: 'npc-svg' }, display_label: 'Староста' }
    : visual.portrait === 'authored'
      ? {
          entity_ref: { entity_kind: 'npc', entity_id: 'npc-authored' },
          display_label: 'Микула',
          portrait_asset_id: visual.portrait_asset_id ?? 'lower-dvina-mikula',
          ...(visual.spec === false ? {} : { portrait_spec_v1: spec })
        }
      : {
          entity_ref: { entity_kind: 'npc', entity_id: 'npc-procedural' },
          display_label: 'Проводник', portrait_spec_v1: spec
        };
  return {
    version: 1,
    schema: 'turn_result',
    party_id: input.party_id,
    turn_id: `turn-${input.turn_number}`,
    turn_number: input.turn_number,
    status: 'resolved', mode: 'attention', summary: { outcome: 'observed' },
    commit: { status: 'committed' },
    screen: {
      version: 1, schema: 'lower_dvina_trace_turn_screen', screen_status: 'ready',
      scenario_id: 'lower_dvina_trace_v1',
      party_id: input.party_id, turn_id: `turn-${input.turn_number}`,
      turn_number: input.turn_number, main_prose: 'Сцена обновилась.',
      ...(visual.scene_asset_id ? { scene_asset_id: visual.scene_asset_id } : {}),
      visible_context: {
        location_label: 'Берег Нижней Двины',
        environment: {
          profile_id: 'env.land_path', node_category: 'spatial.g3.route_site'
        },
        weather: visual.weather ?? 'clear', day_part: visual.day_part ?? 'day'
      },
      input_panel: { input_contract: 'intent_not_fact' },
      action_panel: { suggested_actions: [] },
      panels: { people: { visible: true, data: { active_interlocutor: active } } }
    }
  };
}

test('browser preserves production API semantics through the Lovable UI', {
  timeout: 120_000
}, async (t) => {
  assert.ok(executablePath, 'Chromium executable is required for browser e2e.');
  const records = {
    newGames: [], acknowledgements: [], turns: [], screenReads: [],
    slowTurn: Promise.withResolvers()
  };
  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = resolve(here, '../../apps/game-web');
  const contractsRoot = resolve(here, '../../packages/contracts/src');
  const server = createGameHttpServer({
    root: createRecordedRoot(records),
    staticAssets: createStaticAssetResolver({ webRoot, contractsRoot }),
    developerMode: true
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  t.after(() => records.slowTurn.resolve());
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--no-proxy-server', '--proxy-bypass-list=*']
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await page.goto(baseUrl);
  await page.waitForSelector('[data-start-new-game]');
  assert.equal(await page.locator('[data-continue-party]').count(), 0);
  assert.equal(records.screenReads.length, 0, 'landing must not auto-load a party');

  await page.click('[data-start-new-game]');
  await page.waitForSelector('[data-new-game-form]');
  await page.click('[data-scenario-id="lower_dvina_trace_v1"]');
  await page.waitForSelector('[data-retry-opening-ack]');
  assert.equal(await page.locator('[data-turn-form] textarea:disabled').count(), 1);
  assert.deepEqual(records.newGames[0], { scenario_id: 'lower_dvina_trace_v1' });
  const firstPendingAck = await page.evaluate(() => JSON.parse(
    localStorage.getItem('rus.pending_opening_ack') ?? 'null'
  ));
  assert.deepEqual(records.acknowledgements[0].input, {
    client_ack_id: firstPendingAck.client_ack_id,
    acknowledged_at: firstPendingAck.acknowledged_at
  });
  assert.equal(firstPendingAck.party_id, 'party-e2e-1');

  await page.reload();
  await page.waitForSelector('[data-continue-party]');
  await page.click('[data-continue-party]');
  await page.waitForSelector('[data-retry-opening-ack]');
  assert.equal(await page.locator('[data-turn-form] textarea:disabled').count(), 1);
  assert.deepEqual(records.acknowledgements[1].input,
    records.acknowledgements[0].input,
    'reload retry must preserve the entire acknowledgement');
  await page.click('[data-retry-opening-ack]');
  await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
  assert.deepEqual(records.acknowledgements[2].input,
    records.acknowledgements[0].input);
  assert.equal(await page.evaluate(() => localStorage.getItem(
    'rus.pending_opening_ack'
  )), null);
  assert.equal(await page.locator('script:not([src])').count(), 0);
  assert.match(await page.getAttribute('[data-landscape]', 'class'),
    /landscape--weather-clear/u);
  assert.equal(await page.locator('[data-landscape-canvas]').count(), 1);
  assert.ok(await page.locator('[data-landscape-canvas]').evaluate(
    (canvas) => canvas.toDataURL().length > 1_000
  ));
  await page.click('[data-overlay-open="character"]');
  await page.waitForSelector('[data-overlay-panel]');
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-overlay-panel')), true);
  assert.match(await page.textContent('[data-overlay-panel]'), /Микула|Приказчик/u);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-overlay-panel]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-overlay-open')), 'character');

  await page.fill('[data-turn-form] textarea', 'Осматриваюсь');
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('[data-screen-schema="lower_dvina_trace_turn_screen"]');
  assert.deepEqual(records.turns[0].input, { raw_text: 'Осматриваюсь' });
  assert.equal(await page.locator('[data-action-id]').count(), 0);
  const body = await page.textContent('body');
  assert.match(body, /свежие следы/u);
  assert.doesNotMatch(body, /Скрытый страж|guard-secret/u);
  assert.match(await page.textContent('[data-current-task]'),
    /Осмотреть следы у ворот/u);
  assert.match(await page.textContent('[data-conversation-portrait]'),
    /Страж ворот/u);
  const turnLandscape = await page.locator('[data-landscape]').evaluate(
    (element) => element.outerHTML
  );

  await page.click('[data-return-start]');
  await page.waitForSelector('[data-continue-party]');
  await page.evaluate(() => localStorage.setItem(
    'rus.pending_opening_ack',
    JSON.stringify({
      party_id: 'party-other',
      client_ack_id: 'web:party-other:stale',
      acknowledged_at: '2026-08-14T12:00:00.000Z'
    })
  ));
  const readsBeforeReload = records.screenReads.length;
  const acknowledgementsBeforeReload = records.acknowledgements.length;
  await page.reload();
  await page.waitForSelector('[data-continue-party]');
  assert.equal(records.screenReads.length, readsBeforeReload,
    'reload must remain on landing without loading the remembered party');
  await page.click('[data-continue-party]');
  await page.waitForSelector('[data-screen-schema="lower_dvina_trace_turn_screen"]');
  assert.equal(await page.locator('[data-landscape]').evaluate(
    (element) => element.outerHTML
  ), turnLandscape, 'reload must reproduce the same deterministic landscape');
  assert.match(await page.textContent('[data-conversation-portrait]'),
    /Страж ворот/u);
  assert.equal(records.screenReads.at(-1), 'party-e2e-1');
  assert.equal(records.acknowledgements.length, acknowledgementsBeforeReload,
    'an acknowledged party without matching pending data must not ack again');
  assert.equal(await page.evaluate(() => localStorage.getItem(
    'rus.pending_opening_ack'
  )), null, 'mismatched pending data must be discarded');

  await page.click('[data-return-start]');
  await page.click('[data-start-new-game]');
  await page.click('[data-scenario-id="lower_dvina_trace_v1"]');
  await page.waitForSelector('[data-retry-opening-ack]');
  const responseLossAck = records.acknowledgements.at(-1).input;
  const responseLossPending = await page.evaluate(() => JSON.parse(
    localStorage.getItem('rus.pending_opening_ack') ?? 'null'
  ));
  assert.deepEqual(responseLossAck, {
    client_ack_id: responseLossPending.client_ack_id,
    acknowledged_at: responseLossPending.acknowledged_at
  });
  assert.equal(responseLossPending.party_id, 'party-e2e-2');

  await page.reload();
  await page.waitForSelector('[data-continue-party]');
  await page.click('[data-continue-party]');
  await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
  const secondPartyAcks = records.acknowledgements
    .filter(({ partyId }) => partyId === 'party-e2e-2');
  assert.equal(secondPartyAcks.length, 2);
  assert.deepEqual(secondPartyAcks[1].input, secondPartyAcks[0].input,
    'response-loss retry must replay the exact committed acknowledgement');
  assert.deepEqual(records.newGames.at(-1), { scenario_id: 'lower_dvina_trace_v1' });
  assert.equal(await page.evaluate(() => localStorage.getItem('rus.party_id')), 'party-e2e-2');
  assert.equal(await page.evaluate(() => localStorage.getItem(
    'rus.pending_opening_ack'
  )), null);

  await page.fill('[data-turn-form] textarea', 'Осматриваюсь снова');
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('[data-screen-schema="lower_dvina_trace_turn_screen"]');
  assert.deepEqual(records.turns[1].input, { raw_text: 'Осматриваюсь снова' });

  const themeBefore = await page.getAttribute('html', 'data-theme');
  await page.click('[data-theme-toggle]');
  const themeAfter = themeBefore === 'dark' ? 'light' : 'dark';
  assert.equal(await page.evaluate(() => localStorage.getItem('rus.theme')), themeAfter);
  assert.equal(await page.getAttribute('html', 'data-theme'), themeAfter);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await page.locator('[data-landscape]').isVisible(), true);
  assert.equal(await page.locator('[data-conversation-portrait]').isVisible(), true);

  await page.fill('[data-turn-form] textarea', 'Закончить разговор');
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
  assert.equal(await page.locator('[data-conversation-portrait]').count(), 0);
  assert.equal(await page.locator('[data-landscape-canvas]').isVisible(), true);

  await page.fill('[data-turn-form] textarea', 'Медленный ход');
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('[data-return-start]:disabled', { timeout: 5_000 });
  const slowTurnCount = records.turns.length;
  await page.evaluate(() => document.querySelector('[data-turn-form]')?.requestSubmit());
  assert.equal(records.turns.length, slowTurnCount,
    'a deferred turn must ignore repeated form submission');
  await page.evaluate(() => document.querySelector('[data-return-start]')?.click());
  assert.equal(await page.locator('[data-screen-schema="lower_dvina_trace_turn_screen"]').count(), 1);
  assert.equal(await page.locator('[data-start-new-game]').count(), 0,
    'a deferred turn must not allow switching to another game flow');
  records.slowTurn.resolve();
  await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
  assert.equal(await page.locator('[data-return-start]:not([disabled])').count(), 1);

  await page.fill('[data-turn-form] textarea', 'Проверка утечки');
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('.error-toast');
  const errorBody = await page.textContent('body');
  assert.match(errorBody, /Public payload contains forbidden hidden fields/u);
  assert.doesNotMatch(errorBody, /secret|opaque-trace|binding-42|hidden-route-value|nested-route-value/u);
  assert.equal(await page.inputValue('[data-turn-form] textarea'),
    'Проверка утечки', 'failed turn must keep the player draft');

  await page.evaluate(() => {
    localStorage.setItem('rus.party_id', 'party-missing');
    localStorage.setItem('rus.pending_opening_ack', JSON.stringify({
      party_id: 'party-missing',
      client_ack_id: 'web:party-missing:pending',
      acknowledged_at: '2026-08-14T12:00:00.000Z'
    }));
  });
  await page.reload();
  await page.waitForSelector('[data-continue-party]');
  await page.click('[data-continue-party]');
  await page.waitForSelector('.error-toast');
  assert.equal(await page.evaluate(() => localStorage.getItem('rus.party_id')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem(
    'rus.pending_opening_ack'
  )), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('rus.theme')), themeAfter);
  assert.equal(await page.locator('[data-continue-party]').count(), 0);
});

test('browser renders the PR82 scene-asset matrix and fallbacks', {
  timeout: 120_000
}, async (t) => {
  assert.ok(executablePath, 'Chromium executable is required for browser e2e.');
  const records = {
    newGames: [], acknowledgements: [], turns: [], screenReads: [],
    slowTurn: Promise.withResolvers()
  };
  const here = dirname(fileURLToPath(import.meta.url));
  const server = createGameHttpServer({
    root: createRecordedRoot(records),
    staticAssets: createStaticAssetResolver({
      webRoot: resolve(here, '../../apps/game-web'),
      contractsRoot: resolve(here, '../../packages/contracts/src')
    }),
    developerMode: true
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  t.after(() => records.slowTurn.resolve());
  const browser = await chromium.launch({
    executablePath, headless: true,
    args: ['--no-sandbox', '--no-proxy-server', '--proxy-bypass-list=*']
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    window.__sceneDrawImages = [];
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      window.__sceneDrawImages.push(source?.currentSrc ?? source?.src ?? 'canvas');
      return original.call(this, source, ...args);
    };
  });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page.click('[data-start-new-game]');
  await page.click('[data-scenario-id="lower_dvina_trace_v1"]');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.waitForSelector('[data-retry-opening-ack]');
    await page.click('[data-retry-opening-ack]');
  }
  await page.waitForSelector('[data-turn-form] textarea:not([disabled])');

  for (const [name, visual] of VISUAL_CASES) {
    const emotions = visual.emotions ?? ['neutral'];
    for (const emotion of emotions) {
      const expectedLandscape = landscapeAssetFor(visual);
      const abortPattern = visual.brokenLandscape
        ? /\/assets\/landscape\/lower-dvina\/zhdanko-river-descent\/day-clear\.webp$/
        : visual.brokenPortrait
          ? /\/assets\/portrait\/lower-dvina\/onisim\//
          : null;
      const abort = abortPattern ? (route) => route.abort() : null;
      if (abort) await page.route(abortPattern, abort);
      await page.evaluate(() => { window.__sceneDrawImages = []; });
      await page.locator('[data-landscape-canvas]').evaluate((canvas) => {
        canvas.__e2ePreviousScene = true;
      });
      const rawText = `visual:${name}:${emotion}`;
      await page.fill('[data-turn-form] textarea', rawText);
      await Promise.all([
        page.waitForResponse((response) => response.request().method() === 'POST'
          && /\/api\/v1\/parties\/[^/]+\/turns$/u.test(
            new URL(response.url()).pathname)
          && response.request().postData() === JSON.stringify({ raw_text: rawText })),
        page.click('[data-turn-form] button[type="submit"]')
      ]);
      await page.waitForFunction(({ weather, dayPart }) => {
        const screen = document.querySelector(
          '[data-screen-schema="lower_dvina_trace_turn_screen"]');
        const landscape = document.querySelector('[data-landscape]');
        const canvas = document.querySelector('[data-landscape-canvas]');
        if (!screen || !landscape?.classList.contains(`landscape--weather-${weather}`)
          || !landscape.classList.contains(`landscape--day-${dayPart}`)
          || !canvas || canvas.__e2ePreviousScene) return false;
        const pixels = canvas.getContext('2d').getImageData(0, 0, 32, 32).data;
        return [...pixels].some((value, index) => index % 4 === 3 && value > 0);
      }, {
        weather: visual.weather ?? 'clear', dayPart: visual.day_part ?? 'day'
      });
      if (abort) await page.unroute(abortPattern, abort);

      const landscape = page.locator('[data-landscape]');
      const classes = await landscape.getAttribute('class');
      assert.match(classes, new RegExp(`landscape--weather-${visual.weather ?? 'clear'}`));
      assert.match(classes, new RegExp(`landscape--day-${visual.day_part ?? 'day'}`));
      if (expectedLandscape) assert.ok(requests
        .some((url) => url.endsWith(expectedLandscape)), `${name} requests ${expectedLandscape}`);
      const landscapeSignature = await canvasSignature(page, '[data-landscape-canvas]');
      assert.ok(landscapeSignature.alpha > 0, `${name} landscape is non-empty`);
      if (['rain', 'snow', 'fog'].includes(visual.weather)) {
        await page.waitForFunction(() => {
          const canvas = document.querySelector('[data-scene-weather-canvas]');
          return canvas && [...canvas.getContext('2d').getImageData(0, 200, 1280, 320).data]
            .some((value, index) => index % 4 === 3 && value > 0);
        });
      }
      const weatherAlpha = await weatherSignature(page);
      assert.equal(weatherAlpha.alpha > 0, ['rain', 'snow', 'fog'].includes(visual.weather),
        `${name} foreground weather alpha`);
      assert.deepEqual(await page.locator('.scene-viewport-shell').evaluate((root) =>
        [...root.children].map((child) => child.tagName)),
      ['SECTION', 'ASIDE', 'CANVAS'], `${name} keeps weather above the scene layers`);

      if (visual.brokenLandscape) assert.equal(await page.evaluate(() =>
        window.__sceneDrawImages.some((url) => url.includes(
          '/assets/landscape/lower-dvina/zhdanko-river-descent/day-clear.webp'
        ))), false, 'aborted authored landscape must not leave a stale draw');
      await assertPortraitCase(page, name, visual, emotion);
    }
  }
});

function landscapeAssetFor(visual) {
  const day = visual.day_part ?? 'day';
  const weather = visual.weather ?? 'clear';
  if (visual.scene_asset_id === 'lower-dvina-old-drying-shed-interior') {
    return `/assets/landscape/lower-dvina/old-drying-shed-interior/${
      ['dusk', 'night'].includes(day) ? 'dark' : 'natural'}.webp`;
  }
  if (visual.scene_asset_id?.startsWith('lower-dvina-')) {
    return `/assets/landscape/lower-dvina/${visual.scene_asset_id
      .replace('lower-dvina-', '')}/${day}-${weather}.webp`;
  }
  return `/assets/landscape/field_road/${day}-${weather}.webp`;
}

async function canvasSignature(page, selector) {
  return page.locator(selector).evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, 64, 64).data;
    let alpha = 0;
    let signature = 0;
    for (let index = 0; index < data.length; index += 4) {
      alpha += data[index + 3];
      signature = (signature * 31 + data[index] + data[index + 1]
        + data[index + 2] + data[index + 3]) >>> 0;
    }
    return { alpha, signature };
  });
}

async function assertPortraitCase(page, name, visual, emotion) {
  const canvas = page.locator('[data-conversation-portrait-canvas]');
  if (name === 'svg-fallback') {
    assert.equal(await canvas.count(), 0);
    assert.equal(await page.locator('[data-conversation-portrait] svg').isVisible(), true);
    return;
  }
  if (name === 'broken-authored-without-spec') {
    await page.waitForFunction(() => document.querySelector(
      '[data-conversation-portrait-fallback]')?.hidden === false);
    assert.equal(await canvas.isHidden(), true);
    return;
  }
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-conversation-portrait-canvas]');
    return canvas && [...canvas.getContext('2d').getImageData(200, 100, 368, 600).data]
      .some((value, index) => index % 4 === 3 && value > 0);
  });
  assert.ok((await portraitSignature(page)).alpha > 0,
    `${name} portrait is non-empty`);
  if (visual.portrait !== 'authored') {
    assert.equal(await canvas.evaluate((element) => element.getContext('2d')
      .getImageData(0, 0, 1, 1).data[3]), 0, `${name} keeps portrait transparent`);
    return;
  }
  if (visual.brokenPortrait) {
    assert.equal(await page.locator('[data-conversation-portrait-fallback]').count(), 0);
    return;
  }
  const sources = await page.evaluate(() => window.__sceneDrawImages.filter((url) =>
    url.includes('/assets/portrait/lower-dvina/mikula/')));
  assert.deepEqual(sources.slice(-3).map((url) => url.replace(/^.*\/mikula/, '')), [
    '/outfit.png', '/outfit.png', `/heads/${emotion}.png`
  ], `${name} composes outfit before head`);
}

async function portraitSignature(page) {
  return page.locator('[data-conversation-portrait-canvas]').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(200, 100, 368, 600).data;
    return { alpha: data.filter((_, index) => index % 4 === 3)
      .reduce((sum, value) => sum + value, 0) };
  });
}

async function weatherSignature(page) {
  return page.locator('[data-scene-weather-canvas]').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 200, 1280, 320).data;
    return { alpha: data.filter((_, index) => index % 4 === 3)
      .reduce((sum, value) => sum + value, 0) };
  });
}
