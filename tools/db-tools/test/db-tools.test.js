import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDbExecutionApproval, createDbToolPlan, validateDbToolManifest } from '../src/index.js';

const manifest = { schema_version:'rus.db_tool_manifest.v1', operation:'import', target:'world_base', source_id:'export-1', source_checksum:'abc', dry_run:true, approval_id:'approve-1' };

test('write-like DB tool manifests require approval and dry-run', () => {
  assert.equal(validateDbToolManifest(manifest).ok, true);
  assert.equal(validateDbToolManifest({ ...manifest, dry_run:false }).ok, false);
  assert.equal(validateDbToolManifest({ ...manifest, approval_id:null }).ok, false);
});

test('DB tool plan contains no executable SQL and checks approval checksum', () => {
  const plan = createDbToolPlan(manifest);
  assert.equal(plan.executor_required, true);
  assert.equal('sql' in plan, false);
  assert.equal(assertDbExecutionApproval(plan, { schema_version:'rus.db_tool_approval.v1', approval_id:'approve-1', dry_run_passed:true, source_checksum:'abc' }), true);
  assert.throws(() => assertDbExecutionApproval(plan, { schema_version:'rus.db_tool_approval.v1', approval_id:'approve-1', dry_run_passed:true, source_checksum:'bad' }), /checksum/);
});
