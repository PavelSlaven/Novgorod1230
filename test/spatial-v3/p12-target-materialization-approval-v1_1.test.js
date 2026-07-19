import assert from 'node:assert/strict';
import test from 'node:test';
import { validateP12TargetMaterializationApprovalV11 } from '../../tools/spatial-v3/p12-target-materialization-approval-v1_1.mjs';

test('P12 V1.1 immutable payload has a portable canonical manifest and stays blocked until the follow-up subject binding commit', async () => {
  const result = await validateP12TargetMaterializationApprovalV11();
  assert.equal(result.ok, false);
  assert.equal(result.materialization_authorized, false);
  assert.ok(result.errors.some((error) => error.code === 'P12_V11_SUBJECT_COMMIT_BINDING_MISSING'));
  assert.ok(!result.errors.some((error) => error.code === 'P12_V11_CANONICAL_MANIFEST_INVALID'));
});
