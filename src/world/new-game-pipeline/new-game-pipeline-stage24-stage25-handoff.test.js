import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage24Approval,
  runStage24PartyDbWritePlanBlock,
  validateStage24ToStage25Handoff
} from '../src/world/new-game-pipeline/stages/stage24-party-db-write-plan.js';
import { runCommitGate } from '../src/world/new-game-pipeline/commit/commit-gate.js';
import { makeAudit, makeInput, makePlan } from './stage24-fixtures.mjs';

async function approvedResult() {
  const input = makeInput();
  const plan = makePlan(input);
  const result = await runStage24PartyDbWritePlanBlock({
    input,
    builder: async () => plan,
    planFormatRepairer: async () => plan,
    auditor: async () => makeAudit(plan, true),
    auditFormatRepairer: async ({ parsed_audit_response }) => parsed_audit_response,
    router: async () => { throw new Error('router must not run'); },
    semanticRepairer: async () => plan,
    seniorSemanticRepairer: async () => plan,
    seniorBuilder: async () => plan,
    seniorAuditor: async () => makeAudit(plan, true)
  });
  return { input, plan, result };
}

test('Stage 24 to 25 handoff requires current plan/schema/manifest digests', async () => {
  const { input, result } = await approvedResult();
  assert.deepEqual(validateStage24ToStage25Handoff({
    stage24_result: result,
    party_database_schema: input.party_database_schema,
    approved_pipeline_manifest: input.approved_pipeline_manifest
  }), []);
  const staleSchema = structuredClone(input.party_database_schema);
  staleSchema.schema_version = '2';
  assert.ok(validateStage24ToStage25Handoff({
    stage24_result: result,
    party_database_schema: staleSchema,
    approved_pipeline_manifest: input.approved_pipeline_manifest
  }).length > 0);
});

test('Stage 25 accepts only approved digest-bound Stage 24 bundle and performs dry-run', async () => {
  const { input, result } = await approvedResult();
  let dryRuns = 0;
  const gate = await runCommitGate({
    version: 1,
    schema: 'commit_gate_input',
    request_id: result.request_id,
    stage24_result_approval: buildStage24Approval(result),
    party_db_write_plan: result.party_db_write_plan,
    party_database_schema: input.party_database_schema,
    world_base_reference_snapshot: input.world_base_reference_snapshot,
    approved_pipeline_manifest: input.approved_pipeline_manifest,
    commit_policy: { require_dry_run: true }
  }, { dryRun: async () => { dryRuns += 1; } });
  assert.equal(gate.pass, true);
  assert.equal(dryRuns, 1);
  assert.equal(gate.transaction_permission.can_execute_atomic_commit, true);
});

test('Stage 25 rejects stale plan digest and denied permission', async () => {
  const { input, result } = await approvedResult();
  const approval = buildStage24Approval(result);
  approval.party_db_write_plan_digest = 'sha256:stale';
  approval.permissions.can_execute_transaction = false;
  const gate = await runCommitGate({
    version: 1,
    schema: 'commit_gate_input',
    request_id: result.request_id,
    stage24_result_approval: approval,
    party_db_write_plan: result.party_db_write_plan,
    party_database_schema: input.party_database_schema,
    world_base_reference_snapshot: input.world_base_reference_snapshot,
    approved_pipeline_manifest: input.approved_pipeline_manifest,
    commit_policy: { require_dry_run: true }
  }, { dryRun: async () => {} });
  assert.equal(gate.pass, false);
  assert.ok(gate.concerns.some((item) => item.code === 'COMMIT_GATE_PLAN_DIGEST_MISMATCH'));
  assert.ok(gate.concerns.some((item) => item.code === 'COMMIT_GATE_STAGE24_PERMISSION_DENIED'));
});
