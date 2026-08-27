import assert from 'node:assert/strict';
import test from 'node:test';

import { TurnRuntimeRoles, resolveLlmExecutionConfig } from '../src/provider-config.js';

const env = { DEEPSEEK_API_KEY: 'test-key' };
const customProvider = {
  compatibility: 'openai_compatible',
  baseUrl: 'http://127.0.0.1:8000/v1',
  model: 'local-model'
};

test('all production turn roles use Flash no-reasoning defaults and bounded timeouts', () => {
  for (const roleId of Object.values(TurnRuntimeRoles)) {
    const { config } = resolveLlmExecutionConfig({ scope: 'turn_runtime', roleId, env });
    assert.equal(config.model, 'deepseek-v4-flash', roleId);
    assert.deepEqual(config.thinking, { type: 'disabled' }, roleId);
    assert.equal(config.reasoningEffort, null, roleId);
    assert.equal(config.requestTimeoutMs, roleId.includes('repair') ? 6000 : 10000, roleId);
  }
});

test('custom provider keeps its model instead of turn default model', () => {
  const { config } = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId: TurnRuntimeRoles.TURN_STEP_PLANNER,
    env, runtimeProviderOverride: customProvider
  });
  assert.equal(config.model, 'local-model');
  assert.equal(config.provider, 'openai_compatible');
});
