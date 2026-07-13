import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage25PartyCommitBlock } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import { makeDryRunResult, makeIdempotencyResult, makeStage25Input } from './stage25-fixtures.mjs';

test('dry-run pass=false blocks transaction and player output', async () => {
  const { stage25Input } = await makeStage25Input();
  let transactions = 0;
  const result = await runStage25PartyCommitBlock({
    input: stage25Input,
    idempotencyChecker: async (payload) => makeIdempotencyResult(stage25Input, payload.physical_write_plan_digest),
    dryRunExecutor: async (payload) => makeDryRunResult(payload, false),
    transactionExecutor: async () => { transactions += 1; throw new Error('must not run'); },
    postcommitReader: async () => { throw new Error('must not run'); }
  });
  assert.equal(result.pass, false);
  assert.equal(result.failed_phase, 'dry_run');
  assert.equal(transactions, 0);
  assert.equal(result.player_output_status, 'blocked');
  assert.equal(result.handoff_permission.can_start_stage_26, false);
});

test('dry-run digest mismatch blocks transaction', async () => {
  const { stage25Input } = await makeStage25Input();
  let transactions = 0;
  const result = await runStage25PartyCommitBlock({
    input: stage25Input,
    idempotencyChecker: async (payload) => makeIdempotencyResult(stage25Input, payload.physical_write_plan_digest),
    dryRunExecutor: async (payload) => ({ ...makeDryRunResult(payload), physical_write_plan_digest: 'sha256:' + '1'.repeat(64) }),
    transactionExecutor: async () => { transactions += 1; },
    postcommitReader: async () => null
  });
  assert.equal(result.pass, false);
  assert.equal(transactions, 0);
  assert.ok(result.concerns.some((item) => item.code === 'STAGE25_DRY_RUN_DIGEST_MISMATCH'));
});
