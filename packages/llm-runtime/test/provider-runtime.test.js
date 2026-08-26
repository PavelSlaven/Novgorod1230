import assert from 'node:assert/strict';
import test from 'node:test';

import { TurnRuntimeRoles, resolveLlmExecutionConfig } from '../src/provider-config.js';
import { executeRoleLlmCall } from '../src/runtime.js';

const roleId = TurnRuntimeRoles.WORLD_PROCESS_STEP;

test('request timeout uses positive DEEPSEEK_REQUEST_TIMEOUT_MS or its 120 s default', () => {
  for (const [value, expected] of [
    [undefined, 120000], ['', 120000], ['invalid', 120000], ['0', 120000], ['-1', 120000], ['1.5', 120000], ['60000', 60000]
  ]) {
    const resolution = resolveLlmExecutionConfig({
      scope: 'turn_runtime',
      roleId,
      env: { DEEPSEEK_API_KEY: 'test-key', ...(value === undefined ? {} : { DEEPSEEK_REQUEST_TIMEOUT_MS: value }) }
    });
    assert.equal(resolution.config.requestTimeoutMs, expected);
  }
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
