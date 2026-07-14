import { CLOSED_CONTAINER_STATES } from '../policy/constants.js';
import { asArray, concern, hasText, isObject } from '../shared/utils.js';
import { candidateNeedsRisk, hasMeaningfulRisk } from './item-validation.js';

export function validateContainerState(concerns, container, candidate, npcIds, propertyIndex, path, policy) {
  validatePhysicalContainerState(concerns, container?.physical_state, `${path}.physical_state`);
  if (!isObject(container?.content_state)) concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'content_state is required.', { field: `${path}.content_state` }));
  const condition = container?.physical_state?.condition;
  const access = container?.access_state?.access;
  const closed = CLOSED_CONTAINER_STATES.has(condition) || CLOSED_CONTAINER_STATES.has(access);
  if (closed && container?.content_state?.content_materialized === true) {
    const basis = container?.content_state?.content_causal_basis ?? container?.content_causal_basis;
    if (!isObject(basis) && !hasText(basis)) concerns.push(concern('ITEM_PLACEMENT_CLOSED_CONTAINER_CONTENTS_LEAK', 'Closed/locked/hidden container cannot materialize contents without causal basis.', { field: `${path}.content_state.content_materialized` }));
  }
  if (!isObject(container?.visibility_state)) concerns.push(concern('ITEM_PLACEMENT_VISIBILITY_MISSING', 'Container visibility_state is required.', { field: `${path}.visibility_state` }));
  if (!isObject(container?.access_state)) concerns.push(concern('ITEM_PLACEMENT_ACCESS_MISSING', 'Container access_state is required.', { field: `${path}.access_state` }));
  if (!isObject(container?.property_state)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_MISSING', 'Container property_state is required.', { field: `${path}.property_state` }));
  if (!isObject(container?.risk_state)) concerns.push(concern('ITEM_PLACEMENT_RISK_MISSING', 'Container risk_state is required.', { field: `${path}.risk_state` }));
  const propertyId = container?.property_state?.property_rule_candidate_id;
  if (propertyId && !propertyIndex.byId.has(propertyId)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND', 'Container property_rule_candidate_id must exist.', { field: `${path}.property_state.property_rule_candidate_id` }));
  const allowedPropertyRules = asArray(candidate.property_rule_candidate_ids ?? candidate.property_rule_ids).filter(Boolean);
  if (propertyId && allowedPropertyRules.length > 0 && !allowedPropertyRules.includes(propertyId)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_RULE_MISMATCH', 'Container property rule is incompatible with candidate.', { field: `${path}.property_state.property_rule_candidate_id` }));
  if (container?.property_state?.controller_npc_instance_id && !npcIds.has(container.property_state.controller_npc_instance_id)) concerns.push(concern('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND', 'Container controller NPC must exist.', { field: `${path}.property_state.controller_npc_instance_id` }));
  if (candidateNeedsRisk(candidate, container?.property_state) && !hasMeaningfulRisk(container?.risk_state)) concerns.push(concern('ITEM_PLACEMENT_RISK_MISSING', 'Restricted/valuable container requires risk.', { field: `${path}.risk_state` }));
  if (policy.do_not_reveal_hidden_items === true && container?.visibility_state?.visible_to_player_now === true && container?.access_state?.access === 'hidden') concerns.push(concern('ITEM_PLACEMENT_HIDDEN_ITEM_VISIBLE', 'Hidden container cannot be visible now.', { field: `${path}.visibility_state.visible_to_player_now` }));
}

export function validatePhysicalContainerState(concerns, state, path) {
  if (!isObject(state)) {
    concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'Container physical_state is required.', { field: path }));
    return;
  }
  if (!hasText(state.condition)) concerns.push(concern('ITEM_PLACEMENT_CONDITION_MISSING', 'Container condition is required.', { field: `${path}.condition` }));
  if (!Number.isFinite(Number(state.weight_empty)) || Number(state.weight_empty) < 0) concerns.push(concern('ITEM_PLACEMENT_WEIGHT_MISSING', 'Container weight_empty must be non-negative.', { field: `${path}.weight_empty` }));
  if (!hasText(state.capacity_band)) concerns.push(concern('ITEM_PLACEMENT_SIZE_MISSING', 'Container capacity_band is required.', { field: `${path}.capacity_band` }));
}
