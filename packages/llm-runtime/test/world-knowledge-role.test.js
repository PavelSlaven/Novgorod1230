import assert from 'node:assert/strict';
import test from 'node:test';
import { TurnRuntimeRoles, resolveLlmExecutionConfig } from '../src/provider-config.js';

test('World Knowledge planner uses the existing bounded JSON role transport', () => {
  const { config } = resolveLlmExecutionConfig({
    scope: 'turn_runtime',
    roleId: TurnRuntimeRoles.WORLD_KNOWLEDGE_QUERY_PLANNER,
    env: { LLM_BASE_URL: 'http://127.0.0.1:8000/v1', LLM_API_KEY: 'test-key' }
  });
  assert.equal(config.model, 'qwen3.8-27b-uncensored-w4a16-tp2');
  assert.deepEqual(config.thinking, { type: 'disabled' });
  assert.equal(config.expectedSchema, 'world_knowledge_query_plan_v1');
  assert.equal(config.maxTokens, 20_000);
  assert.equal(config.requestTimeoutMs, 120_000);
});
