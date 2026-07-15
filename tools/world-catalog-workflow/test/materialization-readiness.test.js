import assert from 'node:assert/strict';
import test from 'node:test';
import { assessItemContainerClassificationReadiness, assessMaterializationReadiness, validateCatalogImportManifest } from '../src/materialization-readiness.js';
import { digestValue } from '../src/digest.js';

test('catalog import rejects unknown and party instance tables', () => {
  const digest = 'a'.repeat(64);
  const errors = validateCatalogImportManifest({ version: 2, schema: 'world_catalog_import_manifest_v2', approval: 'approved', deletion_mode: 'none', tables: [{ table_name: 'party_npcs', payload_digest: digest, record_count: 1, dependency_order: 0 }] });
  assert.ok(errors.includes('TABLE_NOT_REGISTERED:party_npcs'));
  assert.ok(errors.includes('PARTY_INSTANCE_TABLE_FORBIDDEN:party_npcs'));
});

test('catalog import verifies payload count and digest', () => {
  const recordsByTable = { world_revisions: [{ id: 'rev-1', status: 'approved' }] };
  const manifest = { version: 2, schema: 'world_catalog_import_manifest_v2', approval: 'approved', deletion_mode: 'none', tables: [{ table_name: 'world_revisions', payload_digest: 'a'.repeat(64), record_count: 2, dependency_order: 0 }] };
  const errors = validateCatalogImportManifest(manifest, { recordsByTable });
  assert.ok(errors.includes('TABLE_COUNT_MISMATCH:world_revisions'));
  assert.ok(errors.includes('TABLE_DIGEST_MISMATCH:world_revisions'));
});

test('catalog import derives layout dependency order from the complete FK registry', () => {
  const recordsByTable = {
    room_templates: [{ id: 'room-1' }],
    building_layout_templates: [{ id: 'layout-1' }],
    building_layout_nodes: [{ id: 'node-1', layout_template_id: 'layout-1', room_template_id: 'room-1' }]
  };
  const tables = ['building_layout_nodes', 'building_layout_templates', 'room_templates'].map((table_name, dependency_order) => ({ table_name, dependency_order, payload_digest: digestValue(recordsByTable[table_name]), record_count: 1 }));
  const errors = validateCatalogImportManifest({ version: 2, schema: 'world_catalog_import_manifest_v2', world_revision_id: 'rev-1', approval: 'approved', deletion_mode: 'none', provenance: {}, tables }, { recordsByTable });
  assert.ok(errors.includes('DEPENDENCY_ORDER_INVALID:building_layout_nodes:building_layout_templates'));
  assert.ok(errors.includes('DEPENDENCY_ORDER_INVALID:building_layout_nodes:room_templates'));
});

test('item/container promotion readiness hard-blocks an approved template without reviewed historical-presence evidence', () => {
  const result = assessItemContainerClassificationReadiness({
    item_templates: [{ id: 'item-1', status: 'approved' }],
    container_templates: [{ id: 'container-1', status: 'approved' }],
    item_template_category_bindings: [{ id: 'binding-1', item_template_id: 'item-1', binding_kind: 'object_type', status: 'approved' }],
    item_template_source_bindings: [{ id: 'draft-evidence', item_template_id: 'item-1', claim_scope: 'historical_presence', review_status: 'needs_review', status: 'draft' }]
  });

  assert.equal(result.pass, false);
  assert.ok(result.concerns.includes('HISTORICAL_PRESENCE_EVIDENCE_REQUIRED:item-1'));
  assert.ok(result.concerns.includes('HISTORICAL_PRESENCE_EVIDENCE_REQUIRED:container-1'));
});

test('G4 readiness follows DDL foreign keys and blocks an unapproved referenced profile', () => {
  const recordsByTable = {
    world_revisions: [{ id: 'rev-1', status: 'approved' }],
    universal_categories: [{ id: 'cat-1', status: 'approved' }],
    region_category_options: [{ id: 'opt-1', region_id: 'region-1', status: 'approved' }],
    g4_materialization_profiles: [{ id: 'profile-1', status: 'approved' }],
    g4_materialization_bindings: [{ id: 'binding-1', graph_node_id: 'g4-1', profile_id: 'profile-1', status: 'approved' }],
    g5_minilocation_templates: [{ id: 'mini-template', status: 'approved' }],
    g5_anchor_templates: [{ id: 'anchor-template', status: 'approved' }],
    materialization_slot_rules: [{ id: 'npc-slot', required: true, min_count: 1, status: 'approved' }, { id: 'item-slot', required: true, min_count: 1, status: 'approved' }, { id: 'container-slot', required: true, min_count: 1, status: 'approved' }],
    region_npc_profile_sets: [{ id: 'npc-profile', status: 'draft' }],
    item_profile_sets: [{ id: 'item-profile', status: 'approved' }],
    container_templates: [{ id: 'container-template', status: 'approved' }],
    g4_npc_materialization_rules: [{ id: 'npc-rule', graph_node_id: 'g4-1', slot_rule_id: 'npc-slot', npc_profile_set_id: 'npc-profile', min_count: 1, status: 'approved' }],
    g4_item_materialization_rules: [{ id: 'item-rule', graph_node_id: 'g4-1', slot_rule_id: 'item-slot', item_profile_id: 'item-profile', status: 'approved' }],
    g4_container_materialization_rules: [{ id: 'container-rule', graph_node_id: 'g4-1', slot_rule_id: 'container-slot', container_template_id: 'container-template', status: 'approved' }]
  };
  const order = { world_revisions: 0, universal_categories: 0, region_category_options: 1, g4_materialization_profiles: 1, g4_materialization_bindings: 2, g5_minilocation_templates: 2, g5_anchor_templates: 2, materialization_slot_rules: 2, region_npc_profile_sets: 2, item_profile_sets: 2, container_templates: 2, g4_npc_materialization_rules: 3, g4_item_materialization_rules: 3, g4_container_materialization_rules: 3 };
  const tables = Object.keys(recordsByTable).sort((left, right) => order[left] - order[right]).map((table_name) => ({ table_name, payload_digest: digestValue(recordsByTable[table_name]), record_count: recordsByTable[table_name].length, dependency_order: order[table_name] }));
  const result = assessMaterializationReadiness({ manifest: { version: 2, schema: 'world_catalog_import_manifest_v2', approval: 'approved', deletion_mode: 'none', tables }, recordsByTable, regionId: 'region-1', g4Id: 'g4-1', historicalYear: 1230, season: 'spring' });
  assert.equal(result.pass, false);
  assert.ok(result.concerns.includes('APPROVED_PROFILE_NOT_FOUND:g4_npc_materialization_rules:npc-rule'));
});

test('G4 readiness does not accept draft G5 templates or slot rules as an approved graph', () => {
  const recordsByTable = {
    world_revisions: [{ id: 'rev-1', status: 'approved' }],
    universal_categories: [{ id: 'cat-1', status: 'approved' }],
    region_category_options: [{ id: 'opt-1', region_id: 'region-1', status: 'approved' }],
    g4_materialization_profiles: [{ id: 'profile-1', world_revision_id: 'rev-1', region_id: 'region-1', layout_template_id: 'layout-1', status: 'approved' }],
    g4_materialization_bindings: [{ id: 'binding-1', graph_node_id: 'g4-1', profile_id: 'profile-1', status: 'approved' }],
    g5_minilocation_templates: [{ id: 'mini-template', status: 'draft' }],
    g5_anchor_templates: [{ id: 'anchor-template', status: 'draft' }],
    materialization_slot_rules: [
      { id: 'node-slot', profile_id: 'profile-1', slot_domain: 'g5_node', required: true, min_count: 1, status: 'draft' },
      { id: 'anchor-slot', profile_id: 'profile-1', slot_domain: 'anchor', required: true, min_count: 1, status: 'draft' }
    ]
  };
  const order = Object.fromEntries(Object.keys(recordsByTable).map((table, index) => [table, index]));
  const tables = Object.keys(recordsByTable).map((table_name) => ({ table_name, payload_digest: digestValue(recordsByTable[table_name]), record_count: recordsByTable[table_name].length, dependency_order: order[table_name] }));
  const result = assessMaterializationReadiness({ manifest: { version: 2, schema: 'world_catalog_import_manifest_v2', world_revision_id: 'rev-1', approval: 'approved', deletion_mode: 'none', provenance: {}, tables }, recordsByTable, regionId: 'region-1', g4Id: 'g4-1', historicalYear: 1230, season: 'spring' });
  assert.equal(result.pass, false);
  assert.ok(result.concerns.includes('REQUIRED_APPROVED_TABLE_EMPTY:g5_minilocation_templates'));
  assert.ok(result.concerns.includes('REQUIRED_APPROVED_TABLE_EMPTY:g5_anchor_templates'));
  assert.ok(result.concerns.includes('REQUIRED_APPROVED_TABLE_EMPTY:materialization_slot_rules'));
  assert.ok(result.concerns.includes('G5_NODE_SLOT_RULE_NOT_READY:profile-1'));
  assert.ok(result.concerns.includes('G5_ANCHOR_SLOT_RULE_NOT_READY:profile-1'));
});
