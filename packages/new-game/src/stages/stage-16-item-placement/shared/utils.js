export function requirePass(concerns, value, field, code) {
  if (value?.pass !== true) concerns.push(concern(code, `${field}.pass must be true.`, { field: `${field}.pass` }));
}

export function itemCandidateId(candidate) { return candidate?.item_profile_candidate_id ?? candidate?.candidate_id ?? candidate?.id ?? null; }

export function containerCandidateId(candidate) { return candidate?.container_profile_candidate_id ?? candidate?.candidate_id ?? candidate?.id ?? null; }

export function propertyCandidateId(candidate) { return candidate?.property_rule_candidate_id ?? candidate?.candidate_id ?? candidate?.id ?? null; }

export function anchorId(anchor) { return anchor?.anchor_id ?? anchor?.g5_anchor_id ?? anchor?.id ?? null; }

export function minilocationId(item) { return item?.minilocation_id ?? item?.g5_minilocation_id ?? item?.id ?? null; }

export function selectedPlaceTemplateId(selected) { return selected?.selected?.selected_place_template_id ?? selected?.selected_place_template_id ?? selected?.selected_candidate_place_template_link_id ?? null; }

export function selectedG4NodeId(selected) { return selected?.selected_node_chain?.g4_node_id ?? selected?.selected?.selected_node_id ?? selected?.selected_node_id ?? null; }

export function placeTemplateIds(candidate) { return asArray(candidate?.place_template_ids ?? candidate?.selected_place_template_id ?? candidate?.candidate_place_template_link_ids ?? candidate?.selected_candidate_place_template_link_id).filter(Boolean); }

export function matchesPlace(candidate, selected) { const ids = placeTemplateIds(candidate); return !selected || ids.length === 0 || ids.includes(selected); }

export function matchesAllowedValue(raw, value) { const allowed = asArray(raw).filter(Boolean); return value == null || allowed.length === 0 || allowed.includes(value) || allowed.includes('any') || allowed.includes('all'); }

export function anchorSupportsItem(anchor) { return anchor?.supports?.can_hold_item === true || anchor?.can_hold_item === true || anchor?.supports_item === true; }

export function anchorSupportsContainer(anchor) { return anchor?.supports?.can_hold_container === true || anchor?.can_hold_container === true || anchor?.supports_container === true; }

export function anchorVisibility(anchor) { return anchor?.visibility?.visibility_default ?? anchor?.visibility_default ?? anchor?.visibility?.state ?? anchor?.visibility ?? 'unknown'; }

export function anchorAccess(anchor) { return anchor?.access?.access_state ?? anchor?.access_state ?? 'unknown'; }

export function normalizeCapacity(anchor, kind) { const raw = anchor?.supports?.[`${kind}_capacity`] ?? anchor?.[`${kind}_capacity`] ?? anchor?.supports?.capacity ?? anchor?.capacity; const value = Number(raw); return raw != null && Number.isInteger(value) && value >= 0 ? value : null; }

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

export function collectPlayerIds(player) {
  const values = [player?.character_id, player?.player_character_id, player?.id, player?.identity?.character_id].filter(Boolean);
  return new Set(values);
}

export function collectPlayerInventoryIds(player) {
  const items = player?.inventory?.items ?? player?.inventory_entries ?? player?.equipment?.items ?? [];
  return new Set(asArray(items).map((item) => item?.item_instance_id ?? item?.item_id ?? item?.id).filter(Boolean));
}

export function collectPlayerInventoryProfileIds(player) {
  const items = player?.inventory?.items ?? player?.inventory_entries ?? player?.equipment?.items ?? [];
  return new Set(asArray(items).map((item) => item?.item_profile_id ?? item?.profile_id).filter(Boolean));
}

export function indexMany(map, values, item) { for (const value of values.filter(Boolean)) { const list = map.get(value) ?? []; list.push(item); map.set(value, list); } }

export function asArray(value) { if (Array.isArray(value)) return value; return value == null ? [] : [value]; }

export function nonEmptyArray(value) { return Array.isArray(value) && value.length > 0; }

export function hasText(value) { return typeof value === 'string' && value.trim().length > 0; }

export function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

export function concern(code, message, details = {}) { return { code, severity: details.severity ?? 'error', message, ...details }; }

export function dedupeConcerns(concerns) { const seen = new Set(); return concerns.filter((item) => { const key = `${item.code}|${item.field ?? ''}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
