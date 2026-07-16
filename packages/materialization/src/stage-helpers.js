import { canonicalDigest, deterministicInstanceId, MaterializationError } from './core.js';

export function assertG5TemplateBundle(selected, g4Id) {
  requireFields(selected, ['template_id', 'materialization_profile', 'layout_template', 'slot_rules', 'layout_edges', 'g5_minilocation_templates', 'g5_anchor_templates', 'g5_edge_templates', 'player_start_anchor_slot_key', 'visibility_model', 'access_model'], 'G5_TEMPLATE_BUNDLE_INCOMPLETE');
  requireFields(selected.materialization_profile, ['profile_id', 'layout_template_id', 'maximum_g5_nodes', 'world_revision_id', 'region_id'], 'G5_PROFILE_INCOMPLETE');
  requireFields(selected.layout_template, ['layout_template_id', 'world_revision_id', 'region_id'], 'G5_LAYOUT_INCOMPLETE');
  if (selected.materialization_profile.layout_template_id !== selected.layout_template.layout_template_id || selected.materialization_profile.world_revision_id !== selected.layout_template.world_revision_id || selected.materialization_profile.region_id !== selected.layout_template.region_id) throw new MaterializationError('G5_PROFILE_LAYOUT_MISMATCH', 'Approved materialization profile and layout must share revision and region.');
  if (!Number.isInteger(selected.materialization_profile.maximum_g5_nodes) || selected.materialization_profile.maximum_g5_nodes <= 0 || !g4Id) throw new MaterializationError('G5_PROFILE_INCOMPLETE', 'G5 profile requires a positive node limit and a selected G4.');
  if (!Array.isArray(selected.slot_rules) || !Array.isArray(selected.layout_edges)) throw new MaterializationError('G5_TEMPLATE_BUNDLE_INCOMPLETE', 'G5 slot rules and layout edges must be arrays.');
  for (const rule of selected.slot_rules) {
    requireFields(rule, ['rule_id', 'profile_id', 'slot_key', 'slot_domain', 'min_count', 'max_count', 'required'], 'G5_SLOT_RULE_INCOMPLETE');
    if (rule.profile_id !== selected.materialization_profile.profile_id || !Number.isInteger(rule.min_count) || !Number.isInteger(rule.max_count) || rule.min_count < 0 || rule.max_count < rule.min_count || (rule.required === true && rule.min_count < 1)) throw new MaterializationError('G5_SLOT_RULE_INVALID', `Invalid approved slot rule ${rule.rule_id}.`);
    if (rule.slot_domain === 'g5_node' && !rule.g5_minilocation_template_id) throw new MaterializationError('G5_SLOT_RULE_INVALID', `Node slot ${rule.rule_id} has no node template.`);
    if (rule.slot_domain === 'anchor' && (!rule.g5_anchor_template_id || !rule.parent_node_slot_key)) throw new MaterializationError('G5_SLOT_RULE_INVALID', `Anchor slot ${rule.rule_id} has no anchor template or parent slot.`);
    if (!['g5_node', 'anchor', 'npc', 'item', 'container'].includes(rule.slot_domain)) throw new MaterializationError('G5_SLOT_RULE_INVALID', `Stage 13 cannot consume ${rule.slot_domain} slot rules.`);
  }
  const startRules = selected.slot_rules.filter((rule) => rule.slot_domain === 'anchor' && rule.slot_key === selected.player_start_anchor_slot_key && ['start', 'start_and_exit'].includes(rule.entry_role));
  const exitRules = selected.slot_rules.filter((rule) => rule.slot_domain === 'anchor' && ['exit', 'start_and_exit'].includes(rule.entry_role));
  if (startRules.length !== 1 || exitRules.length === 0) throw new MaterializationError('G5_ENTRY_EXIT_RULE_INVALID', 'Approved G5 profile requires one pinned start anchor rule and at least one exit anchor rule.');
}

export function indexApproved(values, key, code) { const map = new Map(); for (const value of values ?? []) { if (value?.status !== 'approved' || !value[key] || map.has(value[key])) throw new MaterializationError(code, 'Template records must be approved and have unique IDs.'); map.set(value[key], value); } return map; }
export function chooseApprovedCount(rule, random, choices) { const width = rule.max_count - rule.min_count + 1; const draw = width > 1 ? random.nextUint32() : 0; const count = rule.min_count + (width > 1 ? draw % width : 0); const candidateDigest = canonicalDigest([{ rule_id: rule.rule_id, min_count: rule.min_count, max_count: rule.max_count }]); choices.push({ choice_ordinal: choices.length, choice_key: `${rule.rule_id}:${rule.slot_key}:count`, slot_key: rule.slot_key, candidate_digest: candidateDigest, candidate_set_digest: candidateDigest, candidate_ids: [rule.rule_id], selected_id: `${rule.rule_id}:count:${count}`, selected_weight: 1, rng_draw: draw, rng_counter: random.drawCount, rejection_summary: { rejected_count: 0, missing_count: 0, unapproved_count: 0, wrong_domain_count: 0 } }); return count; }

export function materializeApprovedItems(candidates, { input, partyId, runId, anchors, kind, quantityRequirements, equipmentCandidates }) {
  return candidates.filter((candidate) => candidate?.status === 'approved' && candidate?.required === true)
    .sort((left, right) => String(left[`${kind}_profile_candidate_id`] ?? left[`${kind}_candidate_id`]).localeCompare(String(right[`${kind}_profile_candidate_id`] ?? right[`${kind}_candidate_id`])))
    .map((candidate, ordinal) => {
      const candidateId = candidate[`${kind}_profile_candidate_id`] ?? candidate[`${kind}_candidate_id`];
      const templateId = candidate[`${kind}_template_id`];
      requireFields(candidate, [kind === 'item' ? 'item_profile_candidate_id' : 'container_profile_candidate_id', kind === 'item' ? 'item_profile_id' : 'container_profile_id', `${kind}_template_id`, kind === 'item' ? 'item_category_id' : 'container_category_id', 'slot_rule_id', 'quantity', 'quantity_requirement_id', 'quantity_unit_id', 'condition_state', 'legal_status', 'placement', 'property_state', 'visibility_state', 'access_state', 'risk_state', 'source_trace'], `${kind.toUpperCase()}_CANDIDATE_INCOMPLETE`);
      const placementTargets = ['g5_anchor_id', 'container_instance_id', 'holder_npc_instance_id', 'holder_player_character_id'].filter((key) => candidate.placement[key]);
      if (placementTargets.length !== 1) throw new MaterializationError(`${kind.toUpperCase()}_PLACEMENT_INVALID`, `${kind} ${candidateId} must have exactly one approved placement target.`);
      if (candidate.placement.g5_anchor_id) { const anchor = anchors.get(candidate.placement.g5_anchor_id); const capability = kind === 'item' ? 'can_hold_item' : 'can_hold_container'; if (!anchor || anchor.supports?.[capability] !== true) throw new MaterializationError(`${kind.toUpperCase()}_PLACEMENT_INVALID`, `${kind} ${candidateId} references an ineligible anchor.`); }
      if (!Number.isInteger(candidate.quantity) || candidate.quantity <= 0 || !candidate.causal_basis?.causal_basis_type || candidate.physical_state?.condition !== candidate.condition_state) throw new MaterializationError(`${kind.toUpperCase()}_CANDIDATE_INCOMPLETE`, `${kind} ${candidateId} requires approved quantity, causal basis and consistent condition.`);
      const quantityRequirement = quantityRequirements.get(candidate.quantity_requirement_id);
      if (!quantityRequirement || quantityRequirement.status !== 'approved' || quantityRequirement.world_revision_id !== input.item_profile_candidate_set.world_revision_id) throw new MaterializationError('QUANTITY_REQUIREMENT_NOT_APPROVED', `${kind} ${candidateId} references a missing, draft or wrong-revision quantity requirement.`);
      const requirementTemplateId = quantityRequirement.item_template_id ?? quantityRequirement.container_template_id;
      if (requirementTemplateId !== templateId) throw new MaterializationError('QUANTITY_REQUIREMENT_TEMPLATE_MISMATCH', `${kind} ${candidateId} quantity requirement targets another template.`);
      if (quantityRequirement.default_quantity_policy?.mode !== 'explicit_only') throw new MaterializationError('HIDDEN_DEFAULT_QUANTITY_FORBIDDEN', `${kind} ${candidateId} quantity requirement must be explicit_only.`);
      if (!quantityRequirement.quantity_unit_id || !quantityRequirement.quantity_dimension || !Number.isInteger(quantityRequirement.mass_grams_per_unit) || quantityRequirement.mass_grams_per_unit <= 0) throw new MaterializationError('QUANTITY_REQUIREMENT_INCOMPLETE', `${kind} ${candidateId} quantity requirement lacks unit, dimension or unit mass.`);
      if (candidate.quantity_unit_id !== quantityRequirement.quantity_unit_id) throw new MaterializationError('QUANTITY_UNIT_MISMATCH', `${kind} ${candidateId} quantity unit differs from the approved quantity requirement.`);
      if (candidate.quantity < quantityRequirement.minimum_quantity || (quantityRequirement.maximum_quantity != null && candidate.quantity > quantityRequirement.maximum_quantity)) throw new MaterializationError('QUANTITY_OUTSIDE_APPROVED_RANGE', `${kind} ${candidateId} quantity is outside approved bounds.`);
      if (!candidate.physical_state || candidate.physical_state.mass_grams_per_unit !== quantityRequirement.mass_grams_per_unit || ![0, 1, 2].includes(candidate.physical_state.external_hand_cost)) throw new MaterializationError('PHYSICAL_PROFILE_MISMATCH', `${kind} ${candidateId} must preserve approved mass and hand cost.`);
      for (const field of ['owner_model', 'holder_model', 'controller_model']) if (typeof candidate.property_state?.[field] !== 'string' || !candidate.property_state[field]) throw new MaterializationError('PROPERTY_RELATION_INCOMPLETE', `${kind} ${candidateId} requires separate owner, holder and controller models.`);
      const equipmentCandidate = candidate.equipment_candidate_id ? equipmentCandidates.get(candidate.equipment_candidate_id) : null;
      if (candidate.equipment_candidate_id && (!equipmentCandidate || equipmentCandidate.status !== 'approved' || equipmentCandidate.world_revision_id !== input.item_profile_candidate_set.world_revision_id)) throw new MaterializationError('EQUIPMENT_CANDIDATE_NOT_APPROVED', `${kind} ${candidateId} references unavailable equipment candidate.`);
      const totalMass = candidate.quantity * quantityRequirement.mass_grams_per_unit;
      return {
        [`${kind}_instance_id`]: deterministicInstanceId(partyId, runId, kind, candidate.slot_rule_id, ordinal),
        [`${kind}_profile_candidate_id`]: candidateId,
        [`${kind}_profile_id`]: candidate[`${kind}_profile_id`],
        [`${kind}_template_id`]: templateId,
        [`${kind}_category_id`]: candidate[`${kind}_category_id`],
        slot_rule_id: candidate.slot_rule_id,
        quantity: candidate.quantity,
        quantity_requirement_id: candidate.quantity_requirement_id,
        quantity_unit_id: quantityRequirement.quantity_unit_id,
        quantity_dimension: quantityRequirement.quantity_dimension,
        mass_grams_per_unit: quantityRequirement.mass_grams_per_unit,
        total_mass_grams: totalMass,
        condition_state: candidate.condition_state,
        legal_status: candidate.legal_status,
        causal_basis: structuredClone(candidate.causal_basis),
        placement: { ...structuredClone(candidate.placement), ...structuredClone(candidate.causal_basis) },
        property_state: structuredClone(candidate.property_state), visibility_state: structuredClone(candidate.visibility_state), access_state: structuredClone(candidate.access_state), risk_state: structuredClone(candidate.risk_state),
        physical_state: { ...structuredClone(candidate.physical_state), total_mass_grams: totalMass, weight: totalMass / 1000 },
        ...(candidate.equipment_candidate_id ? { equipment_candidate_id: candidate.equipment_candidate_id } : {}),
        ...(kind === 'container' ? { content_state: structuredClone(candidate.content_state) } : {}),
        hidden_state_projection: structuredClone(candidate.hidden_state_projection ?? null), source_trace: structuredClone(candidate.source_trace)
      };
    });
}

export function requireFields(value, keys, code) { const missing = keys.filter((key) => value?.[key] == null || value[key] === ''); if (missing.length > 0) throw new MaterializationError(code, `Missing required approved fields: ${missing.join(', ')}.`, { missing }); }
export function parentScene(input) { return { g4_node_id: input?.selected_start_node?.selected_node_chain?.g4_node_id ?? null, selected_place_template_id: input?.selected_start_node?.selected?.selected_place_template_id ?? null }; }
export function assertConnectedG5Graph(nodes, anchors, edges, startAnchorId, requiredExitAnchorIds = []) { if (!Array.isArray(nodes) || nodes.length === 0 || !Array.isArray(anchors) || anchors.length === 0) throw new MaterializationError('G5_GRAPH_EMPTY', 'Approved G5 graph requires at least one node and anchor.'); const nodeIds = new Set(nodes.map((node) => node.g5_minilocation_id)); const anchorIds = new Set(anchors.map((anchor) => anchor.anchor_id)); if (!anchorIds.has(startAnchorId)) throw new MaterializationError('G5_START_ANCHOR_UNRESOLVED', 'Start anchor must belong to the materialized graph.'); for (const anchor of anchors) if (!nodeIds.has(anchor.minilocation_id)) throw new MaterializationError('G5_ANCHOR_PARENT_INVALID', `Anchor ${anchor.anchor_id} references a missing G5 node.`); const anchoredNodeIds = new Set(anchors.map((anchor) => anchor.minilocation_id)); const orphanedNodeIds = [...nodeIds].filter((id) => !anchoredNodeIds.has(id)); if (orphanedNodeIds.length > 0) throw new MaterializationError('G5_NODE_ORPHANED', 'Every materialized G5 node must contain a reachable anchor.', { orphaned_node_ids: orphanedNodeIds }); const nodeById = new Map(nodes.map((node) => [node.g5_minilocation_id, node])); const anchorById = new Map(anchors.map((anchor) => [anchor.anchor_id, anchor])); const adjacency = new Map([...anchorIds].map((id) => [id, new Set()])); for (const edge of edges) { if (!anchorIds.has(edge.from_anchor_id) || !anchorIds.has(edge.to_anchor_id) || edge.from_anchor_id === edge.to_anchor_id) throw new MaterializationError('G5_EDGE_REFERENCE_INVALID', `Edge ${edge.edge_id} must connect two different existing anchors.`); const from = anchorById.get(edge.from_anchor_id); const to = anchorById.get(edge.to_anchor_id); if (isTraversable(edge.access) && isTraversable(from.access) && isTraversable(to.access) && isTraversable(nodeById.get(from.minilocation_id)?.access) && isTraversable(nodeById.get(to.minilocation_id)?.access)) { adjacency.get(edge.from_anchor_id).add(edge.to_anchor_id); adjacency.get(edge.to_anchor_id).add(edge.from_anchor_id); } } const visited = new Set(); const queue = [startAnchorId]; while (queue.length) { const id = queue.shift(); if (visited.has(id)) continue; visited.add(id); queue.push(...adjacency.get(id)); } if (visited.size !== anchorIds.size) throw new MaterializationError('G5_GRAPH_DISCONNECTED', 'Every materialized G5 anchor must be reachable from the approved player start anchor.', { start_anchor_id: startAnchorId, unreachable_anchor_ids: [...anchorIds].filter((id) => !visited.has(id)) }); const unreachableExits = requiredExitAnchorIds.filter((id) => !visited.has(id)); if (unreachableExits.length > 0) throw new MaterializationError('G5_EXIT_UNREACHABLE', 'Every required exit must be traversable from the player start anchor.', { unreachable_exit_anchor_ids: unreachableExits }); }
function isTraversable(policy) { const state = policy?.access_state ?? policy?.access ?? policy?.state; if (['forbidden', 'closed', 'locked', 'blocked', 'sealed'].includes(state)) return policy?.traversal_permission === true; return typeof state === 'string' && state.length > 0; }
