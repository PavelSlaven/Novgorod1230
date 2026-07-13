import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexPath = new URL('../src/world/new-game-pipeline/index.js', import.meta.url);
const stagePath = new URL('../src/world/new-game-pipeline/stages/stage25-party-commit.js', import.meta.url);
const screenPath = new URL('../src/world/new-game-pipeline/screens/first-game-screen.js', import.meta.url);
const matrixPath = new URL('../src/world/new-game-pipeline/llm-matrix.js', import.meta.url);

test('Stage 25 orchestration requires real infrastructure and forbids committed-state overrides', async () => {
  const source = await readFile(indexPath, 'utf8');
  assert.ok(source.includes('runStage25PartyCommitBlock'));
  assert.ok(source.includes('executeDryRunTransaction'));
  assert.ok(source.includes('executeApprovedAtomicTransaction'));
  assert.ok(source.includes('readCommittedPartyState'));
  assert.ok(source.includes("forbiddenKey of ['partyStartCommitted'"));
  assert.equal(source.includes('persistPartyStart === true'), false);
  assert.equal(source.includes('deriveCommittedPartyState'), false);
});

test('Stage 25 isolated block receives exact input and explicit infrastructure only', async () => {
  const source = await readFile(stagePath, 'utf8');
  const start = source.indexOf('export async function runStage25PartyCommitBlock');
  const end = source.indexOf('export function buildCommitGateResult', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.equal(block.includes('{ context'), false);
  assert.equal(/\bcontext\./u.test(block), false);
  assert.ok(block.includes('dryRunExecutor'));
  assert.ok(block.includes('transactionExecutor'));
  assert.ok(block.includes('postcommitReader'));
  assert.ok(block.includes('physical_write_plan_digest'));
});

test('Stage 26 requires Stage 25 approval bound to the real committed transaction', async () => {
  const source = await readFile(screenPath, 'utf8');
  assert.ok(source.includes('stage25_party_commit_approval'));
  assert.ok(source.includes('validateStage25ToStage26Handoff'));
  assert.ok(source.includes('transaction_id'));
  assert.ok(source.includes('commit_status'));
});

test('LLM matrix declares Stage 25 as isolated code-only block', async () => {
  const source = await readFile(matrixPath, 'utf8');
  const start = source.indexOf("stage(25, 'party_commit'");
  const end = source.indexOf('stage(26', start);
  const block = source.slice(start, end > start ? end : undefined);
  assert.ok(block.includes("primary_executor: 'isolated_code_block'"));
  assert.ok(block.includes("input_schema: 'commit_gate_input'"));
  assert.ok(block.includes("output_schema: 'stage25_party_start_commit_result'"));
  assert.ok(block.includes("provided_output_policy: 'forbidden_all_environments'"));
});
