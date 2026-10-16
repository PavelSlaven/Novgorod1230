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
      return { status: 'ok', raw_text: '{}', provider: 'openai_compatible', model: 'test-model',
        scope: 'turn_runtime', role_id: roleId, tier_id: null, durationMs: 1, config_hash: 'x' };
    }
  });

  await runner.run({ scope: 'turn_runtime', role_id: roleId, messages: [] });

  assert.equal(capturedOverrides.requestTimeoutMs, 30_000);

  const resolution = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId, overrides: capturedOverrides,
    env: { LLM_API_KEY: 'test-key', LLM_BASE_URL: 'http://example.test/v1' }
  });
  assert.equal(resolution.config.requestTimeoutMs, 30_000);
});

test('a provider timeout under a budget-clamped requestTimeoutMs is reported as turn-budget exhaustion', async () => {
  const runner = createLlmRoleRunnerAdapter({
    turnBudget: { clamp: () => 30_000, claimRepair() {} },
    execute: async () => ({
      status: 'transport_error',
      error: { code: 'timeout', message: 'Provider request timeout', retryable: true }
    })
  });

  await assert.rejects(
    runner.run({ scope: 'turn_runtime', role_id: roleId, messages: [] }),
    (error) => {
      assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
      return true;
    }
  );
});

test('a provider timeout at the full 120 s transport timeout still reports the provider failure', async () => {
  const runner = createLlmRoleRunnerAdapter({
    turnBudget: { clamp: () => 120_000, claimRepair() {} },
    execute: async () => ({
      status: 'transport_error',
      error: { code: 'timeout', message: 'Provider request timeout', retryable: true }
    })
  });

  await assert.rejects(
    runner.run({ scope: 'turn_runtime', role_id: roleId, messages: [] }),
    (error) => {
      assert.equal(error.code, 'timeout');
      assert.notEqual(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
      return true;
    }
  );
});
