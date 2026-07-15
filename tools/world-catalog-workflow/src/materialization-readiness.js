const AUTHORING_TABLES = new Set([
  'source_records', 'record_sources',
  'world_revisions', 'classification_schemes', 'universal_categories', 'category_labels', 'category_scheme_mappings', 'universal_category_relations', 'universal_parameter_definitions', 'region_category_options',
  'region_npc_archetypes', 'region_demographic_profiles', 'region_name_pools', 'region_name_pool_entries', 'region_appearance_profiles',
  'region_clothing_profiles', 'region_equipment_profiles', 'region_equipment_profile_entries', 'region_knowledge_profiles', 'region_behavior_profiles',
  'region_relationship_profiles', 'region_activity_profiles', 'region_schedule_profiles', 'region_npc_profile_sets', 'room_templates',
  'building_layout_templates', 'building_layout_nodes', 'building_layout_edges', 'g4_materialization_profiles', 'g4_materialization_bindings',
  'g5_minilocation_templates', 'g5_anchor_templates', 'g5_edge_templates', 'materialization_slot_rules', 'container_templates',
  'g4_materialization_layout_edges',
  'item_profile_sets', 'item_profile_entries', 'container_content_profiles', 'container_content_profile_entries', 'property_profiles',
  'property_profile_rules', 'transport_templates', 'g4_npc_materialization_rules', 'g4_item_materialization_rules', 'g4_container_materialization_rules',
  'decision_command_catalog', 'decision_policy_profiles', 'decision_policy_options'
]);

const INSTANCE_PREFIXES = ['party_', 'runtime_', 'instance_'];
const LOOKUP_TABLES = new Set(['regions', 'graph_nodes', 'building_templates', 'item_templates', 'region_social_roles']);
const REQUIRED_FOR_G4 = [
  'source_records', 'record_sources', 'world_revisions', 'universal_categories', 'region_category_options', 'g4_materialization_profiles', 'g4_materialization_bindings',
  'room_templates', 'building_layout_templates', 'building_layout_nodes', 'building_layout_edges', 'g5_minilocation_templates', 'g5_anchor_templates', 'g5_edge_templates', 'materialization_slot_rules', 'g4_materialization_layout_edges', 'region_npc_profile_sets', 'item_profile_sets',
  'region_npc_archetypes', 'region_demographic_profiles', 'region_appearance_profiles', 'region_behavior_profiles', 'region_activity_profiles',
  'item_profile_entries', 'container_templates', 'g4_npc_materialization_rules', 'g4_item_materialization_rules', 'g4_container_materialization_rules'
];

export const MATERIALIZATION_FOREIGN_KEYS = Object.freeze([
  ['world_revisions','parent_revision_id','world_revisions'], ['universal_categories','parent_category_id','universal_categories'],
  ['category_labels','category_id','universal_categories'], ['category_labels','source_id','source_records'],
  ['category_scheme_mappings','category_id','universal_categories'], ['category_scheme_mappings','classification_scheme_id','classification_schemes'], ['category_scheme_mappings','source_id','source_records'],
  ['region_category_options','region_id','regions'], ['region_npc_archetypes','region_id','regions'], ['region_demographic_profiles','region_id','regions'], ['region_name_pools','region_id','regions'],
  ['region_appearance_profiles','region_id','regions'], ['region_clothing_profiles','region_id','regions'], ['region_equipment_profiles','region_id','regions'], ['region_knowledge_profiles','region_id','regions'],
  ['region_behavior_profiles','region_id','regions'], ['region_relationship_profiles','region_id','regions'], ['region_activity_profiles','region_id','regions'], ['region_schedule_profiles','region_id','regions'],
  ['room_templates','region_id','regions'], ['building_layout_templates','region_id','regions'], ['g4_materialization_profiles','region_id','regions'], ['container_templates','region_id','regions'], ['item_profile_sets','region_id','regions'], ['property_profiles','region_id','regions'], ['transport_templates','region_id','regions'],
  ['region_category_options','world_revision_id','world_revisions'], ['region_category_options','category_id','universal_categories'],
  ['universal_category_relations','from_category_id','universal_categories'], ['universal_category_relations','to_category_id','universal_categories'], ['universal_parameter_definitions','category_id','universal_categories'],
  ['decision_policy_profiles','region_id','regions'],
  ['decision_policy_profiles','world_revision_id','world_revisions'], ['decision_policy_options','policy_profile_id','decision_policy_profiles'], ['decision_policy_options','command_id','decision_command_catalog'],
  ['region_npc_archetypes','world_revision_id','world_revisions'], ['region_npc_archetypes','social_role_id','region_social_roles'], ['region_npc_archetypes','occupation_id','region_occupations'], ['region_npc_archetypes','legal_status_id','legal_status_archetypes'], ['region_npc_archetypes','mobility_id','mobility_archetypes'], ['region_demographic_profiles','demographic_option_id','region_category_options'], ['region_name_pools','world_revision_id','world_revisions'], ['region_name_pool_entries','name_pool_id','region_name_pools'], ['region_name_pool_entries','name_category_id','universal_categories'],
  ['region_appearance_profiles','appearance_option_id','region_category_options'], ['region_clothing_profiles','garment_category_id','universal_categories'], ['region_equipment_profiles','social_role_id','region_social_roles'], ['region_equipment_profiles','occupation_id','region_occupations'], ['region_equipment_profile_entries','equipment_profile_id','region_equipment_profiles'], ['region_equipment_profile_entries','item_template_id','item_templates'], ['region_equipment_profile_entries','item_category_id','universal_categories'],
  ['region_knowledge_profiles','knowledge_category_id','universal_categories'], ['region_behavior_profiles','behavior_option_id','region_category_options'], ['region_behavior_profiles','decision_policy_id','decision_policy_profiles'], ['region_relationship_profiles','relationship_option_id','region_category_options'], ['region_activity_profiles','activity_option_id','region_category_options'], ['region_activity_profiles','graph_node_id','graph_nodes'], ['region_schedule_profiles','activity_profile_id','region_activity_profiles'], ['region_schedule_profiles','place_id','places'], ['region_schedule_profiles','route_template_id','route_templates'], ['region_schedule_profiles','fallback_activity_profile_id','region_activity_profiles'],
  ['room_templates','room_category_id','universal_categories'], ['building_layout_templates','world_revision_id','world_revisions'], ['building_layout_templates','building_template_id','building_templates'],
  ['building_layout_nodes','layout_template_id','building_layout_templates'], ['building_layout_nodes','room_template_id','room_templates'],
  ['building_layout_edges','layout_template_id','building_layout_templates'], ['building_layout_edges','from_node_id','building_layout_nodes'], ['building_layout_edges','to_node_id','building_layout_nodes'], ['building_layout_edges','passage_category_id','universal_categories'],
  ['g5_minilocation_templates','category_id','universal_categories'], ['g5_anchor_templates','category_id','universal_categories'], ['g5_edge_templates','passage_category_id','universal_categories'],
  ['g4_materialization_profiles','world_revision_id','world_revisions'], ['g4_materialization_profiles','layout_template_id','building_layout_templates'],
  ['g4_materialization_bindings','profile_id','g4_materialization_profiles'], ['g4_materialization_bindings','graph_node_id','graph_nodes'], ['g4_materialization_bindings','place_template_id','place_templates'], ['g4_materialization_bindings','building_template_id','building_templates'],
  ['materialization_slot_rules','profile_id','g4_materialization_profiles'], ['materialization_slot_rules','g5_minilocation_template_id','g5_minilocation_templates'], ['materialization_slot_rules','g5_anchor_template_id','g5_anchor_templates'], ['materialization_slot_rules','g5_edge_template_id','g5_edge_templates'],
  ['g4_materialization_layout_edges','profile_id','g4_materialization_profiles'], ['g4_materialization_layout_edges','g5_edge_template_id','g5_edge_templates'],
  ['region_npc_profile_sets','world_revision_id','world_revisions'], ['region_npc_profile_sets','archetype_id','region_npc_archetypes'], ['region_npc_profile_sets','demographic_profile_id','region_demographic_profiles'], ['region_npc_profile_sets','name_pool_id','region_name_pools'], ['region_npc_profile_sets','appearance_profile_id','region_appearance_profiles'], ['region_npc_profile_sets','clothing_profile_id','region_clothing_profiles'], ['region_npc_profile_sets','equipment_profile_id','region_equipment_profiles'], ['region_npc_profile_sets','knowledge_profile_id','region_knowledge_profiles'], ['region_npc_profile_sets','behavior_profile_id','region_behavior_profiles'], ['region_npc_profile_sets','relationship_profile_id','region_relationship_profiles'], ['region_npc_profile_sets','activity_profile_id','region_activity_profiles'], ['region_npc_profile_sets','schedule_profile_id','region_schedule_profiles'],
  ['container_templates','world_revision_id','world_revisions'], ['container_templates','category_id','universal_categories'], ['item_profile_sets','world_revision_id','world_revisions'],
  ['item_templates','category_id','universal_categories'],
  ['item_profile_entries','profile_id','item_profile_sets'], ['item_profile_entries','item_template_id','item_templates'], ['item_profile_entries','item_category_id','universal_categories'],
  ['container_content_profiles','container_template_id','container_templates'], ['container_content_profile_entries','profile_id','container_content_profiles'], ['container_content_profile_entries','item_template_id','item_templates'], ['container_content_profile_entries','item_category_id','universal_categories'],
  ['property_profiles','world_revision_id','world_revisions'], ['property_profiles','property_category_id','universal_categories'], ['property_profile_rules','property_profile_id','property_profiles'],
  ['transport_templates','world_revision_id','world_revisions'], ['transport_templates','category_id','universal_categories'], ['transport_templates','route_category_id','universal_categories'], ['transport_templates','equipment_profile_id','region_equipment_profiles'],
  ['g4_npc_materialization_rules','world_revision_id','world_revisions'], ['g4_npc_materialization_rules','graph_node_id','graph_nodes'], ['g4_npc_materialization_rules','slot_rule_id','materialization_slot_rules'], ['g4_npc_materialization_rules','npc_profile_set_id','region_npc_profile_sets'],
  ['g4_item_materialization_rules','world_revision_id','world_revisions'], ['g4_item_materialization_rules','graph_node_id','graph_nodes'], ['g4_item_materialization_rules','slot_rule_id','materialization_slot_rules'], ['g4_item_materialization_rules','item_profile_id','item_profile_sets'], ['g4_item_materialization_rules','property_profile_id','property_profiles'],
  ['g4_container_materialization_rules','world_revision_id','world_revisions'], ['g4_container_materialization_rules','graph_node_id','graph_nodes'], ['g4_container_materialization_rules','slot_rule_id','materialization_slot_rules'], ['g4_container_materialization_rules','container_template_id','container_templates'], ['g4_container_materialization_rules','content_profile_id','container_content_profiles'], ['g4_container_materialization_rules','property_profile_id','property_profiles'],
  ['catalog_imports','world_revision_id','world_revisions'], ['catalog_import_tables','import_id','catalog_imports']
]);

export function validateCatalogImportManifest(manifest, { recordsByTable = null } = {}) {
  const errors = [];
  if (manifest?.schema !== 'world_catalog_import_manifest_v2' || manifest?.version !== 2) errors.push('MANIFEST_SCHEMA_INVALID');
  if (typeof manifest?.world_revision_id !== 'string' || manifest.world_revision_id.length === 0) errors.push('WORLD_REVISION_ID_MISSING');
  if (!manifest?.provenance || typeof manifest.provenance !== 'object' || Array.isArray(manifest.provenance)) errors.push('PROVENANCE_MISSING');
  else {
    if (!Array.isArray(manifest.provenance.source_ids) || manifest.provenance.source_ids.length === 0) errors.push('PROVENANCE_SOURCES_MISSING');
    if (!['medium', 'medium_high', 'high'].includes(manifest.provenance.minimum_confidence)) errors.push('PROVENANCE_CONFIDENCE_INVALID');
    if (typeof manifest.provenance.effective_at !== 'string' || !Number.isFinite(Date.parse(manifest.provenance.effective_at))) errors.push('PROVENANCE_EFFECTIVE_AT_INVALID');
    if (typeof manifest.provenance.json_schema_version !== 'string' || !manifest.provenance.json_schema_version) errors.push('JSON_SCHEMA_VERSION_MISSING');
    if (manifest.provenance.negative_fixture_evidence !== true) errors.push('NEGATIVE_FIXTURE_EVIDENCE_MISSING');
  }
  const allowedManifestKeys = new Set(['version', 'schema', 'world_revision_id', 'approval', 'deletion_mode', 'provenance', 'tables']);
  for (const key of Object.keys(manifest ?? {})) if (!allowedManifestKeys.has(key)) errors.push(`MANIFEST_FIELD_FORBIDDEN:${key}`);
  if (manifest?.approval !== 'approved') errors.push('MANIFEST_NOT_APPROVED');
  if (!['none', 'explicit_only'].includes(manifest?.deletion_mode)) errors.push('DELETION_MODE_INVALID');
  if (!Array.isArray(manifest?.tables)) errors.push('TABLE_LIST_MISSING');
  const names = new Set();
  const orderByName = new Map();
  let previousOrder = -1;
  for (const entry of manifest?.tables ?? []) {
    for (const key of Object.keys(entry ?? {})) if (!['table_name', 'payload_digest', 'record_count', 'dependency_order'].includes(key)) errors.push(`TABLE_FIELD_FORBIDDEN:${entry.table_name}:${key}`);
    if (!AUTHORING_TABLES.has(entry.table_name)) errors.push(`TABLE_NOT_REGISTERED:${entry.table_name}`);
    if (INSTANCE_PREFIXES.some((prefix) => String(entry.table_name).startsWith(prefix))) errors.push(`PARTY_INSTANCE_TABLE_FORBIDDEN:${entry.table_name}`);
    if (names.has(entry.table_name)) errors.push(`TABLE_DUPLICATE:${entry.table_name}`);
    names.add(entry.table_name);
    if (!/^[a-f0-9]{64}$/u.test(String(entry.payload_digest ?? ''))) errors.push(`TABLE_DIGEST_INVALID:${entry.table_name}`);
    if (!Number.isInteger(entry.record_count) || entry.record_count < 0) errors.push(`TABLE_COUNT_INVALID:${entry.table_name}`);
    if (!Number.isInteger(entry.dependency_order) || entry.dependency_order < previousOrder) errors.push(`DEPENDENCY_ORDER_INVALID:${entry.table_name}`);
    previousOrder = entry.dependency_order;
    orderByName.set(entry.table_name, entry.dependency_order);
    if (recordsByTable) {
      const records = recordsByTable[entry.table_name];
      if (!Array.isArray(records)) errors.push(`TABLE_PAYLOAD_MISSING:${entry.table_name}`);
      else {
        if (records.length !== entry.record_count) errors.push(`TABLE_COUNT_MISMATCH:${entry.table_name}`);
        if (digestValue(records) !== entry.payload_digest) errors.push(`TABLE_DIGEST_MISMATCH:${entry.table_name}`);
        records.forEach((record, index) => {
          if (!record || typeof record !== 'object' || Array.isArray(record) || !record.id && entry.table_name !== 'region_category_options') errors.push(`RECORD_SHAPE_INVALID:${entry.table_name}:${index}`);
        });
      }
    }
  }
  for (const [sourceTable, sourceColumn, targetTable] of MATERIALIZATION_FOREIGN_KEYS) {
    if (!names.has(sourceTable) || sourceTable === targetTable || !AUTHORING_TABLES.has(targetTable)) continue;
    const sourcePayload = recordsByTable?.[sourceTable];
    if (Array.isArray(sourcePayload) && !sourcePayload.some((record) => record?.[sourceColumn] != null)) continue;
    if (!names.has(targetTable)) errors.push(`DEPENDENCY_MISSING:${sourceTable}:${targetTable}`);
    else if (orderByName.get(targetTable) >= orderByName.get(sourceTable)) errors.push(`DEPENDENCY_ORDER_INVALID:${sourceTable}:${targetTable}`);
  }
  if (recordsByTable) {
    for (const tableName of Object.keys(recordsByTable)) {
      if (!AUTHORING_TABLES.has(tableName) && !LOOKUP_TABLES.has(tableName)) errors.push(`TABLE_NOT_REGISTERED:${tableName}`);
      if (AUTHORING_TABLES.has(tableName) && !names.has(tableName)) errors.push(`TABLE_PAYLOAD_NOT_DECLARED:${tableName}`);
    }
  }
  if (recordsByTable) errors.push(...validateClassificationCatalog(recordsByTable));
  return Object.freeze(errors);
}

const CATEGORY_STATUSES = new Set(['draft', 'approved', 'deprecated']);
const LABEL_TYPES = new Set(['preferred', 'alternative', 'historical', 'deprecated']);
const RELATION_TYPES = new Set(['broader', 'narrower', 'related', 'compatible', 'requires', 'excludes', 'equivalent_with_scope']);
const MAPPING_TYPES = new Set(['exact', 'close', 'broad', 'narrow', 'related']);

export function validateClassificationCatalog(recordsByTable = {}) {
  const errors = [];
  const schemes = recordsByTable.classification_schemes ?? [];
  const categories = recordsByTable.universal_categories ?? [];
  const labels = recordsByTable.category_labels ?? [];
  const relations = recordsByTable.universal_category_relations ?? [];
  const mappings = recordsByTable.category_scheme_mappings ?? [];
  const categoryIds = new Set(categories.map((record) => record?.id).filter(Boolean));
  const schemeIds = new Set(schemes.map((record) => record?.id).filter(Boolean));
  const sourceIds = new Set((recordsByTable.source_records ?? []).map((record) => record?.id).filter(Boolean));
  const stableCodes = new Set();

  errors.push(...validateClassificationJsonSchema('classification_schemes', schemes, classificationSchemesSchema));
  errors.push(...validateClassificationJsonSchema('universal_categories', categories, universalCategoriesSchema));
  errors.push(...validateClassificationJsonSchema('category_labels', labels, categoryLabelsSchema));
  errors.push(...validateClassificationJsonSchema('universal_category_relations', relations, universalCategoryRelationsSchema));
  errors.push(...validateClassificationJsonSchema('category_scheme_mappings', mappings, categorySchemeMappingsSchema));

  for (const scheme of schemes) {
    const id = scheme?.id ?? '?';
    if (!CATEGORY_STATUSES.has(scheme?.status)) errors.push(`CLASSIFICATION_SCHEME_STATUS_INVALID:${id}`);
    if (!/^[a-f0-9]{64}$/u.test(String(scheme?.snapshot_digest ?? ''))) errors.push(`CLASSIFICATION_SCHEME_DIGEST_INVALID:${id}`);
  }
  for (const category of categories) {
    const id = category?.id ?? '?';
    if (!String(category?.stable_code ?? '').trim()) errors.push(`CATEGORY_STABLE_CODE_MISSING:${id}`);
    else if (stableCodes.has(category.stable_code)) errors.push(`CATEGORY_STABLE_CODE_DUPLICATE:${category.stable_code}`);
    else stableCodes.add(category.stable_code);
    if (!String(category?.domain ?? '').trim()) errors.push(`CATEGORY_DOMAIN_MISSING:${id}`);
    if (!String(category?.facet ?? '').trim()) errors.push(`CATEGORY_FACET_MISSING:${id}`);
    if (!String(category?.definition ?? '').trim()) errors.push(`CATEGORY_DEFINITION_MISSING:${id}`);
    if (!String(category?.scope_note ?? '').trim()) errors.push(`CATEGORY_SCOPE_NOTE_MISSING:${id}`);
    if (!String(category?.inclusion_rules ?? '').trim()) errors.push(`CATEGORY_INCLUSION_RULES_MISSING:${id}`);
    if (!String(category?.exclusion_rules ?? '').trim()) errors.push(`CATEGORY_EXCLUSION_RULES_MISSING:${id}`);
    if (!CATEGORY_STATUSES.has(category?.status)) errors.push(`CATEGORY_STATUS_INVALID:${id}`);
    if (category?.parent_category_id && !categoryIds.has(category.parent_category_id)) errors.push(`CATEGORY_PARENT_UNKNOWN:${id}`);
    if (category?.replaced_by_category_id && !categoryIds.has(category.replaced_by_category_id)) errors.push(`CATEGORY_REPLACEMENT_UNKNOWN:${id}`);
  }
  for (const label of labels) {
    const id = label?.id ?? '?';
    if (!categoryIds.has(label?.category_id)) errors.push(`CATEGORY_LABEL_CATEGORY_UNKNOWN:${id}`);
    if (!LABEL_TYPES.has(label?.label_type)) errors.push(`CATEGORY_LABEL_TYPE_INVALID:${id}`);
    if (label?.source_id && !sourceIds.has(label.source_id)) errors.push(`CATEGORY_LABEL_SOURCE_UNKNOWN:${id}`);
  }
  for (const relation of relations) {
    const id = relation?.id ?? '?';
    if (!RELATION_TYPES.has(relation?.relation_type)) errors.push(`CATEGORY_RELATION_TYPE_INVALID:${id}`);
    if (!categoryIds.has(relation?.from_category_id)) errors.push(`CATEGORY_RELATION_CATEGORY_UNKNOWN:${id}:from_category_id`);
    if (!categoryIds.has(relation?.to_category_id)) errors.push(`CATEGORY_RELATION_CATEGORY_UNKNOWN:${id}:to_category_id`);
    if (relation?.from_category_id === relation?.to_category_id && ['broader', 'narrower'].includes(relation?.relation_type)) errors.push(`CATEGORY_HIERARCHY_SELF_CYCLE:${id}`);
  }
  for (const mapping of mappings) {
    const id = mapping?.id ?? '?';
    if (!MAPPING_TYPES.has(mapping?.mapping_type)) errors.push(`CATEGORY_MAPPING_TYPE_INVALID:${id}`);
    if (!categoryIds.has(mapping?.category_id)) errors.push(`CATEGORY_MAPPING_CATEGORY_UNKNOWN:${id}`);
    if (!schemeIds.has(mapping?.classification_scheme_id)) errors.push(`CATEGORY_MAPPING_SCHEME_UNKNOWN:${id}`);
    if (mapping?.source_id && !sourceIds.has(mapping.source_id)) errors.push(`CATEGORY_MAPPING_SOURCE_UNKNOWN:${id}`);
  }
  const parentByChild = new Map();
  for (const category of categories) {
    if (!category?.parent_category_id || !categoryIds.has(category.parent_category_id) || !categoryIds.has(category.id)) continue;
    const parents = parentByChild.get(category.id) ?? new Set();
    parents.add(category.parent_category_id); parentByChild.set(category.id, parents);
  }
  for (const relation of relations) {
    if (!['broader', 'narrower'].includes(relation?.relation_type) || !categoryIds.has(relation?.from_category_id) || !categoryIds.has(relation?.to_category_id)) continue;
    const child = relation.relation_type === 'broader' ? relation.to_category_id : relation.from_category_id;
    const parent = relation.relation_type === 'broader' ? relation.from_category_id : relation.to_category_id;
    const parents = parentByChild.get(child) ?? new Set();
    parents.add(parent); parentByChild.set(child, parents);
  }
  for (const start of parentByChild.keys()) {
    const visit = (node, stack = new Set()) => {
      if (stack.has(node)) return true;
      const next = new Set(stack); next.add(node);
      return [...(parentByChild.get(node) ?? [])].some((parent) => visit(parent, next));
    };
    if (visit(start)) { errors.push(`CATEGORY_HIERARCHY_CYCLE:${start}`); break; }
  }
  return Object.freeze(errors);
}

function validateClassificationJsonSchema(tableName, records, schema) {
  if (!Array.isArray(records)) return [`JSON_SCHEMA_INVALID:${tableName}:payload`];
  const itemSchema = schema.items ?? {};
  const errors = [];
  records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) { errors.push(`JSON_SCHEMA_INVALID:${tableName}:${index}`); return; }
    for (const required of itemSchema.required ?? []) if (!(required in record)) errors.push(`JSON_SCHEMA_REQUIRED:${tableName}:${index}:${required}`);
    for (const [key, value] of Object.entries(record)) {
      const definition = itemSchema.properties?.[key];
      if (!definition) { errors.push(`JSON_SCHEMA_ADDITIONAL_PROPERTY:${tableName}:${index}:${key}`); continue; }
      if (definition.type === 'string' && typeof value !== 'string') errors.push(`JSON_SCHEMA_TYPE:${tableName}:${index}:${key}`);
      else if (definition.type === 'string' && definition.minLength && value.trim().length < definition.minLength) errors.push(`JSON_SCHEMA_MIN_LENGTH:${tableName}:${index}:${key}`);
      if (definition.enum && !definition.enum.includes(value)) errors.push(`JSON_SCHEMA_ENUM:${tableName}:${index}:${key}`);
      if (definition.pattern && !new RegExp(definition.pattern, 'u').test(String(value))) errors.push(`JSON_SCHEMA_PATTERN:${tableName}:${index}:${key}`);
      if (definition.format === 'date' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)))) errors.push(`JSON_SCHEMA_FORMAT:${tableName}:${index}:${key}`);
    }
  });
  return errors;
}

export async function importClassificationCatalog({ manifest, recordsByTable = {}, mode = 'dry-run', adapter = null } = {}) {
  if (!['dry-run', 'apply'].includes(mode)) throw new Error(`CLASSIFICATION_IMPORT_MODE_INVALID:${mode}`);
  const errors = validateCatalogImportManifest(manifest, { recordsByTable });
  const tables = [...(manifest?.tables ?? [])].sort((left, right) => left.dependency_order - right.dependency_order || left.table_name.localeCompare(right.table_name));
  if (errors.length) return Object.freeze({ mode, applied: false, errors, tables: Object.freeze([]) });
  if (mode === 'dry-run') return Object.freeze({ mode, applied: false, errors: Object.freeze([]), tables: Object.freeze(tables.map((entry) => entry.table_name)) });
  if (!adapter || typeof adapter.begin !== 'function' || typeof adapter.insert !== 'function' || typeof adapter.commit !== 'function' || typeof adapter.rollback !== 'function') throw new Error('CLASSIFICATION_IMPORT_ADAPTER_INVALID');
  await adapter.begin();
  try {
    for (const entry of tables) {
      await adapter.insert(entry.table_name, recordsByTable[entry.table_name]);
      if (typeof adapter.readback === 'function') {
        const readback = await adapter.readback(entry.table_name);
        if (readback?.record_count !== entry.record_count || readback?.payload_digest !== entry.payload_digest) throw new Error(`CLASSIFICATION_IMPORT_READBACK_MISMATCH:${entry.table_name}`);
      }
    }
    await adapter.commit();
    return Object.freeze({ mode, applied: true, errors: Object.freeze([]), tables: Object.freeze(tables.map((entry) => entry.table_name)) });
  } catch (error) {
    await adapter.rollback();
    throw error;
  }
}

export function assessMaterializationReadiness({ manifest, recordsByTable = {}, regionId, g4Id, historicalYear, season, jsonSchemaValidators = {} } = {}) {
  const concerns = [...validateCatalogImportManifest(manifest, { recordsByTable })];
  const revisionId = manifest?.world_revision_id;
  if (!Number.isInteger(historicalYear)) concerns.push('HISTORICAL_YEAR_MISSING');
  if (typeof season !== 'string' || !season.trim()) concerns.push('SEASON_MISSING');
  const statuslessTables = new Set(['source_records', 'record_sources', 'building_layout_nodes', 'building_layout_edges', 'item_profile_entries']);
  const active = (table) => (recordsByTable[table] ?? []).filter((record) => statuslessTables.has(table) || record?.status === 'approved');
  const scoped = (table) => active(table).filter((record) => (record.world_revision_id == null || record.world_revision_id === revisionId) && (record.region_id == null || record.region_id === regionId) && periodApplies(record, historicalYear, season));
  for (const table of REQUIRED_FOR_G4) {
    if (scoped(table).length === 0) concerns.push(`REQUIRED_APPROVED_TABLE_EMPTY:${table}`);
  }
  if (!scoped('world_revisions').some((record) => record.id === revisionId)) concerns.push('WORLD_REVISION_NOT_APPROVED');
  const activeOptions = scoped('region_category_options').filter((record) => record.region_id === regionId);
  if (activeOptions.length === 0) concerns.push('REGION_CATEGORY_OPTIONS_NOT_READY');
  const optionsByCategory = new Map();
  for (const option of activeOptions) {
    const values = optionsByCategory.get(option.category_id) ?? [];
    values.push(option); optionsByCategory.set(option.category_id, values);
  }
  for (const options of optionsByCategory.values()) if (options.length > 1) concerns.push(`REGION_CATEGORY_OPTION_ACTIVE_AMBIGUITY:${options.map((option) => option.id).sort().join(':')}`);
  const activeCategories = new Map(scoped('universal_categories').map((record) => [record.id, record]));
  for (const option of activeOptions) {
    const category = activeCategories.get(option.category_id);
    if (!category || category.status !== 'approved' || category.replaced_by_category_id) concerns.push(`REGION_CATEGORY_OPTION_CATEGORY_INACTIVE:${option.id}`);
  }
  const bindings = scoped('g4_materialization_bindings');
  const profiles = new Set(scoped('g4_materialization_profiles').map((record) => record.id));
  if (!bindings.some((record) => record.graph_node_id === g4Id && profiles.has(record.profile_id))) concerns.push('G4_MATERIALIZATION_BINDING_NOT_READY');
  const selectedProfiles = scoped('g4_materialization_profiles').filter((profile) => bindings.some((binding) => binding.graph_node_id === g4Id && binding.profile_id === profile.id));
  const selectedProfileIds = new Set(selectedProfiles.map((profile) => profile.id));
  for (const profile of selectedProfiles) {
    const layout = scoped('building_layout_templates').find((record) => record.id === profile.layout_template_id);
    if (!layout) concerns.push(`G5_LAYOUT_NOT_APPROVED:${profile.id}`);
    else checkLayoutGraph(concerns, layout.id, scoped('building_layout_nodes'), scoped('building_layout_edges'));
    const rules = scoped('materialization_slot_rules').filter((rule) => rule.profile_id === profile.id);
    if (!rules.some((rule) => rule.slot_domain === 'g5_node' && (rule.required === true || rule.min_count > 0))) concerns.push(`G5_NODE_SLOT_RULE_NOT_READY:${profile.id}`);
    if (!rules.some((rule) => rule.slot_domain === 'anchor' && (rule.required === true || rule.min_count > 0))) concerns.push(`G5_ANCHOR_SLOT_RULE_NOT_READY:${profile.id}`);
    if (!profile.player_start_anchor_slot_key || !isNonEmptyObject(profile.visibility_model) || !isNonEmptyObject(profile.access_model)) concerns.push(`G5_PROFILE_RUNTIME_FIELDS_MISSING:${profile.id}`);
    const startRules = rules.filter((rule) => rule.slot_domain === 'anchor' && rule.slot_key === profile.player_start_anchor_slot_key && ['start', 'start_and_exit'].includes(rule.entry_role));
    if (startRules.length !== 1 || !rules.some((rule) => rule.slot_domain === 'anchor' && ['exit', 'start_and_exit'].includes(rule.entry_role))) concerns.push(`G5_ENTRY_EXIT_RULE_NOT_READY:${profile.id}`);
    for (const rule of rules.filter((value) => value.slot_domain === 'anchor')) if (!rule.parent_node_slot_key || !rule.g5_anchor_template_id) concerns.push(`G5_ANCHOR_RULE_RUNTIME_FIELDS_MISSING:${rule.id}`);
    checkRuntimeLayoutEdges(concerns, profile.id, rules, scoped('g4_materialization_layout_edges'), scoped('g5_edge_templates'));
  }
  validateRuntimeTemplateFields(concerns, scoped);
  const slotRules = new Map(scoped('materialization_slot_rules').map((record) => [record.id, record]));
  checkRuleReferences(concerns, scoped('g4_npc_materialization_rules').filter((record) => record.graph_node_id === g4Id), slotRules, selectedProfileIds, new Set(scoped('region_npc_profile_sets').map((record) => record.id)), 'npc_profile_set_id', 'npc', 'g4_npc_materialization_rules');
  checkRuleReferences(concerns, scoped('g4_item_materialization_rules').filter((record) => record.graph_node_id === g4Id), slotRules, selectedProfileIds, new Set(scoped('item_profile_sets').map((record) => record.id)), 'item_profile_id', 'item', 'g4_item_materialization_rules');
  checkRuleReferences(concerns, scoped('g4_container_materialization_rules').filter((record) => record.graph_node_id === g4Id), slotRules, selectedProfileIds, new Set(scoped('container_templates').map((record) => record.id)), 'container_template_id', 'container', 'g4_container_materialization_rules');
  checkProfileContents(concerns, scoped('g4_item_materialization_rules').filter((record) => record.graph_node_id === g4Id), scoped('item_profile_entries'), 'item_profile_id', 'profile_id', 'ITEM_PROFILE_EMPTY');
  checkContainerContents(concerns, scoped('g4_container_materialization_rules').filter((record) => record.graph_node_id === g4Id), scoped('container_content_profiles'), scoped('container_content_profile_entries'));
  validateMaterializationForeignKeys(concerns, scoped);
  validateProvenanceAndPolicies(concerns, recordsByTable, scoped, jsonSchemaValidators, manifest?.provenance, historicalYear, season);
  validateBindingAmbiguity(concerns, bindings);
  for (const [table, records] of Object.entries(recordsByTable)) for (const record of records ?? []) {
    if (record?.status === 'approved' && record.world_revision_id != null && record.world_revision_id !== revisionId) concerns.push(`REVISION_SCOPE_MISMATCH:${table}:${record.id}`);
    if (record?.status === 'approved' && record.region_id != null && record.region_id !== regionId) concerns.push(`REGION_SCOPE_MISMATCH:${table}:${record.id}`);
  }
  return Object.freeze({ pass: concerns.length === 0, region_id: regionId, g4_id: g4Id, concerns: Object.freeze(concerns) });
}

function validateProvenanceAndPolicies(concerns, recordsByTable, scoped, validators, provenance, historicalYear, season) {
  const sources = recordsByTable.record_sources ?? [];
  const confidenceRank = { medium: 1, medium_high: 2, high: 3 };
  const minimumRank = confidenceRank[provenance?.minimum_confidence] ?? Number.POSITIVE_INFINITY;
  const allowedSourceIds = new Set(provenance?.source_ids ?? []);
  const tables = REQUIRED_FOR_G4.filter((table) => table !== 'record_sources');
  for (const table of tables) for (const record of scoped(table)) {
    const links = sources.filter((link) => link.target_table === table && link.target_record_id === record.id && link.support_type !== 'contradicts');
    if (links.length === 0 || !links.some((link) => allowedSourceIds.has(link.source_id) && confidenceRank[link.confidence] >= minimumRank)) concerns.push(`PROVENANCE_NOT_READY:${table}:${record.id}`);
    if (!periodApplies(record, historicalYear, season)) concerns.push(`PERIOD_NOT_APPLICABLE:${table}:${record.id}`);
    for (const [key, value] of Object.entries(record)) if (key.endsWith('_policy') || key.endsWith('_model') || key === 'applicability' || key === 'initial_state') {
      if (!isNonEmptyObject(value)) concerns.push(`JSONB_POLICY_EMPTY:${table}:${record.id}:${key}`);
      const validator = validators[`${table}.${key}`];
      if (typeof validator !== 'function' || validator(value) !== true) concerns.push(`JSONB_SCHEMA_INVALID:${table}:${record.id}:${key}`);
    }
  }
}

function periodApplies(record, historicalYear, season) {
  if (!Number.isInteger(historicalYear) || typeof season !== 'string' || !season) return false;
  if (record.valid_from_year != null && (!Number.isInteger(record.valid_from_year) || historicalYear < record.valid_from_year)) return false;
  if (record.valid_to_year != null && (!Number.isInteger(record.valid_to_year) || historicalYear > record.valid_to_year)) return false;
  const validFrom = record.valid_from ?? record.effective_from;
  const validTo = record.valid_to ?? record.effective_to;
  const validFromYear = validFrom == null ? null : yearFromTimestamp(validFrom);
  const validToYear = validTo == null ? null : yearFromTimestamp(validTo);
  if (validFrom != null && (validFromYear == null || historicalYear < validFromYear)) return false;
  if (validTo != null && (validToYear == null || historicalYear > validToYear)) return false;
  const allowedSeasons = record.allowed_seasons ?? record.applicability?.allowed_seasons;
  if (allowedSeasons != null && (!Array.isArray(allowedSeasons) || (!allowedSeasons.includes('all') && !allowedSeasons.includes(season)))) return false;
  return true;
}

function yearFromTimestamp(value) {
  const match = typeof value === 'string' ? /^(\d{4})-/u.exec(value) : null;
  return match && Number.isFinite(Date.parse(value)) ? Number(match[1]) : null;
}

function validateRuntimeTemplateFields(concerns, scoped) {
  for (const record of scoped('g5_minilocation_templates')) {
    if (!isNonEmptyObject(record.access_policy) || !isNonEmptyObject(record.visibility_policy) || !isNonEmptyObject(record.initial_state)) concerns.push(`G5_NODE_TEMPLATE_RUNTIME_FIELDS_MISSING:${record.id}`);
  }
  for (const record of scoped('g5_anchor_templates')) {
    if (!isNonEmptyObject(record.access_policy) || !isNonEmptyObject(record.visibility_policy) || !isNonEmptyObject(record.initial_state) || !['boolean'].includes(typeof record.can_hold_npc) || !['boolean'].includes(typeof record.can_hold_item) || !['boolean'].includes(typeof record.can_hold_container) || ![record.npc_capacity, record.item_capacity, record.container_capacity].every((value) => Number.isInteger(value) && value >= 0)) concerns.push(`G5_ANCHOR_TEMPLATE_RUNTIME_FIELDS_MISSING:${record.id}`);
  }
  for (const record of scoped('g5_edge_templates')) if (!isNonEmptyObject(record.access_policy) || !isNonEmptyObject(record.visibility_policy) || !isNonEmptyObject(record.initial_state)) concerns.push(`G5_EDGE_TEMPLATE_RUNTIME_FIELDS_MISSING:${record.id}`);
  for (const table of ['g4_npc_materialization_rules', 'g4_item_materialization_rules', 'g4_container_materialization_rules']) for (const record of scoped(table)) {
    if (!Number.isInteger(record.min_count) || !Number.isInteger(record.max_count) || record.min_count < 0 || record.max_count < record.min_count || !record.causal_basis_type || !record.causal_basis_id) concerns.push(`MATERIALIZATION_RULE_RUNTIME_FIELDS_MISSING:${table}:${record.id}`);
  }
}

function validateBindingAmbiguity(concerns, bindings) {
  const seen = new Set();
  for (const binding of bindings) {
    const selector = ['graph_node_id', 'node_type', 'place_template_id', 'building_template_id'].find((key) => binding[key] != null);
    const key = `${selector}:${binding[selector]}:${binding.priority ?? 0}`;
    if (seen.has(key)) concerns.push(`G4_BINDING_AMBIGUOUS:${key}`);
    seen.add(key);
  }
}

function checkRuntimeLayoutEdges(concerns, profileId, rules, edges, edgeTemplates) {
  const anchorSlots = new Set(rules.filter((rule) => rule.slot_domain === 'anchor').map((rule) => rule.slot_key));
  const approvedTemplates = new Set(edgeTemplates.map((value) => value.id));
  const profileEdges = edges.filter((edge) => edge.profile_id === profileId);
  if (profileEdges.length === 0) concerns.push(`G5_RUNTIME_LAYOUT_EDGES_EMPTY:${profileId}`);
  for (const edge of profileEdges) if (!anchorSlots.has(edge.from_anchor_slot_key) || !anchorSlots.has(edge.to_anchor_slot_key) || !approvedTemplates.has(edge.g5_edge_template_id)) concerns.push(`G5_RUNTIME_LAYOUT_EDGE_UNRESOLVED:${edge.id}`);
}

function isNonEmptyObject(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0; }

export const MATERIALIZATION_AUTHORING_TABLES = Object.freeze([...AUTHORING_TABLES].sort());

function checkRuleReferences(concerns, rules, slotRules, selectedProfileIds, approvedCandidates, referenceKey, expectedDomain, table) {
  if (rules.length === 0) concerns.push(`G4_RULES_NOT_READY:${table}`);
  for (const rule of rules) {
    const slot = slotRules.get(rule.slot_rule_id);
    if (!slot) concerns.push(`SLOT_RULE_NOT_FOUND:${table}:${rule.id}`);
    else {
      if (!selectedProfileIds.has(slot.profile_id)) concerns.push(`SLOT_RULE_PROFILE_MISMATCH:${table}:${rule.id}`);
      if (slot.slot_domain !== expectedDomain) concerns.push(`SLOT_RULE_DOMAIN_MISMATCH:${table}:${rule.id}`);
    }
    if (!approvedCandidates.has(rule[referenceKey])) concerns.push(`APPROVED_PROFILE_NOT_FOUND:${table}:${rule.id}`);
    if ((slot?.required === true || Number(slot?.min_count) > 0 || Number(rule.min_count) > 0) && !rule[referenceKey]) concerns.push(`REQUIRED_CANDIDATE_SET_EMPTY:${table}:${rule.id}`);
  }
}

function validateMaterializationForeignKeys(concerns, scoped) {
  for (const [sourceTable, sourceColumn, targetTable] of MATERIALIZATION_FOREIGN_KEYS) {
    const sourceRecords = scoped(sourceTable);
    if (sourceRecords.length === 0) continue;
    const targetIds = new Set(scoped(targetTable).map((record) => record.id));
    for (const record of sourceRecords) {
      const value = record[sourceColumn];
      if (value != null && !targetIds.has(value)) concerns.push(`DDL_FK_NOT_RESOLVED:${sourceTable}:${record.id}:${sourceColumn}:${targetTable}`);
    }
  }
}

function checkProfileContents(concerns, rules, entries, ruleKey, entryKey, code) {
  for (const rule of rules) if (!entries.some((entry) => entry[entryKey] === rule[ruleKey])) concerns.push(`${code}:${rule.id}`);
}

function checkContainerContents(concerns, rules, profiles, entries) {
  for (const rule of rules) {
    if (rule.content_profile_id == null) continue;
    const profile = profiles.find((record) => record.id === rule.content_profile_id);
    if (profile && profile.empty_allowed !== true && !entries.some((entry) => entry.profile_id === profile.id)) concerns.push(`CONTAINER_CONTENT_PROFILE_EMPTY:${rule.id}`);
  }
}

function checkLayoutGraph(concerns, layoutId, nodes, edges) {
  const layoutNodes = nodes.filter((node) => node.layout_template_id === layoutId);
  const layoutEdges = edges.filter((edge) => edge.layout_template_id === layoutId);
  if (layoutNodes.length === 0) { concerns.push(`G5_LAYOUT_NODES_EMPTY:${layoutId}`); return; }
  const adjacency = new Map(layoutNodes.map((node) => [node.id, new Set()]));
  for (const edge of layoutEdges) {
    adjacency.get(edge.from_node_id)?.add(edge.to_node_id);
    adjacency.get(edge.to_node_id)?.add(edge.from_node_id);
  }
  const visited = new Set();
  const queue = [layoutNodes[0].id];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(adjacency.get(id) ?? []));
  }
  if (visited.size !== layoutNodes.length) concerns.push(`G5_LAYOUT_DISCONNECTED:${layoutId}`);
}
import { digestValue } from './digest.js';
import classificationSchemesSchema from '../../../schemas/materialization/classification-schemes-v1.schema.json' with { type: 'json' };
import universalCategoriesSchema from '../../../schemas/materialization/universal-categories-v1.schema.json' with { type: 'json' };
import categoryLabelsSchema from '../../../schemas/materialization/category-labels-v1.schema.json' with { type: 'json' };
import universalCategoryRelationsSchema from '../../../schemas/materialization/universal-category-relations-v1.schema.json' with { type: 'json' };
import categorySchemeMappingsSchema from '../../../schemas/materialization/category-scheme-mappings-v1.schema.json' with { type: 'json' };
