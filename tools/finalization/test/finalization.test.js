import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalizationReport, parseManualChecklist, validateFinalizationPlan } from '../src/index.js';

const plan = {
  schema_version: 'rus.finalization_plan.v1',
  plan_id: 'test', release: 'test',
  automated_evidence: Array.from({ length: 6 }, (_, index) => ({ id: `auto-${index}`, path: `e${index}` })),
  manual_gates: [
    { id: 'm1', required_actor: 'operator', checklist_marker: 'live' },
    { id: 'm2', required_actor: 'operator', checklist_marker: 'archive' },
    { id: 'm3', required_actor: 'auditor', checklist_marker: 'unique' },
    { id: 'm4', required_actor: 'owner', checklist_marker: 'delete' }
  ],
  safety: { automatic_legacy_deletion: false, modify_live_environment: false, accept_secrets: false }
};

test('finalization plan preserves the four manual gates and deletion prohibition', () => {
  const validated = validateFinalizationPlan(plan);
  assert.equal(validated.manual_gates.length, 4);
  assert.equal(validated.safety.automatic_legacy_deletion, false);
});

test('manual checklist is fail-closed when operator confirmations are absent', () => {
  const parsed = parseManualChecklist('- [ ] live\n- [x] archive\n- [ ] unique\n- [ ] delete\n', plan.manual_gates);
  assert.deepEqual(parsed.map((item) => item.checked), [false, true, false, false]);
});

test('successful automation with pending operator gates produces manual hold', () => {
  const evidence = {
    files: [],
    checks: [{ id: 'auto', passed: true }],
    manual: plan.manual_gates.map((item) => ({ id: item.id, required_actor: item.required_actor, checked: false, found: true, text: item.checklist_marker }))
  };
  const report = buildFinalizationReport({ plan, evidence, runId: 'run', startedAt: 'a', completedAt: 'b' });
  assert.equal(report.recommendation.decision, 'automation_complete_manual_hold');
  assert.equal(report.recommendation.legacy_deletion_allowed, false);
});

test('failed automated gate blocks finalization independently of manual state', () => {
  const evidence = {
    files: [],
    checks: [{ id: 'auto', passed: false }],
    manual: plan.manual_gates.map((item) => ({ id: item.id, required_actor: item.required_actor, checked: true, found: true, text: item.checklist_marker }))
  };
  const report = buildFinalizationReport({ plan, evidence, runId: 'run', startedAt: 'a', completedAt: 'b' });
  assert.equal(report.recommendation.decision, 'no_go');
});
