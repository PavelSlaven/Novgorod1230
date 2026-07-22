import { digestValue } from './digest.js';

const PHYSICAL_SOURCE_ID = 'src_gameplay_physical_policy_v3';

export function compileV5CanonicalCatalog({ base_records_by_table: base = {}, v5_datasets: v5 = {}, world_revision_id: worldRevisionId, region_id: regionId } = {}) {
  const errors = [];
  const records = cloneTables(base);
  ensureTables(records);
  const templates = sorted(v5.templates?.templates);
  const templateById = new Map(templates.map((record) => [record.id, record]));
  const itemIds = new Set((records.item_templates ?? []).map((record) => record.id));
  const containerIds = new Set((records.container_templates ?? []).map((record) => record.id));
  const sourceIds = new Set((records.source_records ?? []).map((record) => record.id));

  for (const source of sorted(v5.sources?.sources)) {
    upsert(records.source_records, {
      id: source.id,
      title: source.title,
      source_type: sourceType(source.kind),
      summary: source.coverage,
      status: 'draft',
      confidence: source.kind === 'gameplay_policy' ? 'medium' : 'medium_high'
    });
    sourceIds.add(source.id);
  }

  const evidenceById = new Map((v5.historical_evidence?.evidence ?? []).map((record) => [record.id, record]));
  records.item_template_source_bindings = [];
  records.container_template_source_bindings = [];
  for (const binding of sorted(v5.claim_bindings?.bindings)) {
    const template = templateById.get(binding.template_id);
    const evidence = evidenceById.get(binding.evidence_id);
    if (!template) { errors.push(`CLAIM_TEMPLATE_UNKNOWN:${binding.id}`); continue; }
    if (!sourceIds.has(binding.source_id)) errors.push(`CLAIM_SOURCE_UNKNOWN:${binding.id}:${binding.source_id}`);
    const gameplayPhysicalClaim = binding.claim_scope === 'physical_parameter' && binding.source_id === PHYSICAL_SOURCE_ID && binding.physical_profile_id;
    if (!evidence && !gameplayPhysicalClaim) errors.push(`CLAIM_EVIDENCE_UNKNOWN:${binding.id}:${binding.evidence_id}`);
    const target = template.kind === 'item' ? records.item_template_source_bindings : records.container_template_source_bindings;
    target.push({
      id: binding.id,
      ...(template.kind === 'item' ? { item_template_id: template.id } : { container_template_id: template.id }),
      source_id: binding.source_id,
      world_revision_id: worldRevisionId,
      evidence_class: gameplayPhysicalClaim ? 'comparative_period' : evidenceClass(evidence?.support_level),
      claim_scope: binding.claim_scope,
      valid_from: yearDate(evidence?.source_period_years?.[0] ?? (gameplayPhysicalClaim ? 1230 : undefined), '01-01'),
      valid_to: yearDate(evidence?.source_period_years?.[1] ?? (gameplayPhysicalClaim ? 1230 : undefined), '12-31'),
      confidence: evidence?.confidence ?? (gameplayPhysicalClaim ? 'medium' : 'unknown'),
      review_status: ['reviewed_for_content', 'reviewed_for_gameplay'].includes(binding.review_status) ? 'reviewed' : 'needs_review',
      notes: gameplayPhysicalClaim ? `V5 gameplay physical profile ${binding.physical_profile_id}; not a historical measurement.` : `V5 evidence ${binding.evidence_id}; historical attestation retained separately.`,
      status: 'draft'
    });
  }

  const categoryIds = new Set(records.universal_categories.map((record) => record.id));
  const permissionKeys = new Set(records.region_category_options.map((record) => `${record.region_id}:${record.world_revision_id}:${record.category_id}`));
  for (const template of templates) {
    if (template.kind === 'item' && !itemIds.has(template.id)) errors.push(`V5_ITEM_NOT_IN_CANONICAL_COHORT:${template.id}`);
    if (template.kind === 'container' && !containerIds.has(template.id)) errors.push(`V5_CONTAINER_NOT_IN_CANONICAL_COHORT:${template.id}`);
    for (const material of template.materials ?? []) {
      const categoryId = `cat_${template.kind}_material_${safe(material)}_v1`;
      addCategoryAndPermission(records, categoryIds, permissionKeys, categoryId, template.kind, 'material', material, worldRevisionId, regionId);
      if (template.kind === 'item') addItemBinding(records, template.id, categoryId, 'material');
      else addContainerFacet(records, template.id, categoryId, 'material');
    }
    for (const method of template.construction_methods ?? []) {
      const categoryId = `cat_item_manufacturing_${safe(method)}_v1`;
      addCategoryAndPermission(records, categoryIds, permissionKeys, categoryId, 'item', 'manufacturing_technique', method, worldRevisionId, regionId);
      if (template.kind === 'item') addItemBinding(records, template.id, categoryId, 'manufacturing_technique');
      else {
        const container = records.container_templates.find((record) => record.id === template.id);
        if (container) records.universal_category_relations.push({ id: `relation_${safe(container.category_id)}_requires_${safe(categoryId)}`, from_category_id: container.category_id, to_category_id: categoryId, relation_type: 'requires' });
      }
    }
    if (template.kind === 'item') {
      const conditionCategoryId = 'cat_item_condition_serviceable_initial_v1';
      addCategoryAndPermission(records, categoryIds, permissionKeys, conditionCategoryId, 'item', 'condition', 'serviceable initial condition', worldRevisionId, regionId);
      addItemBinding(records, template.id, conditionCategoryId, 'condition');
    }
  }

  const physicalByTemplate = new Map((v5.physical_profiles?.profiles ?? []).map((record) => [record.template_id, record]));
  for (const template of templates) {
    const physical = physicalByTemplate.get(template.id);
    if (!physical) { errors.push(`PHYSICAL_PROFILE_MISSING:${template.id}`); continue; }
    const target = template.kind === 'item' ? records.item_template_inventory_profiles : records.container_template_inventory_profiles;
    const existing = target.find((record) => (record.item_template_id ?? record.container_template_id) === template.id);
    const quantityDerived = physical.mass_model?.mode === 'quantity_derived';
    const mass = physical.mass_grams?.typical ?? physical.empty_mass_grams?.typical ?? (quantityDerived ? 0 : undefined);
    if (!Number.isInteger(mass) || mass < 0 || (!quantityDerived && mass === 0)) errors.push(`PHYSICAL_MASS_INVALID:${template.id}`);
    const row = {
      id: existing?.id ?? `inventory_${safe(template.id)}_v5`,
      ...(template.kind === 'item' ? { item_template_id: template.id } : { container_template_id: template.id }),
      world_revision_id: worldRevisionId,
      source_id: PHYSICAL_SOURCE_ID,
      mass_grams: mass,
      carry_form: carryForm(physical),
      external_hand_cost: physical.external_hand_cost,
      ...(template.kind === 'container' ? { inventory_role: inventoryRole(physical) } : {}),
      status: 'draft'
    };
    upsert(target, row);
    if (template.kind === 'item') {
      const slotCost = physical.packing_slot_cost ?? (quantityDerived ? 1 : null);
      const bundleSize = physical.packing_bundle_size ?? 1;
      if (!Number.isInteger(slotCost) || slotCost <= 0 || !Number.isInteger(bundleSize) || bundleSize <= 0) errors.push(`ITEM_PACKING_PROFILE_INVALID:${template.id}`);
      else {
        const categoryId = `cat_item_size_packing_${slotCost}_bundle_${bundleSize}_v1`;
        addCategoryAndPermission(records, categoryIds, permissionKeys, categoryId, 'item', 'size_band', `packing cost ${slotCost} per bundle ${bundleSize}`, worldRevisionId, regionId);
        const current = records.item_template_category_bindings.find((binding) => binding.item_template_id === template.id && binding.binding_kind === 'size_band');
        const sizeBinding = { id: current?.id ?? `binding_${safe(template.id)}_size_band_v5`, item_template_id: template.id, category_id: categoryId, binding_kind: 'size_band', packing_slot_cost: slotCost, packing_bundle_size: bundleSize, requires_regional_permission: true, status: 'draft' };
        if (current) Object.assign(current, sizeBinding); else records.item_template_category_bindings.push(sizeBinding);
      }
    }
    if (template.kind === 'container') {
      const container = records.container_templates.find((record) => record.id === template.id);
      if (container) {
        container.packing_slot_cost = physical.packing_slot_cost;
        container.capacity = Math.max(container.capacity, physical.packing_bundle_size ?? 1);
      }
    }
  }

  const unitIds = new Set(records.quantity_unit_definitions.map((record) => record.id));
  for (const unit of sorted(v5.quantity_units?.units)) {
    upsert(records.quantity_unit_definitions, { id: unit.id, dimension: unit.dimension, canonical_unit: unit.canonical_unit, conversion_policy: { version: 1, mode: 'exact_factor', factor: unit.conversion_factor }, status: 'draft' });
    unitIds.add(unit.id);
  }
  const v5QuantityByTemplate = new Map((v5.quantity_profiles?.profiles ?? []).map((record) => [record.template_id, record]));
  for (const record of records.item_template_quantity_profiles) {
    record.maximum_quantity ??= record.minimum_quantity;
    record.default_quantity_policy = { version: 1, mode: 'explicit_only' };
  }
  for (const quantity of sorted(v5.quantity_profiles?.profiles)) {
    if (!unitIds.has(quantity.quantity_unit_id)) errors.push(`QUANTITY_UNIT_UNKNOWN:${quantity.template_id}:${quantity.quantity_unit_id}`);
    upsertBy(records.item_template_quantity_profiles, 'item_template_id', {
      id: quantity.id,
      item_template_id: quantity.template_id,
      world_revision_id: worldRevisionId,
      quantity_unit_id: quantity.quantity_unit_id,
      quantity_dimension: quantity.dimension,
      minimum_quantity: quantity.minimum_quantity,
      maximum_quantity: quantity.maximum_quantity,
      default_quantity_policy: { version: 1, mode: quantity.default_quantity_policy },
      mass_grams_per_unit: quantity.mass_or_volume_unit === 'grams' || quantity.mass_or_volume_unit?.startsWith('grams_per_') ? quantity.mass_or_volume_per_unit : physicalByTemplate.get(quantity.template_id)?.mass_grams?.typical,
      stackable: quantity.stackable,
      partial_consumption_allowed: quantity.partial_consumption_allowed,
      source_id: PHYSICAL_SOURCE_ID,
      status: 'draft'
    });
  }
  for (const template of templates.filter((record) => record.kind === 'item' && !v5QuantityByTemplate.has(record.id))) {
    const physical = physicalByTemplate.get(template.id);
    upsertBy(records.item_template_quantity_profiles, 'item_template_id', {
      id: `quantity_${safe(template.id)}_count_v5`,
      item_template_id: template.id,
      world_revision_id: worldRevisionId,
      quantity_unit_id: 'piece',
      quantity_dimension: 'count',
      minimum_quantity: 1,
      maximum_quantity: 1,
      default_quantity_policy: { version: 1, mode: 'explicit_only' },
      mass_grams_per_unit: physical?.mass_grams?.typical,
      stackable: false,
      partial_consumption_allowed: false,
      source_id: PHYSICAL_SOURCE_ID,
      status: 'draft'
    });
  }
  for (const id of itemIds) if (!records.item_template_quantity_profiles.some((record) => record.item_template_id === id)) errors.push(`ITEM_QUANTITY_PROFILE_MISSING:${id}`);

  const accessByTemplate = new Map((v5.access_policies?.policies ?? []).map((record) => [record.template_id, record]));
  for (const container of records.container_templates) {
    const access = accessByTemplate.get(container.id);
    if (access) container.access_policy = { version: 1, mode: 'v5_explicit', commonness: access.commonness, regional_weight: access.regional_weight, social_access: access.social_access, role_occupation_binding: access.role_occupation_binding, context_domain: access.household_or_trade_context, restrictions: access.restrictions, seasonality: access.seasonality, unlisted_content_policy: 'forbidden' };
  }
  records.item_profile_sets = [];
  records.item_profile_entries = [];
  const materializationRuleByTemplate = new Map((v5.materialization_rules?.rules ?? []).map((record) => [record.template_id, record]));
  for (const profile of sorted(v5.materialization_profiles?.profiles)) records.item_profile_sets.push({ id: profile.id, world_revision_id: worldRevisionId, region_id: regionId, context_domain: profile.context_domain, applicability: { version: 1, mode: 'approved_context_only', valid_from: profile.period?.from, valid_to: profile.period?.to, causal_basis_required: true, fallback: 'deny' }, status: 'draft' });
  for (const template of templates.filter((record) => record.kind === 'item')) {
    const rule = materializationRuleByTemplate.get(template.id);
    const access = accessByTemplate.get(template.id);
    if (!rule) { errors.push(`V5_MATERIALIZATION_RULE_MISSING:${template.id}`); continue; }
    records.item_profile_entries.push({ id: `entry_${safe(rule.profile_id)}_${safe(template.id)}`, profile_id: rule.profile_id, item_template_id: template.id, slot_key: `item_${safe(rule.profile_id)}`, min_quantity: 1, max_quantity: v5QuantityByTemplate.get(template.id)?.maximum_quantity ?? 1, required: false, weight: rule.weight });
    if (!access || access.household_or_trade_context !== v5.materialization_profiles?.profiles?.find((profile) => profile.id === rule.profile_id)?.context_domain) errors.push(`ACCESS_CONTEXT_MISMATCH:${template.id}`);
  }

  const contentCategoryIds = new Set();
  for (const content of sorted(v5.content_categories?.categories)) {
    contentCategoryIds.add(content.id);
    addCategoryAndPermission(records, categoryIds, permissionKeys, content.id, 'item', 'content_type', content.label, worldRevisionId, regionId);
  }
  records.container_content_category_relations = [];
  const compatibilityByContainer = new Map((v5.container_compatibility?.profiles ?? []).map((record) => [record.container_template_id, record]));
  for (const container of records.container_templates) {
    const compatibility = compatibilityByContainer.get(container.id);
    const physical = physicalByTemplate.get(container.id);
    if (!compatibility) { errors.push(`CONTAINER_COMPATIBILITY_MISSING:${container.id}`); continue; }
    if (compatibility.unlisted_content_policy !== 'forbidden') errors.push(`CONTAINER_COMPATIBILITY_NOT_FAIL_CLOSED:${container.id}`);
    container.access_policy = { ...container.access_policy, unlisted_content_policy: compatibility.unlisted_content_policy, closure_model: compatibility.closure_model, access_model: compatibility.access_model };
    addContainerFacet(records, container.id, container.category_id, 'container_form');
    const capacityRange = physical?.capacity?.range ?? { packing_slots: container.capacity };
    const derivedFacets = [
      ['capacity_band', `cat_container_capacity_${digestValue(capacityRange).slice(0, 16)}_v5`, `explicit capacity ${JSON.stringify(capacityRange)}`],
      ['closure_type', `cat_container_closure_${safe(compatibility.closure_model)}_v1`, compatibility.closure_model],
      ['access_model', `cat_container_access_${safe(compatibility.access_model)}_v1`, compatibility.access_model],
      ['portability', `cat_container_portability_${safe(physical?.mobility ?? physical?.carry_form)}_v1`, physical?.mobility ?? physical?.carry_form],
      ['content_compatibility', `cat_container_compatibility_${safe(container.id)}_v5`, `explicit fail-closed compatibility ${compatibility.id}`],
      ['condition', 'cat_container_condition_serviceable_initial_v1', 'serviceable initial condition']
    ];
    for (const [facet, categoryId, label] of derivedFacets) {
      addCategoryAndPermission(records, categoryIds, permissionKeys, categoryId, 'container', facet, label, worldRevisionId, regionId);
      addContainerFacet(records, container.id, categoryId, facet);
    }
    for (const contentCategoryId of compatibility.allowed_content_category_ids ?? []) addCompatibility(records, container.category_id, contentCategoryId, 'allowed', contentCategoryIds, errors, container.id);
    for (const contentCategoryId of compatibility.forbidden_content_category_ids ?? []) addCompatibility(records, container.category_id, contentCategoryId, 'forbidden', contentCategoryIds, errors, container.id);
  }
  for (const entry of records.container_content_profile_entries) {
    const contentProfile = records.container_content_profiles.find((record) => record.id === entry.profile_id);
    if (!entry.required && contentProfile?.empty_allowed !== false) continue;
    const container = records.container_templates.find((record) => record.id === contentProfile?.container_template_id);
    const sizeBinding = records.item_template_category_bindings.find((record) => record.item_template_id === entry.item_template_id && record.binding_kind === 'size_band');
    if (container && sizeBinding) container.capacity = Math.max(container.capacity, sizeBinding.packing_slot_cost);
  }

  dedupeAndSort(records);
  const payload = { schema_version: 'rus.pr17.v5_canonical_catalog.v1', world_revision_id: worldRevisionId, records_by_table: records };
  return freeze({ ...payload, digest: digestValue(payload), errors: [...new Set(errors)].sort() });
}

function addCategoryAndPermission(records, categoryIds, permissionKeys, id, domain, facet, label, revision, region) {
  if (!categoryIds.has(id)) {
    records.universal_categories.push({ id, domain, stable_code: id.replace(/^cat_/u, ''), facet, preferred_label: label, definition: `V5 normalized ${facet}: ${label}.`, scope_note: 'PR17 item/container cohort.', inclusion_rules: `Explicit V5 value ${label}.`, exclusion_rules: 'No inferred or unlisted values.', title: label, status: 'draft' });
    categoryIds.add(id);
  }
  const key = `${region}:${revision}:${id}`;
  if (!permissionKeys.has(key)) {
    records.region_category_options.push({ id: `region_option_${safe(id)}_v1`, world_revision_id: revision, region_id: region, category_id: id, valid_from: '1200-01-01', valid_to: '1250-12-31', weight: 1, applicability: { version: 1, mode: 'explicit_v5_permission' }, status: 'draft' });
    permissionKeys.add(key);
  }
}
function addItemBinding(records, templateId, categoryId, kind) { if (!records.item_template_category_bindings.some((row) => row.item_template_id === templateId && row.category_id === categoryId && row.binding_kind === kind)) records.item_template_category_bindings.push({ id: `binding_${safe(templateId)}_${safe(kind)}_${safe(categoryId)}`, item_template_id: templateId, category_id: categoryId, binding_kind: kind, requires_regional_permission: true, status: 'draft' }); }
function addContainerFacet(records, templateId, categoryId, facet) { if (!records.container_template_facet_bindings.some((row) => row.container_template_id === templateId && row.category_id === categoryId && row.facet === facet)) records.container_template_facet_bindings.push({ id: `facet_${safe(templateId)}_${safe(facet)}_${safe(categoryId)}`, container_template_id: templateId, category_id: categoryId, facet, requires_regional_permission: true, status: 'draft' }); }
function addCompatibility(records, containerCategoryId, contentCategoryId, compatibility, known, errors, containerId) { if (!known.has(contentCategoryId)) errors.push(`CONTAINER_CONTENT_CATEGORY_UNKNOWN:${containerId}:${contentCategoryId}`); records.container_content_category_relations.push({ id: `compat_${safe(containerCategoryId)}_${safe(contentCategoryId)}_${compatibility}`, container_category_id: containerCategoryId, content_category_id: contentCategoryId, compatibility, status: 'draft' }); }
function evidenceClass(value) { if (value === 'direct_novgorod_evidence') return 'direct_novgorod'; if (value === 'direct_novgorod_or_rus_period') return value; if (value === 'rus_period_with_novgorod_context') return value; return 'comparative_period'; }
function sourceType(value) { if (value === 'peer_reviewed_article') return 'article'; if (value === 'primary_document' || value === 'primary_document_continuity') return 'academic_database'; if (value === 'gameplay_policy') return 'project_note'; if (value === 'museum_catalogue') return 'museum'; if (value === 'archaeological_report') return 'archaeology'; return 'book'; }
function carryForm(record) { const text = `${record.carry_form ?? ''} ${record.mobility ?? ''}`; if (/long|pole|shaft/u.test(text)) return 'long'; if (/bulky|fixed|stationary/u.test(text)) return 'bulky'; if (/belt|body|pocket|compact/u.test(text)) return 'compact'; return 'regular'; }
function inventoryRole(record) { if (record.external_hand_cost === 0 && /belt|body/u.test(record.carry_form ?? '')) return 'quick_container'; return record.external_hand_cost > 0 ? 'primary_container' : 'none'; }
function yearDate(value, suffix) { return Number.isInteger(value) ? `${String(value).padStart(4, '0')}-${suffix}` : undefined; }
function upsert(array, record) { const index = array.findIndex((value) => value.id === record.id); if (index >= 0) array[index] = record; else array.push(record); }
function upsertBy(array, key, record) { const index = array.findIndex((value) => value[key] === record[key]); if (index >= 0) array[index] = record; else array.push(record); }
function cloneTables(base) { return Object.fromEntries(Object.entries(base).map(([table, rows]) => [table, structuredClone(rows ?? [])])); }
function ensureTables(records) { for (const table of ['source_records','universal_categories','universal_category_relations','region_category_options','item_templates','container_templates','item_template_category_bindings','container_template_facet_bindings','item_template_inventory_profiles','container_template_inventory_profiles','item_template_source_bindings','container_template_source_bindings','quantity_unit_definitions','item_template_quantity_profiles','container_content_profiles','container_content_profile_entries','container_content_category_relations','item_profile_sets','item_profile_entries','property_profiles','property_profile_rules','g4_item_materialization_rules','g4_container_materialization_rules']) records[table] ??= []; }
function dedupeAndSort(records) { for (const [table, rows] of Object.entries(records)) { const seen = new Set(); records[table] = rows.filter((record) => { const key = record.id ?? JSON.stringify(record); if (seen.has(key)) return false; seen.add(key); return true; }).sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? ''))); } }
function sorted(values) { return [...(values ?? [])].sort((left, right) => String(left.id).localeCompare(String(right.id))); }
function safe(value) { return String(value ?? '').replace(/[^a-z0-9_]+/giu, '_').replace(/^_+|_+$/gu, '').toLowerCase(); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
