import { STAGE16_DRAFT_SCHEMA, STAGE16_PLACEMENT_STATUSES } from '@rus/contracts';
import { normalizeStage16ItemPlacementPolicy } from '../policy/constants.js';
import { buildStage16AnchorIndexes, buildStage16ContainerCandidateIndexes, buildStage16ItemCandidateIndexes, buildStage16PropertyRuleIndexes } from '../references/indexes.js';
import { anchorSupportsContainer, anchorSupportsItem, collectPlayerIds, collectPlayerInventoryIds, collectPlayerInventoryProfileIds, concern, dedupeConcerns, hasText, isObject, matchesAllowedValue, matchesPlace, nonEmptyArray, selectedG4NodeId, selectedPlaceTemplateId } from '../shared/utils.js';
import { collectForbiddenFields, incrementCapacityConcern, validateContainerAnchorBindings, validateItemAnchorBindings, validatePropertyBindings, validateStateArrays } from './binding-validation.js';
import { validateContainerState } from './container-validation.js';
import { validateCausalBasis, validateItemAccessPropertyRisk, validateItemVisibility, validatePhysicalState } from './item-validation.js';

export function validateStage16ItemPlacementDraft(draft, input) {
  const concerns = [];
  if (!isObject(draft)) return [concern('ITEM_PLACEMENT_INVALID_JSON', 'Stage 16 draft must be an object.')];
  if (draft.version !== 1 || draft.schema !== STAGE16_DRAFT_SCHEMA) {
    concerns.push(concern('ITEM_PLACEMENT_SCHEMA_MISMATCH', `Expected ${STAGE16_DRAFT_SCHEMA} version 1.`));
  }
  if (draft.request_id !== input?.request_id) {
    concerns.push(concern('ITEM_PLACEMENT_REQUEST_ID_MISMATCH', 'Draft request_id must match input.', { field: 'request_id' }));
  }
  if (!STAGE16_PLACEMENT_STATUSES.includes(draft.placement_status)) {
    concerns.push(concern('ITEM_PLACEMENT_STATUS_INVALID', 'placement_status is invalid.', { field: 'placement_status' }));
  }
  if (['blocked', 'requires_repair'].includes(draft.placement_status)) {
    concerns.push(concern('NO_ALLOWED_ITEM_PLACEMENT', `placement_status=${draft.placement_status} cannot pass the commit gate.`, { field: 'placement_status' }));
  }

  const policy = normalizeStage16ItemPlacementPolicy(input?.item_placement_policy);
  const itemIndex = buildStage16ItemCandidateIndexes(input);
  const containerIndex = buildStage16ContainerCandidateIndexes(input);
  const propertyIndex = buildStage16PropertyRuleIndexes(input);
  const anchorIndex = buildStage16AnchorIndexes(input);
  const selectedG4 = selectedG4NodeId(input?.selected_start_node);
  const selectedTemplate = selectedPlaceTemplateId(input?.selected_start_node);
  if (draft.parent_scene?.g4_node_id !== selectedG4) {
    concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'parent_scene.g4_node_id must match selected G4.', { field: 'parent_scene.g4_node_id' }));
  }
  if (selectedTemplate && draft.parent_scene?.selected_place_template_id !== selectedTemplate) {
    concerns.push(concern('ITEM_PLACEMENT_PLACE_TEMPLATE_MISMATCH', 'parent_scene.selected_place_template_id must match selected place.', { field: 'parent_scene.selected_place_template_id' }));
  }

  const requiredArrays = [
    'item_instances',
    'container_instances',
    'item_anchor_bindings',
    'container_anchor_bindings',
    'property_bindings',
    'visibility_state',
    'access_state',
    'risk_state',
    'rejected_item_placements',
    'source_trace'
  ];
  for (const field of requiredArrays) {
    if (!Array.isArray(draft[field])) concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', `${field} must be an array.`, { field }));
  }
  if (!isObject(draft.downstream_constraints)) concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'downstream_constraints is required.', { field: 'downstream_constraints' }));
  if (!isObject(draft.audit_self_check)) concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'audit_self_check is required.', { field: 'audit_self_check' }));

  const items = Array.isArray(draft.item_instances) ? draft.item_instances : [];
  const containers = Array.isArray(draft.container_instances) ? draft.container_instances : [];
  if (draft.placement_status === 'empty_allowed') {
    if (policy.allow_empty_item_scene_if_place_supports_it !== true) concerns.push(concern('ITEM_PLACEMENT_EMPTY_NOT_ALLOWED', 'Policy does not allow empty item scene.', { field: 'placement_status' }));
    if (items.length > 0 || containers.length > 0) concerns.push(concern('ITEM_PLACEMENT_EMPTY_HAS_INSTANCES', 'empty_allowed cannot include item/container instances.', { field: 'placement_status' }));
    if (!hasText(draft.empty_scene_reason)) concerns.push(concern('ITEM_PLACEMENT_EMPTY_REASON_MISSING', 'empty_allowed requires empty_scene_reason.', { field: 'empty_scene_reason' }));
  }

  const npcIds = new Set((input?.initial_npc_placement?.npc_instances ?? []).map((item) => item?.npc_instance_id).filter(Boolean));
  const playerIds = collectPlayerIds(input?.player_character);
  const playerInventoryIds = collectPlayerInventoryIds(input?.player_character);
  const playerInventoryProfileIds = collectPlayerInventoryProfileIds(input?.player_character);
  const itemIds = new Set();
  const containerIds = new Set();
  const allContainerIds = new Set(containers.map((entry) => entry?.container_instance_id).filter(Boolean));
  const itemAnchorUsage = new Map();
  const containerAnchorUsage = new Map();

  items.forEach((item, index) => {
    const path = `item_instances[${index}]`;
    const id = item?.item_instance_id;
    if (!hasText(id) || itemIds.has(id)) concerns.push(concern('ITEM_PLACEMENT_DUPLICATE_ITEM_ID', 'item_instance_id must be non-empty and unique.', { field: `${path}.item_instance_id` }));
    else itemIds.add(id);
    if (playerInventoryIds.has(id)) concerns.push(concern('ITEM_PLACEMENT_PLAYER_INVENTORY_DUPLICATE', 'Existing player inventory item cannot be recreated as scene item.', { field: `${path}.item_instance_id` }));

    const candidate = itemIndex.byId.get(item?.item_profile_candidate_id);
    if (!candidate) concerns.push(concern('ITEM_PLACEMENT_ITEM_PROFILE_CANDIDATE_NOT_FOUND', 'item_profile_candidate_id must exist.', { field: `${path}.item_profile_candidate_id` }));
    else {
      if (hasText(candidate.item_profile_id) && item.item_profile_id !== candidate.item_profile_id) concerns.push(concern('ITEM_PLACEMENT_ITEM_PROFILE_MISMATCH', 'item_profile_id must match candidate.', { field: `${path}.item_profile_id` }));
      if (!matchesPlace(candidate, selectedTemplate)) concerns.push(concern('ITEM_PLACEMENT_PLACE_TEMPLATE_MISMATCH', 'Item candidate is incompatible with selected place.', { field: `${path}.item_profile_candidate_id` }));
      if (!matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, input?.historical_frame?.calendar?.season)) concerns.push(concern('ITEM_PLACEMENT_SEASON_CONFLICT', 'Item candidate is incompatible with season.', { field: `${path}.item_profile_candidate_id` }));
      if (!matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.time_of_day, input?.historical_frame?.clock?.time_of_day)) concerns.push(concern('ITEM_PLACEMENT_TIME_CONFLICT', 'Item candidate is incompatible with time.', { field: `${path}.item_profile_candidate_id` }));
    }

    const placement = item?.placement ?? {};
    validateCausalBasis(concerns, placement, `${path}.placement`, policy);
    const anchor = placement.g5_anchor_id ? anchorIndex.byId.get(placement.g5_anchor_id) : null;
    if (placement.g5_anchor_id && !anchor) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'g5_anchor_id must exist.', { field: `${path}.placement.g5_anchor_id` }));
    if (anchor && !anchorSupportsItem(anchor)) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_ITEM', 'Anchor must support item placement.', { field: `${path}.placement.g5_anchor_id` }));
    if (anchor && anchor.parent_g4_node_id && anchor.parent_g4_node_id !== selectedG4) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'Item anchor must belong to selected G4.', { field: `${path}.placement.g5_anchor_id` }));
    if (placement.parent_g4_node_id !== selectedG4) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'Item placement parent_g4_node_id must match selected G4.', { field: `${path}.placement.parent_g4_node_id` }));
    if (anchor) incrementCapacityConcern(concerns, itemAnchorUsage, placement.g5_anchor_id, anchorIndex.itemCapacityById, 'ITEM_PLACEMENT_ANCHOR_CAPACITY_EXCEEDED', `${path}.placement.g5_anchor_id`);

    if (placement.holder_npc_instance_id && !npcIds.has(placement.holder_npc_instance_id)) concerns.push(concern('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND', 'NPC holder must exist in Stage 15.', { field: `${path}.placement.holder_npc_instance_id` }));
    if (placement.holder_player_character_id && !playerIds.has(placement.holder_player_character_id)) concerns.push(concern('ITEM_PLACEMENT_PLAYER_HOLDER_NOT_FOUND', 'Player holder must match player_character.', { field: `${path}.placement.holder_player_character_id` }));
    if (placement.container_instance_id && !containers.some((entry) => entry?.container_instance_id === placement.container_instance_id)) concerns.push(concern('ITEM_PLACEMENT_CONTAINER_HOLDER_NOT_FOUND', 'Container holder must exist.', { field: `${path}.placement.container_instance_id` }));
    if (!placement.g5_anchor_id && !placement.container_instance_id && !placement.holder_npc_instance_id && !placement.holder_player_character_id) concerns.push(concern('ITEM_PLACEMENT_HOLDER_MISSING', 'Item requires anchor, container, NPC holder or player holder.', { field: `${path}.placement` }));

    validatePhysicalState(concerns, item?.physical_state, `${path}.physical_state`, policy);
    validateItemVisibility(concerns, item, anchor, input, path, policy);
    validateItemAccessPropertyRisk(concerns, item, candidate ?? {}, propertyIndex, npcIds, playerIds, allContainerIds, path, policy);
    if (playerInventoryProfileIds.has(item?.item_profile_id) && placement.causal_basis_type !== 'player_inventory_already_existing' && item?.existing_player_item_reference) {
      concerns.push(concern('ITEM_PLACEMENT_PLAYER_INVENTORY_DUPLICATE', 'Existing player inventory reference requires player_inventory_already_existing basis.', { field: `${path}.placement.causal_basis_type` }));
    }
    if (policy.require_source_trace === true && !nonEmptyArray(item?.source_trace)) concerns.push(concern('ITEM_PLACEMENT_SOURCE_MISSING', 'Each item requires source_trace.', { field: `${path}.source_trace` }));
  });

  containers.forEach((container, index) => {
    const path = `container_instances[${index}]`;
    const id = container?.container_instance_id;
    if (!hasText(id) || containerIds.has(id)) concerns.push(concern('ITEM_PLACEMENT_DUPLICATE_CONTAINER_ID', 'container_instance_id must be non-empty and unique.', { field: `${path}.container_instance_id` }));
    else containerIds.add(id);
    const candidate = containerIndex.byId.get(container?.container_profile_candidate_id);
    if (!candidate) concerns.push(concern('ITEM_PLACEMENT_CONTAINER_PROFILE_CANDIDATE_NOT_FOUND', 'container_profile_candidate_id must exist.', { field: `${path}.container_profile_candidate_id` }));
    else if (hasText(candidate.container_profile_id) && container.container_profile_id !== candidate.container_profile_id) concerns.push(concern('ITEM_PLACEMENT_CONTAINER_PROFILE_MISMATCH', 'container_profile_id must match candidate.', { field: `${path}.container_profile_id` }));
    const placement = container?.placement ?? {};
    validateCausalBasis(concerns, placement, `${path}.placement`, policy);
    const anchor = anchorIndex.byId.get(placement.g5_anchor_id);
    if (!anchor) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'Container g5_anchor_id must exist.', { field: `${path}.placement.g5_anchor_id` }));
    else {
      if (!anchorSupportsContainer(anchor)) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_CONTAINER', 'Anchor must support container placement.', { field: `${path}.placement.g5_anchor_id` }));
      if (anchor.parent_g4_node_id && anchor.parent_g4_node_id !== selectedG4) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'Container anchor must belong to selected G4.', { field: `${path}.placement.g5_anchor_id` }));
      incrementCapacityConcern(concerns, containerAnchorUsage, placement.g5_anchor_id, anchorIndex.containerCapacityById, 'ITEM_PLACEMENT_ANCHOR_CAPACITY_EXCEEDED', `${path}.placement.g5_anchor_id`);
    }
    if (placement.parent_g4_node_id !== selectedG4) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'Container parent_g4_node_id must match selected G4.', { field: `${path}.placement.parent_g4_node_id` }));
    validateContainerState(concerns, container, candidate ?? {}, npcIds, propertyIndex, path, policy);
    if (policy.require_source_trace === true && !nonEmptyArray(container?.source_trace)) concerns.push(concern('ITEM_PLACEMENT_SOURCE_MISSING', 'Each container requires source_trace.', { field: `${path}.source_trace` }));
  });

  validateItemAnchorBindings(concerns, draft.item_anchor_bindings, itemIds, anchorIndex, selectedG4);
  validateContainerAnchorBindings(concerns, draft.container_anchor_bindings, containerIds, anchorIndex, selectedG4);
  validatePropertyBindings(concerns, draft.property_bindings, propertyIndex, itemIds, containerIds, npcIds, anchorIndex);
  validateStateArrays(concerns, draft, itemIds, containerIds);
  collectForbiddenFields(draft, concerns);

  if (policy.require_source_trace === true && !nonEmptyArray(draft.source_trace)) concerns.push(concern('ITEM_PLACEMENT_SOURCE_MISSING', 'Draft source_trace must not be empty.', { field: 'source_trace' }));
  if (!nonEmptyArray(draft.audit_self_check?.evidence)) concerns.push(concern('ITEM_PLACEMENT_EMPTY_AUDIT_EVIDENCE', 'audit_self_check.evidence must not be empty.', { field: 'audit_self_check.evidence' }));
  if (draft.audit_self_check?.pass === false && !nonEmptyArray(draft.audit_self_check?.concerns)) concerns.push(concern('ITEM_PLACEMENT_SELF_CHECK_CONCERNS_MISSING', 'Failed audit_self_check requires concerns.', { field: 'audit_self_check.concerns' }));

  return dedupeConcerns(concerns);
}
