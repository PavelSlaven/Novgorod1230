import test from 'node:test';
import assert from 'node:assert/strict';
import * as baseline from '../fixtures/stage22-23-baseline/stage23-narrator-prose-audit-0.5.0.js';
import * as modular from '@rus/new-game/stages/stage-23/compat';
import {
  makeFailingNarratorAudit,
  makeNarratorRepairRoute,
  makePassingNarratorAudit,
  makeStage23Input
} from '../fixtures/stage22-23-fixtures.mjs';

test('Stage 23 compatibility API preserves every baseline export', () => {
  assert.deepEqual(Object.keys(modular).sort(), Object.keys(baseline).sort());
  assert.equal(Object.keys(modular).length, 23);
});

test('Stage 23 policy, input and precheck preserve baseline output', () => {
  const input = makeStage23Input();
  assert.deepEqual(modular.normalizeStage23AuditPolicy(), baseline.normalizeStage23AuditPolicy());
  assert.deepEqual(modular.buildStage23AuditInput(input), baseline.buildStage23AuditInput(input));
  assert.deepEqual(modular.validateStage23AuditInput(input), baseline.validateStage23AuditInput(input));
  assert.deepEqual(modular.buildNarratorProseCodePrecheck(input), baseline.buildNarratorProseCodePrecheck(input));
  assert.equal(modular.computeNarratorStartingProseDigest(input.narrator_starting_prose), baseline.computeNarratorStartingProseDigest(input.narrator_starting_prose));
});

test('Stage 23 audit and route validators preserve baseline output', () => {
  const input = makeStage23Input();
  const passAudit = makePassingNarratorAudit(input);
  const failAudit = makeFailingNarratorAudit(input);
  const route = makeNarratorRepairRoute(input);
  assert.deepEqual(modular.validateNarratorProseAudit(passAudit, input), baseline.validateNarratorProseAudit(passAudit, input));
  assert.deepEqual(modular.validateNarratorProseAudit(failAudit, input, { allowRouteMissing: true }), baseline.validateNarratorProseAudit(failAudit, input, { allowRouteMissing: true }));
  assert.deepEqual(modular.validateStage23RepairRoute(route, failAudit), baseline.validateStage23RepairRoute(route, failAudit));
});

test('Stage 23 full successful orchestration preserves baseline output', async () => {
  const input = makeStage23Input();
  const audit = makePassingNarratorAudit(input);
  const executors = {
    auditor: async () => structuredClone(audit),
    formatRepairer: async () => structuredClone(audit),
    seniorAuditor: async () => structuredClone(audit),
    router: async () => { throw new Error('router must not run on pass'); }
  };
  const oldResult = await baseline.runStage23NarratorProseAuditBlock({ input: structuredClone(input), ...executors });
  const newResult = await modular.runStage23NarratorProseAuditBlock({ input: structuredClone(input), ...executors });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.pass, true);
});

test('Stage 23 failed audit routing preserves baseline output', async () => {
  const input = makeStage23Input();
  const audit = makeFailingNarratorAudit(input);
  const route = makeNarratorRepairRoute(input);
  const executors = {
    auditor: async () => structuredClone(audit),
    formatRepairer: async () => structuredClone(audit),
    seniorAuditor: async () => structuredClone(audit),
    router: async () => structuredClone(route)
  };
  const oldResult = await baseline.runStage23NarratorProseAuditBlock({ input: structuredClone(input), ...executors });
  const newResult = await modular.runStage23NarratorProseAuditBlock({ input: structuredClone(input), ...executors });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.pass, false);
  assert.equal(newResult.repair_route.return_to_stage, 'narrator_prose_semantic_repair');
});

test('Stage 23 audit format-repair path preserves baseline output', async () => {
  const input = makeStage23Input();
  const audit = makePassingNarratorAudit(input);
  const makeExecutors = () => ({
    auditor: async () => '{broken',
    formatRepairer: async () => structuredClone(audit),
    seniorAuditor: async () => structuredClone(audit),
    router: async () => { throw new Error('router must not run'); }
  });
  const oldResult = await baseline.runStage23NarratorProseAuditBlock({ input: structuredClone(input), ...makeExecutors() });
  const newResult = await modular.runStage23NarratorProseAuditBlock({ input: structuredClone(input), ...makeExecutors() });
  assert.deepEqual(newResult, oldResult);
  assert.equal(newResult.diagnostics.format_repair_attempts, 1);
});
