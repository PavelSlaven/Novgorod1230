import test from 'node:test';
import assert from 'node:assert/strict';
import * as stage20 from '@rus/new-game/stages/stage-20/compat';
import * as stage21 from '@rus/new-game/stages/stage-21/compat';
import {
  makeStage20Input,
  makeVisibleContextPackage,
  makeStage21Input,
  makePassingVisibleContextAudit,
  makeFailingVisibleContextAudit,
  makeVisibleContextRepairRoute
} from '../fixtures/stage20-21-fixtures.mjs';

async function makeInput21() {
  const input = makeStage20Input();
  const pkg = makeVisibleContextPackage(input);
  const result = await stage20.runStage20VisibleContextBlock({
    input,
    build: async () => pkg,
    formatRepair: async () => pkg,
    semanticRepair: async () => pkg,
    seniorRepair: async () => pkg
  });
  return makeStage21Input(result);
}

test('Stage 21 independently detects a hidden leak even if Stage 20 precheck is stale', async () => {
  const input = await makeInput21();
  input.visible_context_package.visible_scene_facts[0].private_motive = 'secret';
  input.visible_context_package_digest = (await import('@rus/contracts')).computeVisibleContextPackageDigest(input.visible_context_package);
  const precheck = stage21.buildStage21AuditCodePrecheck(input);
  assert.equal(precheck.pass, false);
  assert.ok(precheck.concerns.some((item) => item.code === 'VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK'));
});

test('Stage 21 rejects audit output that embeds the audited package', async () => {
  const input = await makeInput21();
  const precheck = stage21.buildStage21AuditCodePrecheck(input);
  const audit = makePassingVisibleContextAudit(input);
  audit.visible_context_package = structuredClone(input.visible_context_package);
  const codes = stage21.validateVisibleContextAuditOutput(audit, input, precheck).map((item) => item.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_AUDIT_MUTATED_PACKAGE'));
});

test('Stage 21 rejects incompatible repair routes', async () => {
  const input = await makeInput21();
  const audit = makeFailingVisibleContextAudit(input, 'VISIBLE_CONTEXT_G5_AUDIT_CONFLICT');
  const route = makeVisibleContextRepairRoute(input, audit, { return_to_stage: 'stage20_visible_context' });
  const codes = stage21.validateStage21RepairRoute(route, audit).map((item) => item.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_AUDIT_ROUTE_TARGET_INCOMPATIBLE'));
});

test('Stage 21 detects stale package digest', async () => {
  const input = await makeInput21();
  input.visible_context_package_digest = 'sha256:stale';
  const codes = stage21.validateStage21Input(input).map((item) => item.code);
  assert.ok(codes.includes('VISIBLE_CONTEXT_AUDIT_PACKAGE_DIGEST_MISMATCH'));
});
