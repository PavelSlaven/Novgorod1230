import { PROFILE_RANK } from '../policy/constants.js';

export function requirePass(concerns, value, field, code) {
  if (value?.pass !== true) concerns.push(concern(code, `${field}.pass must be true.`, { field: `${field}.pass` }));
}

export function compareCandidateRef(concerns, actual, allowedRaw, code, field, allowNull = false) {
  if (allowNull && actual == null) return;
  const allowed = asArray(allowedRaw).filter(Boolean);
  if (!hasText(actual) || (allowed.length > 0 && !allowed.includes(actual))) concerns.push(concern(code, `${field} does not match the selected candidate.`, { field }));
}

export function candidateAllowsProfile(candidateRecord, profileLevel) {
  const allowed = asArray(candidateRecord.allowed_profile_levels ?? candidateRecord.profile_levels ?? candidateRecord.profile_level).map(normalizeProfileLevel);
  if (allowed.length > 0) return allowed.includes(profileLevel);
  const max = normalizeProfileLevel(candidateRecord.max_profile_level ?? candidateRecord.profile_level_max ?? candidateRecord.profile_level);
  return !max || PROFILE_RANK[profileLevel] <= PROFILE_RANK[max];
}

export function hasKeySeed(npc, candidateRecord) {
  const keySeed = npc?.base_refs?.key_npc_seed_id;
  if (hasText(keySeed)) {
    const allowed = asArray(candidateRecord.key_npc_seed_ids ?? candidateRecord.key_npc_seed_id).filter(Boolean);
    return allowed.length === 0 || allowed.includes(keySeed);
  }
  return candidateRecord.key_seed === true || candidateRecord.allows_key_profile === true || hasText(candidateRecord.persistence_basis);
}

export function candidateMatchesSelectedPlace(candidateRecord, selectedTemplateId) {
  const ids = candidatePlaceTemplateIds(candidateRecord);
  return !selectedTemplateId || ids.length === 0 || ids.includes(selectedTemplateId);
}

export function candidateMatchesSeason(candidate, season) {
  return matchesAllowedValue(candidate.allowed_seasons ?? candidate.seasons, season);
}

export function candidateMatchesTime(candidate, timeOfDay) {
  return matchesAllowedValue(candidate.allowed_time_of_day ?? candidate.allowed_time_of_day_values ?? candidate.time_of_day, timeOfDay);
}

export function candidatePlaceTemplateIds(candidate) {
  return asArray(candidate.selected_candidate_place_template_link_id
    ?? candidate.candidate_place_template_link_ids
    ?? candidate.place_template_ids
    ?? candidate.place_compatibility?.allowed_place_template_ids
    ?? candidate.place_compatibility?.allowed_candidate_place_template_link_ids
    ?? candidate.selected_place_template_id).filter(Boolean);
}

export function matchesAllowedValue(raw, value) {
  const allowed = asArray(raw).filter(Boolean);
  return value == null || allowed.length === 0 || allowed.includes(value) || allowed.includes('any') || allowed.includes('all');
}

export function selectedPlaceTemplateId(selected) {
  return selected?.selected?.selected_place_template_id
    ?? selected?.selected_place_template_id
    ?? selected?.selected_candidate_place_template_link_id
    ?? null;
}

export function selectedG4NodeId(selected) {
  return selected?.selected_node_chain?.g4_node_id
    ?? selected?.selected?.selected_node_id
    ?? selected?.selected_node_id
    ?? null;
}

export function candidateId(candidate) {
  return candidate?.npc_candidate_id ?? candidate?.candidate_id ?? candidate?.id ?? null;
}

export function anchorId(anchor) {
  return anchor?.anchor_id ?? anchor?.g5_anchor_id ?? anchor?.id ?? null;
}

export function minilocationId(item) {
  return item?.minilocation_id ?? item?.g5_minilocation_id ?? item?.id ?? null;
}

export function anchorSupportsNpc(anchor) {
  return anchor?.supports?.can_hold_npc === true
    || anchor?.supports_npc === true
    || anchor?.can_hold_npc === true;
}

export function anchorVisibility(anchor) {
  return anchor?.visibility?.visibility_default
    ?? anchor?.visibility_default
    ?? anchor?.visibility?.state
    ?? anchor?.visibility
    ?? 'unknown';
}

export function anchorAccess(anchor) {
  return anchor?.access?.access_state ?? anchor?.access_state ?? 'unknown';
}

export function normalizeCapacity(anchor) {
  const raw = anchor?.supports?.npc_capacity
    ?? anchor?.supports?.capacity
    ?? anchor?.npc_capacity
    ?? anchor?.capacity;
  const value = Number(raw);
  return raw != null && Number.isInteger(value) && value >= 0 ? value : null;
}

export function matchesPinnedScope(candidate, input) {
  const seed = input?.g5_scene_graph?.materialization_run?.seed_context ?? {};
  const year = input?.historical_frame?.calendar?.year;
  const season = input?.historical_frame?.calendar?.season;
  return candidate?.world_revision_id === seed.world_revision_id
    && candidate?.region_id === seed.region_id
    && Number.isInteger(year)
    && Number.isInteger(candidate.valid_from_year)
    && Number.isInteger(candidate.valid_to_year)
    && year >= candidate.valid_from_year
    && year <= candidate.valid_to_year
    && Array.isArray(candidate.allowed_seasons ?? candidate.seasons)
    && (candidate.allowed_seasons ?? candidate.seasons).length > 0
    && ((candidate.allowed_seasons ?? candidate.seasons).includes('all') || (candidate.allowed_seasons ?? candidate.seasons).includes(season));
}

export function normalizeProfileLevel(value) {
  return value === 'key_seed' ? 'key' : value;
}

export function indexMany(map, values, item) {
  for (const value of values.filter(Boolean)) {
    const list = map.get(value) ?? [];
    list.push(item);
    map.set(value, list);
  }
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

export function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasAny(set, values) {
  return values.some((value) => set.has(value));
}

export function concern(code, message, details = {}) {
  return { code, severity: details.severity ?? 'error', message, ...details };
}

export function dedupeConcerns(concerns) {
  const seen = new Set();
  return concerns.filter((item) => {
    const key = `${item.code}|${item.field ?? ''}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
