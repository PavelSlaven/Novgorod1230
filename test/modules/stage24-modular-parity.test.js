import test from 'node:test';
import assert from 'node:assert/strict';
import * as baseline from '../fixtures/stage24-baseline/stage24-party-db-write-plan-0.4.0.js';
import * as modular from '@rus/new-game/stages/stage-24/compat';
import { makeStage24Fixture } from '../fixtures/stage24-fixtures.mjs';

function withFixedNow(value, callback) {
  const original = Date.now;
  Date.now = () => value;
  return Promise.resolve().then(callback).finally(() => { Date.now = original; });
}

test('Stage 24 compatibility API preserves all baseline exports', () => {
  assert.deepEqual(Object.keys(modular).sort(), Object.keys(baseline).sort());
  assert.equal(Object.keys(modular).length, 30);
});

test('Stage 24 policy, manifest and input preserve baseline output', () => {
  const f = makeStage24Fixture();
  assert.deepEqual(modular.normalizeStage24WritePolicy(), baseline.normalizeStage24WritePolicy());
  assert.deepEqual(modular.buildApprovedPipelineManifest({ request_id: f.requestId, artifacts: f.approvedPipelineOutputs }), baseline.buildApprovedPipelineManifest({ request_id: f.requestId, artifacts: f.approvedPipelineOutputs }));
  assert.deepEqual(modular.buildStage24Input(f.inputArgs), baseline.buildStage24Input(f.inputArgs));
  assert.deepEqual(modular.validateStage24Input(f.input), baseline.validateStage24Input(f.input));
});

test('Stage 24 precheck, plan and audit validators preserve baseline output', () => {
  const f = makeStage24Fixture();
  const oldPrecheck = baseline.buildPartyDbWritePlanCodePrecheck(f.input);
  const newPrecheck = modular.buildPartyDbWritePlanCodePrecheck(f.input);
  assert.deepEqual(newPrecheck, oldPrecheck);
  assert.deepEqual(modular.validatePartyDbWritePlan(f.plan, f.input, newPrecheck), baseline.validatePartyDbWritePlan(f.plan, f.input, oldPrecheck));
  assert.deepEqual(modular.validatePartyDbWritePlanAudit(f.audit, f.input, f.plan), baseline.validatePartyDbWritePlanAudit(f.audit, f.input, f.plan));
});

test('Stage 24 full successful orchestration preserves baseline output', async () => {
  const f = makeStage24Fixture();
  const oldResult = await withFixedNow(1700000000000, () => baseline.runStage24PartyDbWritePlanBlock({ input: structuredClone(f.input), ...f.executors }));
  const newResult = await withFixedNow(1700000000000, () => modular.runStage24PartyDbWritePlanBlock({ input: structuredClone(f.input), ...f.executors }));
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.pass, true);
  assert.deepEqual(modular.buildStage24Approval(newResult), baseline.buildStage24Approval(oldResult));
});

test('Stage 24 manifest digest mismatch preserves concerns and order', () => {
  const f = makeStage24Fixture();
  const input = structuredClone(f.input);
  input.approved_pipeline_manifest.artifacts[0].artifact_digest = 'sha256:' + '0'.repeat(64);
  input.approved_pipeline_manifest_digest = modular.computeStage24Digest(input.approved_pipeline_manifest);
  input.party_db_write_plan_input_digest = modular.computeStage24Digest({ ...input, party_db_write_plan_input_digest: undefined });
  assert.deepEqual(modular.validateStage24Input(input), baseline.validateStage24Input(input));
});

test('Stage 24 format-repair orchestration preserves baseline output', async () => {
  const f = makeStage24Fixture();
  const createExecutors = () => {
    let first = true;
    return {
      ...f.executors,
      builder: async () => first ? (first = false, '{broken') : structuredClone(f.plan),
      planFormatRepairer: async () => structuredClone(f.plan)
    };
  };
  const oldResult = await withFixedNow(1700000000100, () => baseline.runStage24PartyDbWritePlanBlock({ input: structuredClone(f.input), ...createExecutors() }));
  const newResult = await withFixedNow(1700000000100, () => modular.runStage24PartyDbWritePlanBlock({ input: structuredClone(f.input), ...createExecutors() }));
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.diagnostics.plan_format_repair_attempts, 1);
});

test('Stage 24 successful result passes the modular Stage 25 input boundary', async () => {
  const stage25 = await import('@rus/new-game/stages/stage-25/compat');
  const f = makeStage24Fixture();
  const result = await withFixedNow(1700000000200, () => modular.runStage24PartyDbWritePlanBlock({ input: structuredClone(f.input), ...f.executors }));
  assert.deepEqual(modular.validateStage24ToStage25Handoff({
    stage24_result: result,
    party_database_schema: f.partyDatabaseSchema,
    approved_pipeline_manifest: f.approvedPipelineManifest
  }), []);
  const stage25Input = stage25.buildStage25CommitInput({
    request_id: f.requestId,
    party_creation_context: f.partyCreationContext,
    stage24_result: result,
    party_database_schema: f.partyDatabaseSchema,
    world_base_reference_snapshot: f.worldBaseReferenceSnapshot,
    approved_pipeline_manifest: f.approvedPipelineManifest
  });
  assert.deepEqual(stage25.validateStage25CommitInput(stage25Input), []);
});
