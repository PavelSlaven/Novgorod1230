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
