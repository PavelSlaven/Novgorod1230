import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';

import { chromium } from 'playwright-core';

import { createLowerDvinaTraceTurnStepTestModel } from
  '../../apps/game-server/test/lower-dvina-trace-turn-step-model-fixture.js';
import { createCanonicalPhase11LlmResponder } from
  '../helpers/lower-dvina-phase-11-llm.js';
import { startLocalLlmProviderFixture } from
  '../helpers/local-llm-provider-fixture.js';
import { LOCAL_PLAY_RESOURCES } from
  '../../tools/local-play/local-play-contracts.js';

const CHROME_PATH = [
  process.env.RUS_CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome'
].find((candidate) => candidate && existsSync(candidate));

test('npm run play:local preserves production state across restart', {
  timeout: 600_000
}, async (context) => {
  assert.equal(docker(['version']).status, 0, 'Docker is required.');
  if (resourceExists('container') || resourceExists('volume')) {
    context.skip('Local-play Docker resources already exist and are preserved.');
    return;
  }
  context.after(cleanOwnedTestResources);
  const llm = await startLocalLlmProviderFixture({
    respond: localPlayResponder()
  });
  context.after(() => llm.close());
  const port = await availablePort();
  const env = {
    ...process.env,
    ...llm.env,
    RUS_SERVER_PORT: String(port)
  };

  let launcher = launchLocalPlay(env);
  context.after(() => stopLauncher(launcher));
  await launcher.ready;
  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await get(baseUrl, '/api/v1/health');
  assert.equal(health.release_id, 'spatial-v3-production-v8');
  const scenarios = await get(baseUrl, '/api/v1/scenarios');
  assert.ok(scenarios.scenarios.some(({ scenario_id: id }) =>
    id === 'lower_dvina_trace_v1'));
  assert.ok(scenarios.scenarios.some(({ scenario_id: id }) =>
    id === 'lower_dvina_late_summer_open_water_v1'));

  const started = await post(baseUrl, '/api/v1/new-games', {
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'local-play-new-game'
  });
  const partyId = started.party_id;
  await post(baseUrl,
    `/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`, {
      client_ack_id: 'local-play-opening-ack'
    });
  await post(baseUrl,
    `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, {
      request_id: 'local-play-inspect',
      idempotency_key: 'local-play-inspect',
      raw_text: 'Хочу внимательно осмотреть обломки и берег вокруг.'
    });
  assert.ok(llm.requests.length > 0,
    'the production DeepSeek adapter must call the fixture provider');
  const beforeRestart = await get(baseUrl,
    `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);

  if (CHROME_PATH) {
    await chromiumSmoke({ baseUrl, partyId });
  }
  await stopLauncher(launcher);
  assertOwnedResourcesRemain();

  launcher = launchLocalPlay(env);
  await launcher.ready;
  const afterRestart = await get(baseUrl,
    `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
  assert.deepEqual(afterRestart, beforeRestart);
  await post(baseUrl,
    `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, {
      request_id: 'local-play-camp',
      idempotency_key: 'local-play-camp',
      raw_text: 'Дойти до рыбацкого стана.'
    });

  const boatman = await post(baseUrl, '/api/v1/new-games', {
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    request_id: 'local-play-boatman-new-game'
  });
  await post(baseUrl,
    `/api/v1/parties/${encodeURIComponent(boatman.party_id)}/opening-ack`, {
      client_ack_id: 'local-play-boatman-opening-ack'
    });
  const optionId = boatman.screen.action_panel.suggested_actions[0].option_id;
  const boatmanTurn = await post(baseUrl,
    `/api/v1/parties/${encodeURIComponent(boatman.party_id)}/turns`, {
      request_id: 'local-play-boatman-turn',
      idempotency_key: 'local-play-boatman-turn',
      selected_action_option_id: optionId
    });
  assert.equal(boatmanTurn.screen.schema, 'turn_screen');
  await stopLauncher(launcher);
  assertOwnedResourcesRemain();
});

function localPlayResponder() {
  const canonical = createCanonicalPhase11LlmResponder();
  const turnStep = createLowerDvinaTraceTurnStepTestModel();
  return (request) => [
    'fixture-turn-step-planner',
    'fixture-turn-step-planner-repair'
  ].includes(request.model)
    ? turnStep(request.input.request ?? request.input)
    : canonical(request);
}

function launchLocalPlay(env) {
  const windows = process.platform === 'win32';
  const executable = windows ? process.env.ComSpec : 'npm';
  const args = windows
    ? ['/d', '/s', '/c', 'npm run play:local']
    : ['run', 'play:local'];
  const child = spawn(executable, args, {
    cwd: process.cwd(),
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  return {
    child,
    get output() { return output; },
    ready: waitForOutput(child, () => output, 'Game is ready:', 360_000)
  };
}

async function stopLauncher(launcher) {
  const child = launcher?.child;
  if (!child || child.exitCode != null || child.signalCode != null) return;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', [
      '/PID', String(child.pid), '/T', '/F'
    ], { encoding: 'utf8', windowsHide: true });
    assert.ok([0, 128].includes(result.status), result.stderr);
  } else {
    process.kill(-child.pid, 'SIGTERM');
  }
  await Promise.race([
    once(child, 'exit'),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`local launcher did not stop:\n${launcher.output}`)),
      20_000))
  ]);
}

async function chromiumSmoke({ baseUrl, partyId }) {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--no-proxy-server']
  });
  try {
    const page = await browser.newPage();
    await page.goto(baseUrl);
    await page.evaluate((value) => localStorage.setItem('rus.party_id', value),
      partyId);
    await page.reload();
    await page.waitForSelector('[data-turn-form]');
    assert.equal(await page.locator('.error').count(), 0);
  } finally {
    await browser.close();
  }
}

function waitForOutput(child, readOutput, expected, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(
      `Timed out waiting for ${expected}:\n${readOutput()}`)), timeout);
    const interval = setInterval(() => {
      if (readOutput().includes(expected)) finish();
    }, 100);
    child.once('exit', (code, signal) => finish(new Error(
      `Local play exited before ready (${code ?? signal}):\n${readOutput()}`)));
    child.once('error', finish);
    function finish(error) {
      clearTimeout(timer);
      clearInterval(interval);
      if (error) reject(error); else resolve();
    }
  });
}

async function get(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return responseData(response);
}

async function post(baseUrl, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return responseData(response);
}

async function responseData(response) {
  const envelope = await response.json();
  assert.equal(response.ok, true,
    `${response.status}: ${JSON.stringify(envelope)}`);
  return envelope.data;
}

function resourceExists(kind) {
  const name = kind === 'container'
    ? LOCAL_PLAY_RESOURCES.containerName
    : LOCAL_PLAY_RESOURCES.volumeName;
  return docker(kind === 'container'
    ? ['container', 'inspect', name]
    : ['volume', 'inspect', name]).status === 0;
}

function assertOwnedResourcesRemain() {
  assert.equal(resourceLabel('container'), 'true');
  assert.equal(resourceLabel('volume'), 'true');
}

function cleanOwnedTestResources() {
  if (resourceLabel('container') === 'true') {
    docker(['rm', '-f', LOCAL_PLAY_RESOURCES.containerName]);
  }
  if (resourceLabel('volume') === 'true') {
    docker(['volume', 'rm', LOCAL_PLAY_RESOURCES.volumeName]);
  }
}

function resourceLabel(kind) {
  if (!resourceExists(kind)) return null;
  const name = kind === 'container'
    ? LOCAL_PLAY_RESOURCES.containerName
    : LOCAL_PLAY_RESOURCES.volumeName;
  const format = kind === 'container'
    ? `{{ index .Config.Labels "${LOCAL_PLAY_RESOURCES.resourceLabel}" }}`
    : `{{ index .Labels "${LOCAL_PLAY_RESOURCES.resourceLabel}" }}`;
  return docker([kind, 'inspect', '--format', format, name])
    .stdout.trim();
}

function docker(args) {
  return spawnSync('docker', args, {
    encoding: 'utf8', windowsHide: true, timeout: 120_000
  });
}

function availablePort() {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}
