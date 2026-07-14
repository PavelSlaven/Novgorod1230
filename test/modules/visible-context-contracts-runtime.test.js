import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE20_INPUT_SCHEMA,
  STAGE20_OUTPUT_SCHEMA,
  STAGE21_INPUT_SCHEMA,
  STAGE21_OUTPUT_SCHEMA,
  STAGE21_REQUIRED_CHECKS,
  STAGE21_ALLOWED_CONCERN_CODES,
  STAGE21_ALLOWED_RETURN_STAGES,
  STAGE21_ALLOWED_REPAIR_KINDS
} from '@rus/contracts';
import {
  NewGameVisibleContextRoles,
  NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS,
  getNewGameVisibleContextRoleDescriptor
} from '@rus/llm-runtime';

test('visible-context schemas and audit enums are canonical contracts', () => {
  assert.equal(STAGE20_INPUT_SCHEMA, 'visible_context_builder_input');
  assert.equal(STAGE20_OUTPUT_SCHEMA, 'visible_context_package');
  assert.equal(STAGE21_INPUT_SCHEMA, 'visible_context_audit_input');
  assert.equal(STAGE21_OUTPUT_SCHEMA, 'visible_context_audit');
  assert.ok(STAGE21_REQUIRED_CHECKS.includes('hidden_state_leak_check'));
  assert.ok(STAGE21_REQUIRED_CHECKS.includes('package_digest_check'));
  assert.ok(STAGE21_ALLOWED_CONCERN_CODES.includes('VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK'));
  assert.ok(STAGE21_ALLOWED_RETURN_STAGES.includes('stage20_visible_context'));
  assert.ok(STAGE21_ALLOWED_REPAIR_KINDS.includes('remove_hidden_leak'));
  assert.ok(Object.isFrozen(STAGE21_REQUIRED_CHECKS));
  assert.ok(Object.isFrozen(STAGE21_ALLOWED_CONCERN_CODES));
});

test('visible-context LLM roles resolve to the required repair tiers', () => {
  assert.equal(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[NewGameVisibleContextRoles.BUILDER], 'tier_2_standard');
  assert.equal(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[NewGameVisibleContextRoles.FORMAT_REPAIRER], 'tier_1_fast');
  assert.equal(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[NewGameVisibleContextRoles.SEMANTIC_REPAIRER], 'tier_2_standard');
  assert.equal(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[NewGameVisibleContextRoles.SENIOR_SEMANTIC_REPAIRER], 'tier_3_senior');
  assert.equal(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[NewGameVisibleContextRoles.AUDITOR], 'tier_2_standard');
  assert.equal(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[NewGameVisibleContextRoles.AUDIT_FORMAT_REPAIRER], 'tier_1_fast');
  assert.equal(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[NewGameVisibleContextRoles.SENIOR_AUDITOR], 'tier_3_senior');
  assert.equal(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS[NewGameVisibleContextRoles.AUDIT_ROUTER], 'tier_2_standard');
  const senior = getNewGameVisibleContextRoleDescriptor(NewGameVisibleContextRoles.SENIOR_AUDITOR, {});
  assert.equal(senior.model_tier, 'tier_3_senior');
  assert.equal(senior.model, 'deepseek-v4-pro');
  assert.deepEqual(senior.thinking, { type: 'enabled' });
  assert.equal(senior.reasoning_effort, 'max');
  assert.equal(senior.max_tokens, 12000);
  const format = getNewGameVisibleContextRoleDescriptor(NewGameVisibleContextRoles.AUDIT_FORMAT_REPAIRER, {});
  assert.equal(format.model_tier, 'tier_1_fast');
  assert.equal(format.model, 'deepseek-v4-flash');
  assert.equal(format.max_tokens, 6000);
  assert.ok(Object.isFrozen(NewGameVisibleContextRoles));
  assert.ok(Object.isFrozen(NEW_GAME_VISIBLE_CONTEXT_ROLE_TIERS));
  assert.ok(Object.isFrozen(senior));
});
