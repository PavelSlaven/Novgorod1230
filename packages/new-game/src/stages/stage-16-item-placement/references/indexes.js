import { anchorAccess, anchorId, anchorSupportsContainer, anchorSupportsItem, anchorVisibility, asArray, containerCandidateId, indexMany, itemCandidateId, matchesAllowedValue, matchesPinnedScope, matchesPlace, minilocationId, normalizeCapacity, placeTemplateIds, propertyCandidateId, selectedG4NodeId, selectedPlaceTemplateId } from '../shared/utils.js';

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
  return indexes.candidates.filter((candidate) => candidate.status === 'approved' && matchesPinnedScope(candidate, input) && matchesPlace(candidate, selectedTemplate)
    && matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, season)
    && matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.time_of_day, timeOfDay)
    && candidate.materialization_allowed !== false);
}

export function filterStage16EligibleContainers(input, indexes = buildStage16ContainerCandidateIndexes(input)) {
  const selectedTemplate = selectedPlaceTemplateId(input?.selected_start_node);
  const season = input?.historical_frame?.calendar?.season;
  const timeOfDay = input?.historical_frame?.clock?.time_of_day;
  return indexes.candidates.filter((candidate) => candidate.status === 'approved' && matchesPinnedScope(candidate, input) && matchesPlace(candidate, selectedTemplate)
    && matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, season)
    && matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.time_of_day, timeOfDay)
    && candidate.materialization_allowed !== false);
}

export function filterStage16EligiblePropertyRules(input, indexes = buildStage16PropertyRuleIndexes(input)) {
  return indexes.candidates.filter((candidate) => candidate.status === 'approved' && matchesPinnedScope(candidate, input) && candidate.materialization_allowed !== false && candidate.enabled !== false);
}

export function filterStage16EligibleAnchors(input, indexes = buildStage16AnchorIndexes(input)) {
  const selectedG4 = selectedG4NodeId(input?.selected_start_node);
  const belongs = (anchor) => !selectedG4 || !anchor?.parent_g4_node_id || anchor.parent_g4_node_id === selectedG4;
  return {
    item_anchors: indexes.itemCapable.filter(belongs),
    container_anchors: indexes.containerCapable.filter(belongs)
  };
}
