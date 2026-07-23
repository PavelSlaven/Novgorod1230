const MATCH_KINDS = Object.freeze([
  ['graph_node_id', 4],
  ['building_template_id', 3],
  ['place_template_id', 2],
  ['node_type', 1]
]);

export function resolveG4MaterializationBinding({ graph_node: graphNode, bindings = [] } = {}) {
  if (!graphNode?.id) return freeze({ status: 'missing_graph_node', binding: null, binding_ids: [] });
  const matches = bindings
    .filter((binding) => binding?.status === 'approved')
    .flatMap((binding) => {
      const matched = MATCH_KINDS.find(([field]) => binding[field] != null && binding[field] === graphNode[field === 'graph_node_id' ? 'id' : field]);
      return matched ? [{ binding, match_kind: matched[0], specificity: matched[1], priority: integer(binding.priority) }] : [];
    })
    .sort((left, right) => right.specificity - left.specificity || right.priority - left.priority || String(left.binding.id).localeCompare(String(right.binding.id)));

  if (matches.length === 0) return freeze({ status: 'missing', binding: null, binding_ids: [] });
  const best = matches[0];
  const winners = matches.filter((match) => match.specificity === best.specificity && match.priority === best.priority);
  if (winners.length > 1) {
    return freeze({
      status: 'ambiguous',
      binding: null,
      match_kind: best.match_kind,
      priority: best.priority,
      binding_ids: winners.map((match) => match.binding.id).sort()
    });
  }
  return freeze({
    status: 'resolved',
    binding: structuredClone(best.binding),
    match_kind: best.match_kind,
    priority: best.priority,
    binding_ids: [best.binding.id]
  });
}

export function buildG4ItemContainerCoverageReport(recordsByTable = {}) {
  const graphNodes = [...(recordsByTable.graph_nodes ?? [])]
    .filter((record) => record?.scale_level === 'G4' && record.status === 'approved')
    .sort(byId);
  const profiles = new Map((recordsByTable.g4_materialization_profiles ?? []).map((record) => [record.id, record]));
  const revisions = mapById(recordsByTable.world_revisions);
  const layouts = mapById(recordsByTable.building_layout_templates);
  const buildings = mapById(recordsByTable.building_templates);
  const g5Nodes = mapById(recordsByTable.g5_minilocation_templates);
  const g5Anchors = mapById(recordsByTable.g5_anchor_templates);
  const g5Edges = mapById(recordsByTable.g5_edge_templates);
  const itemProfiles = mapById(recordsByTable.item_profile_sets);
  const propertyProfiles = mapById(recordsByTable.property_profiles);
  const containerTemplates = mapById(recordsByTable.container_templates);
  const contentProfiles = mapById(recordsByTable.container_content_profiles);
  const bindings = recordsByTable.g4_materialization_bindings ?? [];
  const slotRules = recordsByTable.materialization_slot_rules ?? [];
  const slotRuleById = new Map(slotRules.map((record) => [record.id, record]));
  const itemRules = (recordsByTable.g4_item_materialization_rules ?? []).filter(approved);
  const containerRules = (recordsByTable.g4_container_materialization_rules ?? []).filter(approved);
  const graphNodeById = new Map(graphNodes.map((record) => [record.id, record]));
  const concerns = [];
  const entries = [];

  for (const graphNode of graphNodes) {
    const resolution = resolveG4MaterializationBinding({ graph_node: graphNode, bindings });
    if (resolution.status === 'missing') concerns.push(concern('G4_MATERIALIZATION_BINDING_MISSING', graphNode.id));
    if (resolution.status === 'ambiguous') concerns.push(concern('G4_MATERIALIZATION_BINDING_AMBIGUOUS', graphNode.id, { binding_ids: resolution.binding_ids }));
    const binding = resolution.binding;
    const profile = binding ? profiles.get(binding.profile_id) : null;
    if (binding && profile?.status !== 'approved') concerns.push(concern('G4_MATERIALIZATION_PROFILE_NOT_APPROVED', graphNode.id, { profile_id: binding.profile_id }));
    if (profile) {
      requireApproved(revisions, profile.world_revision_id, 'world_revision', graphNode.id, profile.id, concerns);
      const layout = requireApproved(layouts, profile.layout_template_id, 'building_layout_template', graphNode.id, profile.id, concerns);
      if (layout) requireApproved(buildings, layout.building_template_id, 'building_template', graphNode.id, profile.id, concerns);
    }

    const profileSlots = profile
      ? slotRules.filter((rule) => rule.profile_id === profile.id && rule.status === 'approved')
      : [];
    const requiredNodeSlot = profileSlots.some((rule) => rule.slot_domain === 'g5_node' && rule.required === true && integer(rule.min_count) > 0);
    const requiredAnchorSlot = profileSlots.some((rule) => rule.slot_domain === 'anchor' && rule.required === true && integer(rule.min_count) > 0);
    if (profile && (!requiredNodeSlot || !requiredAnchorSlot)) {
      concerns.push(concern('G4_REQUIRED_SPATIAL_SLOT_MISSING', graphNode.id, { profile_id: profile.id, required_node_slot: requiredNodeSlot, required_anchor_slot: requiredAnchorSlot }));
    }
    for (const slot of profileSlots) {
      if (slot.g5_minilocation_template_id) requireApproved(g5Nodes, slot.g5_minilocation_template_id, 'g5_minilocation_template', graphNode.id, slot.id, concerns);
      if (slot.g5_anchor_template_id) requireApproved(g5Anchors, slot.g5_anchor_template_id, 'g5_anchor_template', graphNode.id, slot.id, concerns);
      if (slot.g5_edge_template_id) requireApproved(g5Edges, slot.g5_edge_template_id, 'g5_edge_template', graphNode.id, slot.id, concerns);
    }

    const applicableItemRules = itemRules.filter((rule) => rule.graph_node_id === graphNode.id);
    const applicableContainerRules = containerRules.filter((rule) => rule.graph_node_id === graphNode.id);
    validateRules({ rules: applicableItemRules, domain: 'item', graphNode, profile, slotRuleById, concerns, itemProfiles, propertyProfiles, containerTemplates, contentProfiles });
    validateRules({ rules: applicableContainerRules, domain: 'container', graphNode, profile, slotRuleById, concerns, itemProfiles, propertyProfiles, containerTemplates, contentProfiles });
    const itemContainerPolicy = binding?.applicability?.item_container_policy ?? 'unspecified';
    const requiredRuleDomains = binding?.applicability?.required_rule_domains
      ?? (itemContainerPolicy === 'rules_only' ? ['item', 'container'] : []);
    if (graphNode.status === 'approved' && requiredRuleDomains.includes('item') && applicableItemRules.length === 0) concerns.push(concern('G4_ITEM_RULE_MISSING', graphNode.id));
    if (graphNode.status === 'approved' && requiredRuleDomains.includes('container') && applicableContainerRules.length === 0) concerns.push(concern('G4_CONTAINER_RULE_MISSING', graphNode.id));

    entries.push(freeze({
      graph_node_id: graphNode.id,
      graph_node_status: graphNode.status ?? null,
      runtime_accessible: graphNode.status === 'approved',
      binding_status: resolution.status,
      binding_id: binding?.id ?? null,
      binding_match_kind: resolution.match_kind ?? null,
      profile_id: profile?.id ?? null,
      item_container_policy: itemContainerPolicy,
      context_profile_ids: [...(binding?.applicability?.context_profile_ids ?? [])].sort(),
      approved_slot_count: profileSlots.length,
      approved_item_rule_count: applicableItemRules.length,
      approved_container_rule_count: applicableContainerRules.length
    }));
  }

  for (const rule of [...itemRules, ...containerRules]) {
    const graphNode = graphNodeById.get(rule.graph_node_id);
    if (graphNode?.status !== 'approved') concerns.push(concern('G4_RULE_DRAFT_GRAPH_DEPENDENCY', rule.graph_node_id ?? '<missing>', { rule_id: rule.id, graph_node_status: graphNode?.status ?? null }));
  }

  const summary = freeze({
    g4_count: graphNodes.length,
    resolved_profile_count: entries.filter((entry) => entry.binding_status === 'resolved' && entry.profile_id).length,
    runtime_accessible_g4_count: entries.filter((entry) => entry.runtime_accessible).length,
    ambiguous_binding_count: concerns.filter(code('G4_MATERIALIZATION_BINDING_AMBIGUOUS')).length,
    missing_profile_count: concerns.filter(code('G4_MATERIALIZATION_BINDING_MISSING', 'G4_MATERIALIZATION_PROFILE_NOT_APPROVED')).length,
    missing_required_slot_count: concerns.filter(code('G4_REQUIRED_SPATIAL_SLOT_MISSING')).length,
    missing_item_rule_count: concerns.filter(code('G4_ITEM_RULE_MISSING')).length,
    missing_container_rule_count: concerns.filter(code('G4_CONTAINER_RULE_MISSING')).length,
    invalid_causal_basis_count: concerns.filter(code('G4_RULE_CAUSAL_BASIS_MISSING')).length,
    invalid_rule_slot_count: concerns.filter(code('G4_RULE_SLOT_INVALID')).length,
    draft_dependency_rule_count: concerns.filter(code('G4_RULE_DRAFT_GRAPH_DEPENDENCY')).length,
    unapproved_dependency_count: concerns.filter(code('G4_DEPENDENCY_NOT_APPROVED')).length
  });
  return freeze({
    schema_version: 'rus.g4_item_container_coverage.v1',
    pass: concerns.length === 0,
    summary,
    concerns: concerns.sort((left, right) => left.code.localeCompare(right.code) || left.graph_node_id.localeCompare(right.graph_node_id)),
    entries
  });
}

function validateRules({ rules, domain, graphNode, profile, slotRuleById, concerns, itemProfiles, propertyProfiles, containerTemplates, contentProfiles }) {
  for (const rule of rules) {
    const slot = slotRuleById.get(rule.slot_rule_id);
    if (!slot || slot.status !== 'approved' || slot.profile_id !== profile?.id || slot.slot_domain !== domain) {
      concerns.push(concern('G4_RULE_SLOT_INVALID', graphNode.id, { rule_id: rule.id, slot_rule_id: rule.slot_rule_id, expected_domain: domain }));
    }
    if (!nonEmpty(rule.causal_basis_type) || !nonEmpty(rule.causal_basis_id)) concerns.push(concern('G4_RULE_CAUSAL_BASIS_MISSING', graphNode.id, { rule_id: rule.id }));
    if (domain === 'item') requireApproved(itemProfiles, rule.item_profile_id, 'item_profile_set', graphNode.id, rule.id, concerns);
    if (domain === 'container') {
      requireApproved(containerTemplates, rule.container_template_id, 'container_template', graphNode.id, rule.id, concerns);
      if (rule.content_profile_id) requireApproved(contentProfiles, rule.content_profile_id, 'container_content_profile', graphNode.id, rule.id, concerns);
    }
    if (rule.property_profile_id) requireApproved(propertyProfiles, rule.property_profile_id, 'property_profile', graphNode.id, rule.id, concerns);
  }
}

function requireApproved(records, id, dependencyType, graphNodeId, ownerId, concerns) {
  const record = id ? records.get(id) : null;
  if (record?.status === 'approved') return record;
  concerns.push(concern('G4_DEPENDENCY_NOT_APPROVED', graphNodeId, { owner_id: ownerId, dependency_type: dependencyType, dependency_id: id ?? null, dependency_status: record?.status ?? null }));
  return null;
}

function concern(codeValue, graphNodeId, extra = {}) { return freeze({ code: codeValue, severity: 'hard_block', graph_node_id: graphNodeId, ...extra }); }
function code(...codes) { const expected = new Set(codes); return (entry) => expected.has(entry.code); }
function approved(record) { return record?.status === 'approved'; }
function integer(value) { return Number.isInteger(Number(value)) ? Number(value) : 0; }
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
function byId(left, right) { return String(left.id).localeCompare(String(right.id)); }
function mapById(values = []) { return new Map(values.map((record) => [record.id, record])); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
