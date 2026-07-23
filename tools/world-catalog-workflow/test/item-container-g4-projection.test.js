import assert from 'node:assert/strict';
import test from 'node:test';

import { compileItemContainerG4Projection } from '../src/index.js';

const baseInput = Object.freeze({
  world_revision_id: 'revision_items_v1',
  region_id: 'region_novgorod_land',
  graph_nodes: [{
    id: 'g4_craft_yard',
    title: 'Ремесленные дворы',
    node_type: 'location',
    scale_level: 'G4',
    place_template_id: 'pt_posad_suburb',
    status: 'usable_with_caution'
  }],
  context_profiles: [{
    id: 'profile_craft_work_v3',
    context_domain: 'craft_work',
    region_id: 'region_novgorod_land',
    period: { from: '1200-01-01', to: '1250-12-31' },
    status: 'content_ready'
  }],
  context_mappings: [{
    profile_id: 'profile_craft_work_v3',
    context_domain: 'craft_work',
    graph_node_id: 'g4_craft_yard',
    place_template_id: 'pt_posad_suburb',
    causal_basis_type: 'functional_place_context',
    causal_basis_id: 'craft_yards:workshop_activity',
    current_status: 'usable_with_caution',
    requested_status: 'approved',
    confidence: 'medium'
  }],
  templates: [
    { id: 'item_hammer', kind: 'item', materialization_profile_id: 'profile_craft_work_v3' },
    { id: 'container_toolbox', kind: 'container', materialization_profile_id: 'profile_craft_work_v3', container_compatibility_id: 'compat_toolbox' }
  ],
  materialization_rules: [
    { id: 'rule_item_hammer', template_id: 'item_hammer', profile_id: 'profile_craft_work_v3', weight: 50, status: 'content_ready' },
    { id: 'rule_container_toolbox', template_id: 'container_toolbox', profile_id: 'profile_craft_work_v3', weight: 40, status: 'content_ready' }
  ],
  container_content_profiles: [{ id: 'content_container_toolbox', container_template_id: 'container_toolbox', status: 'approved' }]
});

test('projection compiler deterministically expands approved semantic mappings without inventing G4 context', () => {
  const first = compileItemContainerG4Projection(baseInput);
  const second = compileItemContainerG4Projection({
    ...baseInput,
    templates: [...baseInput.templates].reverse(),
    materialization_rules: [...baseInput.materialization_rules].reverse()
  });

  assert.deepEqual(first, second);
  assert.equal(first.errors.length, 0);
  assert.equal(first.records_by_table.g4_materialization_profiles.length, 1);
  assert.equal(first.records_by_table.g4_materialization_bindings.length, 1);
  assert.deepEqual(
    first.records_by_table.g4_materialization_bindings.map((binding) => binding.graph_node_id),
    ['g4_craft_yard']
  );
  assert.equal(first.records_by_table.g4_materialization_bindings.some((binding) => binding.node_type != null), false);
  assert.equal(first.records_by_table.item_profile_sets.length, 1);
  assert.equal(first.records_by_table.item_profile_entries.length, 1);
  assert.equal(first.records_by_table.g4_item_materialization_rules.length, 1);
  assert.equal(first.records_by_table.g4_container_materialization_rules.length, 1);
  assert.equal(first.graph_node_status_transitions[0].graph_node_id, 'g4_craft_yard');
  assert.equal(first.graph_node_status_transitions[0].to_status, 'approved');
  assert.match(first.digest, /^[a-f0-9]{64}$/u);
});

test('projection compiler rejects a mapping whose approved place identity does not match the graph', () => {
  const result = compileItemContainerG4Projection({
    ...baseInput,
    context_mappings: [{ ...baseInput.context_mappings[0], place_template_id: 'pt_market_place' }]
  });

  assert.ok(result.errors.includes('G4_MAPPING_PLACE_TEMPLATE_MISMATCH:profile_craft_work_v3:g4_craft_yard'));
});

test('projection compiler rejects cross-context military-to-household substitution', () => {
  const result = compileItemContainerG4Projection({
    ...baseInput,
    context_profiles: [{ ...baseInput.context_profiles[0], id: 'profile_military_service_v3', context_domain: 'military_service' }],
    context_mappings: [{ ...baseInput.context_mappings[0], profile_id: 'profile_military_service_v3', context_domain: 'household_personal' }],
    templates: baseInput.templates.map((template) => ({ ...template, materialization_profile_id: 'profile_military_service_v3' })),
    materialization_rules: baseInput.materialization_rules.map((rule) => ({ ...rule, profile_id: 'profile_military_service_v3' }))
  });

  assert.ok(result.errors.includes('CONTEXT_DOMAIN_MISMATCH:profile_military_service_v3'));
});

test('projection compiler hard-blocks missing causal basis and unmapped template profiles', () => {
  const result = compileItemContainerG4Projection({
    ...baseInput,
    context_mappings: [{ ...baseInput.context_mappings[0], causal_basis_id: '' }],
    templates: [...baseInput.templates, { id: 'item_unmapped', kind: 'item', materialization_profile_id: 'profile_missing' }],
    materialization_rules: [...baseInput.materialization_rules, { id: 'rule_item_unmapped', template_id: 'item_unmapped', profile_id: 'profile_missing', weight: 1, status: 'content_ready' }]
  });

  assert.ok(result.errors.includes('CAUSAL_BASIS_MISSING:profile_craft_work_v3'));
  assert.ok(result.errors.includes('TEMPLATE_CONTEXT_PROFILE_UNMAPPED:item_unmapped:profile_missing'));
});
