import assert from 'node:assert/strict';
import test from 'node:test';

import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { resolveLlmExecutionConfig, TurnRuntimeRoles } from '@rus/llm-runtime';

const roleId = TurnRuntimeRoles.WORLD_PROCESS_STEP;

test('turnBudget.clamp() flows through as a requestTimeoutMs ceiling, not overwritten by the 120 s default', async () => {
  let capturedOverrides = null;
  const runner = createLlmRoleRunnerAdapter({
    turnBudget: { clamp: () => 30_000, claimRepair() {} },
    execute: async ({ overrides }) => {
      capturedOverrides = overrides;
      return { status: 'ok', raw_text: '{}', provider: 'deepseek', model: 'test-model',
        scope: 'turn_runtime', role_id: roleId, tier_id: null, durationMs: 1, config_hash: 'x' };
    }
  });

  await runner.run({ scope: 'turn_runtime', role_id: roleId, messages: [] });

  assert.equal(capturedOverrides.requestTimeoutMs, 30_000);

  const resolution = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId, overrides: capturedOverrides,
    env: { DEEPSEEK_API_KEY: 'test-key' }
  });
  assert.equal(resolution.config.requestTimeoutMs, 30_000);
});
