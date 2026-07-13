import { STAGE16_CAUSAL_BASIS_TYPES } from '@rus/contracts';
import { HIDDEN_VISIBILITY_STATES, RISK_REQUIRED_GROUPS, RISK_REQUIRED_RARITIES, RISK_REQUIRED_VALUE_BANDS } from '../policy/constants.js';
import { anchorVisibility, asArray, concern, hasText, isObject, nonEmptyArray } from '../shared/utils.js';

export function validateCausalBasis(concerns, placement, path, policy) {
  const basis = placement?.causal_basis_type;
  if (policy.require_causal_basis === true && !hasText(basis)) concerns.push(concern('ITEM_PLACEMENT_NO_CAUSAL_BASIS', 'causal_basis_type is required.', { field: `${path}.causal_basis_type` }));
  if (basis === 'player_desire' || placement?.requested_by_player === true || placement?.basis_source === 'player_desire') concerns.push(concern('ITEM_PLACEMENT_PLAYER_DESIRE_MATERIALIZED', 'Player desire is not a valid causal basis.', { field: `${path}.causal_basis_type` }));
  if (hasText(basis) && basis !== 'player_desire' && !STAGE16_CAUSAL_BASIS_TYPES.includes(basis)) concerns.push(concern('ITEM_PLACEMENT_NO_CAUSAL_BASIS', 'causal_basis_type is outside the allowed enum.', { field: `${path}.causal_basis_type` }));
}

export function validatePhysicalState(concerns, state, path, policy) {
  if (!isObject(state)) {
    concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'physical_state is required.', { field: path }));
    return;
  }
  if (policy.require_weight_size_condition === true) {
    if (!Number.isFinite(Number(state.weight)) || Number(state.weight) < 0) concerns.push(concern('ITEM_PLACEMENT_WEIGHT_MISSING', 'physical_state.weight must be a non-negative number.', { field: `${path}.weight` }));
    if (!hasText(state.size_band)) concerns.push(concern('ITEM_PLACEMENT_SIZE_MISSING', 'physical_state.size_band is required.', { field: `${path}.size_band` }));
    if (!hasText(state.condition)) concerns.push(concern('ITEM_PLACEMENT_CONDITION_MISSING', 'physical_state.condition is required.', { field: `${path}.condition` }));
  }
}

export function validateItemVisibility(concerns, item, anchor, input, path, policy) {
  const state = item?.visibility_state;
  if (policy.require_visibility_model === true && !isObject(state)) {
    concerns.push(concern('ITEM_PLACEMENT_VISIBILITY_MISSING', 'visibility_state is required.', { field: `${path}.visibility_state` }));
    return;
  }
  const visibility = state?.visibility;
  if (!hasText(visibility)) concerns.push(concern('ITEM_PLACEMENT_VISIBILITY_MISSING', 'visibility_state.visibility is required.', { field: `${path}.visibility_state.visibility` }));
  if (HIDDEN_VISIBILITY_STATES.has(visibility) && state?.visible_to_player_now === true) concerns.push(concern('ITEM_PLACEMENT_HIDDEN_ITEM_VISIBLE', 'Hidden/inaccessible item cannot be visible now.', { field: `${path}.visibility_state.visible_to_player_now` }));
  const anchorState = anchorVisibility(anchor ?? {});
  if (['hidden', 'blocked', 'offscreen'].includes(anchorState) && state?.visible_to_player_now === true && !hasText(state?.visibility_basis)) concerns.push(concern('ITEM_PLACEMENT_HIDDEN_ITEM_VISIBLE', 'Hidden anchor requires explicit visibility basis.', { field: `${path}.visibility_state.visibility_basis` }));
  if (input?.historical_frame?.clock?.light_profile === 'dark' && state?.visible_to_player_now === true && state?.requires_light !== false && !hasText(state?.visibility_basis)) concerns.push(concern('ITEM_PLACEMENT_VISIBILITY_MISSING', 'Dark light requires visibility basis.', { field: `${path}.visibility_state.visibility_basis` }));
}

export function validateItemAccessPropertyRisk(concerns, item, candidate, propertyIndex, npcIds, playerIds, containerIds, path, policy) {
  const access = item?.access_state;
  const property = item?.property_state;
  const risk = item?.risk_state;
  if (policy.require_access_model === true && !isObject(access)) concerns.push(concern('ITEM_PLACEMENT_ACCESS_MISSING', 'access_state is required.', { field: `${path}.access_state` }));
  if (isObject(access) && !hasText(access.access)) concerns.push(concern('ITEM_PLACEMENT_ACCESS_MISSING', 'access_state.access is required.', { field: `${path}.access_state.access` }));
  if (policy.require_owner_or_holder_model === true && !isObject(property)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_MISSING', 'property_state is required.', { field: `${path}.property_state` }));
  if (isObject(property)) {
    if (property.property_rule_candidate_id && !propertyIndex.byId.has(property.property_rule_candidate_id)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND', 'property_rule_candidate_id must exist.', { field: `${path}.property_state.property_rule_candidate_id` }));
    const allowedPropertyRules = asArray(candidate.property_rule_candidate_ids ?? candidate.property_rule_ids).filter(Boolean);
    if (property.property_rule_candidate_id && allowedPropertyRules.length > 0 && !allowedPropertyRules.includes(property.property_rule_candidate_id)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_RULE_MISMATCH', 'property_rule_candidate_id is not compatible with item candidate.', { field: `${path}.property_state.property_rule_candidate_id` }));
    if (!hasText(property.owner_model) || !hasText(property.holder_model) || !hasText(property.controller_model)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_MISSING', 'property_state owner/holder/controller models are required.', { field: `${path}.property_state` }));
    if (property.owner_npc_instance_id && !npcIds.has(property.owner_npc_instance_id)) concerns.push(concern('ITEM_PLACEMENT_OWNER_NOT_FOUND', 'owner_npc_instance_id must exist.', { field: `${path}.property_state.owner_npc_instance_id` }));
    if (property.owner_model === 'npc' && !property.owner_npc_instance_id) concerns.push(concern('ITEM_PLACEMENT_OWNER_NOT_FOUND', 'NPC owner requires owner_npc_instance_id.', { field: `${path}.property_state.owner_npc_instance_id` }));
    if (property.controller_model === 'npc' && (!property.controller_id || !npcIds.has(property.controller_id))) concerns.push(concern('ITEM_PLACEMENT_CONTROLLER_NOT_FOUND', 'NPC controller requires an existing controller_id.', { field: `${path}.property_state.controller_id` }));
    if (property.holder_model === 'npc' && property.holder_id && !npcIds.has(property.holder_id)) concerns.push(concern('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND', 'NPC holder_id must exist.', { field: `${path}.property_state.holder_id` }));
    if (property.holder_model === 'player' && property.holder_id && !playerIds.has(property.holder_id)) concerns.push(concern('ITEM_PLACEMENT_PLAYER_HOLDER_NOT_FOUND', 'Player holder_id must exist.', { field: `${path}.property_state.holder_id` }));
    if (property.holder_model === 'container' && property.holder_id && !containerIds.has(property.holder_id)) concerns.push(concern('ITEM_PLACEMENT_CONTAINER_HOLDER_NOT_FOUND', 'Container holder_id must exist.', { field: `${path}.property_state.holder_id` }));
  }
  if (!isObject(risk)) concerns.push(concern('ITEM_PLACEMENT_RISK_MISSING', 'risk_state is required.', { field: `${path}.risk_state` }));
  const interactable = item?.game_function?.can_be_taken === true || item?.game_function?.can_be_used_for?.length > 0 || item?.game_function?.can_be_searched === true;
  if (interactable && policy.require_property_rule_for_interactable_item === true && !hasText(property?.property_rule_candidate_id)) concerns.push(concern('ITEM_PLACEMENT_PROPERTY_MISSING', 'Interactable item requires property_rule_candidate_id.', { field: `${path}.property_state.property_rule_candidate_id` }));
  const risky = candidateNeedsRisk(candidate, property);
  if (risky && !hasMeaningfulRisk(risk)) concerns.push(concern('ITEM_PLACEMENT_RISK_MISSING', 'Rare/valuable/restricted/foreign/disputed item requires risk.', { field: `${path}.risk_state` }));
  if (risky && !hasOwnerOrController(property)) concerns.push(concern('ITEM_PLACEMENT_RARE_ITEM_WITHOUT_OWNER', 'Rare/valuable/restricted item requires owner or controller.', { field: `${path}.property_state` }));
  if (['service', 'sacred'].includes(property?.legal_or_social_status) && ['free', 'reachable'].includes(access?.access)) concerns.push(concern('ITEM_PLACEMENT_SERVICE_ITEM_WITHOUT_RESTRICTION', 'Service/sacred item requires access restriction.', { field: `${path}.access_state.access` }));
}

export function candidateNeedsRisk(candidate, property) {
  return RISK_REQUIRED_RARITIES.has(candidate?.rarity)
    || RISK_REQUIRED_VALUE_BANDS.has(candidate?.value_band)
    || RISK_REQUIRED_GROUPS.has(candidate?.item_group)
    || ['owned', 'borrowed', 'entrusted', 'stolen', 'service', 'sacred', 'disputed', 'trade_stock'].includes(property?.legal_or_social_status)
    || ['npc', 'household', 'workplace', 'authority', 'sacred', 'disputed'].includes(property?.owner_model);
}

export function hasMeaningfulRisk(risk) {
  if (!isObject(risk)) return false;
  const fields = ['theft_risk', 'witness_risk', 'legal_risk', 'reputation_risk', 'damage_risk', 'noise_risk', 'opening_risk'];
  return fields.some((field) => hasText(risk[field]) && risk[field] !== 'none') || nonEmptyArray(risk.risk_basis);
}

export function hasOwnerOrController(property) {
  return isObject(property) && ((hasText(property.owner_model) && property.owner_model !== 'none') || (hasText(property.controller_model) && property.controller_model !== 'none'));
}
