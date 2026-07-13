import test from 'node:test';
import assert from 'node:assert/strict';
import { createApproval, explainJsonObjectParse, verifyApproval } from '@rus/contracts';

test('JSON contract accepts objects only', () => {
  assert.equal(explainJsonObjectParse('{"a":1}').ok, true);
  assert.equal(explainJsonObjectParse('[]').ok, false);
});

test('approval binds to exact artifact', () => {
  const approval = createApproval({ stageId: 2, artifact: { a: 1 } });
  assert.equal(verifyApproval(approval, { a: 1 }), true);
  assert.equal(verifyApproval(approval, { a: 2 }), false);
});
