import { createHash } from 'node:crypto';

import { stableStringify } from './digest.js';
import { validateJsonSchemaRecords } from './materialization-readiness.js';
import sourceRecordsSchema from '../../../schemas/materialization/source-records-v1.schema.json' with { type: 'json' };
import recordSourcesSchema from '../../../schemas/materialization/record-sources-v1.schema.json' with { type: 'json' };
import worldRevisionsSchema from '../../../schemas/materialization/world-revisions-v1.schema.json' with { type: 'json' };
import universalCategoriesSchema from '../../../schemas/materialization/universal-categories-v1.schema.json' with { type: 'json' };
import categoryLabelsSchema from '../../../schemas/materialization/category-labels-v1.schema.json' with { type: 'json' };
import regionCategoryOptionsSchema from '../../../schemas/materialization/region-category-options-v1.schema.json' with { type: 'json' };
import itemTemplatesSchema from '../../../schemas/materialization/item-templates-v1.schema.json' with { type: 'json' };
import itemTemplateCategoryBindingsSchema from '../../../schemas/materialization/item-template-category-bindings-v1.schema.json' with { type: 'json' };
import itemTemplateInventoryProfilesSchema from '../../../schemas/materialization/item-template-inventory-profiles-v1.schema.json' with { type: 'json' };
import itemTemplateSourceBindingsSchema from '../../../schemas/materialization/item-template-source-bindings-v1.schema.json' with { type: 'json' };
import quantityUnitDefinitionsSchema from '../../../schemas/materialization/quantity-unit-definitions-v1.schema.json' with { type: 'json' };
import itemTemplateQuantityProfilesSchema from '../../../schemas/materialization/item-template-quantity-profiles-v1.schema.json' with { type: 'json' };
import containerTemplatesSchema from '../../../schemas/materialization/container-templates-v1.schema.json' with { type: 'json' };
import containerTemplateFacetBindingsSchema from '../../../schemas/materialization/container-template-facet-bindings-v1.schema.json' with { type: 'json' };
import containerTemplateInventoryProfilesSchema from '../../../schemas/materialization/container-template-inventory-profiles-v1.schema.json' with { type: 'json' };
import containerTemplateSourceBindingsSchema from '../../../schemas/materialization/container-template-source-bindings-v1.schema.json' with { type: 'json' };
import containerContentProfilesSchema from '../../../schemas/materialization/container-content-profiles-v1.schema.json' with { type: 'json' };
import containerContentProfileEntriesSchema from '../../../schemas/materialization/container-content-profile-entries-v1.schema.json' with { type: 'json' };
import itemProfileSetsSchema from '../../../schemas/materialization/item-profile-sets-v1.schema.json' with { type: 'json' };
import itemProfileEntriesSchema from '../../../schemas/materialization/item-profile-entries-v1.schema.json' with { type: 'json' };
import propertyProfilesSchema from '../../../schemas/materialization/property-profiles-v1.schema.json' with { type: 'json' };
import propertyProfileRulesSchema from '../../../schemas/materialization/property-profile-rules-v1.schema.json' with { type: 'json' };
import regionEquipmentProfilesSchema from '../../../schemas/materialization/region-equipment-profiles-v1.schema.json' with { type: 'json' };
import regionEquipmentProfileEntriesSchema from '../../../schemas/materialization/region-equipment-profile-entries-v1.schema.json' with { type: 'json' };
import itemClassificationMigrationInventorySchema from '../../../schemas/materialization/item-classification-migration-inventory-v1.schema.json' with { type: 'json' };

// A supplemental catalog is intentionally separate from the approved base archive.
// It is authoring input only; this validator never makes draft rows runtime candidates.
export const SUPPLEMENTAL_AUTHORING_TABLES = Object.freeze(new Set([
  'source_records', 'record_sources', 'world_revisions', 'universal_categories', 'category_labels',
  'region_category_options', 'item_templates', 'item_template_category_bindings',
  'item_template_inventory_profiles', 'item_template_source_bindings', 'quantity_unit_definitions', 'item_template_quantity_profiles',
  'container_templates', 'container_template_facet_bindings',
  'container_template_inventory_profiles', 'container_template_source_bindings', 'container_content_profiles',
  'container_content_profile_entries', 'item_profile_sets', 'item_profile_entries',
  'property_profiles', 'property_profile_rules', 'region_equipment_profiles',
  'region_equipment_profile_entries', 'item_classification_migration_inventory'
]));

const PARTY_PREFIXES = Object.freeze(['party_', 'runtime_', 'instance_']);
const STATUS = new Set(['draft', 'approved', 'deprecated']);
const STRICT_FIELDS = Object.freeze({
  universal_categories: new Set(['id', 'domain', 'parent_category_id', 'stable_code', 'facet', 'preferred_label', 'definition', 'scope_note', 'inclusion_rules', 'exclusion_rules', 'replaced_by_category_id', 'title', 'status']),
  category_labels: new Set(['id', 'category_id', 'language', 'label', 'label_type', 'valid_from', 'valid_to', 'source_id']),
  region_category_options: new Set(['id', 'world_revision_id', 'region_id', 'category_id', 'valid_from', 'valid_to', 'weight', 'applicability', 'status']),
  item_template_category_bindings: new Set(['id', 'item_template_id', 'category_id', 'binding_kind', 'packing_slot_cost', 'packing_bundle_size', 'exclusivity_group', 'requires_regional_permission', 'status']),
  item_template_inventory_profiles: new Set(['id', 'item_template_id', 'world_revision_id', 'source_id', 'mass_grams', 'carry_form', 'external_hand_cost', 'status']),
  item_template_source_bindings: new Set(['id', 'item_template_id', 'source_id', 'world_revision_id', 'evidence_class', 'claim_scope', 'valid_from', 'valid_to', 'confidence', 'review_status', 'notes', 'status']),
  quantity_unit_definitions: new Set(['id', 'dimension', 'canonical_unit', 'conversion_policy', 'status']),
  item_template_quantity_profiles: new Set(['id', 'item_template_id', 'world_revision_id', 'quantity_unit_id', 'quantity_dimension', 'minimum_quantity', 'maximum_quantity', 'default_quantity_policy', 'mass_grams_per_unit', 'stackable', 'partial_consumption_allowed', 'source_id', 'status']),
  container_template_facet_bindings: new Set(['id', 'container_template_id', 'category_id', 'facet', 'requires_regional_permission', 'status']),
  container_template_inventory_profiles: new Set(['id', 'container_template_id', 'world_revision_id', 'source_id', 'mass_grams', 'carry_form', 'external_hand_cost', 'inventory_role', 'status']),
  container_template_source_bindings: new Set(['id', 'container_template_id', 'source_id', 'world_revision_id', 'evidence_class', 'claim_scope', 'valid_from', 'valid_to', 'confidence', 'review_status', 'notes', 'status']),
  source_records: new Set(['id', 'title', 'source_type', 'summary', 'status', 'confidence']),
  record_sources: new Set(['id', 'source_id', 'target_table', 'target_record_id', 'support_type', 'summary', 'page_or_section', 'confidence', 'contradiction_notes']),
  world_revisions: new Set(['id', 'parent_revision_id', 'title', 'effective_from', 'effective_to', 'catalog_digest', 'status']),
  item_templates: new Set(['id', 'world_revision_id', 'region_id', 'category_id', 'source_id', 'title', 'status']),
  container_templates: new Set(['id', 'world_revision_id', 'region_id', 'category_id', 'source_id', 'capacity', 'packing_slot_cost', 'capacity_policy', 'access_policy', 'status']),
  item_profile_sets: new Set(['id', 'world_revision_id', 'region_id', 'context_domain', 'applicability', 'status']),
  item_profile_entries: new Set(['id', 'profile_id', 'item_template_id', 'item_category_id', 'slot_key', 'min_quantity', 'max_quantity', 'required', 'weight']),
  container_content_profiles: new Set(['id', 'container_template_id', 'empty_allowed', 'status']),
  container_content_profile_entries: new Set(['id', 'profile_id', 'item_template_id', 'item_category_id', 'min_quantity', 'max_quantity', 'required', 'weight']),
  property_profiles: new Set(['id', 'world_revision_id', 'region_id', 'property_category_id', 'status']),
  property_profile_rules: new Set(['id', 'property_profile_id', 'owner_kind', 'holder_kind', 'controller_kind', 'access_policy', 'claim_conditions', 'status']),
  region_equipment_profiles: new Set(['id', 'region_id', 'social_role_id', 'occupation_id', 'status']),
  region_equipment_profile_entries: new Set(['id', 'equipment_profile_id', 'item_template_id', 'item_category_id', 'slot_key', 'required', 'weight']),
  item_classification_migration_inventory: new Set(['id', 'legacy_table_name', 'legacy_record_id', 'legacy_field_name', 'legacy_value', 'resolution_status', 'resolved_category_id', 'report_note'])
});
const SCHEMA_IDS = Object.freeze({
  source_records: 'rus.source_records.v1', record_sources: 'rus.record_sources.v1', world_revisions: 'rus.world_revisions.v1', universal_categories: 'rus.universal_categories.v1', category_labels: 'rus.category_labels.v1', region_category_options: 'rus.region_category_options.v1',
  item_templates: 'rus.item_templates.v1', item_template_category_bindings: 'rus.item_template_category_bindings.v1', item_template_inventory_profiles: 'rus.item_template_inventory_profiles.v1',
  item_template_source_bindings: 'rus.item_template_source_bindings.v1',
  quantity_unit_definitions: 'rus.quantity_unit_definitions.v1', item_template_quantity_profiles: 'rus.item_template_quantity_profiles.v1',
  container_templates: 'rus.container_templates.v1', container_template_facet_bindings: 'rus.container_template_facet_bindings.v1', container_template_inventory_profiles: 'rus.container_template_inventory_profiles.v1',
  container_template_source_bindings: 'rus.container_template_source_bindings.v1',
  container_content_profiles: 'rus.container_content_profiles.v1', container_content_profile_entries: 'rus.container_content_profile_entries.v1',
  item_profile_sets: 'rus.item_profile_sets.v1', item_profile_entries: 'rus.item_profile_entries.v1',
  property_profiles: 'rus.property_profiles.v1', property_profile_rules: 'rus.property_profile_rules.v1',
  region_equipment_profiles: 'rus.region_equipment_profiles.v1', region_equipment_profile_entries: 'rus.region_equipment_profile_entries.v1', item_classification_migration_inventory: 'rus.item_classification_migration_inventory.v1'
});
const SUPPLEMENTAL_FK_DEPENDENCIES = Object.freeze({
  world_revisions: ['world_revisions'], universal_categories: ['universal_categories'],
  record_sources: ['source_records'],
  category_labels: ['universal_categories', 'source_records'], region_category_options: ['world_revisions', 'universal_categories'],
  item_templates: ['world_revisions', 'universal_categories', 'source_records'],
  item_template_category_bindings: ['item_templates', 'universal_categories'], item_template_inventory_profiles: ['item_templates', 'world_revisions', 'source_records'],
  item_template_source_bindings: ['item_templates', 'world_revisions', 'source_records'],
  quantity_unit_definitions: [], item_template_quantity_profiles: ['item_templates', 'world_revisions', 'quantity_unit_definitions', 'source_records'],
  container_templates: ['world_revisions', 'universal_categories', 'source_records'], container_template_facet_bindings: ['container_templates', 'universal_categories'],
  container_template_inventory_profiles: ['container_templates', 'world_revisions', 'source_records'], container_content_profiles: ['container_templates'],
  container_template_source_bindings: ['container_templates', 'world_revisions', 'source_records'],
  container_content_profile_entries: ['container_content_profiles', 'item_templates', 'universal_categories'], item_profile_sets: ['world_revisions'],
  item_profile_entries: ['item_profile_sets', 'item_templates', 'universal_categories'], property_profiles: ['world_revisions', 'universal_categories'],
  property_profile_rules: ['property_profiles'], region_equipment_profile_entries: ['region_equipment_profiles', 'item_templates', 'universal_categories'],
  item_classification_migration_inventory: ['universal_categories']
});
const SCHEMAS = Object.freeze({
  source_records: sourceRecordsSchema, record_sources: recordSourcesSchema, world_revisions: worldRevisionsSchema, universal_categories: universalCategoriesSchema, category_labels: categoryLabelsSchema, region_category_options: regionCategoryOptionsSchema,
  item_templates: itemTemplatesSchema, item_template_category_bindings: itemTemplateCategoryBindingsSchema, item_template_inventory_profiles: itemTemplateInventoryProfilesSchema,
  item_template_source_bindings: itemTemplateSourceBindingsSchema,
  quantity_unit_definitions: quantityUnitDefinitionsSchema, item_template_quantity_profiles: itemTemplateQuantityProfilesSchema,
  container_templates: containerTemplatesSchema, container_template_facet_bindings: containerTemplateFacetBindingsSchema, container_template_inventory_profiles: containerTemplateInventoryProfilesSchema,
  container_template_source_bindings: containerTemplateSourceBindingsSchema,
  container_content_profiles: containerContentProfilesSchema, container_content_profile_entries: containerContentProfileEntriesSchema,
  item_profile_sets: itemProfileSetsSchema, item_profile_entries: itemProfileEntriesSchema,
  property_profiles: propertyProfilesSchema, property_profile_rules: propertyProfileRulesSchema,
  region_equipment_profiles: regionEquipmentProfilesSchema, region_equipment_profile_entries: regionEquipmentProfileEntriesSchema, item_classification_migration_inventory: itemClassificationMigrationInventorySchema
});

export function supplementalDigest(records) {
  return createHash('sha256').update(stableStringify(records), 'utf8').digest('hex');
}

export function validateSupplementalCatalogBundle(manifest, recordsByTable = {}, { externalIds = {} } = {}) {
  const errors = [];
  const datasets = manifest?.datasets;
  if (manifest?.schema_version !== 1) errors.push('MANIFEST_SCHEMA_INVALID');
  if (typeof manifest?.bundle_id !== 'string' || !manifest.bundle_id) errors.push('BUNDLE_ID_MISSING');
  if (typeof manifest?.world_revision_id !== 'string' || !manifest.world_revision_id) errors.push('WORLD_REVISION_ID_MISSING');
  if (manifest?.approval !== 'draft') errors.push('SUPPLEMENTAL_MANIFEST_NOT_DRAFT');
  if (manifest?.deletion_policy !== 'none') errors.push('DELETION_POLICY_INVALID');
  if (!manifest?.provenance || !Array.isArray(manifest.provenance.source_ids) || manifest.provenance.source_ids.length === 0) errors.push('PROVENANCE_SOURCES_MISSING');
  if (!Array.isArray(datasets)) return Object.freeze({ errors: Object.freeze([...errors, 'DATASET_LIST_MISSING']) });

  const declared = new Set();
  let previousOrder = -1;
  for (const dataset of datasets) {
    const table = dataset?.table;
    if (!SUPPLEMENTAL_AUTHORING_TABLES.has(table)) errors.push(`TABLE_NOT_REGISTERED:${table}`);
    if (dataset?.schema_id !== SCHEMA_IDS[table] || dataset?.schema_id !== SCHEMAS[table]?.$id) errors.push(`SCHEMA_ID_INVALID:${table}`);
    if (PARTY_PREFIXES.some((prefix) => String(table).startsWith(prefix))) errors.push(`PARTY_TABLE_FORBIDDEN:${table}`);
    if (declared.has(table)) errors.push(`TABLE_DUPLICATE:${table}`);
    declared.add(table);
    if (!Number.isInteger(dataset?.dependency_order) || dataset.dependency_order < previousOrder) errors.push(`DEPENDENCY_ORDER_INVALID:${table}`);
    previousOrder = dataset?.dependency_order;
    if (!Number.isInteger(dataset?.record_count) || dataset.record_count < 0) errors.push(`RECORD_COUNT_INVALID:${table}`);
    if (!/^[a-f0-9]{64}$/u.test(String(dataset?.sha256 ?? ''))) errors.push(`DATASET_DIGEST_INVALID:${table}`);
    if (typeof dataset?.path !== 'string' || dataset.path.includes('..')) errors.push(`DATASET_PATH_INVALID:${table}`);
    const records = recordsByTable[table];
    if (!Array.isArray(records)) { errors.push(`DATASET_MISSING:${table}`); continue; }
    if (records.length !== dataset.record_count) errors.push(`RECORD_COUNT_MISMATCH:${table}`);
    if (supplementalDigest(records) !== dataset.sha256) errors.push(`DATASET_DIGEST_MISMATCH:${table}`);
    if (SCHEMAS[table]) errors.push(...validateJsonSchemaRecords(table, records, SCHEMAS[table]));
  }
  for (const table of Object.keys(recordsByTable)) if (!declared.has(table)) errors.push(`TABLE_PAYLOAD_NOT_DECLARED:${table}`);
  const orderByTable = new Map(datasets.map((dataset) => [dataset.table, dataset.dependency_order]));
  for (const [table, dependencies] of Object.entries(SUPPLEMENTAL_FK_DEPENDENCIES)) for (const dependency of dependencies) {
    if (dependency !== table && declared.has(table) && declared.has(dependency) && orderByTable.get(dependency) >= orderByTable.get(table)) errors.push(`FK_DEPENDENCY_ORDER_INVALID:${table}:${dependency}`);
  }

  const local = (table) => new Set((recordsByTable[table] ?? []).map((record) => record?.id).filter(Boolean));
  const known = (table) => new Set([...local(table), ...(externalIds[table] ?? [])]);
  const categories = known('universal_categories');
  const templates = known('item_templates');
  const containers = known('container_templates');
  const profiles = known('item_profile_sets');
  const contentProfiles = known('container_content_profiles');
  const equipmentProfiles = known('region_equipment_profiles');
  const sources = known('source_records');
  const revisions = known('world_revisions');
  const quantityUnits = known('quantity_unit_definitions');
  const regions = known('regions');

  for (const sourceId of manifest.provenance.source_ids ?? []) {
    if (!sources.has(sourceId)) errors.push(`PROVENANCE_SOURCE_UNKNOWN:${sourceId}`);
  }

  for (const [table, records] of Object.entries(recordsByTable)) for (const record of records ?? []) {
    const allowed = STRICT_FIELDS[table];
    if (allowed) for (const key of Object.keys(record ?? {})) if (!allowed.has(key)) errors.push(`RECORD_FIELD_FORBIDDEN:${table}:${record?.id ?? '?'}:${key}`);
    if (!record?.id && table !== 'region_category_options') errors.push(`RECORD_ID_MISSING:${table}`);
    if (record?.status != null && !STATUS.has(record.status)) errors.push(`STATUS_INVALID:${table}:${record.id ?? '?'}`);
    if (record?.status != null && record.status !== 'draft') errors.push(`SUPPLEMENTAL_RECORD_NOT_DRAFT:${table}:${record.id ?? '?'}`);
  }
  for (const record of recordsByTable.universal_categories ?? []) {
    for (const key of ['stable_code', 'domain', 'facet', 'preferred_label', 'definition', 'scope_note', 'inclusion_rules', 'exclusion_rules', 'title']) {
      if (typeof record?.[key] !== 'string' || !record[key].trim()) errors.push(`CATEGORY_FIELD_REQUIRED:${record?.id ?? '?'}:${key}`);
    }
    if (record.parent_category_id && !categories.has(record.parent_category_id)) errors.push(`CATEGORY_PARENT_UNKNOWN:${record.id}`);
    if (record.replaced_by_category_id && !categories.has(record.replaced_by_category_id)) errors.push(`CATEGORY_REPLACEMENT_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.category_labels ?? []) {
    if (!categories.has(record.category_id)) errors.push(`LABEL_CATEGORY_UNKNOWN:${record.id}`);
    if (record.source_id && !sources.has(record.source_id)) errors.push(`LABEL_SOURCE_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.record_sources ?? []) {
    if (!sources.has(record.source_id)) errors.push(`RECORD_SOURCE_SOURCE_UNKNOWN:${record.id}`);
    if (!SUPPLEMENTAL_AUTHORING_TABLES.has(record.target_table) || record.target_table === 'record_sources') {
      errors.push(`RECORD_SOURCE_TARGET_TABLE_INVALID:${record.id}`);
      continue;
    }
    if (!known(record.target_table).has(record.target_record_id)) errors.push(`RECORD_SOURCE_TARGET_UNKNOWN:${record.id}`);
    if (orderByTable.has(record.target_table) && orderByTable.get(record.target_table) >= orderByTable.get('record_sources')) {
      errors.push(`RECORD_SOURCE_TARGET_ORDER_INVALID:${record.id}`);
    }
  }
  for (const record of recordsByTable.world_revisions ?? []) {
    if (record.parent_revision_id && !revisions.has(record.parent_revision_id)) errors.push(`WORLD_REVISION_PARENT_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.region_category_options ?? []) {
    if (!revisions.has(record.world_revision_id)) errors.push(`REGION_OPTION_REVISION_UNKNOWN:${record.id}`);
    if (!regions.has(record.region_id)) errors.push(`REGION_OPTION_REGION_UNKNOWN:${record.id}`);
    if (!categories.has(record.category_id)) errors.push(`REGION_OPTION_CATEGORY_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.item_templates ?? []) {
    if (!regions.has(record.region_id)) errors.push(`ITEM_REGION_UNKNOWN:${record.id}`);
    if (!revisions.has(record.world_revision_id)) errors.push(`ITEM_REVISION_UNKNOWN:${record.id}`);
    if (!categories.has(record.category_id)) errors.push(`ITEM_CATEGORY_UNKNOWN:${record.id}`);
    if (!sources.has(record.source_id)) errors.push(`ITEM_SOURCE_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.container_templates ?? []) {
    if (!regions.has(record.region_id)) errors.push(`CONTAINER_REGION_UNKNOWN:${record.id}`);
    if (!revisions.has(record.world_revision_id)) errors.push(`CONTAINER_REVISION_UNKNOWN:${record.id}`);
    if (!categories.has(record.category_id)) errors.push(`CONTAINER_CATEGORY_UNKNOWN:${record.id}`);
    if (!sources.has(record.source_id)) errors.push(`CONTAINER_SOURCE_UNKNOWN:${record.id}`);
    if (!Number.isInteger(record.capacity) || record.capacity < 1) errors.push(`CONTAINER_CAPACITY_INVALID:${record.id}`);
  }
  const bindingsByTemplate = new Map();
  for (const record of recordsByTable.item_template_category_bindings ?? []) {
    if (!templates.has(record.item_template_id)) errors.push(`ITEM_BINDING_TEMPLATE_UNKNOWN:${record.id}`);
    if (!categories.has(record.category_id)) errors.push(`ITEM_BINDING_CATEGORY_UNKNOWN:${record.id}`);
    const list = bindingsByTemplate.get(record.item_template_id) ?? [];
    list.push(record); bindingsByTemplate.set(record.item_template_id, list);
  }
  for (const id of templates) {
    const bindings = bindingsByTemplate.get(id) ?? [];
    if (bindings.filter((record) => record.binding_kind === 'object_type').length !== 1) errors.push(`ITEM_OBJECT_TYPE_AMBIGUOUS:${id}`);
    if (bindings.filter((record) => record.binding_kind === 'primary_function' && record.exclusivity_group === 'primary_function').length !== 1) errors.push(`ITEM_PRIMARY_FUNCTION_AMBIGUOUS:${id}`);
  }
  for (const record of recordsByTable.item_template_inventory_profiles ?? []) {
    if (!templates.has(record.item_template_id)) errors.push(`ITEM_INVENTORY_TEMPLATE_UNKNOWN:${record.id}`);
    if (!revisions.has(record.world_revision_id)) errors.push(`ITEM_INVENTORY_REVISION_UNKNOWN:${record.id}`);
    if (!sources.has(record.source_id)) errors.push(`ITEM_INVENTORY_SOURCE_UNKNOWN:${record.id}`);
    if (!Number.isInteger(record.mass_grams) || record.mass_grams <= 0) errors.push(`ITEM_MASS_INVALID:${record.id}`);
  }
  const itemSourceBindingKeys = new Set();
  for (const record of recordsByTable.item_template_source_bindings ?? []) {
    if (!templates.has(record.item_template_id)) errors.push(`ITEM_SOURCE_BINDING_TEMPLATE_UNKNOWN:${record.id}`);
    if (!revisions.has(record.world_revision_id)) errors.push(`ITEM_SOURCE_BINDING_REVISION_UNKNOWN:${record.id}`);
    if (!sources.has(record.source_id)) errors.push(`ITEM_SOURCE_BINDING_SOURCE_UNKNOWN:${record.id}`);
    const template = (recordsByTable.item_templates ?? []).find((value) => value.id === record.item_template_id);
    if (template && template.world_revision_id !== record.world_revision_id) errors.push(`ITEM_SOURCE_BINDING_TEMPLATE_REVISION_MISMATCH:${record.id}`);
    if (record.valid_from && record.valid_to && record.valid_from > record.valid_to) errors.push(`ITEM_SOURCE_BINDING_PERIOD_INVALID:${record.id}`);
    const key = `${record.item_template_id}:${record.source_id}:${record.claim_scope}`;
    if (itemSourceBindingKeys.has(key)) errors.push(`ITEM_SOURCE_BINDING_DUPLICATE:${record.id}`);
    itemSourceBindingKeys.add(key);
  }
  const quantityProfilesByTemplateRevision = new Set();
  for (const record of recordsByTable.item_template_quantity_profiles ?? []) {
    if (!templates.has(record.item_template_id)) errors.push(`QUANTITY_PROFILE_TEMPLATE_UNKNOWN:${record.id}`);
    if (!revisions.has(record.world_revision_id)) errors.push(`QUANTITY_PROFILE_REVISION_UNKNOWN:${record.id}`);
    if (!quantityUnits.has(record.quantity_unit_id)) errors.push(`QUANTITY_PROFILE_UNIT_UNKNOWN:${record.id}`);
    if (!sources.has(record.source_id)) errors.push(`QUANTITY_PROFILE_SOURCE_UNKNOWN:${record.id}`);
    if (!Number.isInteger(record.minimum_quantity) || record.minimum_quantity < 1 || (record.maximum_quantity != null && (!Number.isInteger(record.maximum_quantity) || record.maximum_quantity < record.minimum_quantity))) {
      errors.push(`QUANTITY_PROFILE_RANGE_INVALID:${record.id}`);
    }
    const unit = (recordsByTable.quantity_unit_definitions ?? []).find((value) => value.id === record.quantity_unit_id);
    if (unit && unit.dimension !== record.quantity_dimension) errors.push(`QUANTITY_PROFILE_DIMENSION_MISMATCH:${record.id}`);
    const key = `${record.item_template_id}:${record.world_revision_id}`;
    if (quantityProfilesByTemplateRevision.has(key)) errors.push(`QUANTITY_PROFILE_DUPLICATE:${record.id}`);
    quantityProfilesByTemplateRevision.add(key);
  }
  for (const record of recordsByTable.container_template_inventory_profiles ?? []) {
    if (!containers.has(record.container_template_id)) errors.push(`CONTAINER_INVENTORY_TEMPLATE_UNKNOWN:${record.id}`);
    if (!revisions.has(record.world_revision_id)) errors.push(`CONTAINER_INVENTORY_REVISION_UNKNOWN:${record.id}`);
    if (!sources.has(record.source_id)) errors.push(`CONTAINER_INVENTORY_SOURCE_UNKNOWN:${record.id}`);
  }
  const containerSourceBindingKeys = new Set();
  for (const record of recordsByTable.container_template_source_bindings ?? []) {
    if (!containers.has(record.container_template_id)) errors.push(`CONTAINER_SOURCE_BINDING_TEMPLATE_UNKNOWN:${record.id}`);
    if (!revisions.has(record.world_revision_id)) errors.push(`CONTAINER_SOURCE_BINDING_REVISION_UNKNOWN:${record.id}`);
    if (!sources.has(record.source_id)) errors.push(`CONTAINER_SOURCE_BINDING_SOURCE_UNKNOWN:${record.id}`);
    const template = (recordsByTable.container_templates ?? []).find((value) => value.id === record.container_template_id);
    if (template && template.world_revision_id !== record.world_revision_id) errors.push(`CONTAINER_SOURCE_BINDING_TEMPLATE_REVISION_MISMATCH:${record.id}`);
    if (record.valid_from && record.valid_to && record.valid_from > record.valid_to) errors.push(`CONTAINER_SOURCE_BINDING_PERIOD_INVALID:${record.id}`);
    const key = `${record.container_template_id}:${record.source_id}:${record.claim_scope}`;
    if (containerSourceBindingKeys.has(key)) errors.push(`CONTAINER_SOURCE_BINDING_DUPLICATE:${record.id}`);
    containerSourceBindingKeys.add(key);
  }
  for (const record of recordsByTable.container_template_facet_bindings ?? []) {
    if (!containers.has(record.container_template_id)) errors.push(`CONTAINER_FACET_TEMPLATE_UNKNOWN:${record.id}`);
    if (!categories.has(record.category_id)) errors.push(`CONTAINER_FACET_CATEGORY_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.container_content_profiles ?? []) if (!containers.has(record.container_template_id)) errors.push(`CONTENT_PROFILE_CONTAINER_UNKNOWN:${record.id}`);
  for (const record of recordsByTable.container_content_profile_entries ?? []) {
    if (!contentProfiles.has(record.profile_id)) errors.push(`CONTENT_ENTRY_PROFILE_UNKNOWN:${record.id}`);
    if ((record.item_template_id == null) === (record.item_category_id == null)) errors.push(`CONTENT_ENTRY_TARGET_XOR_INVALID:${record.id}`);
    if (record.item_template_id != null && !templates.has(record.item_template_id)) errors.push(`CONTENT_ENTRY_TEMPLATE_UNKNOWN:${record.id}`);
    if (record.item_category_id != null && !categories.has(record.item_category_id)) errors.push(`CONTENT_ENTRY_CATEGORY_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.item_profile_entries ?? []) {
    if (!profiles.has(record.profile_id)) errors.push(`PROFILE_ENTRY_PROFILE_UNKNOWN:${record.id}`);
    if ((record.item_template_id == null) === (record.item_category_id == null)) errors.push(`PROFILE_ENTRY_TARGET_XOR_INVALID:${record.id}`);
    if (record.item_template_id != null && !templates.has(record.item_template_id)) errors.push(`PROFILE_ENTRY_TEMPLATE_UNKNOWN:${record.id}`);
    if (record.item_category_id != null && !categories.has(record.item_category_id)) errors.push(`PROFILE_ENTRY_CATEGORY_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.region_equipment_profile_entries ?? []) {
    if (!equipmentProfiles.has(record.equipment_profile_id)) errors.push(`EQUIPMENT_ENTRY_PROFILE_UNKNOWN:${record.id}`);
    if ((record.item_template_id == null) === (record.item_category_id == null)) errors.push(`EQUIPMENT_ENTRY_TARGET_XOR_INVALID:${record.id}`);
    if (record.item_template_id != null && !templates.has(record.item_template_id)) errors.push(`EQUIPMENT_ENTRY_TEMPLATE_UNKNOWN:${record.id}`);
    if (record.item_category_id != null && !categories.has(record.item_category_id)) errors.push(`EQUIPMENT_ENTRY_CATEGORY_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.item_profile_sets ?? []) {
    if (!revisions.has(record.world_revision_id)) errors.push(`ITEM_PROFILE_REVISION_UNKNOWN:${record.id}`);
    if (!regions.has(record.region_id)) errors.push(`ITEM_PROFILE_REGION_UNKNOWN:${record.id}`);
  }
  const propertyProfiles = known('property_profiles');
  for (const record of recordsByTable.property_profiles ?? []) {
    if (!revisions.has(record.world_revision_id)) errors.push(`PROPERTY_PROFILE_REVISION_UNKNOWN:${record.id}`);
    if (!regions.has(record.region_id)) errors.push(`PROPERTY_PROFILE_REGION_UNKNOWN:${record.id}`);
    if (!categories.has(record.property_category_id)) errors.push(`PROPERTY_PROFILE_CATEGORY_UNKNOWN:${record.id}`);
  }
  for (const record of recordsByTable.property_profile_rules ?? []) if (!propertyProfiles.has(record.property_profile_id)) errors.push(`PROPERTY_RULE_PROFILE_UNKNOWN:${record.id}`);
  for (const record of recordsByTable.item_classification_migration_inventory ?? []) if (record.resolved_category_id && !categories.has(record.resolved_category_id)) errors.push(`MIGRATION_RESOLVED_CATEGORY_UNKNOWN:${record.id}`);
  for (const record of recordsByTable.region_equipment_profiles ?? []) {
    if (!regions.has(record.region_id)) errors.push(`EQUIPMENT_REGION_UNKNOWN:${record.id}`);
    if (record.social_role_id && !known('region_social_roles').has(record.social_role_id)) errors.push(`EQUIPMENT_ROLE_UNKNOWN:${record.id}`);
    if (record.occupation_id && !known('region_occupations').has(record.occupation_id)) errors.push(`EQUIPMENT_OCCUPATION_UNKNOWN:${record.id}`);
  }
  return Object.freeze({ errors: Object.freeze(errors) });
}

export async function applySupplementalCatalogBundle({ manifest, recordsByTable = {}, adapter, externalIds = {} } = {}) {
  if (!adapter || typeof adapter.begin !== 'function' || typeof adapter.insert !== 'function' || typeof adapter.readback !== 'function' || typeof adapter.commit !== 'function' || typeof adapter.rollback !== 'function') throw new Error('SUPPLEMENTAL_APPLY_ADAPTER_INVALID');
  const validation = validateSupplementalCatalogBundle(manifest, recordsByTable, { externalIds });
  if (validation.errors.length > 0) return Object.freeze({ applied: false, errors: validation.errors, tables: Object.freeze([]) });
  const datasets = [...manifest.datasets].sort((left, right) => left.dependency_order - right.dependency_order || left.table.localeCompare(right.table));
  await adapter.begin();
  try {
    for (const dataset of datasets) {
      await adapter.insert(dataset.table, recordsByTable[dataset.table]);
      const readback = await adapter.readback(dataset.table, recordsByTable[dataset.table]);
      if (readback?.record_count !== dataset.record_count || readback?.payload_digest !== dataset.sha256) throw new Error(`SUPPLEMENTAL_READBACK_MISMATCH:${dataset.table}:expected=${dataset.record_count}/${dataset.sha256}:actual=${readback?.record_count}/${readback?.payload_digest}`);
    }
    await adapter.commit();
    return Object.freeze({ applied: true, errors: Object.freeze([]), tables: Object.freeze(datasets.map((dataset) => dataset.table)) });
  } catch (error) {
    await adapter.rollback();
    throw error;
  }
}
