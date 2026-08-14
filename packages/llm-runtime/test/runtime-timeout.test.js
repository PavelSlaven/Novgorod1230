import assert from 'node:assert/strict';
import test from 'node:test';

import { executeRoleLlmCall } from '../src/runtime.js';
import { resolveLlmExecutionConfig } from '../src/provider-config.js';

test('reasoning roles allow responses beyond the former 30 second boundary', () => {
  const resolution = resolveLlmExecutionConfig({
    scope: 'turn_runtime',
    roleId: 'turn_step_planner',
    env: { DEEPSEEK_API_KEY: 'test' }
  });

  assert.equal(resolution.enabled, true);
  assert.equal(resolution.config.requestTimeoutMs, 120_000);
});

test('configured request timeout aborts the provider call with a timeout code',
  async (context) => {
    const originalFetch = globalThis.fetch;
    context.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = (_url, { signal }) => new Promise((resolve, reject) => {
      const completion = setTimeout(() => resolve(new Response(JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })), 25);
      signal.addEventListener('abort', () => {
        clearTimeout(completion);
        reject(signal.reason);
      }, { once: true });
    });

    const result = await executeRoleLlmCall({
      scope: 'turn_runtime',
      roleId: 'turn_step_planner',
      env: {
        DEEPSEEK_API_KEY: 'test',
        DEEPSEEK_REQUEST_TIMEOUT_MS: '5'
      },
      messages: [{ role: 'user', content: '{}' }]
    });

    assert.equal(result.status, 'transport_error');
    assert.equal(result.error.code, 'timeout');
    assert.ok(result.durationMs < 25);
  });
