import { assertGatePassed, createGateResult } from '../gate.js';
import { createFrozenArtifactRecord } from '../lifecycle.js';

export const STAGE16_INPUT_SCHEMA = 'item_placement_input';
export const STAGE16_DRAFT_SCHEMA = 'initial_item_placement_draft';
export const STAGE16_PRECHECK_SCHEMA = 'initial_item_placement_code_precheck';
export const STAGE16_AUDIT_SCHEMA = 'initial_item_placement_audit';

export const STAGE16_PLACEMENT_STATUSES = Object.freeze([
  'placed',
  'empty_allowed',
  'blocked',
  'requires_repair'
]);

export const DEFAULT_STAGE16_ITEM_PLACEMENT_POLICY = Object.freeze({
  target_visible_items_min: 0,
  target_visible_items_max: 12,
  target_interactable_items_min: 0,
  target_interactable_items_max: 6,
  target_containers_max: 6,
  allow_empty_item_scene_if_place_supports_it: true,
  require_item_profile_candidate: true,
  require_anchor_supports_item_or_container: true,
  require_property_rule_for_interactable_item: true,
  require_owner_or_holder_model: true,
  require_visibility_model: true,
  require_access_model: true,
  require_weight_size_condition: true,
  require_causal_basis: true,
  require_source_trace: true,
  do_not_create_items_from_player_desire: true,
  do_not_reveal_hidden_items: true,
  do_not_fill_closed_containers_without_causal_basis: true,
  do_not_duplicate_player_inventory: true,
  do_not_create_new_npcs: true,
  do_not_change_g5_scene: true,
  do_not_create_hidden_event: true,
  do_not_write_intro_prose: true,
  do_not_write_visible_scene: true
});

export const STAGE16_CAUSAL_BASIS_TYPES = Object.freeze([
  'place_function',
  'anchor_function',
  'npc_holder',
  'npc_controller',
  'player_inventory_already_existing',
  'work_activity',
  'trade_activity',
  'access_obstacle',
  'property_risk',
  'visible_background',
  'searchable_detail',
  'seasonal_need',
  'body_state_need',
  'route_or_travel_need',
  'storage_function'
]);

const FORMAT_CODES = new Set([
  'ITEM_PLACEMENT_INVALID_JSON',
  'ITEM_PLACEMENT_SCHEMA_MISMATCH',
  'ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING',
  'ITEM_PLACEMENT_AUDIT_SCHEMA_MISMATCH',
  'ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING'
]);

const RISK_REQUIRED_RARITIES = new Set(['rare', 'very_rare', 'restricted', 'unique']);
const RISK_REQUIRED_VALUE_BANDS = new Set(['valuable', 'expensive', 'high', 'very_high', 'luxury']);
const RISK_REQUIRED_GROUPS = new Set(['weapon', 'service', 'authority', 'sacred', 'restricted']);
const CLOSED_CONTAINER_STATES = new Set(['closed', 'locked', 'sealed', 'hidden', 'inaccessible']);
const HIDDEN_VISIBILITY_STATES = new Set(['hidden', 'known_but_not_seen', 'inaccessible']);
const FORBIDDEN_OUTPUT_KEYS = new Map([
  ['new_npc', 'ITEM_PLACEMENT_CREATED_NPC'],
  ['new_npcs', 'ITEM_PLACEMENT_CREATED_NPC'],
  ['npc_instances', 'ITEM_PLACEMENT_CREATED_NPC'],
  ['new_anchor', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['new_anchors', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['new_edge', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['new_edges', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['modified_g5_scene', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['g5_scene_graph_draft', 'ITEM_PLACEMENT_CREATED_G5_ANCHOR'],
  ['visible_scene', 'ITEM_PLACEMENT_CREATED_VISIBLE_SCENE'],
  ['intro_prose', 'ITEM_PLACEMENT_CREATED_INTRO_PROSE'],
  ['narrator_prose', 'ITEM_PLACEMENT_CREATED_INTRO_PROSE'],
  ['hidden_event', 'ITEM_PLACEMENT_CREATED_HIDDEN_EVENT'],
  ['quest', 'ITEM_PLACEMENT_CREATED_HIDDEN_EVENT'],
  ['future_plot_item', 'ITEM_PLACEMENT_PLAYER_DESIRE_MATERIALIZED']
]);

const REQUIRED_AUDIT_CHECKS = Object.freeze([
  'all_item_candidates_exist',
  'all_container_candidates_exist',
  'all_property_rules_exist',
  'all_anchors_valid',
  'all_holders_valid',
  'causal_basis_valid',
  'visibility_access_property_risk_valid',
  'closed_containers_protected',
  'no_player_inventory_duplicates',
  'no_forbidden_entities_created',
  'source_trace_sufficient'
]);

export function normalizeStage16ItemPlacementPolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE16_ITEM_PLACEMENT_POLICY,
    ...(isObject(policy) ? policy : {})
  });
}

export function buildStage16ItemPlacementInput(context, options = {}) {
  const explicit = isObject(options) ? options : {};
  return {
    version: 1,
    schema: STAGE16_INPUT_SCHEMA,
    request_id: explicit.request_id ?? context?.requestId ?? null,
    historical_frame: explicit.historical_frame ?? context?.getStageOutput?.(3) ?? null,
    selected_start_node: explicit.selected_start_node ?? context?.getStageOutput?.(9) ?? null,
    start_place_audit: explicit.start_place_audit ?? context?.getStageOutput?.(10) ?? null,
    player_character: explicit.player_character
      ?? context?.getStageOutput?.(1101)
      ?? context?.getStageOutput?.(11)
      ?? null,
    player_character_audit: explicit.player_character_audit ?? context?.getStageOutput?.(12) ?? null,
    g5_scene_graph: explicit.g5_scene_graph
      ?? explicit.g5_scene_graph_draft
      ?? context?.getStageOutput?.(13)
      ?? null,
    g5_scene_audit: explicit.g5_scene_audit ?? context?.getStageOutput?.(14) ?? null,
    initial_npc_placement: explicit.initial_npc_placement ?? context?.getStageOutput?.(15) ?? null,
    npc_placement_audit: explicit.npc_placement_audit ?? context?.getStageOutput?.(1502) ?? null,
    item_profile_candidate_set: explicit.item_profile_candidate_set ?? context?.getStageOutput?.(8) ?? null,
    item_placement_policy: normalizeStage16ItemPlacementPolicy(
      explicit.item_placement_policy ?? explicit.policy ?? {}
    )
  };
}

export function validateStage16ItemPlacementInput(input) {
  const concerns = [];
  if (!isObject(input)) return [concern('ITEM_PLACEMENT_INVALID_JSON', 'Stage 16 input must be an object.')];
  if (input.version !== 1 || input.schema !== STAGE16_INPUT_SCHEMA) {
    concerns.push(concern('ITEM_PLACEMENT_SCHEMA_MISMATCH', `Expected ${STAGE16_INPUT_SCHEMA} version 1.`));
  }
  requirePass(concerns, input.start_place_audit, 'start_place_audit', 'ITEM_PLACEMENT_START_PLACE_AUDIT_FAILED');
  requirePass(concerns, input.player_character_audit, 'player_character_audit', 'ITEM_PLACEMENT_PLAYER_AUDIT_FAILED');
  if (input.player_character?.schema !== 'player_character_game_profile') {
    concerns.push(concern('ITEM_PLACEMENT_PLAYER_PROFILE_INVALID', 'player_character must be player_character_game_profile.', { field: 'player_character.schema' }));
  }
  if (input.g5_scene_graph?.schema !== 'g5_scene_graph_draft' || input.g5_scene_graph?.materialization_status !== 'materialized') {
    concerns.push(concern('ITEM_PLACEMENT_G5_SCENE_NOT_MATERIALIZED', 'g5_scene_graph must be a materialized g5_scene_graph_draft.', { field: 'g5_scene_graph' }));
  }
  if (input.g5_scene_audit?.schema !== 'g5_scene_audit' || input.g5_scene_audit?.pass !== true) {
    concerns.push(concern('ITEM_PLACEMENT_G5_AUDIT_FAILED', 'g5_scene_audit must pass.', { field: 'g5_scene_audit' }));
  }
  if (input.g5_scene_audit?.commit_permission?.can_continue_to_item_placement !== true) {
    concerns.push(concern('ITEM_PLACEMENT_G5_PERMISSION_DENIED', 'Stage 14 did not permit item placement.', { field: 'g5_scene_audit.commit_permission.can_continue_to_item_placement' }));
  }
  if (input.initial_npc_placement?.schema !== 'initial_npc_placement_draft'
    || !['placed', 'empty_allowed'].includes(input.initial_npc_placement?.placement_status)) {
    concerns.push(concern('ITEM_PLACEMENT_NPC_PLACEMENT_INVALID', 'initial_npc_placement must be placed or empty_allowed.', { field: 'initial_npc_placement' }));
  }
  if (input.npc_placement_audit?.schema !== 'initial_npc_placement_audit' || input.npc_placement_audit?.pass !== true) {
    concerns.push(concern('ITEM_PLACEMENT_NPC_AUDIT_FAILED', 'npc_placement_audit must pass.', { field: 'npc_placement_audit' }));
  }
  if (input.npc_placement_audit?.commit_permission?.can_continue_to_item_placement !== true) {
    concerns.push(concern('ITEM_PLACEMENT_NPC_PERMISSION_DENIED', 'Stage 15 did not permit item placement.', { field: 'npc_placement_audit.commit_permission.can_continue_to_item_placement' }));
  }
  const candidateSet = input.item_profile_candidate_set;
  if (candidateSet?.schema !== 'item_profile_candidate_set' || candidateSet?.selection_status !== 'ready') {
    concerns.push(concern('ITEM_PLACEMENT_CANDIDATE_SET_NOT_READY', 'item_profile_candidate_set must have selection_status=ready.', { field: 'item_profile_candidate_set' }));
  }
  for (const field of ['item_profile_candidates', 'container_profile_candidates', 'property_rule_candidates']) {
    if (!Array.isArray(candidateSet?.[field])) {
      concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', `${field} must be an array.`, { field: `item_profile_candidate_set.${field}` }));
    }
  }
  if (!Array.isArray(input.g5_scene_graph?.g5_anchors)) {
    concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'g5_scene_graph.g5_anchors must be an array.', { field: 'g5_scene_graph.g5_anchors' }));
  }
  if (!isObject(input.item_placement_policy)) {
    concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'item_placement_policy is required.', { field: 'item_placement_policy' }));
  } else {
    for (const key of Object.keys(DEFAULT_STAGE16_ITEM_PLACEMENT_POLICY)) {
      if (!Object.prototype.hasOwnProperty.call(input.item_placement_policy, key)) {
        concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', `item_placement_policy.${key} is required.`, { field: `item_placement_policy.${key}` }));
      }
    }
  }
  return dedupeConcerns(concerns);
}

export function buildStage16ItemCandidateIndexes(input) {
  const candidates = input?.item_profile_candidate_set?.item_profile_candidates ?? [];
  const byId = new Map();
  const byProfileId = new Map();
  const byPlaceTemplate = new Map();
  const byAnchorFunction = new Map();
  const byItemGroup = new Map();
  const byItemKind = new Map();
  const byRarity = new Map();
  const byValueBand = new Map();
  const byContainerProfile = new Map();
  const byPropertyRule = new Map();
  for (const candidate of candidates) {
    const id = itemCandidateId(candidate);
    if (!id) continue;
    byId.set(id, candidate);
    indexMany(byProfileId, asArray(candidate.item_profile_id), candidate);
    indexMany(byPlaceTemplate, placeTemplateIds(candidate), candidate);
    indexMany(byAnchorFunction, asArray(candidate.anchor_functions ?? candidate.allowed_anchor_functions), candidate);
    indexMany(byItemGroup, asArray(candidate.item_group ?? candidate.item_groups), candidate);
    indexMany(byItemKind, asArray(candidate.item_kind ?? candidate.item_kinds), candidate);
    indexMany(byRarity, asArray(candidate.rarity), candidate);
    indexMany(byValueBand, asArray(candidate.value_band), candidate);
    indexMany(byContainerProfile, asArray(candidate.container_profile_candidate_ids ?? candidate.container_profile_ids), candidate);
    indexMany(byPropertyRule, asArray(candidate.property_rule_candidate_ids ?? candidate.property_rule_ids), candidate);
  }
  return { candidates, byId, byProfileId, byPlaceTemplate, byAnchorFunction, byItemGroup, byItemKind, byRarity, byValueBand, byContainerProfile, byPropertyRule };
}

export function buildStage16ContainerCandidateIndexes(input) {
  const candidates = input?.item_profile_candidate_set?.container_profile_candidates ?? [];
  const byId = new Map();
  const byProfileId = new Map();
  const byPlaceTemplate = new Map();
  const byAnchorFunction = new Map();
  const byAccessModel = new Map();
  const byItemProfile = new Map();
  const byPropertyRule = new Map();
  for (const candidate of candidates) {
    const id = containerCandidateId(candidate);
    if (!id) continue;
    byId.set(id, candidate);
    indexMany(byProfileId, asArray(candidate.container_profile_id), candidate);
    indexMany(byPlaceTemplate, placeTemplateIds(candidate), candidate);
    indexMany(byAnchorFunction, asArray(candidate.anchor_functions ?? candidate.allowed_anchor_functions), candidate);
    indexMany(byAccessModel, asArray(candidate.access_models ?? candidate.access_model), candidate);
    indexMany(byItemProfile, asArray(candidate.allowed_item_profile_candidate_ids ?? candidate.item_profile_candidate_ids), candidate);
    indexMany(byPropertyRule, asArray(candidate.property_rule_candidate_ids ?? candidate.property_rule_ids), candidate);
  }
  return { candidates, byId, byProfileId, byPlaceTemplate, byAnchorFunction, byAccessModel, byItemProfile, byPropertyRule };
}

export function buildStage16PropertyRuleIndexes(input) {
  const candidates = input?.item_profile_candidate_set?.property_rule_candidates ?? [];
  const byId = new Map();
  const byItemCandidate = new Map();
  const byContainerCandidate = new Map();
  const byOwnerModel = new Map();
  const byHolderModel = new Map();
  const byAnchor = new Map();
  for (const candidate of candidates) {
    const id = propertyCandidateId(candidate);
    if (!id) continue;
    byId.set(id, candidate);
    indexMany(byItemCandidate, asArray(candidate.item_profile_candidate_ids ?? candidate.item_profile_candidate_id), candidate);
    indexMany(byContainerCandidate, asArray(candidate.container_profile_candidate_ids ?? candidate.container_profile_candidate_id), candidate);
    indexMany(byOwnerModel, asArray(candidate.owner_models ?? candidate.owner_model), candidate);
    indexMany(byHolderModel, asArray(candidate.holder_models ?? candidate.holder_model), candidate);
    indexMany(byAnchor, asArray(candidate.g5_anchor_ids ?? candidate.anchor_ids), candidate);
  }
  return { candidates, byId, byItemCandidate, byContainerCandidate, byOwnerModel, byHolderModel, byAnchor };
}

export function buildStage16AnchorIndexes(input) {
  const anchors = input?.g5_scene_graph?.g5_anchors ?? [];
  const minilocations = input?.g5_scene_graph?.g5_minilocations ?? [];
  const byId = new Map();
  const minilocationById = new Map();
  const itemCapable = [];
  const containerCapable = [];
  const visible = new Set();
  const hidden = new Set();
  const inspectionRequired = new Set();
  const permissionRequired = new Set();
  const closed = new Set();
  const locked = new Set();
  const itemCapacityById = new Map();
  const containerCapacityById = new Map();
  for (const minilocation of minilocations) {
    const id = minilocationId(minilocation);
    if (id) minilocationById.set(id, minilocation);
  }
  for (const anchor of anchors) {
    const id = anchorId(anchor);
    if (!id) continue;
    byId.set(id, anchor);
    const visibility = anchorVisibility(anchor);
    const access = anchorAccess(anchor);
    if (['visible', 'clear', 'open'].includes(visibility)) visible.add(id);
    if (['hidden', 'blocked', 'offscreen', 'inaccessible'].includes(visibility)) hidden.add(id);
    if (['visible_on_inspection', 'searchable', 'inspection_required'].includes(visibility)) inspectionRequired.add(id);
    if (['permission_required', 'guarded'].includes(access)) permissionRequired.add(id);
    if (['closed', 'tied', 'sealed'].includes(access)) closed.add(id);
    if (access === 'locked') locked.add(id);
    const itemCapacity = normalizeCapacity(anchor, 'item');
    const containerCapacity = normalizeCapacity(anchor, 'container');
    itemCapacityById.set(id, itemCapacity);
    containerCapacityById.set(id, containerCapacity);
    if (anchorSupportsItem(anchor) && access !== 'forbidden' && itemCapacity > 0) itemCapable.push(anchor);
    if (anchorSupportsContainer(anchor) && access !== 'forbidden' && containerCapacity > 0) containerCapable.push(anchor);
  }
  return {
    anchors,
    minilocations,
    byId,
    minilocationById,
    itemCapable,
    containerCapable,
    visible,
    hidden,
    inspectionRequired,
    permissionRequired,
    closed,
    locked,
    itemCapacityById,
    containerCapacityById
  };
}

export function filterStage16EligibleItems(input, indexes = buildStage16ItemCandidateIndexes(input)) {
  const selectedTemplate = selectedPlaceTemplateId(input?.selected_start_node);
  const season = input?.historical_frame?.calendar?.season;
  const timeOfDay = input?.historical_frame?.clock?.time_of_day;
  return indexes.candidates.filter((candidate) => matchesPlace(candidate, selectedTemplate)
    && matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, season)
    && matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.time_of_day, timeOfDay)
    && candidate.materialization_allowed !== false);
}

export function filterStage16EligibleContainers(input, indexes = buildStage16ContainerCandidateIndexes(input)) {
  const selectedTemplate = selectedPlaceTemplateId(input?.selected_start_node);
  const season = input?.historical_frame?.calendar?.season;
  const timeOfDay = input?.historical_frame?.clock?.time_of_day;
  return indexes.candidates.filter((candidate) => matchesPlace(candidate, selectedTemplate)
    && matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, season)
    && matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.time_of_day, timeOfDay)
    && candidate.materialization_allowed !== false);
}

export function filterStage16EligiblePropertyRules(input, indexes = buildStage16PropertyRuleIndexes(input)) {
  return indexes.candidates.filter((candidate) => candidate.materialization_allowed !== false && candidate.enabled !== false);
}

export function filterStage16EligibleAnchors(input, indexes = buildStage16AnchorIndexes(input)) {
  const selectedG4 = selectedG4NodeId(input?.selected_start_node);
  const belongs = (anchor) => !selectedG4 || !anchor?.parent_g4_node_id || anchor.parent_g4_node_id === selectedG4;
  return {
    item_anchors: indexes.itemCapable.filter(belongs),
    container_anchors: indexes.containerCapable.filter(belongs)
  };
}

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

export function buildStage16ItemPlacementCodePrecheck(draft, input) {
  const concerns = validateStage16ItemPlacementDraft(draft, input);
  const codes = new Set(concerns.map((item) => item.code));
  const none = (...values) => values.every((value) => !codes.has(value));
  const nonePrefix = (...prefixes) => [...codes].every((code) => !prefixes.some((prefix) => code.startsWith(prefix)));
  const checks = {
    schema_valid: none('ITEM_PLACEMENT_INVALID_JSON', 'ITEM_PLACEMENT_SCHEMA_MISMATCH', 'ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING'),
    placement_status_valid: none('ITEM_PLACEMENT_STATUS_INVALID', 'NO_ALLOWED_ITEM_PLACEMENT'),
    all_item_profile_candidates_exist: none('ITEM_PLACEMENT_ITEM_PROFILE_CANDIDATE_NOT_FOUND', 'ITEM_PLACEMENT_ITEM_PROFILE_MISMATCH'),
    all_container_profile_candidates_exist: none('ITEM_PLACEMENT_CONTAINER_PROFILE_CANDIDATE_NOT_FOUND', 'ITEM_PLACEMENT_CONTAINER_PROFILE_MISMATCH'),
    all_property_rule_candidates_exist: none('ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND', 'ITEM_PLACEMENT_CREATED_PROPERTY_RULE'),
    all_anchors_exist: none('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4'),
    all_anchors_support_item_or_container: none('ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_ITEM', 'ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_CONTAINER', 'ITEM_PLACEMENT_ANCHOR_CAPACITY_EXCEEDED'),
    all_npc_holders_exist: none('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND'),
    all_player_holders_exist: none('ITEM_PLACEMENT_PLAYER_HOLDER_NOT_FOUND'),
    all_container_holders_exist: none('ITEM_PLACEMENT_CONTAINER_HOLDER_NOT_FOUND'),
    all_owners_controllers_exist: none('ITEM_PLACEMENT_OWNER_NOT_FOUND', 'ITEM_PLACEMENT_CONTROLLER_NOT_FOUND'),
    causal_basis_present: none('ITEM_PLACEMENT_NO_CAUSAL_BASIS'),
    no_player_desire_materialization: none('ITEM_PLACEMENT_PLAYER_DESIRE_MATERIALIZED'),
    physical_properties_valid: none('ITEM_PLACEMENT_WEIGHT_MISSING', 'ITEM_PLACEMENT_SIZE_MISSING', 'ITEM_PLACEMENT_CONDITION_MISSING'),
    visibility_valid: none('ITEM_PLACEMENT_VISIBILITY_MISSING', 'ITEM_PLACEMENT_HIDDEN_ITEM_VISIBLE'),
    access_valid: none('ITEM_PLACEMENT_ACCESS_MISSING', 'ITEM_PLACEMENT_ACCESS_INVALID'),
    property_valid: none('ITEM_PLACEMENT_PROPERTY_MISSING', 'ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND'),
    risk_valid: nonePrefix('ITEM_PLACEMENT_RISK_', 'ITEM_PLACEMENT_RARE_ITEM_', 'ITEM_PLACEMENT_FOREIGN_ITEM_', 'ITEM_PLACEMENT_DISPUTED_ITEM_', 'ITEM_PLACEMENT_SERVICE_ITEM_'),
    no_hidden_items_revealed: none('ITEM_PLACEMENT_HIDDEN_ITEM_VISIBLE'),
    no_closed_container_contents_leaked: none('ITEM_PLACEMENT_CLOSED_CONTAINER_CONTENTS_LEAK'),
    no_player_inventory_duplicates: none('ITEM_PLACEMENT_PLAYER_INVENTORY_DUPLICATE'),
    no_new_npcs_created: none('ITEM_PLACEMENT_CREATED_NPC'),
    no_new_g5_anchors_created: none('ITEM_PLACEMENT_CREATED_G5_ANCHOR'),
    no_prose_created: none('ITEM_PLACEMENT_CREATED_VISIBLE_SCENE', 'ITEM_PLACEMENT_CREATED_INTRO_PROSE'),
    no_hidden_events_created: none('ITEM_PLACEMENT_CREATED_HIDDEN_EVENT'),
    source_trace_present: none('ITEM_PLACEMENT_SOURCE_MISSING'),
    audit_self_check_evidence_present: none('ITEM_PLACEMENT_EMPTY_AUDIT_EVIDENCE')
  };
  const pass = concerns.length === 0 && Object.values(checks).every(Boolean);
  return {
    version: 1,
    schema: STAGE16_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? draft?.request_id ?? null,
    pass,
    checks,
    concerns,
    evidence: [{ kind: 'stage16_code_precheck', checked_item_count: draft?.item_instances?.length ?? 0, checked_container_count: draft?.container_instances?.length ?? 0 }]
  };
}

export function buildStage16ItemPlacementAuditInput(input, draft, codePrecheck) {
  return {
    version: 1,
    schema: 'initial_item_placement_audit_input',
    request_id: input?.request_id ?? null,
    item_placement_input: input,
    initial_item_placement_draft: draft,
    initial_item_placement_code_precheck: codePrecheck,
    audit_policy: {
      do_not_modify_draft: true,
      do_not_create_items: true,
      do_not_create_containers: true,
      do_not_create_npcs: true,
      do_not_change_g5_scene: true,
      require_non_empty_evidence: true,
      require_repair_route_on_failure: true
    }
  };
}

export function validateStage16ItemPlacementAudit(audit, draft, input) {
  const concerns = [];
  if (!isObject(audit)) return [concern('ITEM_PLACEMENT_AUDIT_INVALID_JSON', 'Stage 16 audit must be an object.')];
  if (audit.version !== 1 || audit.schema !== STAGE16_AUDIT_SCHEMA) concerns.push(concern('ITEM_PLACEMENT_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE16_AUDIT_SCHEMA} version 1.`));
  if (typeof audit.pass !== 'boolean') concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', 'Audit pass must be boolean.', { field: 'pass' }));
  if (audit.request_id != null && audit.request_id !== input?.request_id) concerns.push(concern('ITEM_PLACEMENT_REQUEST_ID_MISMATCH', 'Audit request_id must match input.', { field: 'request_id' }));
  if (!nonEmptyArray(audit.evidence)) concerns.push(concern('ITEM_PLACEMENT_EMPTY_AUDIT_EVIDENCE', 'Audit evidence must not be empty.', { field: 'evidence' }));
  if (!isObject(audit.checks)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', 'Audit checks object is required.', { field: 'checks' }));
  else for (const key of REQUIRED_AUDIT_CHECKS) if (!isObject(audit.checks[key]) && typeof audit.checks[key] !== 'boolean') concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', `Audit check ${key} is required.`, { field: `checks.${key}` }));
  if (audit.pass === false && !nonEmptyArray(audit.concerns)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_CONCERNS_MISSING', 'Failed audit requires concerns.', { field: 'concerns' }));
  if (audit.pass === false && !isObject(audit.repair_route)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_REPAIR_ROUTE_MISSING', 'Failed audit requires repair_route.', { field: 'repair_route' }));
  if (audit.pass === true && audit.repair_route != null) concerns.push(concern('ITEM_PLACEMENT_AUDIT_REPAIR_ROUTE_INVALID', 'Passed audit must have repair_route=null.', { field: 'repair_route' }));
  validateAuditCommitPermission(concerns, audit);
  for (const key of ['initial_item_placement_draft', 'modified_draft', 'item_instances', 'container_instances', 'new_items', 'new_containers', 'new_npcs', 'new_anchors', 'visible_scene', 'intro_prose', 'hidden_event']) {
    if (Object.prototype.hasOwnProperty.call(audit, key)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_MUTATED_OUTPUT', `Audit must not contain ${key}.`, { field: key }));
  }
  if (audit.pass === true && validateStage16ItemPlacementDraft(draft, input).length > 0) concerns.push(concern('ITEM_PLACEMENT_AUDIT_APPROVED_INVALID_DRAFT', 'Audit cannot pass an invalid item placement draft.'));
  return dedupeConcerns(concerns);
}

export function buildStage17TimeLightConsistencyInput(context, options = {}) {
  const draft = options.initial_item_placement ?? context?.getStageOutput?.(16) ?? null;
  const precheck = options.initial_item_placement_code_precheck ?? context?.getStageOutput?.(1601) ?? null;
  const audit = options.item_placement_audit ?? context?.getStageOutput?.(1602) ?? null;
  return {
    version: 1,
    schema: 'time_light_consistency_input',
    request_id: options.request_id ?? context?.requestId ?? null,
    historical_frame: options.historical_frame ?? context?.getStageOutput?.(3) ?? null,
    selected_start_node: options.selected_start_node ?? context?.getStageOutput?.(9) ?? null,
    player_character: options.player_character ?? context?.getStageOutput?.(1101) ?? context?.getStageOutput?.(11) ?? null,
    g5_scene_graph: options.g5_scene_graph ?? context?.getStageOutput?.(13) ?? null,
    initial_npc_placement: options.initial_npc_placement ?? context?.getStageOutput?.(15) ?? null,
    initial_item_placement: draft,
    initial_item_placement_code_precheck: precheck,
    item_placement_audit: audit,
    constraints: {
      preserve_item_instance_ids: true,
      preserve_container_instance_ids: true,
      preserve_item_anchor_bindings: true,
      preserve_container_anchor_bindings: true,
      preserve_property_bindings: true,
      preserve_item_visibility_state: true,
      preserve_item_access_state: true,
      preserve_item_risk_state: true,
      do_not_reveal_hidden_items_without_check: true,
      do_not_generate_container_contents_without_causal_basis: true,
      ...(options.constraints ?? {})
    }
  };
}

export async function runStage16ItemPlacementBlock({ input, place, audit, formatRepair = null, semanticRepair = null } = {}) {
  const inputConcerns = validateStage16ItemPlacementInput(input);
  if (inputConcerns.length > 0) throw stage16Error('Stage 16 input gate failed.', inputConcerns, routeForInputConcerns(inputConcerns));

  const itemIndexes = buildStage16ItemCandidateIndexes(input);
  const containerIndexes = buildStage16ContainerCandidateIndexes(input);
  const propertyIndexes = buildStage16PropertyRuleIndexes(input);
  const anchorIndexes = buildStage16AnchorIndexes(input);
  const eligibleItems = filterStage16EligibleItems(input, itemIndexes);
  const eligibleContainers = filterStage16EligibleContainers(input, containerIndexes);
  const eligiblePropertyRules = filterStage16EligiblePropertyRules(input, propertyIndexes);
  const eligibleAnchors = filterStage16EligibleAnchors(input, anchorIndexes);
  if ((eligibleItems.length > 0 || eligibleContainers.length > 0)
    && eligibleAnchors.item_anchors.length === 0
    && eligibleAnchors.container_anchors.length === 0) {
    throw stage16Error('No valid G5 anchor can hold items or containers.', [concern('NO_ALLOWED_ITEM_PLACEMENT', 'No existing allowed G5 anchor supports item/container placement.')], {
      repair_kind: 'semantic', return_to_stage: 13, rerun_from_stage: 13, reason_code: 'NO_ALLOWED_ITEM_ANCHOR'
    });
  }

  const placerInput = {
    ...input,
    eligible_item_profile_candidates: eligibleItems,
    eligible_container_profile_candidates: eligibleContainers,
    eligible_property_rule_candidates: eligiblePropertyRules,
    eligible_g5_item_anchors: eligibleAnchors.item_anchors,
    eligible_g5_container_anchors: eligibleAnchors.container_anchors
  };
  let draft = await callJsonRole(place, placerInput, 'InitialItemPlacer');
  let precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
  if (!precheck.pass && typeof formatRepair === 'function' && precheck.concerns.some((item) => FORMAT_CODES.has(item.code))) {
    draft = await callJsonRole(formatRepair, { input, draft, validation_errors: precheck.concerns }, 'InitialItemPlacementFormatRepairer');
    precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
  }
  if (!precheck.pass && typeof semanticRepair === 'function') {
    draft = await callJsonRole(semanticRepair, { input, draft, validation_errors: precheck.concerns }, 'InitialItemPlacementSemanticRepairer');
    precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
  }
  if (!precheck.pass) throw stage16Error('Initial item placement draft failed code precheck.', precheck.concerns, routeForDraftConcerns(precheck.concerns), { draft, code_precheck: precheck });

  let auditOutput = await callJsonRole(audit, buildStage16ItemPlacementAuditInput(input, draft, precheck), 'InitialItemPlacementAuditor');
  let auditConcerns = validateStage16ItemPlacementAudit(auditOutput, draft, input);
  if (auditConcerns.length > 0 && typeof formatRepair === 'function') {
    auditOutput = await callJsonRole(formatRepair, { input, draft, audit: auditOutput, validation_errors: auditConcerns }, 'InitialItemPlacementFormatRepairer');
    auditConcerns = validateStage16ItemPlacementAudit(auditOutput, draft, input);
  }
  if (auditConcerns.length > 0) throw stage16Error('Initial item placement audit output is invalid.', auditConcerns, {
    repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'ITEM_PLACEMENT_AUDIT_FORMAT_INVALID'
  }, { draft, code_precheck: precheck, audit: auditOutput });

  if (auditOutput.pass !== true) {
    if (typeof semanticRepair === 'function') {
      draft = await callJsonRole(semanticRepair, { input, draft, audit_concerns: auditOutput.concerns }, 'InitialItemPlacementSemanticRepairer');
      precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
      if (precheck.pass) {
        auditOutput = await callJsonRole(audit, buildStage16ItemPlacementAuditInput(input, draft, precheck), 'InitialItemPlacementAuditor');
        auditConcerns = validateStage16ItemPlacementAudit(auditOutput, draft, input);
      }
    }
    if (auditOutput.pass !== true || auditConcerns.length > 0) throw stage16Error('Initial item placement semantic audit failed.', auditOutput.concerns ?? auditConcerns, normalizeAuditRepairRoute(auditOutput.repair_route), { draft, code_precheck: precheck, audit: auditOutput });
  }

  return {
    pass: true,
    draft,
    code_precheck: precheck,
    audit: auditOutput,
    eligible_item_count: eligibleItems.length,
    eligible_container_count: eligibleContainers.length,
    eligible_property_rule_count: eligiblePropertyRules.length
  };
}

export async function runStage16ItemPlacement(context, options = {}) {
  const input = options.input?.schema === STAGE16_INPUT_SCHEMA
    ? options.input
    : buildStage16ItemPlacementInput(context, options.input ?? options);
  const providedDraft = options.providedDraft
    ?? options.stageOutputs?.[16]
    ?? options.stageOutputs?.item_placement
    ?? options.stageOutputs?.initial_item_placement_draft
    ?? null;
  const providedAudit = options.providedAudit
    ?? options.stageOutputs?.[1602]
    ?? options.stageOutputs?.initial_item_placement_audit
    ?? providedDraft?.initial_item_placement_audit
    ?? null;
  let result;
  if (providedDraft) {
    rejectProductionProvidedStage16(context, options);
    const draft = providedDraft.initial_item_placement_draft ?? providedDraft;
    const precheck = buildStage16ItemPlacementCodePrecheck(draft, input);
    const auditConcerns = validateStage16ItemPlacementAudit(providedAudit, draft, input);
    if (!precheck.pass || auditConcerns.length > 0 || providedAudit?.pass !== true) {
      throw stage16Error('Provided Stage 16 output failed validation.', [...precheck.concerns, ...auditConcerns], {
        repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'PROVIDED_STAGE16_INVALID'
      });
    }
    result = { pass: true, draft, code_precheck: precheck, audit: providedAudit };
  } else {
    const executor = options.executor;
    if (typeof executor !== 'function') throw new Error('Stage 16 requires an executor.');
    const roleCall = (role) => async (roleInput) => executor({
      context,
      input: roleInput,
      stage: {
        id: 16,
        slug: 'item_placement',
        role,
        output_schema: role === 'InitialItemPlacementAuditor'
          || (role === 'InitialItemPlacementFormatRepairer' && roleInput?.audit)
          ? STAGE16_AUDIT_SCHEMA
          : STAGE16_DRAFT_SCHEMA,
        spec_file: '16.txt'
      }
    });
    result = await runStage16ItemPlacementBlock({
      input,
      place: options.place ?? roleCall('InitialItemPlacer'),
      audit: options.audit ?? roleCall('InitialItemPlacementAuditor'),
      formatRepair: options.formatRepair ?? roleCall('InitialItemPlacementFormatRepairer'),
      semanticRepair: options.semanticRepair ?? roleCall('InitialItemPlacementSemanticRepairer')
    });
  }
  commitStage16Artifacts(context, result, input);
  return result.draft;
}

export function commitStage16Artifacts(context, result, input) {
  const pass = result.pass === true
    && result.code_precheck?.pass === true
    && result.audit?.pass === true
    && result.audit?.commit_permission?.can_continue_to_time_light_gate === true;
  const gate = createGateResult({
    stageId: 16,
    stageSlug: 'item_placement',
    gateKind: 'commit_ready_artifact',
    pass,
    concerns: pass ? [] : (result.code_precheck?.concerns ?? result.audit?.concerns ?? []),
    evidence: [...(result.code_precheck?.evidence ?? []), ...(result.audit?.evidence ?? [])]
  });
  context.setGateResult(16, gate);
  assertGatePassed(gate);
  context.setStageOutput(16, result.draft);
  context.setStageOutput(1601, result.code_precheck);
  context.setStageOutput(1602, result.audit);
  context.setLifecycleState(16, {
    stage_id: 16,
    stage_slug: 'item_placement',
    stage_type: 'semantic_generation',
    input_snapshot: structuredClone(input),
    parsed_output: structuredClone(result.draft),
    structural_validation: structuredClone(result.code_precheck),
    semantic_audit_report: structuredClone(result.audit),
    pre_dependency_gate: createGateResult({ stageId: 16, stageSlug: 'item_placement', gateKind: 'pre_dependency_gate', pass: true }),
    post_dependency_gate: gate,
    terminal_status: 'passed',
    failed_gate: null,
    final_blocked_reason: null
  });
  freeze(context, 16, 'item_placement', result.draft, 'passed', 'passed');
  freeze(context, 1601, 'item_placement_code_precheck', result.code_precheck, 'passed', 'not_required');
  freeze(context, 1602, 'item_placement_audit', result.audit, 'passed', 'passed');
  context.note?.(16, { label: 'item_placement', message: 'item_placement ready', responseRaw: { gate } });
}

function validateCausalBasis(concerns, placement, path, policy) {
  const basis = placement?.causal_basis_type;
  if (policy.require_causal_basis === true && !hasText(basis)) concerns.push(concern('ITEM_PLACEMENT_NO_CAUSAL_BASIS', 'causal_basis_type is required.', { field: `${path}.causal_basis_type` }));
  if (basis === 'player_desire' || placement?.requested_by_player === true || placement?.basis_source === 'player_desire') concerns.push(concern('ITEM_PLACEMENT_PLAYER_DESIRE_MATERIALIZED', 'Player desire is not a valid causal basis.', { field: `${path}.causal_basis_type` }));
  if (hasText(basis) && basis !== 'player_desire' && !STAGE16_CAUSAL_BASIS_TYPES.includes(basis)) concerns.push(concern('ITEM_PLACEMENT_NO_CAUSAL_BASIS', 'causal_basis_type is outside the allowed enum.', { field: `${path}.causal_basis_type` }));
}

function validatePhysicalState(concerns, state, path, policy) {
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

function validateItemVisibility(concerns, item, anchor, input, path, policy) {
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

function validateItemAccessPropertyRisk(concerns, item, candidate, propertyIndex, npcIds, playerIds, containerIds, path, policy) {
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

function validateContainerState(concerns, container, candidate, npcIds, propertyIndex, path, policy) {
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

function validatePhysicalContainerState(concerns, state, path) {
  if (!isObject(state)) {
    concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', 'Container physical_state is required.', { field: path }));
    return;
  }
  if (!hasText(state.condition)) concerns.push(concern('ITEM_PLACEMENT_CONDITION_MISSING', 'Container condition is required.', { field: `${path}.condition` }));
  if (!Number.isFinite(Number(state.weight_empty)) || Number(state.weight_empty) < 0) concerns.push(concern('ITEM_PLACEMENT_WEIGHT_MISSING', 'Container weight_empty must be non-negative.', { field: `${path}.weight_empty` }));
  if (!hasText(state.capacity_band)) concerns.push(concern('ITEM_PLACEMENT_SIZE_MISSING', 'Container capacity_band is required.', { field: `${path}.capacity_band` }));
}

function validateItemAnchorBindings(concerns, bindings, itemIds, anchorIndex, selectedG4) {
  if (!Array.isArray(bindings)) return;
  bindings.forEach((binding, index) => {
    const path = `item_anchor_bindings[${index}]`;
    if (!itemIds.has(binding?.item_instance_id)) concerns.push(concern('ITEM_PLACEMENT_ITEM_PROFILE_CANDIDATE_NOT_FOUND', 'Binding references unknown item_instance_id.', { field: `${path}.item_instance_id` }));
    const anchor = anchorIndex.byId.get(binding?.g5_anchor_id);
    if (!anchor) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'Binding anchor must exist.', { field: `${path}.g5_anchor_id` }));
    else if (anchor.parent_g4_node_id && anchor.parent_g4_node_id !== selectedG4) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'Binding anchor must belong to selected G4.', { field: `${path}.g5_anchor_id` }));
  });
}

function validateContainerAnchorBindings(concerns, bindings, containerIds, anchorIndex, selectedG4) {
  if (!Array.isArray(bindings)) return;
  bindings.forEach((binding, index) => {
    const path = `container_anchor_bindings[${index}]`;
    if (!containerIds.has(binding?.container_instance_id)) concerns.push(concern('ITEM_PLACEMENT_CONTAINER_PROFILE_CANDIDATE_NOT_FOUND', 'Binding references unknown container_instance_id.', { field: `${path}.container_instance_id` }));
    const anchor = anchorIndex.byId.get(binding?.g5_anchor_id);
    if (!anchor) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'Binding anchor must exist.', { field: `${path}.g5_anchor_id` }));
    else if (anchor.parent_g4_node_id && anchor.parent_g4_node_id !== selectedG4) concerns.push(concern('ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'Binding anchor must belong to selected G4.', { field: `${path}.g5_anchor_id` }));
  });
}

function validatePropertyBindings(concerns, bindings, propertyIndex, itemIds, containerIds, npcIds, anchorIndex) {
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

function validateStateArrays(concerns, draft, itemIds, containerIds) {
  for (const field of ['visibility_state', 'access_state', 'risk_state']) {
    const values = draft[field];
    if (!Array.isArray(values)) continue;
    values.forEach((state, index) => {
      const ref = state?.item_instance_id ?? state?.container_instance_id;
      if (!ref || (!itemIds.has(ref) && !containerIds.has(ref))) concerns.push(concern('ITEM_PLACEMENT_REQUIRED_BLOCK_MISSING', `${field} references unknown instance.`, { field: `${field}[${index}]` }));
    });
  }
}

function validateAuditCommitPermission(concerns, audit) {
  const permission = audit?.commit_permission;
  if (!isObject(permission)) {
    concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', 'commit_permission is required.', { field: 'commit_permission' }));
    return;
  }
  const keys = ['can_commit_item_instances', 'can_commit_container_instances', 'can_continue_to_time_light_gate', 'can_continue_to_visible_context'];
  for (const key of keys) if (typeof permission[key] !== 'boolean') concerns.push(concern('ITEM_PLACEMENT_AUDIT_REQUIRED_BLOCK_MISSING', `commit_permission.${key} must be boolean.`, { field: `commit_permission.${key}` }));
  if (audit.pass === true) {
    for (const key of ['can_commit_item_instances', 'can_commit_container_instances', 'can_continue_to_time_light_gate']) if (permission[key] !== true) concerns.push(concern('ITEM_PLACEMENT_AUDIT_PERMISSION_INVALID', `${key} must be true when audit passes.`, { field: `commit_permission.${key}` }));
    if (permission.can_continue_to_visible_context !== false) concerns.push(concern('ITEM_PLACEMENT_AUDIT_PERMISSION_INVALID', 'Stage 16 must not directly permit visible context.', { field: 'commit_permission.can_continue_to_visible_context' }));
  } else if (keys.some((key) => permission[key] !== false)) concerns.push(concern('ITEM_PLACEMENT_AUDIT_PERMISSION_INVALID', 'All commit permissions must be false when audit fails.', { field: 'commit_permission' }));
}

function candidateNeedsRisk(candidate, property) {
  return RISK_REQUIRED_RARITIES.has(candidate?.rarity)
    || RISK_REQUIRED_VALUE_BANDS.has(candidate?.value_band)
    || RISK_REQUIRED_GROUPS.has(candidate?.item_group)
    || ['owned', 'borrowed', 'entrusted', 'stolen', 'service', 'sacred', 'disputed', 'trade_stock'].includes(property?.legal_or_social_status)
    || ['npc', 'household', 'workplace', 'authority', 'sacred', 'disputed'].includes(property?.owner_model);
}

function hasMeaningfulRisk(risk) {
  if (!isObject(risk)) return false;
  const fields = ['theft_risk', 'witness_risk', 'legal_risk', 'reputation_risk', 'damage_risk', 'noise_risk', 'opening_risk'];
  return fields.some((field) => hasText(risk[field]) && risk[field] !== 'none') || nonEmptyArray(risk.risk_basis);
}

function hasOwnerOrController(property) {
  return isObject(property) && ((hasText(property.owner_model) && property.owner_model !== 'none') || (hasText(property.controller_model) && property.controller_model !== 'none'));
}

function collectForbiddenFields(value, concerns, path = 'root', seen = new WeakSet()) {
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

function freeze(context, stageId, stageSlug, artifact, validationStatus, auditStatus) {
  context.freezeArtifact(createFrozenArtifactRecord({ artifact, stageId, stageSlug, schema: artifact.schema, version: artifact.version ?? 1, producedBy: stageSlug, validationStatus, auditStatus, dependencyStatus: 'passed' }));
}

function rejectProductionProvidedStage16(context, options) {
  if (context.env?.NODE_ENV === 'production' && options.allowProvidedStageOutputs !== true) throw new Error('Provided stage 16 output is disabled in production unless allowProvidedStageOutputs=true.');
}

function stage16Error(message, concerns, route, snapshots = {}) {
  const error = new Error(message);
  error.lifecycle = { stage_id: 16, stage_slug: 'item_placement', stage_type: 'semantic_generation', failed_gate: route?.repair_kind === 'format' ? 'structural_validation' : 'semantic_validation', concerns: concerns ?? [], terminal_status: 'stage_failed', ...snapshots };
  error.semanticRecoveryRoute = route;
  return error;
}

function routeForInputConcerns(concerns) {
  const codes = new Set(concerns.map((item) => item.code));
  if (codes.has('ITEM_PLACEMENT_CANDIDATE_SET_NOT_READY')) return route(8, 'ITEM_CANDIDATE_SET_NOT_READY');
  if (codes.has('ITEM_PLACEMENT_G5_SCENE_NOT_MATERIALIZED')) return route(13, 'G5_SCENE_INVALID');
  if (codes.has('ITEM_PLACEMENT_G5_AUDIT_FAILED') || codes.has('ITEM_PLACEMENT_G5_PERMISSION_DENIED')) return route(14, 'G5_AUDIT_NOT_APPROVED');
  if (codes.has('ITEM_PLACEMENT_NPC_PLACEMENT_INVALID') || codes.has('ITEM_PLACEMENT_NPC_AUDIT_FAILED') || codes.has('ITEM_PLACEMENT_NPC_PERMISSION_DENIED')) return route(15, 'NPC_PLACEMENT_NOT_APPROVED');
  return { repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'ITEM_PLACEMENT_INPUT_INVALID' };
}

function routeForDraftConcerns(concerns) {
  const codes = new Set(concerns.map((item) => item.code));
  if ([...codes].some((code) => code.includes('PROFILE_CANDIDATE_NOT_FOUND') || code === 'ITEM_PLACEMENT_PROPERTY_RULE_CANDIDATE_NOT_FOUND')) return route(8, 'ITEM_CANDIDATE_NOT_FOUND');
  if ([...codes].some((code) => ['ITEM_PLACEMENT_ANCHOR_NOT_FOUND', 'ITEM_PLACEMENT_ANCHOR_OUTSIDE_G4', 'ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_ITEM', 'ITEM_PLACEMENT_ANCHOR_CANNOT_HOLD_CONTAINER'].includes(code))) return route(13, 'G5_ANCHOR_INVALID');
  if (codes.has('ITEM_PLACEMENT_NPC_HOLDER_NOT_FOUND')) return route(15, 'NPC_HOLDER_INVALID');
  if ([...codes].some((code) => FORMAT_CODES.has(code))) return { repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'ITEM_PLACEMENT_FORMAT_INVALID' };
  return route(16, 'ITEM_PLACEMENT_SEMANTIC_INVALID');
}

function normalizeAuditRepairRoute(value) {
  if (isObject(value)) return { repair_kind: value.repair_kind ?? 'semantic', return_to_stage: Number(value.return_to_stage ?? 16), rerun_from_stage: Number(value.rerun_from_stage ?? value.return_to_stage ?? 16), reason_code: value.reason_code ?? 'ITEM_PLACEMENT_AUDIT_FAILED' };
  return route(16, 'ITEM_PLACEMENT_AUDIT_FAILED');
}

function route(stage, reasonCode) {
  return { repair_kind: 'semantic', return_to_stage: stage, rerun_from_stage: stage, reason_code: reasonCode };
}

async function callJsonRole(callback, input, role) {
  if (typeof callback !== 'function') throw new Error(`${role} callback is required.`);
  const raw = await callback(input);
  const candidate = raw?.output ?? raw?.parsed_output ?? raw;
  if (typeof candidate === 'string') {
    try { return JSON.parse(candidate); } catch (error) {
      const failure = stage16Error(`${role} returned invalid JSON.`, [concern('ITEM_PLACEMENT_INVALID_JSON', error.message)], { repair_kind: 'format', return_to_stage: 16, rerun_from_stage: 16, reason_code: 'ITEM_PLACEMENT_INVALID_JSON' });
      failure.raw_output = candidate;
      throw failure;
    }
  }
  return candidate;
}

function incrementCapacityConcern(concerns, usage, anchorIdValue, capacityMap, code, field) {
  if (!anchorIdValue) return;
  const used = (usage.get(anchorIdValue) ?? 0) + 1;
  usage.set(anchorIdValue, used);
  if (used > (capacityMap.get(anchorIdValue) ?? 1)) concerns.push(concern(code, 'Anchor capacity exceeded.', { field }));
}

function requirePass(concerns, value, field, code) {
  if (value?.pass !== true) concerns.push(concern(code, `${field}.pass must be true.`, { field: `${field}.pass` }));
}

function itemCandidateId(candidate) { return candidate?.item_profile_candidate_id ?? candidate?.candidate_id ?? candidate?.id ?? null; }
function containerCandidateId(candidate) { return candidate?.container_profile_candidate_id ?? candidate?.candidate_id ?? candidate?.id ?? null; }
function propertyCandidateId(candidate) { return candidate?.property_rule_candidate_id ?? candidate?.candidate_id ?? candidate?.id ?? null; }
function anchorId(anchor) { return anchor?.anchor_id ?? anchor?.g5_anchor_id ?? anchor?.id ?? null; }
function minilocationId(item) { return item?.minilocation_id ?? item?.g5_minilocation_id ?? item?.id ?? null; }
function selectedPlaceTemplateId(selected) { return selected?.selected?.selected_place_template_id ?? selected?.selected_place_template_id ?? selected?.selected_candidate_place_template_link_id ?? null; }
function selectedG4NodeId(selected) { return selected?.selected_node_chain?.g4_node_id ?? selected?.selected?.selected_node_id ?? selected?.selected_node_id ?? null; }
function placeTemplateIds(candidate) { return asArray(candidate?.place_template_ids ?? candidate?.selected_place_template_id ?? candidate?.candidate_place_template_link_ids ?? candidate?.selected_candidate_place_template_link_id).filter(Boolean); }
function matchesPlace(candidate, selected) { const ids = placeTemplateIds(candidate); return !selected || ids.length === 0 || ids.includes(selected); }
function matchesAllowedValue(raw, value) { const allowed = asArray(raw).filter(Boolean); return value == null || allowed.length === 0 || allowed.includes(value) || allowed.includes('any') || allowed.includes('all'); }
function anchorSupportsItem(anchor) { return anchor?.supports?.can_hold_item === true || anchor?.can_hold_item === true || anchor?.supports_item === true; }
function anchorSupportsContainer(anchor) { return anchor?.supports?.can_hold_container === true || anchor?.can_hold_container === true || anchor?.supports_container === true; }
function anchorVisibility(anchor) { return anchor?.visibility?.visibility_default ?? anchor?.visibility_default ?? anchor?.visibility?.state ?? anchor?.visibility ?? 'unknown'; }
function anchorAccess(anchor) { return anchor?.access?.access_state ?? anchor?.access_state ?? 'unknown'; }
function normalizeCapacity(anchor, kind) { const raw = anchor?.supports?.[`${kind}_capacity`] ?? anchor?.[`${kind}_capacity`] ?? anchor?.supports?.capacity ?? anchor?.capacity ?? 1; const value = Number(raw); return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 1; }

function collectPlayerIds(player) {
  const values = [player?.character_id, player?.player_character_id, player?.id, player?.identity?.character_id].filter(Boolean);
  return new Set(values);
}
function collectPlayerInventoryIds(player) {
  const items = player?.inventory?.items ?? player?.inventory_entries ?? player?.equipment?.items ?? [];
  return new Set(asArray(items).map((item) => item?.item_instance_id ?? item?.item_id ?? item?.id).filter(Boolean));
}
function collectPlayerInventoryProfileIds(player) {
  const items = player?.inventory?.items ?? player?.inventory_entries ?? player?.equipment?.items ?? [];
  return new Set(asArray(items).map((item) => item?.item_profile_id ?? item?.profile_id).filter(Boolean));
}
function indexMany(map, values, item) { for (const value of values.filter(Boolean)) { const list = map.get(value) ?? []; list.push(item); map.set(value, list); } }
function asArray(value) { if (Array.isArray(value)) return value; return value == null ? [] : [value]; }
function nonEmptyArray(value) { return Array.isArray(value) && value.length > 0; }
function hasText(value) { return typeof value === 'string' && value.trim().length > 0; }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function concern(code, message, details = {}) { return { code, severity: details.severity ?? 'error', message, ...details }; }
function dedupeConcerns(concerns) { const seen = new Set(); return concerns.filter((item) => { const key = `${item.code}|${item.field ?? ''}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
