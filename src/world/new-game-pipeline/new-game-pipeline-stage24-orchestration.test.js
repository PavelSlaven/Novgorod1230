import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runNewGameLlmStage } from '../src/world/new-game-pipeline/stages/llm-stages.js';
import { createNewGamePipelineContext } from '../src/world/new-game-pipeline/context.js';
import { validateProvidedStage24Result } from '../src/world/new-game-pipeline/stages/stage24-party-db-write-plan.js';

const indexPath = new URL('../src/world/new-game-pipeline/index.js', import.meta.url);
const matrixPath = new URL('../src/world/new-game-pipeline/llm-matrix.js', import.meta.url);
const writePlanPath = new URL('../src/world/new-game-pipeline/commit/write-plan.js', import.meta.url);

test('generic Stage 24 LLM API is blocked because Stage 24 is isolated', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req-24', env: { NODE_ENV: 'test' } });
  await assert.rejects(() => runNewGameLlmStage(context, 24, { executor: async () => ({}) }), /isolated block/);
});

test('provided Stage 24 input, write plan or audit is forbidden', () => {
  assert.throws(() => validateProvidedStage24Result(), /forbidden in all environments/);
});

test('index orchestrates Stage 24 through pure block and required role callbacks', async () => {
  const source = await readFile(indexPath, 'utf8');
  assert.ok(source.includes('runStage24PartyDbWritePlanBlock'));
  assert.ok(source.includes("selectRequiredCallback(options, 'stage24Builder'"));
  assert.ok(source.includes("selectRequiredCallback(options, 'stage24Auditor'"));
  assert.ok(source.includes("selectRequiredCallback(options, 'stage24Router'"));
  assert.ok(source.includes('buildApprovedPipelineManifest'));
  assert.ok(source.includes('commitStage24Result'));
  assert.equal(source.includes('defaultPartyDatabaseSchema'), false);
  assert.equal(source.includes("?? 'pc_001'"), false);
  assert.ok(source.includes('fallback IDs are forbidden'));
});

test('legacy context based write-plan runner is disabled', async () => {
  const source = await readFile(writePlanPath, 'utf8');
  assert.ok(source.includes('Legacy context-based Stage 24 runner is disabled'));
  assert.equal(source.includes('builder({ context'), false);
  assert.equal(source.includes('auditor({\n  context'), false);
});

test('LLM matrix declares Stage 24 isolated roles, schemas and forbidden provided output', async () => {
  const source = await readFile(matrixPath, 'utf8');
  const start = source.indexOf("stage(24, 'party_write_plan'");
  const end = source.indexOf("stage(25, 'party_commit_gate'", start);
  const block = source.slice(start, end);
  assert.ok(block.includes("primary_executor: 'isolated_llm_block'"));
  assert.ok(block.includes("code_precheck_schema: 'party_db_write_plan_code_precheck'"));
  assert.ok(block.includes("audit_format_repairer_role: 'PartyDbWritePlanAuditFormatRepairer'"));
  assert.ok(block.includes("router_role: 'PartyDbWritePlanAuditRouter'"));
  assert.ok(block.includes("provided_output_policy: 'forbidden_all_environments'"));
});
