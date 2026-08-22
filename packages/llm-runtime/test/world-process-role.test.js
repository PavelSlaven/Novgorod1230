import assert from 'node:assert/strict';
import test from 'node:test';
import { getTurnRoleConfig, TurnRuntimeRoles } from
  '../src/provider-config.js';

test('turn runtime resolves the bounded world-process step role', () => {
  const role = getTurnRoleConfig(TurnRuntimeRoles.WORLD_PROCESS_STEP, {});
  assert.equal(TurnRuntimeRoles.WORLD_PROCESS_STEP, 'world_process_step');
  assert.equal(role.expectedSchema, 'world_process_step_plan_v1');
  assert.equal(role.temperature, 0);
  assert.equal(role.contextBudget.reserveRepairTokens, 0);
});
