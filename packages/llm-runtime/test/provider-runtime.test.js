import assert from 'node:assert/strict';
import test from 'node:test';

import { TurnRuntimeRoles, resolveLlmExecutionConfig } from '../src/provider-config.js';
import { describeRoleLlmCall, executeRoleLlmCall } from '../src/runtime.js';

const roleId = TurnRuntimeRoles.WORLD_PROCESS_STEP;
const customProvider = {
  compatibility: 'openai_compatible',
  baseUrl: 'http://127.0.0.1:8000/v1',
  model: 'local-model'
};

test('turn runtime defaults to 10 s, while invalid or explicit environment values keep fallback precedence', () => {
  for (const [value, expected] of [
    [undefined, 10000], ['', 10000], ['invalid', 10000], ['0', 10000], ['-1', 10000], ['1.5', 10000], ['60000', 60000]
  ]) {
    const resolution = resolveLlmExecutionConfig({
      scope: 'turn_runtime',
      roleId,
      env: { DEEPSEEK_API_KEY: 'test-key', ...(value === undefined ? {} : { DEEPSEEK_REQUEST_TIMEOUT_MS: value }) }
    });
    assert.equal(resolution.config.requestTimeoutMs, expected);
  }
});

test('portrait scope retains 120 s transport fallback', () => {
  const resolution = resolveLlmExecutionConfig({
    scope: 'portrait_lab', roleId: 'portrait_spec_normalizer', env: { DEEPSEEK_API_KEY: 'test-key' }
  });
  assert.equal(resolution.config.requestTimeoutMs, 120000);
});

test('aborted request reports deterministic retryable timeout', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('non-AbortError failure')));
  });

  try {
    const result = await executeRoleLlmCall({
      scope: 'turn_runtime',
      roleId,
      messages: [],
      env: { DEEPSEEK_API_KEY: 'test-key', DEEPSEEK_REQUEST_TIMEOUT_MS: '1' }
    });
    assert.equal(result.status, 'transport_error');
    assert.equal(result.error.code, 'timeout');
    assert.equal(result.error.retryable, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('custom provider overrides role model and normalizes base or full request URLs', () => {
  const defaultResolution = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId, env: { DEEPSEEK_API_KEY: 'test-key' }
  });
  assert.equal(defaultResolution.config.provider, 'deepseek');
  assert.equal(defaultResolution.config.model, 'deepseek-v4-flash');

  for (const [baseUrl, requestUrl] of [
    ['http://127.0.0.1:8000/v1', 'http://127.0.0.1:8000/v1/chat/completions'],
    ['http://localhost:8000/v1/', 'http://localhost:8000/v1/chat/completions'],
    ['https://example.test/v1/chat/completions', 'https://example.test/v1/chat/completions'],
    ['https://example.test/v1/chat/completions/', 'https://example.test/v1/chat/completions']
  ]) {
    const resolution = resolveLlmExecutionConfig({
      scope: 'turn_runtime', roleId, runtimeProviderOverride: { ...customProvider, baseUrl }
    });
    assert.equal(resolution.enabled, true);
    assert.equal(resolution.config.requestUrl, requestUrl);
    assert.equal(resolution.config.model, 'local-model');
  }

  for (const baseUrl of ['ftp://example.test/v1', 'not a url', 'https://example.test/v1?key=no']) {
    assert.equal(resolveLlmExecutionConfig({
      scope: 'turn_runtime', roleId, runtimeProviderOverride: { ...customProvider, baseUrl }
    }).reason, 'invalid_provider_config');
  }
});

test('config hash retains DeepSeek base endpoint and canonicalizes custom request endpoint', () => {
  assert.equal(describeRoleLlmCall({
    scope: 'turn_runtime', roleId: 'ordinary_materialization',
    env: { DEEPSEEK_API_KEY: 'test-key' }, overrides: { temperature: 0, maxTokens: 6000 }
  }).config_hash, 'af6b22db5449f13e');
  assert.equal(describeRoleLlmCall({
    scope: 'turn_runtime', roleId, runtimeProviderOverride: customProvider
  }).config_hash, describeRoleLlmCall({
    scope: 'turn_runtime', roleId, runtimeProviderOverride: {
      ...customProvider, baseUrl: 'http://127.0.0.1:8000/v1/chat/completions'
    }
  }).config_hash);
});

test('call description exposes resolved timeout and telemetry exposes redacted start time', async () => {
  const description = describeRoleLlmCall({
    scope: 'turn_runtime', roleId, env: { DEEPSEEK_API_KEY: 'test-key' }
  });
  assert.equal(description.request_timeout_ms, 10000);

  const originalFetch = globalThis.fetch;
  let call;
  globalThis.fetch = async () => ({
    ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] })
  });
  try {
    await executeRoleLlmCall({
      scope: 'turn_runtime', roleId, messages: [{ role: 'user', content: 'secret prompt' }],
      env: { DEEPSEEK_API_KEY: 'secret-key' }, telemetry: { onCall: (value) => { call = value; } }
    });
    assert.equal(Number.isFinite(call.started_at_ms), true);
    assert.equal(call.started_at_ms > 0, true);
    assert.equal(JSON.stringify(call).includes('secret'), false);
    assert.equal(JSON.stringify(call).includes('prompt'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generic provider omits empty authorization and DeepSeek-only payload fields', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, headers: init.headers, payload: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
  };
  try {
    const result = await executeRoleLlmCall({
      scope: 'turn_runtime', roleId, messages: [], runtimeProviderOverride: customProvider
    });
    assert.equal(result.status, 'ok');
    assert.equal(request.url, 'http://127.0.0.1:8000/v1/chat/completions');
    assert.equal('Authorization' in request.headers, false);
    assert.equal('thinking' in request.payload, false);
    assert.equal('reasoning_effort' in request.payload, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('custom key is sent, excluded from config hash, and error body is redacted', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, init) => {
    request = init;
    return { ok: false, status: 401, text: async () => `invalid key secret-key ${'x'.repeat(600)}` };
  };
  try {
    const withKey = { ...customProvider, apiKey: 'secret-key' };
    const result = await executeRoleLlmCall({
      scope: 'turn_runtime', roleId, messages: [], runtimeProviderOverride: withKey
    });
    assert.equal(request.headers.Authorization, 'Bearer secret-key');
    assert.equal(result.error.code, 'http_401');
    assert.equal(result.error.message.includes('secret-key'), false);
    assert.equal(result.error.message.includes('DeepSeek'), false);
    assert.equal(result.error.message.length <= 512 + 'Provider request failed (401): '.length, true);
    const withoutKey = resolveLlmExecutionConfig({
      scope: 'turn_runtime', roleId, runtimeProviderOverride: customProvider
    });
    const keyed = resolveLlmExecutionConfig({
      scope: 'turn_runtime', roleId, runtimeProviderOverride: withKey
    });
    assert.equal(withoutKey.config.apiKey, null);
    assert.notEqual(keyed.config.apiKey, null);
    assert.equal(describeRoleLlmCall({
      scope: 'turn_runtime', roleId, runtimeProviderOverride: customProvider
    }).config_hash, describeRoleLlmCall({
      scope: 'turn_runtime', roleId, runtimeProviderOverride: withKey
    }).config_hash);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DeepSeek retains extensions and timeout precedence is per-call, provider, role, then default', async () => {
  const defaultResolution = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId,
    env: {
      DEEPSEEK_API_KEY: 'test-key', DEEPSEEK_REQUEST_TIMEOUT_MS: '100',
      TURN_WORLD_PROCESS_STEP_REQUEST_TIMEOUT_MS: '200'
    },
    runtimeProviderOverride: { ...customProvider, requestTimeoutMs: 300 },
    overrides: { requestTimeoutMs: 400 }
  });
  assert.equal(defaultResolution.config.requestTimeoutMs, 400);
  assert.equal(resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId, env: { DEEPSEEK_API_KEY: 'test-key' },
    overrides: { requestTimeoutMs: 500 }
  }).config.requestTimeoutMs, 500);

  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
  };
  try {
    const result = await executeRoleLlmCall({
      scope: 'turn_runtime', roleId, messages: [], env: { DEEPSEEK_API_KEY: 'test-key' }
    });
    assert.equal(result.status, 'ok');
    assert.deepEqual(payload.thinking, { type: 'disabled' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
