import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessItemContainerClassificationMigration,
  assessItemContainerClassificationReadiness,
  digestValue,
  importClassificationCatalog,
  validateCatalogImportManifest,
  validateItemContainerClassificationCatalog
} from '../src/index.js';

const approved = { status: 'approved' };

function records() {
  return {
    item_templates: [{ id: 'knife-template', region_id: 'novgorod', ...approved }],
    container_templates: [{ id: 'chest-template', world_revision_id: 'revision-1', category_id: 'chest', capacity: 1, packing_slot_cost: 1, capacity_policy: { version: 1, mode: 'packing_slots', unit: 'packing_slot' }, ...approved }],
    item_profile_sets: [{ id: 'item-profile', ...approved }],
    item_profile_entries: [{ id: 'item-entry', profile_id: 'item-profile', item_template_id: 'knife-template', slot_key: 'tool', required: true, ...approved }],
    g4_item_materialization_rules: [{ id: 'item-rule', item_profile_id: 'item-profile', min_count: 1, ...approved }],
    universal_categories: [
      { id: 'knife', domain: 'item', facet: 'object_type', ...approved },
      { id: 'cutting', domain: 'item', facet: 'primary_function', ...approved },
      { id: 'utility', domain: 'item', facet: 'secondary_function', ...approved },
      { id: 'iron', domain: 'item', facet: 'material', ...approved },
      { id: 'forged', domain: 'item', facet: 'manufacturing_technique', ...approved },
      { id: 'sound', domain: 'item', facet: 'condition', ...approved },
      { id: 'hand', domain: 'item', facet: 'size_band', ...approved },
      { id: 'chest', domain: 'container', facet: 'container_form', ...approved },
      { id: 'lid', domain: 'container', facet: 'closure_type', ...approved },
      { id: 'medium', domain: 'container', facet: 'capacity_band', ...approved },
      { id: 'portable', domain: 'container', facet: 'portability', ...approved }
    ],
    item_template_category_bindings: [
      { id: 'knife-object', item_template_id: 'knife-template', category_id: 'knife', binding_kind: 'object_type', ...approved },
      { id: 'knife-primary', item_template_id: 'knife-template', category_id: 'cutting', binding_kind: 'primary_function', exclusivity_group: 'primary_function', ...approved },
      { id: 'knife-secondary', item_template_id: 'knife-template', category_id: 'utility', binding_kind: 'secondary_function', ...approved },
      { id: 'knife-iron', item_template_id: 'knife-template', category_id: 'iron', binding_kind: 'material', ...approved },
      { id: 'knife-forged', item_template_id: 'knife-template', category_id: 'forged', binding_kind: 'manufacturing_technique', ...approved },
      { id: 'knife-condition', item_template_id: 'knife-template', category_id: 'sound', binding_kind: 'condition', ...approved },
      { id: 'knife-size', item_template_id: 'knife-template', category_id: 'hand', binding_kind: 'size_band', packing_slot_cost: 1, packing_bundle_size: 1, ...approved }
    ],
    container_template_facet_bindings: [
      { id: 'chest-form', container_template_id: 'chest-template', category_id: 'chest', facet: 'container_form', ...approved },
      { id: 'chest-lid', container_template_id: 'chest-template', category_id: 'lid', facet: 'closure_type', ...approved },
      { id: 'chest-medium', container_template_id: 'chest-template', category_id: 'medium', facet: 'capacity_band', ...approved },
      { id: 'chest-portable', container_template_id: 'chest-template', category_id: 'portable', facet: 'portability', ...approved }
    ],
    container_content_category_relations: [{ id: 'chest-allows-knife', container_category_id: 'chest', content_category_id: 'knife', compatibility: 'allowed', ...approved }],
    container_content_profiles: [{ id: 'chest-profile', container_template_id: 'chest-template', empty_allowed: false, ...approved }],
    container_content_profile_entries: [{ id: 'chest-entry', profile_id: 'chest-profile', item_category_id: 'knife', min_quantity: 1, max_quantity: 1, required: true, ...approved }]
  };
}

test('item facets and container facets accept normalized bindings', () => {
  assert.deepEqual(validateItemContainerClassificationCatalog(records()), []);
});

test('canonical item/container validation rejects source evidence from another template revision', () => {
  const value = records();
  value.item_templates[0].world_revision_id = 'revision-1';
  value.world_revisions = [{ id: 'revision-1', ...approved }, { id: 'revision-2', ...approved }];
  value.source_records = [{ id: 'source-1', ...approved }];
  value.item_template_source_bindings = [{
    id: 'item-source-mismatch', item_template_id: 'knife-template', source_id: 'source-1', world_revision_id: 'revision-2',
    evidence_class: 'direct_novgorod', claim_scope: 'historical_presence', confidence: 'medium', review_status: 'reviewed', ...approved
  }];
  value.container_template_source_bindings = [{
    id: 'container-source-mismatch', container_template_id: 'chest-template', source_id: 'source-1', world_revision_id: 'revision-2',
    evidence_class: 'direct_novgorod', claim_scope: 'historical_presence', confidence: 'medium', review_status: 'reviewed', ...approved
  }];

  const errors = validateItemContainerClassificationCatalog(value);
  assert.ok(errors.includes('ITEM_SOURCE_BINDING_TEMPLATE_REVISION_MISMATCH:item-source-mismatch'));
  assert.ok(errors.includes('CONTAINER_SOURCE_BINDING_TEMPLATE_REVISION_MISMATCH:container-source-mismatch'));
});

test('container material is an independent facet and capacity policy is exact packing_slots v1', () => {
  const value = records();
  value.universal_categories.push({ id: 'container-wood', domain: 'container', facet: 'material', ...approved });
  value.container_template_facet_bindings.push({ id: 'chest-wood', container_template_id: 'chest-template', category_id: 'container-wood', facet: 'material', ...approved });
  value.container_templates[0].capacity_policy = { version: 1, mode: 'packing_slots', unit: 'packing_slot' };
  assert.deepEqual(validateItemContainerClassificationCatalog(value), []);
  const invalid = structuredClone(value);
  invalid.container_templates[0].capacity_policy = { version: 1, mode: 'bounded_quantity', unit: 'packing_slot' };
  assert.ok(validateItemContainerClassificationCatalog(invalid).includes('CONTAINER_CAPACITY_POLICY_INVALID:chest-template'));
  invalid.container_templates[0].capacity = 'one';
  assert.ok(validateItemContainerClassificationCatalog(invalid).includes('CONTAINER_CAPACITY_LEGACY_INVALID:chest-template'));
  assert.deepEqual(value.container_templates[0].capacity_policy, { version: 1, mode: 'packing_slots', unit: 'packing_slot' });
});

test('item classification blocks missing/wrong facets, duplicate primary binding and dangling templates', () => {
  const value = records();
  value.item_template_category_bindings.push({ ...value.item_template_category_bindings[3], id: 'wrong-material', category_id: 'cutting' });
  value.item_template_category_bindings.push({ ...value.item_template_category_bindings[1], id: 'primary-duplicate', exclusivity_group: 'primary_function' });
  value.item_template_category_bindings.push({ ...value.item_template_category_bindings[0], id: 'missing-template', item_template_id: 'missing' });
  value.item_template_category_bindings.push({ ...value.item_template_category_bindings[5], id: 'missing-condition', category_id: 'missing' });
  const errors = validateItemContainerClassificationCatalog(value);
  assert.ok(errors.includes('ITEM_BINDING_CATEGORY_FACET_INVALID:wrong-material:material'));
  assert.ok(errors.includes('ITEM_PRIMARY_FUNCTION_AMBIGUOUS:knife-template:primary_function'));
  assert.ok(errors.includes('ITEM_TEMPLATE_UNKNOWN:missing-template'));
  assert.ok(errors.includes('ITEM_BINDING_CATEGORY_UNKNOWN:missing-condition'));
  value.item_template_category_bindings[1].exclusivity_group = 'invented';
  assert.ok(validateItemContainerClassificationCatalog(value).includes('ITEM_EXCLUSIVITY_GROUP_INVALID:knife-primary'));
});

test('container compatibility and explicit empty candidates fail closed', () => {
  const value = records();
  value.container_content_category_relations[0].compatibility = 'forbidden';
  const errors = validateItemContainerClassificationCatalog(value);
  assert.ok(errors.includes('CONTAINER_CONTENT_INCOMPATIBLE:chest-entry:knife'));
  const empty = records();
  empty.container_content_profiles[0].empty_allowed = true;
  empty.container_content_profile_entries = [];
  const emptyErrors = validateItemContainerClassificationCatalog(empty);
  assert.ok(!emptyErrors.some((error) => error.startsWith('CONTAINER_EMPTY_NOT_ALLOWED:')));
  const inactive = records();
  inactive.universal_categories[0].replaced_by_category_id = 'knife-replacement';
  inactive.container_content_category_relations[0].status = 'draft';
  const inactiveErrors = validateItemContainerClassificationCatalog(inactive);
  assert.ok(inactiveErrors.includes('ITEM_BINDING_CATEGORY_INACTIVE:knife-object'));
  assert.ok(inactiveErrors.includes('CONTAINER_CONTENT_RELATION_INACTIVE:chest-allows-knife'));
  const permission = records();
  permission.container_template_facet_bindings[0].requires_regional_permission = true;
  assert.ok(validateItemContainerClassificationCatalog(permission, { worldRevisionId: 'revision-1', effectiveAt: '1230-01-01T00:00:00.000Z' }).includes('CONTAINER_FACET_REGIONAL_PERMISSION_MISSING:chest-form'));
});

test('equipment entries enforce XOR, FK and active item category', () => {
  const value = records();
  value.region_equipment_profiles = [{ id: 'equipment-profile', ...approved }];
  value.region_equipment_profile_entries = [{ id: 'equipment-entry', equipment_profile_id: 'missing', item_template_id: 'missing', item_category_id: 'knife', slot_key: 'hand', required: 'yes', weight: 0 }];
  const errors = validateItemContainerClassificationCatalog(value);
  assert.ok(errors.includes('EQUIPMENT_PROFILE_UNKNOWN:equipment-entry'));
  assert.ok(errors.includes('EQUIPMENT_TARGET_XOR_INVALID:equipment-entry'));
  assert.ok(errors.includes('EQUIPMENT_TEMPLATE_UNKNOWN:equipment-entry'));
  assert.ok(errors.includes('EQUIPMENT_ENTRY_SHAPE_INVALID:equipment-entry'));
});

test('migration inventory reports data gaps/conflicts and readiness distinguishes hard blocks without mutating inputs', () => {
  const value = records();
  const migration = assessItemContainerClassificationMigration({
    legacyRecords: [{ table_name: 'item_templates', record_id: 'knife-template', field_name: 'typical_material', legacy_value: 'железо' }],
    reviewedMappings: [{ legacy_field: 'typical_material', legacy_value: 'железо', category_ids: ['iron', 'forged'] }]
  });
  assert.deepEqual(migration.conflicts, ['MIGRATION_CONFLICT:item_templates:knife-template:typical_material']);
  assert.deepEqual(migration.gaps, []);
  const unknown = assessItemContainerClassificationMigration({ legacyRecords: [{ table_name: 'item_templates', record_id: 'knife-template', field_name: 'typical_material', legacy_value: 'unknown' }], reviewedMappings: [] });
  assert.deepEqual(unknown.gaps, ['DATA_GAP:item_templates:knife-template:typical_material']);
  value.item_profile_entries = [];
  const before = structuredClone(value);
  const missingProfile = assessItemContainerClassificationReadiness(value);
  assert.ok(missingProfile.concerns.includes('MISSING_REQUIRED_PROFILE:item-rule'));
  assert.deepEqual(value, before, 'validation never mutates authoring input');
  value.g4_item_materialization_rules = [];
  const withoutRules = structuredClone(value);
  const missingRule = assessItemContainerClassificationReadiness(value);
  assert.ok(missingRule.concerns.includes('MISSING_G4_RULE:knife-template'));
  assert.deepEqual(value, withoutRules, 'validation never mutates authoring input');
});

test('item/container authoring import remains dry-run-safe and transactionally verifies readback', async () => {
  const value = records();
  delete value.item_profile_sets;
  delete value.item_profile_entries;
  delete value.g4_item_materialization_rules;
  delete value.container_content_profiles;
  delete value.container_content_profile_entries;
  value.world_revisions = [{ id: 'revision-1', status: 'approved' }];
  value.container_templates[0].world_revision_id = 'revision-1';
  value.universal_categories = value.universal_categories.map((category) => ({
    ...category,
    stable_code: `test.${category.id}`,
    preferred_label: category.id,
    definition: 'Approved test category.',
    scope_note: 'Test scope.',
    inclusion_rules: 'Test inclusion.',
    exclusion_rules: 'Test exclusion.',
    title: category.id
  }));
  const tableNames = ['world_revisions', 'universal_categories', 'container_templates', 'item_template_category_bindings', 'container_template_facet_bindings', 'container_content_category_relations'];
  const manifest = {
    version: 2, schema: 'world_catalog_import_manifest_v2', world_revision_id: 'revision-1', approval: 'approved', deletion_mode: 'none',
    provenance: { source_ids: ['source-1'], minimum_confidence: 'high', effective_at: '1230-01-01T00:00:00.000Z', json_schema_version: 'item-container-v1', negative_fixture_evidence: true },
    tables: tableNames.map((table_name, dependency_order) => ({ table_name, dependency_order, record_count: value[table_name].length, payload_digest: digestValue(value[table_name]) }))
  };
  assert.deepEqual(validateCatalogImportManifest(manifest, { recordsByTable: value }), []);
  const calls = [];
  const adapter = {
    async begin() { calls.push('begin'); }, async insert(table) { calls.push(`insert:${table}`); },
    async readback(table) { return { record_count: value[table].length, payload_digest: digestValue(value[table]) }; },
    async commit() { calls.push('commit'); }, async rollback() { calls.push('rollback'); }
  };
  const dryRun = await importClassificationCatalog({ manifest, recordsByTable: value, mode: 'dry-run', adapter });
  assert.equal(dryRun.applied, false);
  assert.deepEqual(calls, []);
  const applied = await importClassificationCatalog({ manifest, recordsByTable: value, mode: 'apply', adapter });
  assert.equal(applied.applied, true);
  assert.ok(calls.includes('commit'));
});
