import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { applyRevisionPromotionPlan, digestValue } from '../src/index.js';
import { buildPr17Stage3CApprovalRequest, buildPr17Stage3CPromotionPlan } from '../src/internal/pr17-stage3c.js';

const root = resolve(import.meta.dirname, '../../..');
const candidateRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');
const manifest = readJson(resolve(candidateRoot, 'manifest.json'));
const readiness = readJson(resolve(candidateRoot, 'reports/EDITORIAL_READINESS_REPORT.json'));
const coverage = readJson(resolve(candidateRoot, 'reports/G4_COVERAGE_REPORT.json'));
const compilation = readJson(resolve(candidateRoot, 'reports/COMPILATION_REPORT.json'));
const mappingRequest = readJson(resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json'));
const legacySnapshot = readJson(resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence/OPERATOR_LEGACY_INVENTORY_SNAPSHOT.json'));
const sourceRecords = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(resolve(candidateRoot, dataset.path))]));
const requiredTemplateIds = [...sourceRecords.item_templates, ...sourceRecords.container_templates].map((record) => record.id).sort();
const approvedIds = Object.fromEntries(manifest.datasets.filter((dataset) => dataset.table !== 'world_revisions').map((dataset) => [dataset.table, sourceRecords[dataset.table].map((record) => record.id)]));
const parentRevision = { id: 'novgorod_1230_research_revision_001', title: 'Approved parent', status: 'approved', catalog_digest: '1'.repeat(64) };
const targetRevision = { id: 'world_revision_novgorod_1230_item_container_approved_001', title: 'Novgorod 1230 approved item/container catalogue', effective_from: '1230-01-01', effective_to: '1250-12-31' };
const approvalRequestResult = buildPr17Stage3CApprovalRequest({ candidate_manifest: manifest, records_by_table: sourceRecords, editorial_readiness_report: readiness, g4_coverage_report: coverage, compilation_report: compilation, template_ids: requiredTemplateIds, target_revision: targetRevision });
const approvalRequest = approvalRequestResult.request;
const approval = { decision: 'approve_all_120', request_digest: approvalRequest.request_digest, candidate_digest: manifest.candidate_digest, readiness_report_digest: readiness.report_digest, activation_authorized: false, approved_by: 'test-editor', approved_at: '2026-07-23T12:00:00+03:00' };

test('PR17 Stage 3C produces one exact digest-bound approval request only after technical readiness', () => {
  assert.equal(approvalRequestResult.status, 'ready_for_human_confirmation');
  assert.deepEqual(approvalRequestResult.errors, []);
  assert.equal(approvalRequest.template_ids.length, 120);
  assert.equal(approvalRequest.g4_status_transitions.length, 9);
  assert.equal(approvalRequest.candidate_digest, manifest.candidate_digest);
  assert.equal(approvalRequest.activation, 'not_requested');
});

test('PR17 Stage 3C promotes all 120 templates with the complete spatial closure and nine atomic G4 transitions', () => {
  const plan = buildPlan();
  assert.equal(plan.status, 'ready', JSON.stringify({ errors: plan.errors, gaps: plan.typed_data_gaps }));
  assert.equal(plan.manifest.approval, 'approved');
  assert.equal(plan.manifest.activation, 'not_requested');
  assert.equal(plan.activation.performed, false);
  assert.equal(plan.status_transitions.length, 9);
  assert.equal(plan.manifest.status_transitions[0].record_count, 9);
  assert.deepEqual(plan.status_transitions.map((transition) => transition.to_status), Array(9).fill('approved'));
  for (const table of ['g4_materialization_profiles', 'g4_materialization_bindings', 'g5_minilocation_templates', 'g5_anchor_templates', 'g5_edge_templates', 'materialization_slot_rules', 'g4_materialization_layout_edges', 'g4_item_materialization_rules', 'g4_container_materialization_rules']) {
    assert.ok(plan.manifest.datasets.some((dataset) => dataset.table === table), table);
  }
  assert.equal(plan.records_by_table.item_templates.length, 102);
  assert.equal(plan.records_by_table.container_templates.length, 18);
  for (const table of ['building_layout_templates', 'container_templates', 'item_profile_sets', 'item_templates', 'property_profiles', 'region_category_options', 'container_template_inventory_profiles', 'container_template_source_bindings', 'g4_materialization_profiles', 'item_template_inventory_profiles', 'item_template_quantity_profiles', 'item_template_source_bindings', 'g4_container_materialization_rules', 'g4_item_materialization_rules']) {
    assert.ok(plan.records_by_table[table].every((record) => record.world_revision_id === targetRevision.id), table);
  }
});

test('PR17 Stage 3C approval is bound to the exact candidate digest', () => {
  const plan = buildPlan({ approval_attestation: { ...approval, candidate_digest: 'f'.repeat(64) } });
  assert.equal(plan.status, 'blocked');
  assert.ok(plan.errors.some((error) => error.code === 'PR17_APPROVAL_ATTESTATION_INVALID'));
  assert.deepEqual(plan.manifest.datasets, []);
  assert.deepEqual(plan.status_transitions ?? [], []);
});

test('PR17 approval request blocks a dataset that no longer matches the candidate manifest', () => {
  const tampered = structuredClone(sourceRecords);
  tampered.item_templates[0].title = 'tampered';
  const result = buildPr17Stage3CApprovalRequest({ candidate_manifest: manifest, records_by_table: tampered, editorial_readiness_report: readiness, g4_coverage_report: coverage, compilation_report: compilation, template_ids: requiredTemplateIds, target_revision: targetRevision });
  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.some((error) => error.code === 'PR17_CANDIDATE_DATASET_MISMATCH'));
});

test('PR17 Stage 3C applies G4 transitions and datasets in one transaction without activation', async () => {
  const plan = buildPlan();
  assert.equal(plan.status, 'ready');
  const events = [];
  let target = null;
  const transitionState = new Map(mappingRequest.profile_mappings.map((mapping) => [mapping.graph_node_id, mapping.current_status]));
  const result = await applyRevisionPromotionPlan({
    plan,
    adapter: {
      async begin() { events.push('begin'); },
      async transition(table, transition) { assert.equal(table, 'graph_nodes'); transitionState.set(transition.id, transition.to_status); events.push(`transition:${transition.id}`); },
      async readTransition(table, id) { assert.equal(table, 'graph_nodes'); return { id, status: transitionState.get(id) }; },
      async insert(table, rows) { if (table === 'world_revisions') target = rows[0]; events.push(`insert:${table}`); },
      async readback(_table, rows) { return { record_count: rows.length, payload_digest: digestValue(rows) }; },
      async readRevision(id) { if (id === parentRevision.id) return parentRevision; if (id === targetRevision.id) return target; return null; },
      async commit() { events.push('commit'); },
      async rollback() { events.push('rollback'); }
    }
  });
  assert.equal(result.applied, true);
  assert.equal(result.audit.status_transitions.length, 9);
  assert.equal(result.activation.performed, false);
  assert.equal(events[0], 'begin');
  assert.equal(events.at(-1), 'commit');
  assert.equal(events.includes('rollback'), false);
});

test('PR17 Stage 3C rollback restores all G4 transitions when dataset readback fails', async () => {
  const plan = buildPlan();
  const original = new Map(mappingRequest.profile_mappings.map((mapping) => [mapping.graph_node_id, mapping.current_status]));
  const state = new Map(original);
  const events = [];
  await assert.rejects(() => applyRevisionPromotionPlan({
    plan,
    adapter: {
      async begin() { events.push('begin'); },
      async transition(_table, transition) { state.set(transition.id, transition.to_status); },
      async readTransition(_table, id) { return { id, status: state.get(id) }; },
      async insert() { events.push('insert'); },
      async readback() { return { record_count: 0, payload_digest: '0'.repeat(64) }; },
      async readRevision(id) { return id === parentRevision.id ? parentRevision : null; },
      async commit() { events.push('commit'); },
      async rollback() { state.clear(); for (const [id, status] of original) state.set(id, status); events.push('rollback'); }
    }
  }), /PROMOTION_READBACK_MISMATCH/);
  assert.deepEqual(state, original);
  assert.equal(events.includes('commit'), false);
  assert.equal(events.at(-1), 'rollback');
});

function buildPlan(overrides = {}) {
  return buildPr17Stage3CPromotionPlan({
    approval_request: approvalRequest,
    candidate_manifest: manifest,
    editorial_readiness_report: readiness,
    g4_coverage_report: coverage,
    compilation_report: compilation,
    template_ids: requiredTemplateIds,
    legacy_inventory_snapshot: legacySnapshot,
    approval_attestation: approval,
    parent_revision: parentRevision,
    target_revision: targetRevision,
    source_records_by_table: sourceRecords,
    approved_record_ids_by_table: approvedIds,
    external_records_by_table: { graph_nodes: graphNodes() },
    external_approved_ids: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) },
    ...overrides
  });
}

function graphNodes() {
  return mappingRequest.profile_mappings.map((mapping) => ({ id: mapping.graph_node_id, title: mapping.graph_node_title, node_type: mapping.node_type, scale_level: 'G4', region_id: 'region_novgorod_land', place_template_id: mapping.place_template_id, building_template_id: mapping.building_template_id ?? null, status: mapping.current_status }));
}

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
