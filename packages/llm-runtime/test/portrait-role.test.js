import test from 'node:test';
import assert from 'node:assert/strict';
import { PortraitLabRoles, resolveLlmExecutionConfig } from '../src/index.js';

test('portrait lab role uses deterministic Qwen JSON output settings', () => {
  const resolution = resolveLlmExecutionConfig({
    scope: 'portrait_lab',
    roleId: PortraitLabRoles.SPEC_NORMALIZER,
    env: { LLM_BASE_URL: 'http://127.0.0.1:8000/v1', LLM_API_KEY: 'test-key' }
  });

  assert.equal(resolution.enabled, true);
  assert.equal(resolution.config.model, 'qwen3.8-27b-uncensored-w4a16-tp2');
  assert.deepEqual(resolution.config.responseFormat, { type: 'json_object' });
  assert.equal(resolution.config.temperature, 0);
  assert.equal(resolution.config.parseJson, true);
  assert.equal(resolution.config.expectedSchema, 'portrait_spec_v1');
});

test('portrait lab model remains configurable through its role environment', () => {
  const resolution = resolveLlmExecutionConfig({
    scope: 'portrait_lab',
    roleId: PortraitLabRoles.SPEC_NORMALIZER,
    env: {
      LLM_BASE_URL: 'http://127.0.0.1:8000/v1', LLM_API_KEY: 'test-key',
      PORTRAIT_SPEC_NORMALIZER_MODEL: 'qwen-custom-model'
    }
  });
  assert.equal(resolution.config.model, 'qwen-custom-model');
});
