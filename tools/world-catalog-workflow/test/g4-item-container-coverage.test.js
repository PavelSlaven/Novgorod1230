import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildG4ItemContainerCoverageReport,
  resolveG4MaterializationBinding
} from '../src/index.js';

const approved = { status: 'approved' };

test('G4 binding resolution prefers an exact graph node over a generic node type', () => {
  const node = {
    id: 'g4-household',
    scale_level: 'G4',
    node_type: 'location',
    place_template_id: 'pt-posad',
    ...approved
  };
  const result = resolveG4MaterializationBinding({
    graph_node: node,
    bindings: [
      { id: 'binding-generic', profile_id: 'profile-generic', node_type: 'location', priority: 0, ...approved },
      { id: 'binding-specific', profile_id: 'profile-household', graph_node_id: node.id, priority: 0, ...approved }
    ]
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.binding.id, 'binding-specific');
  assert.equal(result.match_kind, 'graph_node_id');
});

test('G4 binding resolution rejects equal-priority ambiguity at the same specificity', () => {
  const result = resolveG4MaterializationBinding({
    graph_node: { id: 'g4-1', scale_level: 'G4', node_type: 'location', ...approved },
    bindings: [
      { id: 'binding-a', profile_id: 'profile-a', node_type: 'location', priority: 10, ...approved },
      { id: 'binding-b', profile_id: 'profile-b', node_type: 'location', priority: 10, ...approved }
    ]
  });

  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.binding_ids, ['binding-a', 'binding-b']);
});

test('coverage reports only runtime-approved G4 and hard-blocks a new approved G4 without an exact binding', () => {
  const records = {
    world_revisions: [{ id: 'revision-1', ...approved }],
    building_templates: [{ id: 'building-house', ...approved }],
    building_layout_templates: [{ id: 'layout-house', building_template_id: 'building-house', ...approved }],
    g5_minilocation_templates: [{ id: 'g5-node-house', ...approved }],
    g5_anchor_templates: [{ id: 'g5-anchor-house', ...approved }],
    item_profile_sets: [{ id: 'profile_household_personal_v3', ...approved }],
    container_templates: [{ id: 'container-1', ...approved }],
    graph_nodes: [
      { id: 'g4-household', scale_level: 'G4', node_type: 'location', place_template_id: 'pt-posad', ...approved },
      { id: 'g4-draft', scale_level: 'G4', node_type: 'location', place_template_id: 'pt-village', status: 'draft' }
    ],
    g4_materialization_profiles: [
      { id: 'profile-household', world_revision_id: 'revision-1', layout_template_id: 'layout-house', ...approved }
    ],
    g4_materialization_bindings: [
      { id: 'binding-household', profile_id: 'profile-household', graph_node_id: 'g4-household', priority: 100, applicability: { item_container_policy: 'rules_only', context_profile_ids: ['profile_household_personal_v3'] }, ...approved }
    ],
    materialization_slot_rules: [
      { id: 'house-node', profile_id: 'profile-household', slot_key: 'main', slot_domain: 'g5_node', g5_minilocation_template_id: 'g5-node-house', required: true, min_count: 1, max_count: 1, ...approved },
      { id: 'house-anchor', profile_id: 'profile-household', slot_key: 'entry', slot_domain: 'anchor', g5_anchor_template_id: 'g5-anchor-house', required: true, min_count: 1, max_count: 1, ...approved },
      { id: 'house-item', profile_id: 'profile-household', slot_key: 'items', slot_domain: 'item', required: false, min_count: 0, max_count: 20, ...approved },
      { id: 'house-container', profile_id: 'profile-household', slot_key: 'containers', slot_domain: 'container', required: false, min_count: 0, max_count: 10, ...approved }
    ],
    g4_item_materialization_rules: [
      { id: 'item-rule', graph_node_id: 'g4-household', slot_rule_id: 'house-item', item_profile_id: 'profile_household_personal_v3', causal_basis_type: 'functional_place_context', causal_basis_id: 'dense_yards', ...approved }
    ],
    g4_container_materialization_rules: [
      { id: 'container-rule', graph_node_id: 'g4-household', slot_rule_id: 'house-container', container_template_id: 'container-1', causal_basis_type: 'functional_place_context', causal_basis_id: 'dense_yards', ...approved }
    ]
  };

  const report = buildG4ItemContainerCoverageReport(records);

  assert.equal(report.summary.g4_count, 1);
  assert.equal(report.summary.resolved_profile_count, 1);
  assert.equal(report.summary.runtime_accessible_g4_count, 1);
  assert.equal(report.summary.ambiguous_binding_count, 0);
  assert.equal(report.summary.missing_required_slot_count, 0);
  assert.equal(report.summary.draft_dependency_rule_count, 0);
  assert.equal(report.pass, true);
  assert.equal(report.entries.some((entry) => entry.graph_node_id === 'g4-draft'), false);

  const missingBinding = structuredClone(records);
  missingBinding.graph_nodes.push({ id: 'g4-new-approved', scale_level: 'G4', node_type: 'location', place_template_id: 'pt-new', ...approved });
  const missingBindingReport = buildG4ItemContainerCoverageReport(missingBinding);
  assert.equal(missingBindingReport.pass, false);
  assert.equal(missingBindingReport.summary.g4_count, 2);
  assert.equal(missingBindingReport.summary.missing_profile_count, 1);
  assert.equal(missingBindingReport.concerns.some((entry) => entry.code === 'G4_MATERIALIZATION_BINDING_MISSING' && entry.graph_node_id === 'g4-new-approved'), true);

  const invalid = structuredClone(records);
  invalid.g4_item_materialization_rules.push({
    id: 'draft-item-rule',
    graph_node_id: 'g4-draft',
    slot_rule_id: 'house-item',
    item_profile_id: 'profile_household_personal_v3',
    causal_basis_type: 'functional_place_context',
    causal_basis_id: 'invented',
    ...approved
  });
  const invalidReport = buildG4ItemContainerCoverageReport(invalid);
  assert.equal(invalidReport.pass, false);
  assert.equal(invalidReport.summary.draft_dependency_rule_count, 1);
  assert.equal(invalidReport.concerns.some((entry) => entry.code === 'G4_RULE_DRAFT_GRAPH_DEPENDENCY'), true);

  const draftDependency = structuredClone(records);
  draftDependency.world_revisions[0].status = 'draft';
  const draftDependencyReport = buildG4ItemContainerCoverageReport(draftDependency);
  assert.equal(draftDependencyReport.pass, false);
  assert.equal(draftDependencyReport.summary.unapproved_dependency_count, 1);
  assert.equal(draftDependencyReport.concerns.some((entry) => entry.dependency_type === 'world_revision'), true);
});
