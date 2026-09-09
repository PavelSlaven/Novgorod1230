import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, createUiStore, renderAppState } from '../src/index.js';
import { rememberLlmSettings, storedLlmSettings } from '../src/app/llm-settings-preferences.js';
import { assertLlmProbeSuccess, createLlmSettingsController, llmSettingsCandidate } from '../src/app/llm-settings.js';

test('LLM API client uses game-server routes and preserves error envelopes', async () => {
  const calls = [];
  const client = createApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ version: 1, schema: 'rus_api_success', ok: true, data: { mode: 'custom' } }) };
    }
  });
  await client.getLlmSettings();
  await client.testLlmSettings({ mode: 'custom', base_url: 'http://localhost:8000/v1', model: 'local' });
  await client.applyLlmSettings({ mode: 'custom', base_url: 'http://localhost:8000/v1', model: 'local', api_key: 'secret' });
  await client.resetLlmSettings();
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method ?? 'GET']), [
    ['/api/v1/llm-settings', 'GET'], ['/api/v1/llm-settings/test', 'POST'],
    ['/api/v1/llm-settings', 'PUT'], ['/api/v1/llm-settings', 'PUT']
  ]);
  assert.deepEqual(JSON.parse(calls[3].options.body), { mode: 'default' });
});

test('LLM settings candidate and failed probes stay strict', () => {
  assert.deepEqual(llmSettingsCandidate(new Map([
    ['mode', 'local'], ['base_url', 'http://127.0.0.1:8000/v1'],
    ['model', 'gemma'], ['api_key', '']
  ])), { mode: 'local', base_url: 'http://127.0.0.1:8000/v1',
    model: 'gemma', api_key: '' });
  assert.throws(() => assertLlmProbeSuccess({ ok: false, category: 'timeout' }), {
    code: 'LLM_PROBE_FAILED', message: 'Проверка не пройдена: timeout.'
  });
  assert.throws(() => assertLlmProbeSuccess({ ok: false, category: 'secret key' }),
    /Проверка не пройдена: unknown\./u);
});

test('LLM preferences restore non-secret fields without persisting API key', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  rememberLlmSettings(storage, {
    mode: 'custom', base_url: 'http://127.0.0.1:8000/v1', model: 'local', api_key: 'secret'
  });
  assert.deepEqual(storedLlmSettings(storage), {
    mode: 'custom', base_url: 'http://127.0.0.1:8000/v1', model: 'local', api_key_present: false
  });
  assert.doesNotMatch(values.get('rus.llm_settings'), /secret/u);
});

test('LLM settings reload replaces stale browser draft with server config', async () => {
  const store = createUiStore();
  store.setLlmSettingsDraft({
    mode: 'custom', base_url: 'http://127.0.0.1:8000/v1', model: 'local', api_key_present: false
  });
  await createLlmSettingsController({
    root: { querySelector: () => ({ focus() {} }) },
    api: { getLlmSettings: async () => ({ mode: 'local',
      base_url: 'http://127.0.0.1:8000/v1', model: 'managed-gemma',
      api_key_present: false }) },
    store, storage: null
  }).open();
  const state = store.getState();
  assert.equal(state.llmSettings.mode, 'local');
  assert.equal(state.llmSettingsDraft.model, 'managed-gemma');
  assert.match(renderAppState(state), /name="model" value="managed-gemma"/u);
});

test('LLM settings overlay has required controls and never renders key', () => {
  const store = createUiStore();
  store.setLlmSettings({ mode: 'custom', base_url: 'http://localhost/v1', model: 'local', api_key_present: true });
  store.openOverlay('llm_settings');
  let html = renderAppState(store.getState());
  for (const label of ['Локальная Gemma 4 (по умолчанию)',
    'Свой OpenAI-compatible endpoint', 'API base URL', 'Model', 'Проверить',
    'Применить', 'Вернуть локальную Gemma']) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /Локальная Gemma 4/u);
  assert.match(html, /type="password"/u);
  assert.doesNotMatch(html, /secret|value="[^"]+"[^>]*type="password"/u);
  assert.doesNotMatch(html, /name="llm_action" value="test" disabled/u);
  store.setLlmSettings({ mode: 'local', base_url: 'http://localhost/v1',
    model: 'managed-gemma' });
  html = renderAppState(store.getState());
  assert.doesNotMatch(html, /name="llm_action" value="test" disabled/u);
});

test('local mode fills supported preset', () => {
  const fields = {
    base_url: { value: '' }, model: { value: '' }
  };
  const root = {
    querySelectorAll: () => Object.values(fields),
    querySelector: (selector) => selector.includes('base_url')
      ? fields.base_url : selector.includes('model') ? fields.model : null
  };
  const store = createUiStore();
  store.setLlmSettings({ mode: 'local', local_preset: {
    base_url: 'http://127.0.0.1:8000/v1', model: 'supported-gemma'
  } });
  createLlmSettingsController({ root, api: {}, store, storage: null })
    .selectMode('local');
  assert.equal(fields.base_url.value, 'http://127.0.0.1:8000/v1');
  assert.equal(fields.model.value, 'supported-gemma');
});

test('landing blocks local play with hardware diagnostics until custom provider is selected', () => {
  const store = createUiStore();
  store.setLlmSettings({ mode: 'local', local_runtime: { ready: false,
    reasons: ['Недостаточно VRAM.'] } });
  let html = renderAppState(store.getState());
  assert.match(html, /Недостаточно VRAM/u);
  assert.match(html, /data-start-new-game disabled/u);
  store.setLlmSettings({ mode: 'custom', base_url: 'https://example.test/v1',
    model: 'custom' });
  html = renderAppState(store.getState());
  assert.doesNotMatch(html, /data-start-new-game disabled/u);
});
