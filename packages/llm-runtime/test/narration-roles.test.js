import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveLlmExecutionConfig } from '../src/provider-config.js';

for (const roleId of [
  'legacy.narrator.dossier',
  'legacy.narrator.dossier_repair',
  'legacy.narrator.repair'
]) {
  test(`${roleId} uses the JSON narration_output contract`, () => {
    const resolution = resolveLlmExecutionConfig({
      scope: 'legacy_world',
      roleId,
      env: {
        DEEPSEEK_API_KEY: 'test',
        DEEPSEEK_BASE_URL: 'http://127.0.0.1:1'
      }
    });
    assert.equal(resolution.enabled, true);
    assert.equal(resolution.config.parseJson, true);
    assert.equal(resolution.config.expectedSchema, 'narration_output');
    assert.equal(resolution.config.responseFormat.type, 'json_object');
  });
}

test('narrator audit output limit matches its reserved output budget', () => {
  const resolution = resolveLlmExecutionConfig({
    scope: 'legacy_world',
    roleId: 'legacy.narrator.audit',
    env: { DEEPSEEK_API_KEY: 'test' }
  });

  assert.equal(resolution.enabled, true);
  assert.equal(resolution.config.maxTokens, 2000);
  assert.equal(resolution.config.contextBudget.reserveOutputTokens, 2000);
});
