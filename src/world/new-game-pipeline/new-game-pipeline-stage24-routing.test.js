import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage24PartyDbWritePlanBlock } from '../src/world/new-game-pipeline/stages/stage24-party-db-write-plan.js';
import { makeAudit, makeInput, makePlan, makeRoute } from './stage24-fixtures.mjs';

test('plan format repair is separate and followed by full audit', async () => {
  const input = makeInput();
  const plan = makePlan(input);
  let formatCalls = 0;
  let auditCalls = 0;
  const result = await runStage24PartyDbWritePlanBlock({
    input,
    builder: async () => '```json\n{invalid\n```',
    planFormatRepairer: async () => { formatCalls += 1; return plan; },
    auditor: async () => { auditCalls += 1; return makeAudit(plan, true); },
    auditFormatRepairer: async ({ parsed_audit_response }) => parsed_audit_response,
    router: async () => { throw new Error('router must not run'); },
    semanticRepairer: async () => plan,
    seniorSemanticRepairer: async () => plan,
    seniorBuilder: async () => plan,
    seniorAuditor: async () => makeAudit(plan, true)
  });
  assert.equal(result.pass, true);
  assert.ok(formatCalls >= 1);
  assert.equal(auditCalls, 1);
});

test('semantic repair always ends with a new audit', async () => {
  const input = makeInput();
  const plan = makePlan(input);
  let audits = 0;
  let repairs = 0;
  const result = await runStage24PartyDbWritePlanBlock({
    input,
    builder: async () => plan,
    planFormatRepairer: async () => plan,
    auditor: async () => { audits += 1; return audits === 1 ? makeAudit(plan, false) : makeAudit(plan, true); },
    auditFormatRepairer: async ({ parsed_audit_response }) => parsed_audit_response,
    router: async ({ concerns }) => makeRoute({ request_id: 'req-24', concerns }),
    semanticRepairer: async () => { repairs += 1; return plan; },
    seniorSemanticRepairer: async () => plan,
    seniorBuilder: async () => plan,
    seniorAuditor: async () => makeAudit(plan, true)
  });
  assert.equal(result.pass, true);
  assert.equal(repairs, 1);
  assert.equal(audits, 2);
});

test('second semantic repair escalates to senior and is re-audited', async () => {
  const input = makeInput();
  const plan = makePlan(input);
  let audits = 0;
  let normalRepairs = 0;
  let seniorRepairs = 0;
  const result = await runStage24PartyDbWritePlanBlock({
    input,
    builder: async () => plan,
    planFormatRepairer: async () => plan,
    auditor: async () => { audits += 1; return audits <= 2 ? makeAudit(plan, false) : makeAudit(plan, true); },
    auditFormatRepairer: async ({ parsed_audit_response }) => parsed_audit_response,
    router: async ({ concerns }) => makeRoute({ request_id: 'req-24', concerns }),
    semanticRepairer: async () => { normalRepairs += 1; return plan; },
    seniorSemanticRepairer: async () => { seniorRepairs += 1; return plan; },
    seniorBuilder: async () => plan,
    seniorAuditor: async () => makeAudit(plan, true)
  });
  assert.equal(result.pass, true);
  assert.equal(normalRepairs, 1);
  assert.equal(seniorRepairs, 1);
  assert.equal(audits, 3);
});

test('invalid audit JSON uses audit format repair before senior auditor', async () => {
  const input = makeInput();
  const plan = makePlan(input);
  let auditFormatCalls = 0;
  let seniorAuditCalls = 0;
  const result = await runStage24PartyDbWritePlanBlock({
    input,
    builder: async () => plan,
    planFormatRepairer: async () => plan,
    auditor: async () => '{invalid',
    auditFormatRepairer: async () => { auditFormatCalls += 1; return makeAudit(plan, true); },
    router: async () => { throw new Error('router must not run'); },
    semanticRepairer: async () => plan,
    seniorSemanticRepairer: async () => plan,
    seniorBuilder: async () => plan,
    seniorAuditor: async () => { seniorAuditCalls += 1; return makeAudit(plan, true); }
  });
  assert.equal(result.pass, true);
  assert.equal(auditFormatCalls, 1);
  assert.equal(seniorAuditCalls, 0);
});
