import test from 'node:test';
import assert from 'node:assert/strict';
import * as baseline from '../fixtures/stage20-21-baseline/stage20-visible-context.js';
import * as modular from '@rus/new-game/stages/stage-20/compat';
import { makeStage20Input, makeVisibleContextPackage } from '../fixtures/stage20-21-fixtures.mjs';

test('Stage 20 compatibility API preserves every baseline export', () => {
  assert.deepEqual(Object.keys(modular).sort(), Object.keys(baseline).sort());
  assert.equal(Object.keys(modular).length, 17);
});

test('Stage 20 policy, input, references, visibility filter and precheck preserve baseline output', () => {
  const input = makeStage20Input();
  const pkg = makeVisibleContextPackage(input);
  assert.deepEqual(modular.normalizeStage20VisibleContextPolicy(), baseline.normalizeStage20VisibleContextPolicy());
  assert.deepEqual(modular.buildStage20VisibleContextInput(input), baseline.buildStage20VisibleContextInput(input));
  assert.deepEqual(modular.validateStage20Input(input), baseline.validateStage20Input(input));
  const oldRefs = baseline.buildStage20ReferenceIndex(input);
  const newRefs = modular.buildStage20ReferenceIndex(input);
  assert.deepEqual(newRefs, oldRefs);
  const oldFilter = baseline.buildStage20VisibilityFilter(input, oldRefs);
  const newFilter = modular.buildStage20VisibilityFilter(input, newRefs);
  assert.deepEqual(newFilter, oldFilter);
  assert.deepEqual(modular.validateVisibleContextPackage(pkg, input, newRefs, newFilter), baseline.validateVisibleContextPackage(pkg, input, oldRefs, oldFilter));
  assert.deepEqual(modular.buildVisibleContextCodePrecheck(pkg, input, newRefs, newFilter), baseline.buildVisibleContextCodePrecheck(pkg, input, oldRefs, oldFilter));
});

test('Stage 20 full successful orchestration preserves baseline output', async () => {
  const input = makeStage20Input();
  const pkg = makeVisibleContextPackage(input);
  const executors = {
    build: async () => structuredClone(pkg),
    formatRepair: async () => structuredClone(pkg),
    semanticRepair: async () => structuredClone(pkg),
    seniorRepair: async () => structuredClone(pkg)
  };
  const oldResult = await baseline.runStage20VisibleContextBlock({ input: structuredClone(input), ...executors });
  const newResult = await modular.runStage20VisibleContextBlock({ input: structuredClone(input), ...executors });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.pass, true);
});

test('Stage 20 format repair path preserves baseline output', async () => {
  const input = makeStage20Input();
  const pkg = makeVisibleContextPackage(input);
  const makeExecutors = () => ({
    build: async () => '{broken',
    formatRepair: async () => structuredClone(pkg),
    semanticRepair: async () => structuredClone(pkg),
    seniorRepair: async () => structuredClone(pkg)
  });
  const oldResult = await baseline.runStage20VisibleContextBlock({ input: structuredClone(input), ...makeExecutors() });
  const newResult = await modular.runStage20VisibleContextBlock({ input: structuredClone(input), ...makeExecutors() });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.repair_history[0].kind, 'format');
});

test('Stage 20 semantic and senior repair escalation preserves baseline output', async () => {
  const input = makeStage20Input();
  const valid = makeVisibleContextPackage(input);
  const invalid = makeVisibleContextPackage(input, {
    visible_scene_facts: [{ visible_fact_id: 'fact-bad', label: 'Ложный факт.', source_refs: ['unknown-ref'] }]
  });
  const makeExecutors = () => ({
    build: async () => structuredClone(invalid),
    formatRepair: async ({ parsed_output }) => structuredClone(parsed_output),
    semanticRepair: async () => structuredClone(invalid),
    seniorRepair: async () => structuredClone(valid)
  });
  const oldResult = await baseline.runStage20VisibleContextBlock({ input: structuredClone(input), ...makeExecutors() });
  const newResult = await modular.runStage20VisibleContextBlock({ input: structuredClone(input), ...makeExecutors() });
  assert.deepEqual(newResult, oldResult);
  assert.deepEqual(newResult.repair_history.map((item) => item.kind), ['semantic', 'senior_semantic']);
});
