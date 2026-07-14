import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { computeStage26ScreenDigest } from '@rus/contracts';
import { createGameCompositionRoot, createGameHttpServer, createInMemorySessionStore, createStaticAssetResolver, listen } from '@rus/game-server';

const executablePath = [process.env.RUS_CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find((item) => item && existsSync(item));

function createRoot() {
  return createGameCompositionRoot({
    newGameWorkflow: { run: async () => ({ status: 'approved', artifact: stage26Fixture() }) },
    turnWorkflow: { run: async (input) => turnFixture(input) },
    sessionStore: createInMemorySessionStore(),
    now: () => '2026-07-12T12:30:00.000Z'
  });
}

function stage26Fixture() {
  const screen = {
    version: 1, schema: 'first_game_screen', screen_status: 'ready', party_id: 'party-e2e-1',
    main_prose: 'Перед тобой открывается дорога к Новгороду.',
    action_panel: { suggested_actions: [{ option_id: 'look', label: 'Осмотреться' }] },
    position_panel: { position_ref: { g1_id: 'g1-1', g2_id: 'g2-1' } }, panels: {},
    delivery_state: { message_id: 'message-e2e-1' }
  };
  return {
    version: 1, schema: 'stage26_first_game_screen_result', pass: true, request_id: 'request-e2e-1',
    party_id: screen.party_id, transaction_id: 'tx-e2e-1', first_game_screen: screen,
    screen_digest: computeStage26ScreenDigest(screen), visible_context_package_digest: 'sha256:visible',
    narrator_output_digest: 'sha256:narrator',
    delivery_permission: { can_create_delivery_attempt: true, can_show_screen: true, can_accept_first_turn_intent: true }
  };
}

function turnFixture(input) {
  return {
    version: 1, schema: 'turn_result', party_id: input.party_id, turn_id: 'turn-e2e-1', turn_number: input.turn_number,
    status: 'resolved', mode: 'attention', summary: { outcome: 'observed' }, commit: { status: 'committed' },
    screen: {
      version: 1, schema: 'turn_screen', screen_status: 'ready', party_id: input.party_id,
      turn_id: 'turn-e2e-1', turn_number: input.turn_number,
      main_prose: 'Ты замечаешь свежие следы на дороге.',
      visible_context: { current_position: { g1_id: 'g1-1' } },
      input_panel: { input_contract: 'intent_not_fact' }, action_panel: { suggested_actions: [] }, panels: {}
    }
  };
}

test('real browser completes new game, opening acknowledgement, and first turn', { skip: !executablePath && 'Chromium executable not found.' }, async (t) => {
  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = resolve(here, '../../apps/game-web');
  const server = createGameHttpServer({ root: createRoot(), staticAssets: createStaticAssetResolver({ webRoot }) });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--no-proxy-server', '--proxy-bypass-list=*', '--disable-features=HttpsUpgrades,BlockInsecurePrivateNetworkRequests'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.exposeFunction('__rusHttp', async ({ path, method, headers, body }) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers,
      ...(body ? { body } : {})
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text()
    };
  });
  await page.setContent('<!doctype html><html><body><div data-game-root></div></body></html>');
  await page.evaluate(() => {
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(String(input), 'https://rus.test');
      const result = await globalThis.__rusHttp({
        path: `${url.pathname}${url.search}`,
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
        body: options.body ?? null
      });
      return new Response(result.body, { status: result.status, headers: result.headers });
    };
  });
  const bundle = await build({
    entryPoints: [resolve(webRoot, 'src/main.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    target: ['es2022']
  });
  await page.addScriptTag({ type: 'module', content: bundle.outputFiles[0].text });
  await page.waitForSelector('[data-new-game-form]');
  await page.fill('[data-new-game-form] textarea[name="start_text"]', 'Начать в Новгороде');
  await page.click('[data-new-game-form] button[type="submit"]');
  await page.waitForSelector('[data-screen-schema="first_game_screen"]');
  assert.match(await page.textContent('body'), /дорога к Новгороду/u);
  await page.fill('[data-turn-form] textarea[name="raw_text"]', 'Осматриваюсь');
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('[data-screen-schema="turn_screen"]');
  const body = await page.textContent('body');
  assert.match(body, /свежие следы/u);
  const contract = await page.getAttribute('[data-screen-schema="turn_screen"]', 'data-screen-schema');
  assert.equal(contract, 'turn_screen');
  const hiddenLeak = await page.locator('body').evaluate((node) => /hidden_state|private_motives|write_plan/u.test(node.textContent ?? ''));
  assert.equal(hiddenLeak, false);
});
