import assert from 'node:assert/strict';
import test from 'node:test';
import { validateP12TargetMaterializationApprovalV11 } from '../../tools/spatial-v3/p12-target-materialization-approval-v1_1.mjs';

test('P12 V1.1 immutable payload has a portable canonical manifest and authorizes only the bound repository apply', async () => {
  const result = await validateP12TargetMaterializationApprovalV11();
  assert.equal(result.ok, true);
  assert.equal(result.materialization_authorized, true);
  assert.equal(result.p12_operational_gaps_closed, false);
  assert.equal(result.p28_activation, 'not_authorized');
  assert.deepEqual(result.errors, []);
});
