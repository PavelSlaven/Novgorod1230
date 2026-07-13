import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNarratorProseAuditApproval } from '@rus/contracts';
import * as stage22 from '@rus/new-game/stages/stage-22/compat';
import * as stage23 from '@rus/new-game/stages/stage-23/compat';
import { makeNarratorProse, makePassingNarratorAudit, makeStage22Input, makeStage22VisiblePackage } from '../fixtures/stage22-23-fixtures.mjs';

test('Stage 22 result passes Stage 23 audit and commit handoff', async () => {
  const input22 = makeStage22Input();
  const prose = makeNarratorProse();
  const result22 = await stage22.runStage22NarratorProseBlock({
    input: input22,
    writer: async () => structuredClone(prose),
    formatRepairer: async () => structuredClone(prose),
    seniorWriter: async () => structuredClone(prose)
  });
  const input23 = stage23.buildStage23AuditInput({
    request_id: input22.request_id,
    visible_context_package: input22.visible_context_package,
    visible_context_package_digest: input22.visible_context_package_digest,
    visible_context_approval: input22.visible_context_approval,
    stage22_result: result22
  });
  const audit = makePassingNarratorAudit(input23);
  const result23 = await stage23.runStage23NarratorProseAuditBlock({
    input: input23,
    auditor: async () => structuredClone(audit),
    formatRepairer: async () => structuredClone(audit),
    seniorAuditor: async () => structuredClone(audit),
    router: async () => { throw new Error('router must not run'); }
  });
  assert.deepEqual(stage23.validateStage23CommitHandoff({
    request_id: input22.request_id,
    visible_context_package: makeStage22VisiblePackage(),
    stage22_result: result22,
    stage23_result: result23
  }), []);
  const approval = buildNarratorProseAuditApproval(result23);
  assert.equal(approval.pass, true);
  assert.equal(approval.permissions.can_show_to_player, true);
});

test('declarative Stage 22 and Stage 23 definitions execute modular runners', async () => {
  const { stage22Definition } = await import('@rus/new-game/stages/stage-22');
  const { stage23Definition } = await import('@rus/new-game/stages/stage-23');
  const input22 = makeStage22Input();
  const prose = makeNarratorProse();
  const execution22 = await stage22Definition.execute({
    input: input22,
    services: {
      writer: async () => structuredClone(prose),
      formatRepairer: async () => structuredClone(prose),
      seniorWriter: async () => structuredClone(prose)
    }
  });
  assert.equal(execution22.status, 'approved');
  const input23 = stage23.buildStage23AuditInput({
    request_id: input22.request_id,
    visible_context_package: input22.visible_context_package,
    visible_context_package_digest: input22.visible_context_package_digest,
    visible_context_approval: input22.visible_context_approval,
    stage22_result: execution22.artifact
  });
  const audit = makePassingNarratorAudit(input23);
  const execution23 = await stage23Definition.execute({
    input: input23,
    services: {
      auditor: async () => structuredClone(audit),
      formatRepairer: async () => structuredClone(audit),
      seniorAuditor: async () => structuredClone(audit),
      router: async () => { throw new Error('router must not run'); }
    }
  });
  assert.equal(execution23.status, 'approved');
});
