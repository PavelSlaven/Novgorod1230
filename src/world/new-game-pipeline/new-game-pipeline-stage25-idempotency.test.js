import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage25PartyCommitBlock } from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import { makeStage25Input } from './stage25-fixtures.mjs';

test('same idempotency key with another payload blocks before dry-run', async () => {
  const { stage25Input } = await makeStage25Input();
  let dryRuns = 0;
  const result = await runStage25PartyCommitBlock({
    input: stage25Input,
    idempotencyChecker: async (payload) => ({
      version: 1,
      schema: 'party_commit_idempotency_result',
      request_id: payload.request_id,
      pass: false,
      status: 'hash_conflict',
      idempotency_key: payload.party_creation_context.idempotency_key,
      payload_hash: payload.party_creation_context.payload_hash,
      physical_write_plan_digest: payload.physical_write_plan_digest,
      concerns: [{ code: 'STAGE25_IDEMPOTENCY_HASH_CONFLICT', severity: 'hard_block', message: 'hash conflict' }],
      evidence: []
    }),
    dryRunExecutor: async () => { dryRuns += 1; },
    transactionExecutor: async () => null,
    postcommitReader: async () => null
  });
  assert.equal(result.pass, false);
  assert.equal(result.failed_phase, 'idempotency');
  assert.equal(dryRuns, 0);
});

test('in-progress idempotency attempt blocks concurrent commit', async () => {
  const { stage25Input } = await makeStage25Input();
  const result = await runStage25PartyCommitBlock({
    input: stage25Input,
    idempotencyChecker: async (payload) => ({
      version: 1,
      schema: 'party_commit_idempotency_result',
      request_id: payload.request_id,
      pass: false,
      status: 'in_progress',
      idempotency_key: payload.party_creation_context.idempotency_key,
      payload_hash: payload.party_creation_context.payload_hash,
      physical_write_plan_digest: payload.physical_write_plan_digest,
      concerns: [{ code: 'STAGE25_IDEMPOTENCY_IN_PROGRESS', severity: 'hard_block', message: 'in progress' }],
      evidence: []
    }),
    dryRunExecutor: async () => null,
    transactionExecutor: async () => null,
    postcommitReader: async () => null
  });
  assert.equal(result.pass, false);
  assert.equal(result.player_output_status, 'blocked');
});
