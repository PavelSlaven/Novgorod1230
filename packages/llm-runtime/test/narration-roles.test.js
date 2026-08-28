import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLlmExecutionConfig } from '../src/provider-config.js';

const gameplayNarrationRoles = {
  'legacy.narrator.dossier': ['json_object_with_schema', 'narration_output'],
  'legacy.narrator.audit': ['json_object_with_schema', 'semantic_audit'],
  'legacy.narrator.dossier_repair': ['json_repair', 'narration_output'],
  'legacy.narrator.repair': ['json_repair', 'narration_output']
};

for (const [roleId, [outputContractMode, expectedSchema]] of Object.entries(gameplayNarrationRoles)) {
  test(`${roleId} uses Flash without reasoning`, () => {
    const resolution = resolveLlmExecutionConfig({
      scope: 'legacy_world',
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
  });
}

test('custom narration provider retains its model override', () => {
  const resolution = resolveLlmExecutionConfig({
    scope: 'legacy_world', roleId: 'legacy.narrator.dossier',
    runtimeProviderOverride: {
      compatibility: 'openai_compatible', baseUrl: 'http://127.0.0.1:8000/v1',
      model: 'local-narrator'
    }
  });
  assert.equal(resolution.enabled, true);
  assert.equal(resolution.config.provider, 'openai_compatible');
  assert.equal(resolution.config.model, 'local-narrator');
});
