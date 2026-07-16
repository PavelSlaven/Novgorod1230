import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRevisionPromotionPlan, buildRevisionPromotionPlan } from '../src/revision-promotion.js';

const parent = { id: 'rev_parent', status: 'approved', catalog_digest: '1'.repeat(64) };
const target = { id: 'rev_next', title: 'Next revision', effective_from: '1230-01-01', effective_to: '1250-12-31' };
const approval = { decision: 'approve_subset', approved_by: 'editor', approved_at: '2026-07-16T00:00:00Z' };

test('Stage 3C hard-blocks an empty approved subset and does not create an importable revision', () => {
  const plan = buildRevisionPromotionPlan({ parent_revision: parent, target_revision: target, approval_attestation: approval });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.typed_data_gaps.some((gap) => gap.code === 'APPROVED_SUBSET_EMPTY'), true);
  assert.equal(plan.records_by_table.world_revisions, undefined);
  assert.equal(plan.revision_candidate.import_status, 'blocked_not_created');
  assert.deepEqual(plan.manifest.datasets, []);
  assert.equal(plan.activation.performed, false);
  assert.equal(plan.rollback_plan.forbidden_actions.includes('update parent revision'), true);
});

test('Stage 3C requires an exact explicit approval attestation', () => {
  const plan = buildRevisionPromotionPlan({ parent_revision: parent, target_revision: target });
  assert.equal(plan.errors.some((error) => error.code === 'PROMOTION_APPROVAL_ATTESTATION_MISSING'), true);
});

test('Stage 3C does not mutate source authoring rows or the parent revision', () => {
  const source = { item_templates: [{ id: 'item_1', world_revision_id: 'draft', region_id: 'r', category_id: 'c', source_id: 's', status: 'draft' }] };
  const before = structuredClone(source);
  const parentBefore = structuredClone(parent);
  buildRevisionPromotionPlan({ parent_revision: parent, target_revision: target, approval_attestation: approval, source_records_by_table: source, approved_record_ids_by_table: { item_templates: ['item_1'] } });
  assert.deepEqual(source, before);
  assert.deepEqual(parent, parentBefore);
});

test('Stage 3C catalog digest is independent of approval ID ordering', () => {
  const source = { source_records: [{ id: 's2', status: 'draft' }, { id: 's1', status: 'draft' }] };
  const left = buildRevisionPromotionPlan({ parent_revision: parent, target_revision: target, approval_attestation: approval, source_records_by_table: source, approved_record_ids_by_table: { source_records: ['s2', 's1'] } });
  const right = buildRevisionPromotionPlan({ parent_revision: parent, target_revision: target, approval_attestation: approval, source_records_by_table: source, approved_record_ids_by_table: { source_records: ['s1', 's2'] } });
  assert.equal(left.manifest.catalog_digest, right.manifest.catalog_digest);
});

test('Stage 3C detects incomplete approved dependency closure', () => {
  const plan = buildRevisionPromotionPlan({ parent_revision: parent, target_revision: target, approval_attestation: approval, source_records_by_table: { item_templates: [{ id: 'item_1', world_revision_id: 'draft', region_id: 'r', category_id: 'c', source_id: 's', status: 'draft' }] }, approved_record_ids_by_table: { item_templates: ['item_1'] } });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.typed_data_gaps.some((gap) => gap.code === 'ITEM_REGIONAL_PERMISSION_MISSING'), true);
  assert.equal(plan.typed_data_gaps.some((gap) => gap.code === 'ITEM_MATERIALIZATION_RULE_MISSING'), true);
});

test('Stage 3C transaction rolls back on readback mismatch before changing parent revision', async () => {
  const events = [];
  const plan = { status: 'ready', manifest: { parent_revision_id: 'rev_parent', world_revision_id: 'rev_next', catalog_digest: 'a'.repeat(64), manifest_digest: 'd'.repeat(64), datasets: [{ table: 'world_revisions', record_count: 1, payload_digest: 'b'.repeat(64) }] }, records_by_table: { world_revisions: [{ id: 'rev_next' }] } };
  await assert.rejects(() => applyRevisionPromotionPlan({ plan, adapter: { async begin() { events.push('begin'); }, async insert() { events.push('insert'); }, async readback() { return { record_count: 0, payload_digest: 'c'.repeat(64) }; }, async readRevision(id) { return id === 'rev_parent' ? parent : null; }, async commit() { events.push('commit'); }, async rollback() { events.push('rollback'); } } }), /PROMOTION_READBACK_MISMATCH/);
  assert.deepEqual(events, ['begin', 'insert', 'rollback']);
});
