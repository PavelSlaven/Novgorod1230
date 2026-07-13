import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage25CommitInput,
  buildStage25CommitPreflight,
  normalizeStage25CommitPolicy,
  runStage25PartyCommitBlock,
  validateProvidedStage25Result,
  validateStage25CommitInput,
  validateStage25ToStage26Handoff
} from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import {
  makeDryRunResult,
  makeIdempotencyResult,
  makePostcommitState,
  makeStage25Input,
  makeTransactionResult
} from './stage25-fixtures.mjs';

test('Stage 25 is isolated and completes only through explicit infrastructure callbacks', async () => {
  const { stage25Input } = await makeStage25Input();
  const received = [];
  const result = await runStage25PartyCommitBlock({
    input: stage25Input,
    idempotencyChecker: async (payload) => { received.push(payload); return makeIdempotencyResult(stage25Input, payload.physical_write_plan_digest); },
    dryRunExecutor: async (payload) => { received.push(payload); return makeDryRunResult(payload); },
    transactionExecutor: async (payload) => { received.push(payload); return makeTransactionResult(payload); },
    postcommitReader: async (payload) => { received.push(payload); return makePostcommitState(payload); }
  });
  assert.equal(result.pass, true);
  assert.equal(result.commit_status, 'committed');
  assert.equal(result.party_start_committed.commit_status, 'committed');
  assert.deepEqual(validateStage25ToStage26Handoff(result), []);
  assert.ok(received.every((payload) => !Object.hasOwn(payload, 'context') && !Object.hasOwn(payload, 'pipeline_context')));
  assert.equal(result.handoff_permission.can_start_stage_26, true);
});

test('Stage 25 input rejects global context and weakened policy', async () => {
  const { stage25Input } = await makeStage25Input();
  const withContext = { ...stage25Input, context: {} };
  assert.ok(validateStage25CommitInput(withContext).some((item) => item.code === 'STAGE25_FORBIDDEN_INPUT_FIELD'));
  assert.throws(() => normalizeStage25CommitPolicy({ require_dry_run: false }), /cannot weaken/u);
});

test('Stage 25 provided committed output is forbidden', () => {
  assert.throws(() => validateProvidedStage25Result(), /forbidden/u);
});

test('Stage 25 preflight requires every executor and exact Stage 24 digests', async () => {
  const { stage25Input } = await makeStage25Input();
  const preflight = buildStage25CommitPreflight(stage25Input, {});
  assert.equal(preflight.pass, false);
  assert.ok(preflight.concerns.some((item) => item.code === 'STAGE25_DRY_RUN_EXECUTOR_MISSING'));
  const stale = structuredClone(stage25Input);
  stale.stage24_result_approval.party_db_write_plan_digest = 'sha256:' + '0'.repeat(64);
  assert.ok(validateStage25CommitInput(stale).some((item) => item.code === 'STAGE25_PLAN_DIGEST_MISMATCH'));
});
