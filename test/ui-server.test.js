import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../src/ui-server.js', import.meta.url));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApiState(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        return response;
      }
      lastError = new Error(`Unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }

  throw lastError ?? new Error('Server did not become ready in time.');
}

function startUiServer(port, extraEnv = {}) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(port),
      DEBUG_UI: '',
      NEW_GAME_ARTIFACT_RAW: '',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  return { child, stderrRef: () => stderr };
}

async function stopUiServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(5000)
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}

test('ui server production payload omits debug internals by default', async () => {
  const port = 32123;
  const { child, stderrRef } = startUiServer(port);

  try {
    const response = await waitForApiState(`http://127.0.0.1:${port}/api/state`);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.meta.debugVisible, false);
    assert.equal('debug' in payload.state, false);
    assert.equal('technicalJournal' in payload.state, false);
    assert.equal('relationships' in payload.state, false);
    assert.equal('propertyLedger' in payload.state, false);
    assert.equal('social' in payload.state, false);
    assert.ok(payload.state.player.observedActorProfile);
    assert.equal('trueStatus' in payload.state.player.observedActorProfile.identity, false);
    assert.equal('hidden' in payload.state.player.observedActorProfile.mind, false);
    assert.equal('knowledge_map' in payload.state.player, false);
    assert.equal('actorProfile' in payload.state.player, false);
    assert.ok(payload.state.orientation);
    assert.equal('currentPosition' in payload.state, false);
  } finally {
    await stopUiServer(child);
    const stderr = stderrRef();
    if (child.exitCode !== 0 && child.exitCode !== null && stderr.trim()) {
      assert.fail(`ui server exited unexpectedly:\n${stderr}`);
    }
  }
});

test('ui server process payload is sanitized outside debug mode', async () => {
  const port = 32125;
  const { child, stderrRef } = startUiServer(port);

  try {
    const response = await waitForApiState(`http://127.0.0.1:${port}/api/process`);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.process.diagnosticsVisible, false);
    assert.ok(Array.isArray(payload.process.journal));
    assert.equal(payload.process.journal.some((entry) => 'requestRaw' in entry), false);
    assert.equal(payload.process.journal.some((entry) => 'responseRaw' in entry), false);
    assert.equal(payload.process.journal.some((entry) => 'requestPreview' in entry), false);
    assert.equal(payload.process.journal.some((entry) => 'responsePreview' in entry), false);
    assert.equal(payload.process.journal.some((entry) => 'provider' in entry), false);
    assert.equal(payload.process.journal.some((entry) => 'model' in entry), false);
  } finally {
    await stopUiServer(child);
    const stderr = stderrRef();
    if (child.exitCode !== 0 && child.exitCode !== null && stderr.trim()) {
      assert.fail(`ui server exited unexpectedly:\n${stderr}`);
    }
  }
});

test('ui server main screen serves the expected browser shell', async () => {
  const port = 32124;
  const { child, stderrRef } = startUiServer(port);

  try {
    const response = await waitForApiState(`http://127.0.0.1:${port}/`);
    const html = await response.text();

    assert.match(html, /<title>Русь XIII век<\/title>/);
    assert.match(html, /id="commandInput"/);
    assert.match(html, /id="journalButton"/);
    assert.match(html, /id="inventoryButton"/);
    assert.match(html, /id="peopleButton"/);
    assert.match(html, /id="propertyButton"/);
    assert.match(html, /id="mapButton"/);
    assert.match(html, /id="clockText"/);
    assert.match(html, /id="themeToggle"/);
    assert.match(html, /id="journalTabs"/);
    assert.match(html, /id="newGameOverlay"/);
    assert.match(html, /id="newGameText"/);
    assert.match(html, /id="generationDiagnostics"[^>]*hidden/);
    assert.match(html, /id="startOverlay" class="start-overlay"/);
    assert.doesNotMatch(html, /id="startOverlay"[^>]*hidden/);
    assert.ok((html.match(/data-theme-toggle/g) ?? []).length >= 8);
    assert.ok((html.match(/data-theme-toggle[^>]*>☾<\/button>/g) ?? []).length >= 8);
    assert.doesNotMatch(html, />Ночь</);
    assert.doesNotMatch(html, />День</);
    assert.doesNotMatch(html, /id="startPlayerName"/);
    assert.match(html, /<script>\s*window\.__INITIAL_STATE__\s*=\s*\{/);
    assert.doesNotMatch(html, /__UI_BOOTSTRAP__/);
    assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  } finally {
    await stopUiServer(child);
    const stderr = stderrRef();
    if (child.exitCode !== 0 && child.exitCode !== null && stderr.trim()) {
      assert.fail(`ui server exited unexpectedly:\n${stderr}`);
    }
  }
});

test('ui server serves browser ui modules', async () => {
  const port = 32129;
  const { child, stderrRef } = startUiServer(port);

  const modulePaths = [
    '/app.js',
    '/inventory-view.js',
    '/people-view.js',
    '/property-view.js',
    '/scene-hints.js',
    '/route-view.js',
    '/vitals.js',
    '/map-panel.js',
    '/knowledge-graph.js',
    '/graph-viewport.js',
    '/diagnostics-visibility.js',
    '/world/item-access.js'
  ];

  try {
    await waitForApiState(`http://127.0.0.1:${port}/healthz`);
    for (const path of modulePaths) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') ?? '', /javascript/);
      const text = await response.text();
      assert.doesNotMatch(text, /<html/i, `${path} must not return HTML shell`);
    }
  } finally {
    await stopUiServer(child);
    const stderr = stderrRef();
    if (child.exitCode !== 0 && child.exitCode !== null && stderr.trim()) {
      assert.fail(`ui server exited unexpectedly:\n${stderr}`);
    }
  }
});

test('ui server rejects oversized JSON body with 413', async () => {
  const port = 32126;
  const { child, stderrRef } = startUiServer(port);

  try {
    await waitForApiState(`http://127.0.0.1:${port}/healthz`);
    const oversized = 'x'.repeat(300000);
    const response = await fetch(`http://127.0.0.1:${port}/api/new-game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: oversized })
    });
    const payload = await response.json();

    assert.equal(response.status, 413);
    assert.equal(payload.ok, false);
    assert.match(payload.error, /too large/i);
  } finally {
    await stopUiServer(child);
    const stderr = stderrRef();
    if (child.exitCode !== 0 && child.exitCode !== null && stderr.trim()) {
      assert.fail(`ui server exited unexpectedly:\n${stderr}`);
    }
  }
});

test('ui server rejects state-changing POST without auth token when UI_SERVER_TOKEN is set', async () => {
  const port = 32127;
  const token = 'test-ui-token-12345';
  const { child, stderrRef } = startUiServer(port, { UI_SERVER_TOKEN: token });

  try {
    const stateResponse = await waitForApiState(`http://127.0.0.1:${port}/api/state`);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.meta.authRequired, true);
    assert.ok(statePayload.meta.csrfToken);

    const response = await fetch(`http://127.0.0.1:${port}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.ok, false);
    assert.match(payload.error, /unauthorized/i);
  } finally {
    await stopUiServer(child);
    const stderr = stderrRef();
    if (child.exitCode !== 0 && child.exitCode !== null && stderr.trim()) {
      assert.fail(`ui server exited unexpectedly:\n${stderr}`);
    }
  }
});

test('ui server accepts state-changing POST with token and csrf', async () => {
  const port = 32128;
  const token = 'test-ui-token-67890';
  const { child, stderrRef } = startUiServer(port, { UI_SERVER_TOKEN: token });

  try {
    const stateResponse = await waitForApiState(`http://127.0.0.1:${port}/api/state`);
    const statePayload = await stateResponse.json();

    const response = await fetch(`http://127.0.0.1:${port}/api/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-UI-Token': token,
        'X-CSRF-Token': statePayload.meta.csrfToken
      },
      body: '{}'
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
  } finally {
    await stopUiServer(child);
    const stderr = stderrRef();
    if (child.exitCode !== 0 && child.exitCode !== null && stderr.trim()) {
      assert.fail(`ui server exited unexpectedly:\n${stderr}`);
    }
  }
});
