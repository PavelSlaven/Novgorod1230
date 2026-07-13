import { anchorAccess, anchorId, anchorSupportsNpc, anchorVisibility, asArray, candidateId, candidatePlaceTemplateIds, indexMany, matchesAllowedValue, minilocationId, normalizeCapacity, selectedG4NodeId, selectedPlaceTemplateId } from '../shared/utils.js';

export function buildStage15CandidateIndex(input) {
  const candidates = input?.npc_candidate_set?.npc_candidates ?? [];
  const byId = new Map();
  const byProfileLevel = new Map();
  const byPlaceTemplateId = new Map();
  const byAnchorFunction = new Map();
  const bySocialRoleId = new Map();
  const byOccupationId = new Map();
  const byArchetypeId = new Map();
  const byNamePoolId = new Map();

  for (const candidate of candidates) {
    const id = candidateId(candidate);
    if (!id) continue;
    byId.set(id, candidate);
    indexMany(byProfileLevel, asArray(candidate.profile_level ?? candidate.allowed_profile_levels), candidate);
    indexMany(byPlaceTemplateId, candidatePlaceTemplateIds(candidate), candidate);
    indexMany(byAnchorFunction, asArray(candidate.anchor_functions ?? candidate.allowed_anchor_functions), candidate);
    indexMany(bySocialRoleId, asArray(candidate.social_role_id ?? candidate.social_role_ids), candidate);
    indexMany(byOccupationId, asArray(candidate.occupation_id ?? candidate.occupation_ids), candidate);
    indexMany(byArchetypeId, asArray(candidate.npc_archetype_id ?? candidate.npc_archetype_ids), candidate);
    indexMany(byNamePoolId, asArray(candidate.name_pool_ids ?? candidate.name_pool_id), candidate);
  }

  return {
    candidates,
    byId,
    byProfileLevel,
    byPlaceTemplateId,
    byAnchorFunction,
    bySocialRoleId,
    byOccupationId,
    byArchetypeId,
    byNamePoolId
  };
}

export function buildStage15AnchorIndex(input) {
  const anchors = input?.g5_scene_graph?.g5_anchors ?? [];
  const minilocations = input?.g5_scene_graph?.g5_minilocations ?? [];
  const byId = new Map();
  const minilocationById = new Map();
  const npcCapable = [];
  const visible = new Set();
  const audible = new Set();
  const hidden = new Set();
  const forbidden = new Set();
  const capacityById = new Map();

  for (const minilocation of minilocations) {
    const id = minilocationId(minilocation);
    if (id) minilocationById.set(id, minilocation);
  }
  for (const anchor of anchors) {
    const id = anchorId(anchor);
    if (!id) continue;
    byId.set(id, anchor);
    const visibility = anchorVisibility(anchor);
    if (visibility === 'visible' || visibility === 'visible_on_inspection') visible.add(id);
    if (visibility === 'audible') audible.add(id);
    if (visibility === 'hidden' || visibility === 'offscreen' || visibility === 'blocked') hidden.add(id);
    if (anchorAccess(anchor) === 'forbidden') forbidden.add(id);
    const capacity = normalizeCapacity(anchor);
    capacityById.set(id, capacity);
    if (anchorSupportsNpc(anchor) && !forbidden.has(id) && capacity > 0) npcCapable.push(anchor);
  }

  return {
    anchors,
    minilocations,
    byId,
    minilocationById,
    npcCapable,
    visible,
    audible,
    hidden,
    forbidden,
    capacityById
  };
}

export function filterStage15EligibleCandidates(input, indexes = buildStage15CandidateIndex(input)) {
  const selectedTemplateId = selectedPlaceTemplateId(input.selected_start_node);
  const season = input.historical_frame?.calendar?.season ?? null;
  const timeOfDay = input.historical_frame?.clock?.time_of_day ?? null;
  return indexes.candidates.filter((candidate) => {
    if (candidate.status === 'rejected' || candidate.status === 'conflict' || candidate.enabled === false) return false;
    const placeIds = candidatePlaceTemplateIds(candidate);
    if (selectedTemplateId && placeIds.length > 0 && !placeIds.includes(selectedTemplateId)) return false;
    if (!matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, season)) return false;
    if (!matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.allowed_time_of_day_values ?? candidate.time_of_day, timeOfDay)) return false;
    return true;
  });
}

export function filterStage15EligibleAnchors(input, indexes = buildStage15AnchorIndex(input)) {
  const selectedG4 = selectedG4NodeId(input.selected_start_node);
  return indexes.npcCapable.filter((anchor) => {
    const parentG4 = anchor.parent_g4_node_id ?? anchor.parent_location_id ?? input.g5_scene_graph?.parent_location?.g4_node_id;
    return !selectedG4 || !parentG4 || parentG4 === selectedG4;
  });
}
