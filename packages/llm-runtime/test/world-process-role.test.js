import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLlmExecutionConfig, TurnRuntimeRoles } from
  '../src/provider-config.js';

test('turn runtime resolves the bounded world-process step role', () => {
  const { config: role } = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId: TurnRuntimeRoles.WORLD_PROCESS_STEP,
    env: { DEEPSEEK_API_KEY: 'test-key' }
  });
  assert.equal(TurnRuntimeRoles.WORLD_PROCESS_STEP, 'world_process_step');
  assert.equal(role.expectedSchema, null);
  assert.equal(role.temperature, 0);
  assert.equal(role.contextBudget.reserveRepairTokens, 0);
});

test('turn runtime resolves the S1 spatial semantic descriptor role', () => {
  const { config: role } = resolveLlmExecutionConfig({
    scope: 'turn_runtime', roleId: TurnRuntimeRoles.SPATIAL_SEMANTIC_DESCRIPTOR,
    env: {
      DEEPSEEK_API_KEY: 'test-key',
      TURN_SPATIAL_SEMANTIC_DESCRIPTOR_MODEL: 'fixture-s1'
    }
  });
  assert.equal(TurnRuntimeRoles.SPATIAL_SEMANTIC_DESCRIPTOR,
    'spatial_semantic_descriptor');
  assert.equal(role.model, 'fixture-s1');
  assert.equal(role.expectedSchema, 'rus.s1_spatial_semantic_proposal.v1');
  assert.equal(role.temperature, 0);
  assert.equal(role.maxTokens, 400);
  assert.equal(role.contextBudget.reserveRepairTokens, 0);
});
