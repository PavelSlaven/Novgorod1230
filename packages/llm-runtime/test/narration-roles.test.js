import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLlmExecutionConfig } from '../src/provider-config.js';

const gameplayNarrationRoles = {
  gameplay_narrator: ['json_object_with_schema', 'narration_output', 10000],
  gameplay_narrator_format_repair: ['json_repair', 'narration_output', 6000],
  gameplay_narrator_auditor: ['json_object_with_schema', 'narration_audit', 10000],
  gameplay_narrator_semantic_repair: ['json_object_with_schema', 'narration_semantic_repair', 6000]
};

for (const [roleId, [outputContractMode, expectedSchema, requestTimeoutMs]] of Object.entries(gameplayNarrationRoles)) {
  test(`${roleId} uses Flash without reasoning`, () => {
    const resolution = resolveLlmExecutionConfig({
      scope: 'turn_runtime',
      roleId,
      env: {
        DEEPSEEK_API_KEY: 'test',
        DEEPSEEK_MODEL: 'deepseek-chat',
        DEEPSEEK_BASE_URL: 'http://127.0.0.1:1'
      }
    });
    assert.equal(resolution.enabled, true);
    assert.equal(resolution.config.model, 'deepseek-v4-flash');
    assert.deepEqual(resolution.config.thinking, { type: 'disabled' });
    assert.equal(resolution.config.reasoningEffort, null);
    assert.equal(resolution.config.parseJson, true);
    assert.equal(resolution.config.responseFormat.type, 'json_object');
    assert.equal(resolution.config.outputContractMode, outputContractMode);
    assert.equal(resolution.config.expectedSchema, expectedSchema);
    assert.equal(resolution.config.requestTimeoutMs, requestTimeoutMs);
  });
}

test('custom narration provider retains its model override', () => {
  const resolution = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId: 'gameplay_narrator',
    runtimeProviderOverride: {
      compatibility: 'openai_compatible', baseUrl: 'http://127.0.0.1:8000/v1',
      model: 'local-narrator'
    }
  });
  assert.equal(resolution.enabled, true);
  assert.equal(resolution.config.provider, 'openai_compatible');
  assert.equal(resolution.config.model, 'local-narrator');
});
