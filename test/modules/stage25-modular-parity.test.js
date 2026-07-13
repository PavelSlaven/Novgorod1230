import test from 'node:test';
import assert from 'node:assert/strict';
import * as baseline from '../fixtures/stage25-baseline/stage25-party-commit-0.3.0.js';
import * as modular from '@rus/new-game/stages/stage-25/compat';
import { makeStage25Fixture } from '../fixtures/stage25-fixtures.mjs';

function buildArgs(f) {
  return {
    request_id: f.requestId,
    party_creation_context: f.partyCreationContext,
    stage24_result: f.stage24Result,
    party_database_schema: f.partyDatabaseSchema,
    world_base_reference_snapshot: f.worldBaseReferenceSnapshot,
    approved_pipeline_manifest: f.manifest
  };
}

test('Stage 25 compatibility API preserves all baseline exports', () => {
  assert.deepEqual(Object.keys(modular).sort(), Object.keys(baseline).sort());
  assert.equal(Object.keys(modular).length, 38);
});

test('Stage 25 input and policy preserve baseline output', () => {
  const f = makeStage25Fixture();
  const args = buildArgs(f);
  assert.deepEqual(modular.normalizeStage25CommitPolicy(), baseline.normalizeStage25CommitPolicy());
  assert.deepEqual(modular.buildStage25CommitInput(args), baseline.buildStage25CommitInput(args));
  assert.deepEqual(modular.validateStage25CommitInput(f.input), baseline.validateStage25CommitInput(f.input));
});

test('Stage 25 physical plan materialization and digest preserve baseline output', () => {
  const f = makeStage25Fixture();
  const args = {
    logical_plan: f.logicalPlan,
    party_database_schema: f.partyDatabaseSchema,
    world_base_reference_snapshot: f.worldBaseReferenceSnapshot
  };
  const oldResult = baseline.materializeStage25PhysicalPlan(args);
  const newResult = modular.materializeStage25PhysicalPlan(args);
  assert.deepEqual(newResult, oldResult);
  assert.equal(modular.computeStage25Digest(newResult.physical_write_plan), baseline.computeStage25Digest(oldResult.physical_write_plan));
});

test('Stage 25 full successful orchestration preserves baseline output', async () => {
  const f = makeStage25Fixture();
  const oldResult = await baseline.runStage25PartyCommitBlock({ input: structuredClone(f.input), ...f.executors });
  const newResult = await modular.runStage25PartyCommitBlock({ input: structuredClone(f.input), ...f.executors });
  assert.equal(oldResult.pass, true);
  assert.deepEqual(newResult, oldResult);
  assert.deepEqual(modular.validateStage25Result(newResult), []);
  assert.deepEqual(modular.validateStage25ToStage26Handoff(newResult), []);
  assert.deepEqual(modular.buildStage25Approval(newResult), baseline.buildStage25Approval(oldResult));
});

test('Stage 25 invalid Stage 24 binding preserves concerns and order', () => {
  const f = makeStage25Fixture();
  const input = structuredClone(f.input);
  input.stage24_result_approval.party_db_write_plan_digest = 'sha256:' + '0'.repeat(64);
  assert.deepEqual(modular.validateStage25CommitInput(input), baseline.validateStage25CommitInput(input));
});

test('Stage 25 failure route preserves baseline output', async () => {
  const f = makeStage25Fixture();
  const dryRunExecutor = async () => ({ ...structuredClone(f.dryRunResult), rollback_completed: false });
  const oldResult = await baseline.runStage25PartyCommitBlock({ input: f.input, ...f.executors, dryRunExecutor });
  const newResult = await modular.runStage25PartyCommitBlock({ input: f.input, ...f.executors, dryRunExecutor });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.repair_route.repair_kind, 'party_db_write_plan_or_schema_repair');
});

test('Stage 24 boundary contracts preserve legacy approval and handoff behavior', async () => {
  const f = makeStage25Fixture();
  const contracts = await import('@rus/contracts');
  const stage24 = await import('../../legacy/src/world/new-game-pipeline/stages/stage24-party-db-write-plan.js');
  assert.deepEqual(
    contracts.buildStage24WritePlanApproval(f.stage24Result),
    stage24.buildStage24Approval(f.stage24Result)
  );
  const args = {
    stage24_result: f.stage24Result,
    party_database_schema: f.partyDatabaseSchema,
    approved_pipeline_manifest: f.manifest
  };
  assert.deepEqual(
    contracts.validateStage24ToStage25HandoffContract(args),
    stage24.validateStage24ToStage25Handoff(args)
  );
  assert.deepEqual(contracts.validateStage24ToStage25HandoffContract(args), []);
});
