import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runStage25PartyCommitBlock,
  validateStage25Result,
  validateStage25ToStage26Handoff
} from '@rus/new-game/stages/stage-25/compat';
import { makeStage25Fixture } from '../fixtures/stage25-fixtures.mjs';

test('Stage 25 commits only after dry run and postcommit readback', async () => {
  const f = makeStage25Fixture();
  const calls = [];
  const result = await runStage25PartyCommitBlock({
    input: f.input,
    physicalPlanAdapter: f.executors.physicalPlanAdapter,
    idempotencyChecker: async (input) => { calls.push(['idempotency', input]); return structuredClone(f.idempotencyResult); },
    dryRunExecutor: async (input) => { calls.push(['dry_run', input]); return structuredClone(f.dryRunResult); },
    transactionExecutor: async (input) => { calls.push(['transaction', input]); return structuredClone(f.transactionResult); },
    postcommitReader: async (input) => { calls.push(['postcommit', input]); return structuredClone(f.postcommitState); }
  });
  assert.equal(result.pass, true);
  assert.deepEqual(calls.map(([name]) => name), ['idempotency', 'dry_run', 'transaction', 'postcommit']);
  assert.equal(calls[2][1].commit_gate_approval.can_execute_atomic_commit, true);
  assert.equal(calls[2][1].commit_gate_approval.physical_plan_digest, f.physicalDigest);
  assert.deepEqual(validateStage25Result(result), []);
  assert.deepEqual(validateStage25ToStage26Handoff(result), []);
});

test('Stage 25 replay_committed does not repeat dry run or transaction', async () => {
  const f = makeStage25Fixture();
  const committed = await runStage25PartyCommitBlock({ input: f.input, ...f.executors });
  let dryRuns = 0;
  let transactions = 0;
  let reads = 0;
  const replay = await runStage25PartyCommitBlock({
    input: f.input,
    physicalPlanAdapter: f.executors.physicalPlanAdapter,
    idempotencyChecker: async () => ({
      ...structuredClone(f.idempotencyResult),
      status: 'replay_committed',
      committed_result: structuredClone(committed)
    }),
    dryRunExecutor: async () => { dryRuns += 1; return f.dryRunResult; },
    transactionExecutor: async () => { transactions += 1; return f.transactionResult; },
    postcommitReader: async () => { reads += 1; return f.postcommitState; }
  });
  assert.deepEqual(replay, committed);
  assert.equal(dryRuns, 0);
  assert.equal(transactions, 0);
  assert.equal(reads, 0);
});

test('Stage 25 rejects a dry run without completed rollback simulation', async () => {
  const f = makeStage25Fixture();
  const result = await runStage25PartyCommitBlock({
    input: f.input,
    ...f.executors,
    dryRunExecutor: async () => ({ ...structuredClone(f.dryRunResult), rollback_completed: false })
  });
  assert.equal(result.pass, false);
  assert.equal(result.failed_phase, 'dry_run');
  assert.equal(result.handoff_permission.can_start_stage_26, false);
  assert.ok(result.concerns.some((item) => item.code === 'STAGE25_DRY_RUN_ROLLBACK_FAILED'));
});

test('Stage 25 rejects partial transaction results', async () => {
  const f = makeStage25Fixture();
  const result = await runStage25PartyCommitBlock({
    input: f.input,
    ...f.executors,
    transactionExecutor: async () => ({
      ...structuredClone(f.transactionResult),
      pass: false,
      commit_status: 'partial',
      batch_results: [{ batch_id: 'batch-party-state', operation: 'insert_only', attempted_rows: 1, affected_rows: 0 }]
    })
  });
  assert.equal(result.pass, false);
  assert.equal(result.failed_phase, 'transaction');
  assert.equal(result.handoff_permission.can_show_player_output, false);
  assert.ok(result.concerns.some((item) => item.code === 'STAGE25_TRANSACTION_NOT_COMMITTED'));
});

test('Stage 25 blocks hidden state in the committed public read model', async () => {
  const f = makeStage25Fixture();
  const result = await runStage25PartyCommitBlock({
    input: f.input,
    ...f.executors,
    postcommitReader: async () => ({
      ...structuredClone(f.postcommitState),
      party_public_state: { hidden_state: { secret: true } }
    })
  });
  assert.equal(result.pass, false);
  assert.equal(result.failed_phase, 'postcommit');
  assert.equal(result.commit_status, 'commit_error');
  assert.ok(result.concerns.some((item) => item.code === 'STAGE25_HIDDEN_PUBLIC_LEAK'));
});

test('Stage 25 returns manual recovery route after postcommit failure', async () => {
  const f = makeStage25Fixture();
  const result = await runStage25PartyCommitBlock({
    input: f.input,
    ...f.executors,
    postcommitReader: async () => ({ ...structuredClone(f.postcommitState), current_position: null })
  });
  assert.equal(result.pass, false);
  assert.equal(result.repair_route.repair_kind, 'manual_postcommit_recovery');
  assert.equal(result.player_output_status, 'blocked');
});

test('Stage 25 default schema adapter completes the full technical commit boundary', async () => {
  const f = makeStage25Fixture();
  let observedPhysicalDigest = null;
  const result = await runStage25PartyCommitBlock({
    input: f.input,
    idempotencyChecker: async (input) => {
      observedPhysicalDigest = input.physical_write_plan_digest;
      return {
        version: 1,
        schema: 'party_commit_idempotency_result',
        pass: true,
        status: 'new',
        idempotency_key: f.idempotencyKey,
        payload_hash: f.input.party_creation_context.payload_hash,
        physical_write_plan_digest: input.physical_write_plan_digest
      };
    },
    dryRunExecutor: async (input) => ({
      version: 1,
      schema: 'party_write_plan_dry_run_result',
      request_id: f.requestId,
      physical_write_plan_digest: input.physical_write_plan_digest,
      pass: true,
      checks: Object.fromEntries(Object.keys(f.dryRunResult.checks).map((key) => [key, { pass: true, evidence: [`${key}:ok`] }])),
      concerns: [],
      evidence: ['default adapter dry-run passed'],
      rollback_completed: true
    }),
    transactionExecutor: async (input) => ({
      version: 1,
      schema: 'party_transaction_result',
      request_id: f.requestId,
      party_id: f.partyId,
      transaction_id: f.transactionId,
      physical_write_plan_digest: input.physical_write_plan_digest,
      pass: true,
      commit_status: 'committed',
      executed_batches: [...input.physical_write_plan.transaction.write_order],
      batch_results: input.physical_write_plan.write_batches.map((batch) => ({
        batch_id: batch.batch_id,
        operation: batch.operation_mode,
        attempted_rows: batch.records.length,
        affected_rows: batch.records.length
      })),
      postcondition_checks: [{ pass: true, evidence: ['party ready'] }],
      rollback: { attempted: false, completed: false }
    }),
    postcommitReader: async (input) => ({
      ...structuredClone(f.postcommitState),
      physical_write_plan_digest: input.physical_write_plan_digest
    })
  });
  assert.equal(result.pass, true);
  assert.equal(result.physical_plan_digest, observedPhysicalDigest);
  assert.notEqual(observedPhysicalDigest, f.physicalDigest, 'default adapter must use its own exact physical projection digest');
  assert.deepEqual(validateStage25Result(result), []);
});

test('declarative Stage 25 definition executes the modular commit runner', async () => {
  const f = makeStage25Fixture();
  const { stage25Definition } = await import('@rus/new-game/stages/stage-25');
  const gate = await stage25Definition.execute({ input: f.input, services: { stage25: f.executors } });
  assert.equal(gate.status, 'approved');
  assert.equal(gate.artifact.pass, true);
  assert.deepEqual(validateStage25Result(gate.artifact), []);
});
