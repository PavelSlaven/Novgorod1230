import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalogEditorialReadinessReport, buildCoherentEditorialApprovalPlan, buildEditorialEvidenceReviewPlan } from '../src/editorial-readiness.js';

const catalog = [...Array.from({ length: 102 }, (_, i) => ({ id: `item_${String(i).padStart(3, '0')}`, kind: 'item' })), ...Array.from({ length: 18 }, (_, i) => ({ id: `container_${String(i).padStart(3, '0')}`, kind: 'container' }))];
const legacy = { complete: false, source: { verified: false }, rows: [] };

test('readiness requires exactly 120 templates with 102/18 split', () => {
  const report = buildCatalogEditorialReadinessReport({ template_catalog: catalog.slice(0, 119), target_revision_id: 'rev_2', legacy_inventory_snapshot: legacy });
  assert.equal(report.approval_cohort_ready, false);
  assert.equal(report.structural_issues.some((entry) => entry.code === 'TEMPLATE_COHORT_SIZE_INVALID'), true);
});

test('unverified local source blocks all templates without a zero-row claim', () => {
  const report = buildCatalogEditorialReadinessReport({ template_catalog: catalog, target_revision_id: 'rev_2', legacy_inventory_snapshot: legacy });
  assert.equal(report.summary.template_count, 120);
  assert.equal(report.summary.blocked_by_legacy_migration_count, 120);
  assert.equal(report.summary.ready_for_editorial_approval_count, 0);
  assert.equal(report.legacy_source_verified, false);
});

test('readiness is deterministic and sorted', () => {
  const left = buildCatalogEditorialReadinessReport({ template_catalog: [...catalog].reverse(), target_revision_id: 'rev_2', legacy_inventory_snapshot: legacy });
  const right = buildCatalogEditorialReadinessReport({ template_catalog: catalog, target_revision_id: 'rev_2', legacy_inventory_snapshot: legacy });
  assert.equal(left.report_digest, right.report_digest);
  assert.deepEqual(left.template_ids.blocked_by_legacy_migration, [...left.template_ids.blocked_by_legacy_migration].sort());
});

test('review and approval plans contain no transitions while one blocker remains', () => {
  const report = buildCatalogEditorialReadinessReport({ template_catalog: catalog, target_revision_id: 'rev_2', legacy_inventory_snapshot: legacy });
  const review = buildEditorialEvidenceReviewPlan({ readiness_report: report, records_by_table: { item_template_source_bindings: [{ id: 'binding', item_template_id: 'item_000', review_status: 'needs_review', status: 'draft' }] }, review_attestation: { decision: 'review_evidence', reviewed_by: 'editor', reviewed_at: '2026-07-16T09:00:00Z' } });
  const approval = buildCoherentEditorialApprovalPlan({ readiness_report: report, records_by_table: { item_templates: [{ id: 'item_000', status: 'draft' }] }, approval_attestation: { decision: 'approve_all_120', approved_by: 'editor', approved_at: '2026-07-16T09:00:00Z' } });
  assert.equal(review.status, 'blocked'); assert.deepEqual(review.transitions, []);
  assert.equal(approval.status, 'blocked'); assert.deepEqual(approval.transitions, []);
});
