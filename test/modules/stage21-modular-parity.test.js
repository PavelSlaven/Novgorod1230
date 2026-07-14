import test from 'node:test';
import assert from 'node:assert/strict';
import * as baseline20 from '../fixtures/stage20-21-baseline/stage20-visible-context.js';
import * as baseline from '../fixtures/stage20-21-baseline/stage21-visible-context-audit.js';
import * as modular20 from '@rus/new-game/stages/stage-20/compat';
import * as modular from '@rus/new-game/stages/stage-21/compat';
import {
  makeStage20Input,
  makeVisibleContextPackage,
  makeStage21Input,
  makePassingVisibleContextAudit,
  makeFailingVisibleContextAudit,
  makeVisibleContextRepairRoute
} from '../fixtures/stage20-21-fixtures.mjs';

async function makeStage20Results() {
  const input = makeStage20Input();
  const pkg = makeVisibleContextPackage(input);
  const executors = {
    build: async () => structuredClone(pkg),
    formatRepair: async () => structuredClone(pkg),
    semanticRepair: async () => structuredClone(pkg),
    seniorRepair: async () => structuredClone(pkg)
  };
  return {
    oldResult: await baseline20.runStage20VisibleContextBlock({ input: structuredClone(input), ...executors }),
    newResult: await modular20.runStage20VisibleContextBlock({ input: structuredClone(input), ...executors })
  };
}

test('Stage 21 compatibility API preserves every baseline export', () => {
  assert.deepEqual(Object.keys(modular).sort(), Object.keys(baseline).sort());
  assert.equal(Object.keys(modular).length, 21);
});

test('Stage 21 policy, input, reference index and independent precheck preserve baseline output', async () => {
  const { oldResult, newResult } = await makeStage20Results();
  const oldInput = makeStage21Input(oldResult);
  const newInput = makeStage21Input(newResult);
  assert.deepEqual(modular.normalizeStage21AuditPolicy(), baseline.normalizeStage21AuditPolicy());
  assert.deepEqual(modular.buildStage21VisibleContextAuditInput(newInput), baseline.buildStage21VisibleContextAuditInput(oldInput));
  assert.deepEqual(modular.validateStage21Input(newInput), baseline.validateStage21Input(oldInput));
  assert.deepEqual(modular.buildStage21ReferenceIndex(newInput), baseline.buildStage21ReferenceIndex(oldInput));
  assert.deepEqual(modular.buildStage21AuditCodePrecheck(newInput), baseline.buildStage21AuditCodePrecheck(oldInput));
});

test('Stage 21 successful audit orchestration preserves baseline output', async () => {
  const { oldResult, newResult } = await makeStage20Results();
  const oldInput = makeStage21Input(oldResult);
  const newInput = makeStage21Input(newResult);
  const oldAudit = makePassingVisibleContextAudit(oldInput);
  const newAudit = makePassingVisibleContextAudit(newInput);
  const oldExec = {
    auditor: async () => structuredClone(oldAudit),
    formatRepairer: async () => structuredClone(oldAudit),
    seniorAuditor: async () => structuredClone(oldAudit),
    auditRouter: async () => { throw new Error('router must not run'); }
  };
  const newExec = {
    auditor: async () => structuredClone(newAudit),
    formatRepairer: async () => structuredClone(newAudit),
    seniorAuditor: async () => structuredClone(newAudit),
    auditRouter: async () => { throw new Error('router must not run'); }
  };
  const oldAuditResult = await baseline.runStage21VisibleContextAuditBlock({ input: oldInput, ...oldExec });
  const newAuditResult = await modular.runStage21VisibleContextAuditBlock({ input: newInput, ...newExec });
  assert.deepEqual(newAuditResult, oldAuditResult);
  assert.equal(newAuditResult.pass, true);
});

test('Stage 21 audit format repair path preserves baseline output', async () => {
  const { oldResult, newResult } = await makeStage20Results();
  const oldInput = makeStage21Input(oldResult);
  const newInput = makeStage21Input(newResult);
  const oldAudit = makePassingVisibleContextAudit(oldInput);
  const newAudit = makePassingVisibleContextAudit(newInput);
  const oldExec = {
    auditor: async () => '{broken',
    formatRepairer: async () => structuredClone(oldAudit),
    seniorAuditor: async () => structuredClone(oldAudit),
    auditRouter: async () => { throw new Error('router must not run'); }
  };
  const newExec = {
    auditor: async () => '{broken',
    formatRepairer: async () => structuredClone(newAudit),
    seniorAuditor: async () => structuredClone(newAudit),
    auditRouter: async () => { throw new Error('router must not run'); }
  };
  const oldAuditResult = await baseline.runStage21VisibleContextAuditBlock({ input: oldInput, ...oldExec });
  const newAuditResult = await modular.runStage21VisibleContextAuditBlock({ input: newInput, ...newExec });
  assert.deepEqual(newAuditResult, oldAuditResult);
  assert.equal(newAuditResult.diagnostics.format_repair_attempts, 1);
});

test('Stage 21 failed audit routing preserves baseline output', async () => {
  const { oldResult, newResult } = await makeStage20Results();
  const oldInput = makeStage21Input(oldResult);
  const newInput = makeStage21Input(newResult);
  const oldAudit = makeFailingVisibleContextAudit(oldInput);
  const newAudit = makeFailingVisibleContextAudit(newInput);
  const oldRoute = makeVisibleContextRepairRoute(oldInput, oldAudit);
  const newRoute = makeVisibleContextRepairRoute(newInput, newAudit);
  const oldExec = {
    auditor: async () => structuredClone(oldAudit),
    formatRepairer: async () => structuredClone(oldAudit),
    seniorAuditor: async () => structuredClone(oldAudit),
    auditRouter: async () => structuredClone(oldRoute)
  };
  const newExec = {
    auditor: async () => structuredClone(newAudit),
    formatRepairer: async () => structuredClone(newAudit),
    seniorAuditor: async () => structuredClone(newAudit),
    auditRouter: async () => structuredClone(newRoute)
  };
  const oldAuditResult = await baseline.runStage21VisibleContextAuditBlock({ input: oldInput, ...oldExec });
  const newAuditResult = await modular.runStage21VisibleContextAuditBlock({ input: newInput, ...newExec });
  assert.deepEqual(newAuditResult, oldAuditResult);
  assert.equal(newAuditResult.pass, false);
  assert.equal(newAuditResult.repair_route.return_to_stage, 'stage20_visible_context');
});
