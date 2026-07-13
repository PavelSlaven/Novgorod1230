import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage25PartyCommitBlock } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import { makeDryRunResult, makeIdempotencyResult, makePostcommitState, makeStage25Input, makeTransactionResult } from './stage25-fixtures.mjs';

async function runWithPostcommit(overrides) {
  const { stage25Input } = await makeStage25Input();
  return runStage25PartyCommitBlock({
    input: stage25Input,
    idempotencyChecker: async (payload) => makeIdempotencyResult(stage25Input, payload.physical_write_plan_digest),
    dryRunExecutor: async (payload) => makeDryRunResult(payload),
    transactionExecutor: async (payload) => makeTransactionResult(payload),
    postcommitReader: async (payload) => makePostcommitState(payload, overrides)
  });
}

test('postcommit not-ready state blocks Stage 26 after physical commit', async () => {
  const result = await runWithPostcommit({ party_state: { status: 'initializing', is_ready_for_player: false } });
  assert.equal(result.pass, false);
  assert.equal(result.commit_status, 'commit_error');
  assert.equal(result.failed_phase, 'postcommit');
  assert.equal(result.handoff_permission.can_start_stage_26, false);
});

test('hidden data in public read model blocks Stage 26', async () => {
  const result = await runWithPostcommit({ party_public_state: { public_position_label: 'У ворот', hidden_state: { danger: true } } });
  assert.equal(result.pass, false);
  assert.ok(result.concerns.some((item) => item.code === 'STAGE25_HIDDEN_PUBLIC_LEAK'));
});

test('knowledge mismatch blocks committed handoff', async () => {
  const result = await runWithPostcommit({ integrity: { knowledge_hash_matches: false } });
  assert.equal(result.pass, false);
  assert.ok(result.concerns.some((item) => item.code === 'STAGE25_POSTCOMMIT_CHECK_FAILED'));
});
