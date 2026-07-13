import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisibleContextAuditApproval } from '@rus/contracts';
import * as stage20 from '@rus/new-game/stages/stage-20/compat';
import * as stage21 from '@rus/new-game/stages/stage-21/compat';
import { buildStage22NarratorInput, validateStage22Input } from '@rus/new-game/stages/stage-22/compat';
import { stage20Definition, stage21Definition } from '@rus/new-game';
import { makeStage20Input, makeVisibleContextPackage, makeStage21Input, makePassingVisibleContextAudit } from '../fixtures/stage20-21-fixtures.mjs';

test('Stage 20 -> Stage 21 -> Stage 22 handoff is fully modular', async () => {
  const input20 = makeStage20Input();
  const pkg = makeVisibleContextPackage(input20);
  const result20 = await stage20.runStage20VisibleContextBlock({
    input: input20,
    build: async () => structuredClone(pkg),
    formatRepair: async () => structuredClone(pkg),
    semanticRepair: async () => structuredClone(pkg),
    seniorRepair: async () => structuredClone(pkg)
  });
  const input21 = makeStage21Input(result20);
  const audit = makePassingVisibleContextAudit(input21);
  const result21 = await stage21.runStage21VisibleContextAuditBlock({
    input: input21,
    auditor: async () => structuredClone(audit),
    formatRepairer: async () => structuredClone(audit),
    seniorAuditor: async () => structuredClone(audit),
    auditRouter: async () => { throw new Error('router must not run'); }
  });
  const approval = buildVisibleContextAuditApproval(result21);
  const input22 = buildStage22NarratorInput({
    request_id: result20.request_id,
    visible_context_package: result20.visible_context_package,
    visible_context_package_digest: result20.visible_context_package_digest,
    visible_context_approval: approval,
    narrator_policy: {}
  });
  assert.deepEqual(validateStage22Input(input22), []);
  assert.equal(approval.pass, true);
});

test('declarative Stage 20 and Stage 21 definitions execute modular runners', async () => {
  const input20 = makeStage20Input();
  const pkg = makeVisibleContextPackage(input20);
  const executed20 = await stage20Definition.execute({
    input: input20,
    services: { stage20: {
      build: async () => structuredClone(pkg),
      formatRepair: async () => structuredClone(pkg),
      semanticRepair: async () => structuredClone(pkg),
      seniorRepair: async () => structuredClone(pkg)
    } }
  });
  assert.equal(executed20.status, 'approved');
  const input21 = makeStage21Input(executed20.artifact);
  const audit = makePassingVisibleContextAudit(input21);
  const executed21 = await stage21Definition.execute({
    input: input21,
    services: { stage21: {
      auditor: async () => structuredClone(audit),
      formatRepairer: async () => structuredClone(audit),
      seniorAuditor: async () => structuredClone(audit),
      auditRouter: async () => { throw new Error('router must not run'); }
    } }
  });
  assert.equal(executed21.status, 'approved');
});
