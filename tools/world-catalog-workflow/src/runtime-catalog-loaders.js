import { digestValue } from './digest.js';
import { resolveG4MaterializationBinding } from './g4-item-container-coverage.js';

const ALL_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

export function buildApprovedItemCatalogSnapshot({ records_by_table: records = {}, world_revision_id: worldRevisionId, catalog_digest: sourceCatalogDigest } = {}) {
  requireApprovedRevision(records.world_revisions, worldRevisionId, sourceCatalogDigest);
  const itemTemplates = approvedRevisionMap(records.item_templates, worldRevisionId);
  const containerTemplates = approvedRevisionMap(records.container_templates, worldRevisionId);
  const inventoryItems = indexBy(approvedForRevision(records.item_template_inventory_profiles, worldRevisionId), 'item_template_id');
  const inventoryContainers = indexBy(approvedForRevision(records.container_template_inventory_profiles, worldRevisionId), 'container_template_id');
  const quantityProfiles = indexBy(approvedForRevision(records.item_template_quantity_profiles, worldRevisionId), 'item_template_id');
  const itemBindings = groupBy(approved(records.item_template_category_bindings), 'item_template_id');
  const containerBindings = groupBy(approved(records.container_template_facet_bindings), 'container_template_id');
  const itemSourceBindings = groupBy(approvedForRevision(records.item_template_source_bindings, worldRevisionId), 'item_template_id');
  const containerSourceBindings = groupBy(approvedForRevision(records.container_template_source_bindings, worldRevisionId), 'container_template_id');
  const itemProfiles = approvedRevisionMap(records.item_profile_sets, worldRevisionId);
  const profileEntries = approvedOrStatusless(records.item_profile_entries).filter((entry) => itemProfiles.has(entry.profile_id));
  const itemRulesByProfile = indexBy(approvedForRevision(records.g4_item_materialization_rules, worldRevisionId), 'item_profile_id');
  const containerRules = approvedForRevision(records.g4_container_materialization_rules, worldRevisionId);
  const propertyProfiles = approvedRevisionMap(records.property_profiles, worldRevisionId);
  const propertyRules = indexBy(approved(records.property_profile_rules).filter((rule) => propertyProfiles.has(rule.property_profile_id)), 'property_profile_id');
  const contentProfiles = approvedMap(records.container_content_profiles);
  const compatibilityByCategory = groupBy(approved(records.container_content_category_relations), 'container_category_id');
  const graphNodes = approvedMap(records.graph_nodes);

  const propertyCandidates = [...propertyRules.values()].map((rule) => {
    const profile = propertyProfiles.get(rule.property_profile_id);
    if (!profile) fail('RUNTIME_PROPERTY_PROFILE_NOT_APPROVED', rule.id);
    return {
      property_rule_candidate_id: rule.id,
      property_profile_id: profile.id,
      world_revision_id: profile.world_revision_id,
      region_id: profile.region_id,
      owner_model: rule.owner_kind,
      holder_model: rule.holder_kind,
      controller_model: rule.controller_kind,
      access_model: structuredClone(rule.access_policy),
      claim_conditions: structuredClone(rule.claim_conditions),
      materialization_allowed: true,
      valid_from_year: 1200,
      valid_to_year: 1250,
      allowed_seasons: [...ALL_SEASONS],
      status: 'approved'
    };
  }).sort(byRuntimeId);
  const propertyCandidateByProfile = new Map(propertyCandidates.map((record) => [record.property_profile_id, record]));
  const quantityRequirements = [];
  const itemCandidates = profileEntries.map((entry) => {
    const profile = itemProfiles.get(entry.profile_id);
    const template = itemTemplates.get(entry.item_template_id);
    const inventory = inventoryItems.get(entry.item_template_id);
    const quantity = quantityProfiles.get(entry.item_template_id);
    const materializationRule = itemRulesByProfile.get(entry.profile_id);
    if (!profile || !template || !inventory || !quantity || !materializationRule) fail('RUNTIME_ITEM_DEPENDENCY_NOT_APPROVED', entry.id);
    const graphNode = graphNodes.get(materializationRule.graph_node_id);
    const property = propertyCandidateByProfile.get(materializationRule.property_profile_id);
    if (!graphNode || graphNode.region_id !== profile.region_id || !property) fail('RUNTIME_ITEM_CONTEXT_NOT_APPROVED', entry.id);
    const bindings = itemBindings.get(template.id) ?? [];
    const materials = bindings.filter((binding) => binding.binding_kind === 'material').map((binding) => binding.category_id).sort();
    const constructions = bindings.filter((binding) => binding.binding_kind === 'manufacturing_technique').map((binding) => binding.category_id).sort();
    const condition = singleCategory(bindings, 'condition', template.id);
    const sizeBinding = singleBinding(bindings, 'size_band', template.id);
    const candidateId = `runtime_${entry.id}`;
    quantityRequirements.push(quantityRequirement(quantity, candidateId));
    return {
      item_profile_candidate_id: candidateId,
      item_profile_id: profile.id,
      item_template_id: template.id,
      item_category_id: template.category_id,
      slot_rule_id: materializationRule.slot_rule_id,
      property_rule_candidate_ids: [property.property_rule_candidate_id],
      quantity_requirement_id: quantity.id,
      quantity_unit_id: quantity.quantity_unit_id,
      quantity: quantity.minimum_quantity,
      condition_state: condition,
      legal_status: 'context_controlled',
      property_state: propertyState(property),
      visibility_state: { visibility: 'visible_if_accessible', visible_to_player: false },
      access_state: { access: 'context_policy', policy: structuredClone(property.access_model) },
      risk_state: { legal_risk: 'context_dependent', social_risk: 'context_dependent' },
      physical_state: { mass_grams_per_unit: quantity.mass_grams_per_unit, external_hand_cost: inventory.external_hand_cost, carry_form: inventory.carry_form, condition, size_band: sizeBinding.category_id, material_category_id: materials[0], approved_material_category_ids: materials, approved_construction_category_ids: constructions },
      packing_slot_cost: sizeBinding.packing_slot_cost,
      packing_bundle_size: sizeBinding.packing_bundle_size,
      variant_selection: { mode: 'deterministic_from_approved_bindings', selected_material_category_id: materials[0], candidate_material_category_ids: materials },
      context_graph_node_ids: [materializationRule.graph_node_id],
      place_template_ids: graphNode.place_template_id ? [graphNode.place_template_id] : [],
      causal_basis: { causal_basis_type: materializationRule.causal_basis_type, causal_basis_id: materializationRule.causal_basis_id },
      required: entry.required === true,
      weight: entry.weight,
      world_revision_id: profile.world_revision_id,
      region_id: profile.region_id,
      valid_from_year: year(materializationRule.valid_from, 1200),
      valid_to_year: year(materializationRule.valid_to, 1250),
      allowed_seasons: [...ALL_SEASONS],
      materialization_allowed: true,
      source_trace: itemSourceBindings.get(template.id)?.map(sourceTrace) ?? [],
      status: 'approved'
    };
  }).sort(byRuntimeId);

  const containerCandidates = containerRules.map((rule) => {
    const template = containerTemplates.get(rule.container_template_id);
    const inventory = inventoryContainers.get(rule.container_template_id);
    const content = rule.content_profile_id ? contentProfiles.get(rule.content_profile_id) : null;
    const property = propertyCandidateByProfile.get(rule.property_profile_id);
    const graphNode = graphNodes.get(rule.graph_node_id);
    if (!template || !inventory || !property || !graphNode || graphNode.region_id !== template.region_id || (rule.content_profile_id && !content)) fail('RUNTIME_CONTAINER_DEPENDENCY_NOT_APPROVED', rule.id);
    const bindings = containerBindings.get(template.id) ?? [];
    const materials = bindings.filter((binding) => binding.facet === 'material').map((binding) => binding.category_id).sort();
    const condition = singleCategory(bindings, 'condition', template.id, 'facet');
    const capacityBand = singleCategory(bindings, 'capacity_band', template.id, 'facet');
    const quantityId = `quantity_${template.id}_count_v1`;
    quantityRequirements.push({ quantity_requirement_id: quantityId, container_template_id: template.id, world_revision_id: template.world_revision_id, quantity_unit_id: 'piece', quantity_dimension: 'count', minimum_quantity: 1, maximum_quantity: 1, default_quantity_policy: { version: 1, mode: 'explicit_only' }, mass_grams_per_unit: inventory.mass_grams, stackable: false, partial_consumption_allowed: false, status: 'approved' });
    return {
      container_profile_candidate_id: `runtime_${rule.id}`,
      container_profile_id: content?.id ?? template.id,
      container_template_id: template.id,
      container_category_id: template.category_id,
      slot_rule_id: rule.slot_rule_id,
      property_rule_candidate_ids: [property.property_rule_candidate_id],
      quantity_requirement_id: quantityId,
      quantity_unit_id: 'piece',
      quantity: 1,
      condition_state: condition,
      legal_status: 'context_controlled',
      property_state: propertyState(property),
      visibility_state: { visibility: 'visible_if_accessible', visible_to_player: false },
      access_state: structuredClone(template.access_policy),
      risk_state: { legal_risk: 'context_dependent', social_risk: 'context_dependent' },
      physical_state: { mass_grams_per_unit: inventory.mass_grams, weight_empty: inventory.mass_grams / 1000, external_hand_cost: inventory.external_hand_cost, carry_form: inventory.carry_form, condition, capacity_band: capacityBand, material_category_id: materials[0], approved_material_category_ids: materials },
      capacity: template.capacity,
      packing_slot_cost: template.packing_slot_cost,
      capacity_policy: structuredClone(template.capacity_policy),
      content_state: { empty_allowed: content?.empty_allowed === true, unlisted_content_policy: template.access_policy?.unlisted_content_policy ?? 'forbidden', compatibility_relations: structuredClone(compatibilityByCategory.get(template.category_id) ?? []) },
      context_graph_node_ids: [rule.graph_node_id],
      place_template_ids: graphNode.place_template_id ? [graphNode.place_template_id] : [],
      causal_basis: { causal_basis_type: rule.causal_basis_type, causal_basis_id: rule.causal_basis_id },
      required: rule.min_count > 0,
      weight: rule.weight,
      world_revision_id: template.world_revision_id,
      region_id: template.region_id,
      valid_from_year: year(rule.valid_from, 1200),
      valid_to_year: year(rule.valid_to, 1250),
      allowed_seasons: [...ALL_SEASONS],
      materialization_allowed: true,
      source_trace: containerSourceBindings.get(template.id)?.map(sourceTrace) ?? [],
      status: 'approved'
    };
  }).sort(byRuntimeId);

  const approvedEquipmentProfiles = approvedMap(records.region_equipment_profiles);
  const equipmentCandidates = approvedOrStatusless(records.region_equipment_profile_entries).filter((entry) => approvedEquipmentProfiles.has(entry.equipment_profile_id)).map((entry) => {
    const profile = approvedEquipmentProfiles.get(entry.equipment_profile_id);
    if (!profile) fail('RUNTIME_EQUIPMENT_PROFILE_NOT_APPROVED', entry.id);
    if (entry.item_template_id && !itemTemplates.has(entry.item_template_id)) fail('RUNTIME_EQUIPMENT_ITEM_NOT_APPROVED', entry.id);
    return { equipment_candidate_id: entry.id, equipment_profile_id: profile.id, item_template_id: entry.item_template_id ?? null, item_category_id: entry.item_category_id ?? null, required: entry.required, weight: entry.weight, world_revision_id: worldRevisionId, region_id: profile.region_id, valid_from_year: 1200, valid_to_year: 1250, allowed_seasons: [...ALL_SEASONS], status: 'approved' };
  }).sort(byRuntimeId);
  const core = { version: 1, schema: 'approved_item_catalog_snapshot', world_revision_id: worldRevisionId, source_catalog_digest: sourceCatalogDigest, item_profile_candidates: itemCandidates, container_profile_candidates: containerCandidates, equipment_candidates: equipmentCandidates, quantity_requirements: quantityRequirements.sort(byRuntimeId), property_rule_candidates: propertyCandidates };
  return deepFreeze({ ...core, catalog_digest: digestValue(core) });
}

export function buildAllowedG5TemplateSet({ records_by_table: records = {}, graph_node_id: graphNodeId, world_revision_id: worldRevisionId, selected_g4_type_id: selectedG4TypeId = null, source_catalog_digest: sourceCatalogDigest } = {}) {
  requireApprovedRevision(records.world_revisions, worldRevisionId, sourceCatalogDigest);
  const graphNode = (records.graph_nodes ?? []).find((record) => record.id === graphNodeId);
  if (graphNode?.status !== 'approved' || graphNode.scale_level !== 'G4') fail('RUNTIME_G4_NOT_APPROVED', graphNodeId);
  const resolution = resolveG4MaterializationBinding({ graph_node: graphNode, bindings: records.g4_materialization_bindings });
  if (resolution.status !== 'resolved') fail('RUNTIME_G4_BINDING_UNRESOLVED', graphNodeId);
  const profile = approvedMap(records.g4_materialization_profiles).get(resolution.binding.profile_id);
  const layout = approvedRevisionMap(records.building_layout_templates, worldRevisionId).get(profile?.layout_template_id);
  if (!profile || profile.world_revision_id !== worldRevisionId || !layout) fail('RUNTIME_G4_PROFILE_NOT_APPROVED', graphNodeId);
  const slots = approved(records.materialization_slot_rules).filter((record) => record.profile_id === profile.id).sort(byId);
  const itemRule = approvedForRevision(records.g4_item_materialization_rules, worldRevisionId).find((record) => record.graph_node_id === graphNodeId);
  const containerRules = approvedForRevision(records.g4_container_materialization_rules, worldRevisionId).filter((record) => record.graph_node_id === graphNodeId).sort(byId);
  const runtimeItems = buildApprovedItemCatalogSnapshot({ records_by_table: records, world_revision_id: worldRevisionId, catalog_digest: sourceCatalogDigest });
  const itemCandidates = itemRule ? runtimeItems.item_profile_candidates.filter((candidate) => candidate.item_profile_id === itemRule.item_profile_id) : [];
  const containerCandidateByTemplate = new Map(runtimeItems.container_profile_candidates.map((candidate) => [candidate.container_template_id, candidate]));
  const anchorSlotByTemplate = new Map(slots.filter((slot) => slot.slot_domain === 'anchor').map((slot) => [slot.g5_anchor_template_id, slot.slot_key]));
  const layoutEdges = approved(records.g4_materialization_layout_edges).filter((record) => record.profile_id === profile.id).sort(byId);
  const runtimeSlots = slots.map((slot) => {
    const base = { rule_id: slot.id, profile_id: slot.profile_id, slot_key: slot.slot_key, slot_domain: slot.slot_domain, min_count: slot.min_count, max_count: slot.max_count, required: slot.required, ...(slot.g5_minilocation_template_id ? { g5_minilocation_template_id: slot.g5_minilocation_template_id } : {}), ...(slot.g5_anchor_template_id ? { g5_anchor_template_id: slot.g5_anchor_template_id } : {}), ...(slot.g5_edge_template_id ? { g5_edge_template_id: slot.g5_edge_template_id } : {}), ...(slot.parent_node_slot_key ? { parent_node_slot_key: slot.parent_node_slot_key } : {}), entry_role: slot.entry_role };
    if (slot.slot_domain === 'item') return { ...base, min_count: itemRule?.min_count ?? 0, max_count: Math.min(slot.max_count, itemRule?.max_count ?? 0), required: (itemRule?.min_count ?? 0) > 0, candidate_ids: itemCandidates.map((candidate) => candidate.item_profile_candidate_id), anchor_slot_key: requiredAnchorSlot(anchorSlotByTemplate, slot), causal_basis_type: 'place_function', causal_basis_id: itemRule?.causal_basis_id, source_causal_basis_type: itemRule?.causal_basis_type };
    if (slot.slot_domain === 'container') return { ...base, candidate_ids: containerRules.map((rule) => containerCandidateByTemplate.get(rule.container_template_id)?.container_profile_candidate_id).filter(Boolean), anchor_slot_key: requiredAnchorSlot(anchorSlotByTemplate, slot), causal_basis_type: 'storage_function', causal_basis_id: containerRules[0]?.causal_basis_id, source_causal_basis_type: containerRules[0]?.causal_basis_type };
    return base;
  });
  for (const slot of runtimeSlots.filter((record) => record.required && ['item', 'container'].includes(record.slot_domain))) if (!slot.candidate_ids.length) fail('RUNTIME_REQUIRED_RESOURCE_CANDIDATES_EMPTY', slot.rule_id);
  const fromYear = year(profile.valid_from, 1200), toYear = year(profile.valid_to, 1250);
  const template = {
    template_id: `runtime_bundle_${profile.id}_${graphNodeId}`,
    g4_type_id: selectedG4TypeId ?? graphNode.node_type,
    status: 'approved',
    world_revision_id: worldRevisionId,
    region_id: profile.region_id,
    valid_from_year: fromYear,
    valid_to_year: toYear,
    allowed_seasons: [...ALL_SEASONS],
    player_start_anchor_slot_key: profile.player_start_anchor_slot_key,
    materialization_profile: { profile_id: profile.id, layout_template_id: profile.layout_template_id, maximum_g5_nodes: profile.maximum_g5_nodes, world_revision_id: worldRevisionId, region_id: profile.region_id, valid_from_year: fromYear, valid_to_year: toYear, allowed_seasons: [...ALL_SEASONS] },
    layout_template: { layout_template_id: layout.id, world_revision_id: worldRevisionId, region_id: layout.region_id, valid_from_year: year(layout.valid_from, fromYear), valid_to_year: year(layout.valid_to, toYear), allowed_seasons: [...ALL_SEASONS] },
    slot_rules: runtimeSlots,
    layout_edges: layoutEdges.map((record) => ({ edge_id: record.id, from_anchor_slot_key: record.from_anchor_slot_key, to_anchor_slot_key: record.to_anchor_slot_key, g5_edge_template_id: record.g5_edge_template_id })),
    g5_minilocation_templates: referencedTemplates(runtimeSlots, 'g5_minilocation_template_id', approvedMap(records.g5_minilocation_templates), runtimeNode),
    g5_anchor_templates: referencedTemplates(runtimeSlots, 'g5_anchor_template_id', approvedMap(records.g5_anchor_templates), runtimeAnchor),
    g5_edge_templates: referencedTemplates(layoutEdges, 'g5_edge_template_id', approvedMap(records.g5_edge_templates), runtimeEdge),
    visibility_model: structuredClone(profile.visibility_model),
    access_model: structuredClone(profile.access_model),
    source_catalog_digest: sourceCatalogDigest
  };
  const core = { version: 1, schema: 'allowed_g5_template_set', selected_g4_type_id: template.g4_type_id, world_revision_id: worldRevisionId, allowed_g5_templates: [template] };
  return deepFreeze({ ...core, catalog_digest: digestValue(core) });
}

function quantityRequirement(record) { return { quantity_requirement_id: record.id, item_template_id: record.item_template_id, world_revision_id: record.world_revision_id, quantity_unit_id: record.quantity_unit_id, quantity_dimension: record.quantity_dimension, minimum_quantity: record.minimum_quantity, maximum_quantity: record.maximum_quantity, default_quantity_policy: structuredClone(record.default_quantity_policy), mass_grams_per_unit: record.mass_grams_per_unit, stackable: record.stackable, partial_consumption_allowed: record.partial_consumption_allowed, status: 'approved' }; }
function propertyState(property) { return { property_rule_candidate_id: property.property_rule_candidate_id, owner_model: property.owner_model, holder_model: property.holder_model, controller_model: property.controller_model }; }
function sourceTrace(record) { return { source_id: record.source_id, binding_id: record.id, claim_scope: record.claim_scope }; }
function runtimeNode(record) { return { template_id: record.id, status: record.status, capacity: record.capacity, access_policy: structuredClone(record.access_policy), visibility_policy: structuredClone(record.visibility_policy), initial_state: structuredClone(record.initial_state) }; }
function runtimeAnchor(record) { return { template_id: record.id, status: record.status, anchor_type: record.category_id, can_hold_npc: record.can_hold_npc, can_hold_item: record.can_hold_item, can_hold_container: record.can_hold_container, npc_capacity: record.npc_capacity, item_capacity: record.item_capacity, container_capacity: record.container_capacity, access_policy: structuredClone(record.access_policy), visibility_policy: structuredClone(record.visibility_policy) }; }
function runtimeEdge(record) { return { template_id: record.id, status: record.status, access_policy: structuredClone(record.access_policy), visibility_policy: structuredClone(record.visibility_policy), initial_state: structuredClone(record.initial_state) }; }
function referencedTemplates(slots, field, records, project) { const ids = [...new Set(slots.map((slot) => slot[field]).filter(Boolean))].sort(); return ids.map((id) => { const record = records.get(id); if (!record) fail('RUNTIME_G5_TEMPLATE_NOT_APPROVED', id); return project(record); }); }
function requiredAnchorSlot(anchorSlotByTemplate, resourceSlot) { const value = anchorSlotByTemplate.get(resourceSlot.g5_anchor_template_id); if (!value) fail('RUNTIME_RESOURCE_ANCHOR_SLOT_UNRESOLVED', resourceSlot.id); return value; }
function singleCategory(bindings, kind, owner, key = 'binding_kind') { const values = bindings.filter((record) => record[key] === kind).map((record) => record.category_id).sort(); if (!values.length) fail('RUNTIME_CATEGORY_BINDING_MISSING', `${owner}:${kind}`); return values[0]; }
function singleBinding(bindings, kind, owner, key = 'binding_kind') { const values = bindings.filter((record) => record[key] === kind).sort(byId); if (values.length !== 1) fail('RUNTIME_CATEGORY_BINDING_AMBIGUOUS', `${owner}:${kind}`); return values[0]; }
function approved(values = []) { return values.filter((record) => record.status === 'approved'); }
function approvedForRevision(values = [], worldRevisionId) { return approved(values).filter((record) => record.world_revision_id === worldRevisionId); }
function approvedOrStatusless(values = []) { return values.filter((record) => record.status == null || record.status === 'approved'); }
function approvedMap(values = []) { return new Map(approved(values).map((record) => [record.id, record])); }
function approvedRevisionMap(values = [], worldRevisionId) { return new Map(approvedForRevision(values, worldRevisionId).map((record) => [record.id, record])); }
function indexBy(values = [], key, requireApproved = false) { const map = new Map(); for (const record of values) if ((!requireApproved || record.status === 'approved') && record[key]) { if (map.has(record[key])) fail('RUNTIME_DEPENDENCY_AMBIGUOUS', `${key}:${record[key]}`); map.set(record[key], record); } return map; }
function groupBy(values = [], key) { const map = new Map(); for (const record of values) { const list = map.get(record[key]) ?? []; list.push(record); map.set(record[key], list); } return map; }
function year(value, fallback) { return typeof value === 'string' && /^\d{4}/u.test(value) ? Number(value.slice(0, 4)) : fallback; }
function requireDigest(value) { if (!/^[a-f0-9]{64}$/u.test(String(value ?? ''))) fail('RUNTIME_SOURCE_CATALOG_DIGEST_INVALID', value); }
function requireApprovedRevision(values, worldRevisionId, catalogDigest) {
  requireDigest(catalogDigest);
  const revision = approvedMap(values).get(worldRevisionId);
  if (!revision) fail('RUNTIME_WORLD_REVISION_NOT_APPROVED', worldRevisionId);
  if (revision.catalog_digest !== catalogDigest) fail('RUNTIME_SOURCE_CATALOG_DIGEST_MISMATCH', worldRevisionId);
  return revision;
}
function fail(code, id) { const error = new Error(`${code}:${id ?? ''}`); error.code = code; throw error; }
function byId(left, right) { return String(left.id).localeCompare(String(right.id)); }
function byRuntimeId(left, right) { const id = (value) => value.item_profile_candidate_id ?? value.container_profile_candidate_id ?? value.property_rule_candidate_id ?? value.quantity_requirement_id ?? value.equipment_candidate_id ?? value.id; return String(id(left)).localeCompare(String(id(right))); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
