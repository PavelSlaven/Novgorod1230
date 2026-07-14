import test from 'node:test';
import assert from 'node:assert/strict';
import * as baseline from '../fixtures/stage22-23-baseline/stage22-narrator-prose-0.5.0.js';
import * as modular from '@rus/new-game/stages/stage-22/compat';
import { makeNarratorProse, makeStage22Input } from '../fixtures/stage22-23-fixtures.mjs';

test('Stage 22 compatibility API preserves every baseline export', () => {
  assert.deepEqual(Object.keys(modular).sort(), Object.keys(baseline).sort());
  assert.equal(Object.keys(modular).length, 22);
});

test('Stage 22 policy, input, references and precheck preserve baseline output', () => {
  const input = makeStage22Input();
  assert.deepEqual(modular.normalizeStage22NarratorPolicy(), baseline.normalizeStage22NarratorPolicy());
  assert.deepEqual(modular.buildStage22NarratorInput(input), baseline.buildStage22NarratorInput(input));
  assert.deepEqual(modular.validateStage22Input(input), baseline.validateStage22Input(input));
  const oldIndex = baseline.buildStage22ReferenceIndex(input);
  const newIndex = modular.buildStage22ReferenceIndex(input);
  assert.deepEqual(newIndex.summary, oldIndex.summary);
  assert.deepEqual([...newIndex.allVisibleRefs].sort(), [...oldIndex.allVisibleRefs].sort());
  assert.deepEqual(modular.buildNarratorStartCodePrecheck(input), baseline.buildNarratorStartCodePrecheck(input));
});

test('Stage 22 prose validation preserves concerns and order', () => {
  const input = makeStage22Input();
  const precheck = modular.buildNarratorStartCodePrecheck(input);
  const prose = makeNarratorProse();
  assert.deepEqual(
    modular.validateNarratorStartingProseOutput(prose, input, precheck),
    baseline.validateNarratorStartingProseOutput(prose, input, baseline.buildNarratorStartCodePrecheck(input))
  );
});

test('Stage 22 full successful orchestration preserves baseline output', async () => {
  const input = makeStage22Input();
  const prose = makeNarratorProse();
  const executors = {
    writer: async () => structuredClone(prose),
    formatRepairer: async () => structuredClone(prose),
    seniorWriter: async () => structuredClone(prose)
  };
  const oldResult = await baseline.runStage22NarratorProseBlock({ input: structuredClone(input), ...executors });
  const newResult = await modular.runStage22NarratorProseBlock({ input: structuredClone(input), ...executors });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.pass, true);
});

test('Stage 22 writer format-repair path preserves baseline output', async () => {
  const input = makeStage22Input();
  const prose = makeNarratorProse();
  const makeExecutors = () => ({
    writer: async () => '{broken',
    formatRepairer: async () => structuredClone(prose),
    seniorWriter: async () => structuredClone(prose)
  });
  const oldResult = await baseline.runStage22NarratorProseBlock({ input: structuredClone(input), ...makeExecutors() });
  const newResult = await modular.runStage22NarratorProseBlock({ input: structuredClone(input), ...makeExecutors() });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.diagnostics.format_repair_attempts, 1);
});

test('Stage 22 semantic repair path preserves baseline output', async () => {
  const input = makeStage22Input();
  const prose = makeNarratorProse();
  const failedResult = {
    narrator_starting_prose: structuredClone(prose),
    generation_history: [],
    diagnostics: { writer_attempts: 1, format_repair_attempts: 0, senior_writer_attempts: 0, semantic_repair_attempts: 0 }
  };
  const proseAudit = {
    version: 1,
    schema: 'narrator_prose_audit',
    request_id: input.request_id,
    pass: false,
    concerns: [{ code: 'NARRATOR_PROSE_ADDED_FACT', severity: 'repairable', message: 'repair' }],
    evidence: ['repair evidence'],
    repair_route: { return_to_stage: 'narrator_prose_semantic_repair' }
  };
  const executors = {
    semanticRepairer: async () => structuredClone(prose),
    formatRepairer: async () => structuredClone(prose),
    seniorRepairer: async () => structuredClone(prose)
  };
  const oldResult = await baseline.runStage22SemanticRepairBlock({ input: structuredClone(input), failedResult: structuredClone(failedResult), proseAudit: structuredClone(proseAudit), ...executors });
  const newResult = await modular.runStage22SemanticRepairBlock({ input: structuredClone(input), failedResult: structuredClone(failedResult), proseAudit: structuredClone(proseAudit), ...executors });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.diagnostics.semantic_repair_attempts, 1);
});
