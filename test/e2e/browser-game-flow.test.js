import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { computeStage26ScreenDigest } from '@rus/contracts';
import {
  createGameCompositionRoot,
  createGameHttpServer,
  createInMemorySessionStore,
  createStaticAssetResolver,
  listen
} from '@rus/game-server';
import {
  createSpatialV3PlayerProjection,
  createSpatialV3ProjectionPanels
} from '@rus/presentation/spatial-v3-projection';

const executablePath = [
  process.env.RUS_CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome'
].find((item) => item && existsSync(item));

function createRecordedRoot(records) {
  let partyNumber = 0;
  let nowTick = 0;
  const acknowledgementAttempts = new Map();
  const root = createGameCompositionRoot({
    newGameWorkflow: {
      run: async (input) => {
        if (input.start_text === 'Сломать создание') {
          return { status: 'rejected' };
        }
        partyNumber += 1;
        return {
          status: 'approved',
          artifact: stage26Fixture(`party-e2e-${partyNumber}`)
        };
      }
    },
    turnWorkflow: { run: async (input) => turnFixture(input) },
    sessionStore: createInMemorySessionStore(),
    scenarioRegistry: {
      listPublic: async () => [{
        scenario_id: 'lower_dvina_trace_v1',
        title: 'След на Нижней Двине',
        description: 'Позднее лето, разбитая лодья и пропавший груз.',
        available: true
      }],
      resolveForNewGame: async (scenarioId) => scenarioId === 'lower_dvina_trace_v1'
        ? {
            start_text: 'Начать опубликованный сценарий Нижней Двины.',
            player_name: 'Микула',
            scenario_context: { scenario_id: 'lower_dvina_trace_v1' }
          }
        : null
    },
    now: () => new Date(
      Date.parse('2026-07-12T12:30:00.000Z') + nowTick++ * 1_000
    ).toISOString()
  });
  return Object.freeze({
    health: () => root.health(),
    listScenarios: () => root.listScenarios(),
    async startNewGame(input) {
      records.newGames.push(structuredClone(input));
      return root.startNewGame(input);
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
        await root.acknowledgeOpening(partyId, input);
        throw Object.assign(new Error('Acknowledgement response was lost.'), {
          code: 'ACK_RESPONSE_LOST', status: 503
        });
      }
      return root.acknowledgeOpening(partyId, input);
    },
    async submitTurn(partyId, input) {
      records.turns.push({ partyId, input: structuredClone(input) });
      return root.submitTurn(partyId, input);
    },
    async getPartyScreen(partyId) {
      records.screenReads.push(partyId);
      return root.getPartyScreen(partyId);
    }
  });
}

function stage26Fixture(partyId) {
  const screen = {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: partyId,
    main_prose: 'Перед тобой открывается дорога к Новгороду.',
    visible_context: {
      location_label: 'Дорога у Новгорода',
      calendar: 'Лето 6738'
    },
    action_panel: {
      suggested_actions: [{ option_id: 'look', label: 'Осмотреться' }]
    },
    position_panel: { position_ref: { g1_id: 'g1-1', g2_id: 'g2-1' } },
    panels: {
      character: {
        visible: true,
        data: { name: '<script>bad()</script>Иван', role: 'Лодочник', health: 9 }
      },
      map: {
        visible: true,
        data: {
          scene_map: {
            nodes: [{ token: 'gate', label: 'Городские ворота', certainty: 'known' }],
            links: []
          },
          world_signals: [{ approximate_area: 'у ворот', approximate_direction: 'впереди' }]
        }
      }
    },
    delivery_state: { message_id: `message-${partyId}` }
  };
  return {
    version: 1,
    schema: 'stage26_first_game_screen_result',
    pass: true,
    request_id: `request-${partyId}`,
    party_id: partyId,
    transaction_id: `tx-${partyId}`,
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

function turnFixture(input) {
  const leaking = input.raw_text === 'Проверка утечки';
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
      schema: 'turn_screen',
      screen_status: 'ready',
      party_id: input.party_id,
      turn_id: `turn-${input.turn_number}`,
      turn_number: input.turn_number,
      main_prose: 'Ты замечаешь свежие следы на дороге.',
      visible_context: { location_label: 'У городских ворот' },
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
        : panels
    }
  };
}

test('browser preserves production API semantics through the Lovable UI', {
  skip: !executablePath && 'Chromium executable not found.', timeout: 120_000
}, async (t) => {
  const records = {
    newGames: [], acknowledgements: [], turns: [], screenReads: []
  };
  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = resolve(here, '../../apps/game-web');
  const server = createGameHttpServer({
    root: createRecordedRoot(records),
    staticAssets: createStaticAssetResolver({ webRoot }),
    developerMode: true
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
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
  await page.fill('[data-new-game-form] textarea', '   ');
  await page.click('[data-new-game-form] button[type="submit"]');
  await page.waitForSelector('.error-toast');
  assert.equal(records.newGames.length, 0, 'blank start_text must not be sent');
  await page.click('[data-dismiss-error]');

  await page.fill('[data-new-game-form] textarea', 'Начать в Новгороде');
  await page.click('[data-new-game-form] button[type="submit"]');
  await page.waitForSelector('[data-screen-schema="first_game_screen"]');
  await page.waitForSelector('[data-retry-opening-ack]');
  assert.equal(await page.locator('[data-turn-form] textarea:disabled').count(), 1);
  assert.deepEqual(records.newGames[0], { start_text: 'Начать в Новгороде' });
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

  await page.click('[data-overlay-open="character"]');
  await page.waitForSelector('[data-overlay-panel]');
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-overlay-panel')), true);
  assert.match(await page.textContent('[data-overlay-panel]'), /Иван|Лодочник/u);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-overlay-panel]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-overlay-open')), 'character');

  await page.fill('[data-turn-form] textarea', 'Осматриваюсь');
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('[data-screen-schema="turn_screen"]');
  assert.deepEqual(records.turns[0].input, { raw_text: 'Осматриваюсь' });
  assert.equal(await page.locator('[data-action-id]').count(), 0);
  const body = await page.textContent('body');
  assert.match(body, /свежие следы/u);
  assert.doesNotMatch(body, /Скрытый страж|guard-secret/u);

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
  await page.waitForSelector('[data-screen-schema="turn_screen"]');
  assert.equal(records.screenReads.at(-1), 'party-e2e-1');
  assert.equal(records.acknowledgements.length, acknowledgementsBeforeReload,
    'an acknowledged party without matching pending data must not ack again');
  assert.equal(await page.evaluate(() => localStorage.getItem(
    'rus.pending_opening_ack'
  )), null, 'mismatched pending data must be discarded');

  await page.click('[data-return-start]');
  await page.click('[data-start-new-game]');
  await page.fill('[data-new-game-form] textarea', 'Сломать создание');
  await page.click('[data-new-game-form] button[type="submit"]');
  await page.waitForSelector('.error-toast');
  assert.equal(await page.evaluate(() => localStorage.getItem('rus.party_id')), 'party-e2e-1');
  await page.click('[data-dismiss-error]');
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

  await page.click('[data-action-id="look"]');
  await page.waitForSelector('[data-screen-schema="turn_screen"]');
  assert.deepEqual(records.turns[1].input, { selected_action_option_id: 'look' });

  const themeBefore = await page.getAttribute('html', 'data-theme');
  await page.click('[data-theme-toggle]');
  const themeAfter = themeBefore === 'dark' ? 'light' : 'dark';
  assert.equal(await page.evaluate(() => localStorage.getItem('rus.theme')), themeAfter);
  assert.equal(await page.getAttribute('html', 'data-theme'), themeAfter);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

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
