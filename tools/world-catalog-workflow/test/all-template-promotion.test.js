import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAllTemplateRevisionPromotionPlan } from '../src/all-template-promotion.js';

const ids = Array.from({ length: 120 }, (_, index) => `template_${index + 1}`);

test('strict promotion rejects 119 templates and an unverified operator source', () => {
  const plan = buildAllTemplateRevisionPromotionPlan({
    required_template_ids: ids,
    approved_record_ids_by_table: { item_templates: ids.slice(0, 119) },
    editorial_readiness_report: { report_digest: 'a'.repeat(64), approval_cohort_ready: false, summary: { ready_for_editorial_approval_count: 0 } },
    legacy_inventory_snapshot: { source: { verified: false }, complete: false },
    approval_attestation: { decision: 'approve_all_120', readiness_report_digest: 'a'.repeat(64), approved_by: 'editor', approved_at: '2026-07-16T09:00:00Z' }
  });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.errors.some((error) => error.code === 'APPROVAL_COHORT_INCOMPLETE'), true);
  assert.equal(plan.errors.some((error) => error.code === 'LEGACY_SOURCE_NOT_VERIFIED'), true);
  assert.deepEqual(plan.manifest.datasets, []);
  assert.equal(plan.activation.performed, false);
});
