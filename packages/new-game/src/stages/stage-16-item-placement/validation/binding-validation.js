import { FORBIDDEN_OUTPUT_KEYS } from '../policy/constants.js';
import { concern, isObject } from '../shared/utils.js';

export function validateItemAnchorBindings(concerns, bindings, itemIds, anchorIndex, selectedG4) {
  if (!Array.isArray(bindings)) return;
  bindings.forEach((binding, index) => {
    const path = `item_anchor_bindings[${index}]`;
    if (!itemIds.has(binding?.item_instance_id)) concerns.push(concern('ITEM_PLACEMENT_ITEM_PROFILE_CANDIDATE_NOT_FOUND', 'Binding references unknown item_instance_id.', { field: `${path}.item_instance_id` }));
    const anchor = anchorIndex.byId.get(binding?.g5_anchor_id);
    if (!anchor) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'Binding anchor must exist.', { field: `${path}.g5_anchor_id` }));
    else if (anchor.parent_g4_node_id && anchor.parent_g4_node_id !== selectedG4) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'Binding anchor must belong to selected G4.', { field: `${path}.g5_anchor_id` }));
  });
}

export function validateContainerAnchorBindings(concerns, bindings, containerIds, anchorIndex, selectedG4) {
  if (!Array.isArray(bindings)) return;
  bindings.forEach((binding, index) => {
    const path = `container_anchor_bindings[${index}]`;
    if (!containerIds.has(binding?.container_instance_id)) concerns.push(concern('ITEM_PLACEMENT_CONTAINER_PROFILE_CANDIDATE_NOT_FOUND', 'Binding references unknown container_instance_id.', { field: `${path}.container_instance_id` }));
    const anchor = anchorIndex.byId.get(binding?.g5_anchor_id);
    if (!anchor) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'Binding anchor must exist.', { field: `${path}.g5_anchor_id` }));
    else if (anchor.parent_g4_node_id && anchor.parent_g4_node_id !== selectedG4) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'Binding anchor must belong to selected G4.', { field: `${path}.g5_anchor_id` }));
  });
}

export function validatePropertyBindings(concerns, bindings, propertyIndex, itemIds, containerIds, npcIds, anchorIndex) {
  if (!Array.isArray(bindings)) return;
  bindings.forEach((binding, index) => {
    const path = `property_bindings[${index}]`;
    if (!propertyIndex.byId.has(binding?.property_rule_candidate_id)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND', 'property_rule_candidate_id must exist.', { field: `${path}.property_rule_candidate_id` }));
    const applies = binding?.applies_to ?? {};
    const refs = [applies.item_instance_id, applies.container_instance_id, applies.g5_anchor_id, applies.npc_instance_id].filter(Boolean);
    if (refs.length !== 1) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_MISSING', 'property binding must apply to exactly one target.', { field: `${path}.applies_to` }));
    if (applies.item_instance_id && !itemIds.has(applies.item_instance_id)) concerns.push(concern('ITEM_PLACEMENT_ITEM_PROFILE_CANDIDATE_NOT_FOUND', 'Unknown item target.', { field: `${path}.applies_to.item_instance_id` }));
    if (applies.container_instance_id && !containerIds.has(applies.container_instance_id)) concerns.push(concern('ITEM_PLACEMENT_CONTAINER_PROFILE_CANDIDATE_NOT_FOUND', 'Unknown container target.', { field: `${path}.applies_to.container_instance_id` }));
    if (applies.g5_anchor_id && !anchorIndex.byId.has(applies.g5_anchor_id)) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'Unknown anchor target.', { field: `${path}.applies_to.g5_anchor_id` }));
    if (applies.npc_instance_id && !npcIds.has(applies.npc_instance_id)) concerns.push(concern('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND', 'Unknown NPC target.', { field: `${path}.applies_to.npc_instance_id` }));
    if (!isObject(binding?.access_model)) concerns.push(concern('ITEM_PLACEMENT_ACCESS_MISSING', 'property binding access_model is required.', { field: `${path}.access_model` }));
    if (!isObject(binding?.risk_model)) concerns.push(concern('ITEM_PLACEMENT_RISK_MISSING', 'property binding risk_model is required.', { field: `${path}.risk_model` }));
  });
}

export function validateStateArrays(concerns, draft, itemIds, containerIds) {
  for (const field of ['visibility_state', 'access_state', 'risk_state']) {
    const values = draft[field];
    if (!Array.isArray(values)) continue;
    values.forEach((state, index) => {
      const ref = state?.item_instance_id ?? state?.container_instance_id;
      if (!ref || (!itemIds.has(ref) && !containerIds.has(ref))) concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', `${field} references unknown instance.`, { field: `${field}[${index}]` }));
    });
  }
}

export function collectForbiddenFields(value, concerns, path = 'root', seen = new WeakSet()) {
  if (!isObject(value) && !Array.isArray(value)) return;
  if (isObject(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_OUTPUT_KEYS.has(key) && child != null && !(Array.isArray(child) && child.length === 0)) concerns.push(concern(FORBIDDEN_OUTPUT_KEYS.get(key), `Forbidden field ${key} is not allowed in Stage 16.`, { field: `${path}.${key}` }));
      collectForbiddenFields(child, concerns, `${path}.${key}`, seen);
    }
  } else value.forEach((item, index) => collectForbiddenFields(item, concerns, `${path}[${index}]`, seen));
}

export function incrementCapacityConcern(concerns, usage, anchorIdValue, capacityMap, code, field) {
  if (!anchorIdValue) return;
  const used = (usage.get(anchorIdValue) ?? 0) + 1;
  usage.set(anchorIdValue, used);
  if (used > (capacityMap.get(anchorIdValue) ?? 1)) concerns.push(concern(code, 'Anchor capacity exceeded.', { field }));
}
