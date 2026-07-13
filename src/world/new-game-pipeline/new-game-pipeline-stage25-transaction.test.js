import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeApprovedAtomicTransaction,
  executeAtomicPartyWritePlan,
  executeDryRunTransaction
} from '../src/world/new-game-pipeline/commit/party-transaction.js';
import {
  buildCommitGateApproval,
  buildCommitGateResult,
  buildStage25CommitPreflight
} from '../src/world/new-game-pipeline/stages/stage25-party-commit.js';
import { makeDryRunResult, makeIdempotencyResult, makeStage25Input } from './stage25-fixtures.mjs';

function mockClient({ rowCount = 1, exists = true } = {}) {
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (/^INSERT|^UPDATE/u.test(sql)) return { rowCount, rows: rowCount ? [{ id: 'party-24' }] : [] };
      if (/SELECT EXISTS/u.test(sql)) return { rowCount: 1, rows: [{ ok: exists }] };
      return { rowCount: 0, rows: [] };
    }
  };
}

async function approvedTransactionInput() {
  const { stage25Input } = await makeStage25Input();
  const preflight = buildStage25CommitPreflight(stage25Input, {
    idempotencyChecker: async (payload) => makeIdempotencyResult(stage25Input, payload.physical_write_plan_digest),
    dryRunExecutor: async () => null,
    transactionExecutor: async () => null,
    postcommitReader: async () => null
  });
  const dryRun = makeDryRunResult({ request_id: stage25Input.request_id, physical_write_plan_digest: preflight.digests.physical_plan_digest, physical_write_plan: preflight.physical_write_plan });
  const gate = buildCommitGateResult({ input: stage25Input, preflight, dryRunResult: dryRun });
  return {
    version: 1,
    schema: 'approved_party_transaction_input',
    request_id: stage25Input.request_id,
    party_creation_context: stage25Input.party_creation_context,
    commit_gate_approval: buildCommitGateApproval(gate),
    physical_write_plan: preflight.physical_write_plan,
    physical_write_plan_digest: preflight.digests.physical_plan_digest,
    party_database_schema: stage25Input.party_database_schema,
    postconditions: stage25Input.party_db_write_plan.postconditions
  };
}

test('direct raw-plan transaction bypass is forbidden', async () => {
  await assert.rejects(() => executeAtomicPartyWritePlan({ schema: 'party_db_write_plan' }, { client: mockClient() }), /DIRECT_TRANSACTION_EXECUTOR_FORBIDDEN/u);
});

test('approved transaction checks rowCount, postconditions and commits', async () => {
  const input = await approvedTransactionInput();
  const client = mockClient();
  const result = await executeApprovedAtomicTransaction(input, {
    client,
    evaluatePostcondition: async () => true
  });
  assert.equal(result.commit_status, 'committed');
  assert.ok(client.queries.includes('BEGIN'));
  assert.ok(client.queries.includes('COMMIT'));
  assert.ok(!client.queries.includes('ROLLBACK'));
});

test('zero-row write rolls back and fails', async () => {
  const input = await approvedTransactionInput();
  const client = mockClient({ rowCount: 0 });
  await assert.rejects(() => executeApprovedAtomicTransaction(input, { client, evaluatePostcondition: async () => true }), /affected zero rows/u);
  assert.ok(client.queries.includes('ROLLBACK'));
});

test('database dry-run always rolls back exact physical plan', async () => {
  const input = await approvedTransactionInput();
  const client = mockClient();
  const result = await executeDryRunTransaction({
    version: 1,
    schema: 'party_write_plan_dry_run_input',
    request_id: input.request_id,
    party_creation_context: input.party_creation_context,
    physical_write_plan: input.physical_write_plan,
    physical_write_plan_digest: input.physical_write_plan_digest,
    party_database_schema: input.party_database_schema
  }, { client, evaluatePostcondition: async () => true });
  assert.equal(result.pass, true);
  assert.equal(result.rollback_completed, true);
  assert.ok(client.queries.includes('ROLLBACK'));
  assert.ok(!client.queries.includes('COMMIT'));
});
