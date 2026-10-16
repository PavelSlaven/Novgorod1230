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
    ['mode', 'custom'], ['base_url', 'http://127.0.0.1:8000/v1'],
    ['model', 'qwen3.8-27b-uncensored-w4a16-tp2'], ['api_key', '']
  ])), { mode: 'custom', base_url: 'http://127.0.0.1:8000/v1',
    model: 'qwen3.8-27b-uncensored-w4a16-tp2', api_key: '' });
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
  values.set('rus.llm_settings', JSON.stringify({ mode: 'local',
    base_url: 'http://127.0.0.1:8000/v1', model: 'retired-model' }));
  assert.equal(storedLlmSettings(storage).mode, 'unconfigured');
});

test('LLM settings reload replaces stale browser draft with server config', async () => {
  const store = createUiStore();
  store.setLlmSettingsDraft({
    mode: 'custom', base_url: 'http://127.0.0.1:8000/v1', model: 'local', api_key_present: false
  });
  await createLlmSettingsController({
    root: { querySelector: () => ({ focus() {} }) },
    api: { getLlmSettings: async () => ({ mode: 'custom',
      base_url: 'http://127.0.0.1:8000/v1', model: 'qwen3.8-27b-uncensored-w4a16-tp2',
      api_key_present: false }) },
    store, storage: null
  }).open();
  const state = store.getState();
  assert.equal(state.llmSettings.mode, 'custom');
  assert.equal(state.llmSettingsDraft.model, 'qwen3.8-27b-uncensored-w4a16-tp2');
  assert.match(renderAppState(state), /name="model" value="qwen3.8-27b-uncensored-w4a16-tp2"/u);
});

test('LLM settings overlay has required controls and never renders key', () => {
  const store = createUiStore();
  store.setLlmSettings({ mode: 'custom', base_url: 'http://localhost/v1', model: 'local', api_key_present: true });
  store.openOverlay('llm_settings');
  let html = renderAppState(store.getState());
  for (const label of ['OpenAI-compatible vLLM endpoint',
    'API base URL', 'Model', 'Проверить',
    'Применить', 'Сбросить настройку']) {
    assert.ok(html.includes(label), label);
  }
  assert.doesNotMatch(html, /Gemma/u);
  assert.match(html, /type="password"/u);
  assert.doesNotMatch(html, /secret|value="[^"]+"[^>]*type="password"/u);
  assert.doesNotMatch(html, /name="llm_action" value="test" disabled/u);
  store.setLlmSettings({ mode: 'unconfigured', base_url: null,
    model: 'qwen3.8-27b-uncensored-w4a16-tp2' });
  html = renderAppState(store.getState());
  assert.doesNotMatch(html, /name="llm_action" value="test" disabled/u);
});

test('landing blocks play until exact provider settings are configured', () => {
  const store = createUiStore();
  store.setLlmSettings({ mode: 'unconfigured',
    model: 'qwen3.8-27b-uncensored-w4a16-tp2' });
  let html = renderAppState(store.getState());
  assert.match(html, /Настрой OpenAI-compatible vLLM endpoint/u);
  assert.match(html, /data-start-new-game disabled/u);
  store.setLlmSettings({ mode: 'custom', base_url: 'https://example.test/v1',
    model: 'custom' });
  html = renderAppState(store.getState());
  assert.doesNotMatch(html, /data-start-new-game disabled/u);
});
