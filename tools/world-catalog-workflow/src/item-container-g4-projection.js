import { digestValue } from './digest.js';

const PERIOD_FROM = '1200-01-01';
const PERIOD_TO = '1250-12-31';

export function compileItemContainerG4Projection(input = {}) {
  const errors = [];
  const worldRevisionId = required(input.world_revision_id, 'WORLD_REVISION_ID_MISSING', errors);
  const regionId = required(input.region_id, 'REGION_ID_MISSING', errors);
  const graphNodes = sorted(input.graph_nodes);
  const contextProfiles = sorted(input.context_profiles);
  const contextMappings = sorted(input.context_mappings, 'profile_id');
  const templates = sorted(input.templates);
  const materializationRules = sorted(input.materialization_rules);
  const contentProfileByContainer = new Map((input.container_content_profiles ?? []).map((record) => [record.container_template_id, record]));
  const graphNodeById = new Map(graphNodes.map((record) => [record.id, record]));
  const profileById = new Map(contextProfiles.map((record) => [record.id, record]));
  const mappingByProfile = new Map();

  for (const mapping of contextMappings) {
    const profile = profileById.get(mapping.profile_id);
    const graphNode = graphNodeById.get(mapping.graph_node_id);
    if (mappingByProfile.has(mapping.profile_id)) errors.push(`CONTEXT_MAPPING_DUPLICATE:${mapping.profile_id}`);
    mappingByProfile.set(mapping.profile_id, mapping);
    if (!profile) errors.push(`CONTEXT_PROFILE_UNKNOWN:${mapping.profile_id}`);
    if (profile && profile.context_domain !== mapping.context_domain) errors.push(`CONTEXT_DOMAIN_MISMATCH:${mapping.profile_id}`);
    if (!graphNode) errors.push(`G4_MAPPING_GRAPH_NODE_UNKNOWN:${mapping.profile_id}:${mapping.graph_node_id}`);
    if (graphNode && graphNode.scale_level !== 'G4') errors.push(`G4_MAPPING_SCALE_INVALID:${mapping.profile_id}:${mapping.graph_node_id}`);
    if (graphNode && graphNode.region_id && graphNode.region_id !== regionId) errors.push(`G4_MAPPING_REGION_MISMATCH:${mapping.profile_id}:${mapping.graph_node_id}`);
    if (graphNode && graphNode.place_template_id !== mapping.place_template_id) errors.push(`G4_MAPPING_PLACE_TEMPLATE_MISMATCH:${mapping.profile_id}:${mapping.graph_node_id}`);
    if (!nonEmpty(mapping.causal_basis_type) || !nonEmpty(mapping.causal_basis_id)) errors.push(`CAUSAL_BASIS_MISSING:${mapping.profile_id}`);
    if (mapping.requested_status !== 'approved') errors.push(`G4_MAPPING_APPROVAL_TARGET_INVALID:${mapping.profile_id}`);
  }
  for (const profile of contextProfiles) if (!mappingByProfile.has(profile.id)) errors.push(`CONTEXT_PROFILE_UNMAPPED:${profile.id}`);

  const templateById = new Map(templates.map((record) => [record.id, record]));
  const sourceRuleByTemplate = new Map();
  for (const rule of materializationRules) {
    if (sourceRuleByTemplate.has(rule.template_id)) errors.push(`TEMPLATE_RULE_DUPLICATE:${rule.template_id}`);
    sourceRuleByTemplate.set(rule.template_id, rule);
    const template = templateById.get(rule.template_id);
    if (!template) errors.push(`MATERIALIZATION_RULE_TEMPLATE_UNKNOWN:${rule.id}:${rule.template_id}`);
    if (template && template.materialization_profile_id !== rule.profile_id) errors.push(`TEMPLATE_RULE_PROFILE_MISMATCH:${rule.template_id}`);
  }
  for (const template of templates) {
    if (!['item', 'container'].includes(template.kind)) errors.push(`TEMPLATE_KIND_INVALID:${template.id}`);
    if (!mappingByProfile.has(template.materialization_profile_id)) errors.push(`TEMPLATE_CONTEXT_PROFILE_UNMAPPED:${template.id}:${template.materialization_profile_id}`);
    if (!sourceRuleByTemplate.has(template.id)) errors.push(`TEMPLATE_MATERIALIZATION_RULE_MISSING:${template.id}`);
    if (template.kind === 'container' && !contentProfileByContainer.has(template.id)) errors.push(`CONTAINER_CONTENT_PROFILE_MISSING:${template.id}`);
  }

  const contexts = contextProfiles.map((profile) => ({
    key: profile.context_domain,
    source_profile_id: profile.id,
    period_from: profile.period?.from ?? PERIOD_FROM,
    period_to: profile.period?.to ?? PERIOD_TO,
    mapping: mappingByProfile.get(profile.id)
  })).sort((left, right) => left.key.localeCompare(right.key));

  const records = emptyRecords();
  records.universal_categories.push(...baseCategories());
  for (const context of contexts) appendSpatialContext(records, { context, worldRevisionId, regionId, templates, sourceRuleByTemplate });

  for (const profile of contextProfiles) {
    const mapping = mappingByProfile.get(profile.id);
    const profileTemplates = templates.filter((template) => template.materialization_profile_id === profile.id);
    const itemTemplates = profileTemplates.filter((template) => template.kind === 'item');
    const containerTemplates = profileTemplates.filter((template) => template.kind === 'container');
    const propertyProfileId = `property_context_${safe(profile.context_domain)}_v1`;
    records.item_profile_sets.push({
      id: profile.id,
      world_revision_id: worldRevisionId,
      region_id: regionId,
      context_domain: profile.context_domain,
      applicability: applicability(profile, mapping),
      status: 'approved'
    });
    records.property_profiles.push({ id: propertyProfileId, world_revision_id: worldRevisionId, region_id: regionId, property_category_id: 'cat_item_property_context_controlled_v1', status: 'approved' });
    records.property_profile_rules.push(propertyRule(profile.context_domain, propertyProfileId));
    for (const template of itemTemplates) {
      const sourceRule = sourceRuleByTemplate.get(template.id);
      records.item_profile_entries.push({
        id: `entry_${safe(profile.id)}_${safe(template.id)}`,
        profile_id: profile.id,
        item_template_id: template.id,
        slot_key: `item_${safe(profile.context_domain)}`,
        min_quantity: 1,
        max_quantity: 1,
        required: false,
        weight: positiveInteger(sourceRule?.weight, 1)
      });
    }
    if (itemTemplates.length > 0 && mapping) {
      records.g4_item_materialization_rules.push({
        id: `g4_item_rule_${safe(profile.context_domain)}_v1`,
        world_revision_id: worldRevisionId,
        graph_node_id: mapping.graph_node_id,
        slot_rule_id: `slot_${safe(profile.context_domain)}_item_v1`,
        item_profile_id: profile.id,
        property_profile_id: propertyProfileId,
        min_count: 1,
        max_count: itemTemplates.length,
        economic_basis: `approved_context_profile:${profile.context_domain}`,
        causal_basis_type: mapping.causal_basis_type,
        causal_basis_id: mapping.causal_basis_id,
        applicability: applicability(profile, mapping),
        valid_from: profile.period?.from ?? PERIOD_FROM,
        valid_to: profile.period?.to ?? PERIOD_TO,
        confidence: mapping.confidence ?? 'medium',
        weight: 1,
        status: 'approved'
      });
    }
    for (const template of containerTemplates) {
      if (!mapping) continue;
      const sourceRule = sourceRuleByTemplate.get(template.id);
      records.g4_container_materialization_rules.push({
        id: `g4_container_rule_${safe(profile.context_domain)}_${safe(template.id)}_v1`,
        world_revision_id: worldRevisionId,
        graph_node_id: mapping.graph_node_id,
        slot_rule_id: `slot_${safe(profile.context_domain)}_container_v1`,
        container_template_id: template.id,
        content_profile_id: contentProfileByContainer.get(template.id)?.id ?? null,
        property_profile_id: propertyProfileId,
        min_count: 0,
        max_count: 1,
        causal_basis_type: mapping.causal_basis_type,
        causal_basis_id: mapping.causal_basis_id,
        applicability: applicability(profile, mapping),
        valid_from: profile.period?.from ?? PERIOD_FROM,
        valid_to: profile.period?.to ?? PERIOD_TO,
        confidence: mapping.confidence ?? 'medium',
        weight: positiveInteger(sourceRule?.weight, 1),
        status: 'approved'
      });
    }
  }

  for (const values of Object.values(records)) values.sort(byId);
  const graphNodeStatusTransitions = contextMappings.map((mapping) => ({
    graph_node_id: mapping.graph_node_id,
    from_status: mapping.current_status,
    to_status: mapping.requested_status,
    approval_basis: `approved_semantic_mapping:${mapping.profile_id}`,
    causal_basis_type: mapping.causal_basis_type,
    causal_basis_id: mapping.causal_basis_id
  })).sort((left, right) => left.graph_node_id.localeCompare(right.graph_node_id));
  const payload = { schema_version: 'rus.item_container_g4_projection.v1', records_by_table: records, graph_node_status_transitions: graphNodeStatusTransitions };
  return deepFreeze({ ...payload, digest: digestValue(payload), errors: [...new Set(errors)].sort() });
}

function appendSpatialContext(records, { context, worldRevisionId, regionId, templates, sourceRuleByTemplate }) {
  const key = safe(context.key);
  const mapping = context.mapping;
  const profileId = `g4_profile_${key}_v1`;
  const layoutId = `layout_${key}_v1`;
  const buildingId = `building_${key}_v1`;
  const roomId = `room_${key}_v1`;
  const layoutNodeId = `layout_node_${key}_main_v1`;
  const g5NodeId = `g5_node_${key}_v1`;
  const startAnchorId = `g5_anchor_${key}_start_v1`;
  const workAnchorId = `g5_anchor_${key}_work_v1`;
  const exitAnchorId = `g5_anchor_${key}_exit_v1`;
  const edgeTemplateId = `g5_edge_${key}_internal_v1`;
  const contextTemplates = templates.filter((template) => template.materialization_profile_id === context.source_profile_id);
  const itemCount = contextTemplates.filter((template) => template.kind === 'item').length;
  const containerCount = contextTemplates.filter((template) => template.kind === 'container').length;
  const itemWeights = contextTemplates.filter((template) => template.kind === 'item').map((template) => positiveInteger(sourceRuleByTemplate.get(template.id)?.weight, 1));
  records.building_templates.push(buildingTemplate(buildingId, context.key, regionId));
  records.room_templates.push({ id: roomId, region_id: regionId, room_category_id: 'cat_g5_zone_functional_v1', capacity: Math.max(1, itemCount + containerCount), access_policy: accessModel(context), visibility_policy: visibilityModel(context), status: 'approved' });
  records.building_layout_templates.push({ id: layoutId, world_revision_id: worldRevisionId, region_id: regionId, building_template_id: buildingId, valid_from: context.period_from, valid_to: context.period_to, status: 'approved' });
  records.building_layout_nodes.push({ id: layoutNodeId, layout_template_id: layoutId, slot_key: 'main_zone', room_template_id: roomId, required: true, ordinal: 0 });
  records.g5_minilocation_templates.push({ id: g5NodeId, category_id: 'cat_g5_zone_functional_v1', capacity: Math.max(1, itemCount + containerCount), access_policy: accessModel(context), visibility_policy: visibilityModel(context), initial_state: { version: 1, mode: 'authored_empty' }, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, confidence: mapping?.confidence ?? 'medium' });
  records.g5_anchor_templates.push(
    anchorTemplate(startAnchorId, context, mapping, 0, 0),
    anchorTemplate(workAnchorId, context, mapping, itemCount, containerCount),
    anchorTemplate(exitAnchorId, context, mapping, 0, 0)
  );
  records.g5_edge_templates.push({ id: edgeTemplateId, passage_category_id: 'cat_g5_passage_internal_v1', access_policy: accessModel(context), visibility_policy: visibilityModel(context), initial_state: { version: 1, mode: 'open' }, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, confidence: mapping?.confidence ?? 'medium' });
  records.g4_materialization_profiles.push({ id: profileId, world_revision_id: worldRevisionId, region_id: regionId, layout_template_id: layoutId, maximum_g5_nodes: 1, player_start_anchor_slot_key: 'anchor_start', visibility_model: visibilityModel(context), access_model: accessModel(context), status: 'approved', valid_from: context.period_from, valid_to: context.period_to, confidence: mapping?.confidence ?? 'medium' });
  records.g4_materialization_bindings.push({
    id: `binding_${key}_v1`, profile_id: profileId,
    graph_node_id: mapping?.graph_node_id,
    priority: 100,
    applicability: { version: 1, item_container_policy: 'rules_only', required_rule_domains: requiredDomains(itemCount, containerCount), context_profile_ids: [context.source_profile_id], causal_basis_type: mapping?.causal_basis_type, causal_basis_id: mapping?.causal_basis_id },
    status: 'approved', valid_from: context.period_from, valid_to: context.period_to, confidence: mapping?.confidence ?? 'medium'
  });
  records.materialization_slot_rules.push(
    { id: `slot_${key}_node_v1`, profile_id: profileId, slot_key: 'main_zone', slot_domain: 'g5_node', min_count: 1, max_count: 1, g5_minilocation_template_id: g5NodeId, g5_anchor_template_id: null, g5_edge_template_id: null, parent_node_slot_key: null, entry_role: 'none', required: true, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, applicability: { version: 1, context_domain: context.key }, confidence: mapping?.confidence ?? 'medium' },
    { id: `slot_${key}_anchor_start_v1`, profile_id: profileId, slot_key: 'anchor_start', slot_domain: 'anchor', min_count: 1, max_count: 1, g5_minilocation_template_id: null, g5_anchor_template_id: startAnchorId, g5_edge_template_id: null, parent_node_slot_key: 'main_zone', entry_role: 'start', required: true, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, applicability: { version: 1, context_domain: context.key }, confidence: mapping?.confidence ?? 'medium' },
    { id: `slot_${key}_anchor_work_v1`, profile_id: profileId, slot_key: 'anchor_work', slot_domain: 'anchor', min_count: 1, max_count: 1, g5_minilocation_template_id: null, g5_anchor_template_id: workAnchorId, g5_edge_template_id: null, parent_node_slot_key: 'main_zone', entry_role: 'none', required: true, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, applicability: { version: 1, context_domain: context.key }, confidence: mapping?.confidence ?? 'medium' },
    { id: `slot_${key}_anchor_exit_v1`, profile_id: profileId, slot_key: 'anchor_exit', slot_domain: 'anchor', min_count: 1, max_count: 1, g5_minilocation_template_id: null, g5_anchor_template_id: exitAnchorId, g5_edge_template_id: null, parent_node_slot_key: 'main_zone', entry_role: 'exit', required: true, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, applicability: { version: 1, context_domain: context.key }, confidence: mapping?.confidence ?? 'medium' }
  );
  records.g4_materialization_layout_edges.push(
    { id: `g4_layout_edge_${key}_start_work_v1`, profile_id: profileId, from_anchor_slot_key: 'anchor_start', to_anchor_slot_key: 'anchor_work', g5_edge_template_id: edgeTemplateId, ordinal: 0, status: 'approved' },
    { id: `g4_layout_edge_${key}_work_exit_v1`, profile_id: profileId, from_anchor_slot_key: 'anchor_work', to_anchor_slot_key: 'anchor_exit', g5_edge_template_id: edgeTemplateId, ordinal: 1, status: 'approved' }
  );
  if (itemCount > 0) records.materialization_slot_rules.push({ id: `slot_${key}_item_v1`, profile_id: profileId, slot_key: `item_${key}`, slot_domain: 'item', min_count: 1, max_count: itemCount, g5_minilocation_template_id: null, g5_anchor_template_id: workAnchorId, g5_edge_template_id: null, parent_node_slot_key: 'main_zone', entry_role: 'none', required: true, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, applicability: { version: 1, context_domain: context.key, selection_weight_total: itemWeights.reduce((sum, value) => sum + value, 0) }, confidence: mapping?.confidence ?? 'medium' });
  if (containerCount > 0) records.materialization_slot_rules.push({ id: `slot_${key}_container_v1`, profile_id: profileId, slot_key: `container_${key}`, slot_domain: 'container', min_count: 1, max_count: containerCount, g5_minilocation_template_id: null, g5_anchor_template_id: workAnchorId, g5_edge_template_id: null, parent_node_slot_key: 'main_zone', entry_role: 'none', required: true, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, applicability: { version: 1, context_domain: context.key }, confidence: mapping?.confidence ?? 'medium' });
}

function anchorTemplate(id, context, mapping, itemCapacity, containerCapacity) {
  return { id, category_id: 'cat_g5_anchor_storage_surface_v1', can_hold_npc: false, can_hold_item: itemCapacity > 0, can_hold_container: containerCapacity > 0, npc_capacity: 0, item_capacity: itemCapacity, container_capacity: containerCapacity, access_policy: accessModel(context), visibility_policy: visibilityModel(context), initial_state: { version: 1, mode: 'authored_empty' }, status: 'approved', valid_from: context.period_from, valid_to: context.period_to, confidence: mapping?.confidence ?? 'medium' };
}

function baseCategories() {
  return [
    category('cat_g5_zone_functional_v1', 'g5_zone', 'zone_type', 'functional zone'),
    category('cat_g5_anchor_storage_surface_v1', 'g5_anchor', 'anchor_type', 'storage or working surface'),
    category('cat_g5_passage_internal_v1', 'g5_edge', 'passage_type', 'internal traversable passage'),
    category('cat_item_property_context_controlled_v1', 'item_property', 'property_model', 'context controlled property')
  ];
}

function category(id, domain, facet, title) {
  return { id, domain, stable_code: id.replace(/^cat_/u, ''), facet, preferred_label: title, definition: `Approved ${title} category for deterministic item/container materialization.`, scope_note: 'PR17 active-v2 item/container dependency projection only.', inclusion_rules: 'Only records emitted by the approved deterministic projection.', exclusion_rules: 'No inferred, fallback, or unapproved records.', title, status: 'approved' };
}

function buildingTemplate(id, contextDomain, regionId) {
  return { id, region_id: regionId, title: `Materialization complex: ${contextDomain}`, slug: id, building_type: null, summary: `Functional building or site complex for ${contextDomain}.`, allowed_place_types: [], allowed_location_types: [], required_economy: null, required_social_order: null, typical_owner: null, typical_controller: null, typical_users: [], materials: [], size_band: null, wealth_level: null, condition_band: null, layout_rules: [{ version: 1, mode: 'single_authored_zone' }], room_templates: [], storage_rules: [], access_rules: [], locked_area_rules: [], hidden_area_rules: [], fire_risk: null, theft_risk: null, social_risk: null, typical_objects: [], typical_npc_roles: [], typical_activities: [], game_use: 'active-v2 deterministic G4 to G5 materialization', limits: 'No semantic expansion beyond approved context mapping.', status: 'approved', confidence: 'medium', sources: ['src_pr17_v5_historical_gameplay'], audit_notes: 'Generated from approved PR17 semantic mapping; building_type intentionally null for building-or-complex layouts.' };
}

function propertyRule(contextDomain, propertyProfileId) {
  const institution = ['military_service', 'religious_personal', 'trade_administration', 'writing_accounting'].includes(contextDomain);
  const workshop = contextDomain === 'craft_work';
  const owner = institution ? 'institution' : workshop ? 'workshop' : 'household';
  return { id: `rule_${propertyProfileId}`, property_profile_id: propertyProfileId, owner_kind: owner, holder_kind: owner, controller_kind: owner, access_policy: { version: 1, mode: 'explicit_owner_holder_controller', context_domain: contextDomain }, claim_conditions: { version: 1, causal_basis_required: true }, status: 'approved' };
}

function applicability(profile, mapping) {
  return { version: 1, mode: 'approved_context_only', context_domain: profile.context_domain, graph_node_ids: mapping ? [mapping.graph_node_id] : [], causal_basis_required: true };
}
function requiredDomains(itemCount, containerCount) { return [...(itemCount > 0 ? ['item'] : []), ...(containerCount > 0 ? ['container'] : [])]; }
function visibilityModel(context) { return { version: 1, mode: 'authored', context_domain: context.key, default: 'visible_if_accessible' }; }
function accessModel(context) { return { version: 1, mode: 'explicit_context_policy', context_domain: context.key, access_state: 'open', traversal_permission: true, fallback: 'deny' }; }
function emptyRecords() { return { universal_categories: [], building_templates: [], room_templates: [], building_layout_templates: [], building_layout_nodes: [], building_layout_edges: [], g5_minilocation_templates: [], g5_anchor_templates: [], g5_edge_templates: [], g4_materialization_profiles: [], g4_materialization_bindings: [], materialization_slot_rules: [], g4_materialization_layout_edges: [], item_profile_sets: [], item_profile_entries: [], property_profiles: [], property_profile_rules: [], g4_item_materialization_rules: [], g4_container_materialization_rules: [] }; }
function required(value, error, errors) { if (!nonEmpty(value)) errors.push(error); return value ?? ''; }
function sorted(values, key = 'id') { return [...(values ?? [])].sort((left, right) => String(left?.[key] ?? '').localeCompare(String(right?.[key] ?? ''))); }
function byId(left, right) { return String(left.id).localeCompare(String(right.id)); }
function safe(value) { return String(value ?? '').replace(/[^a-z0-9_]+/giu, '_').replace(/^_+|_+$/gu, '').toLowerCase(); }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function positiveInteger(value, fallback) { return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback; }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
